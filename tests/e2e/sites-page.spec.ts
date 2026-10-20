import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { lancerLyra } from './helpers'

// Règles par site appliquées à la page (jalon D, tâche 13) : style personnalisé avant le premier rendu, zoom, lecture automatique,
// script personnalisé dans un monde isolé. Serveur HTTP local : le site est « 127.0.0.1 ».

let serveur: Server
let PORT = 0
const SITE = (): string => `http://127.0.0.1:${PORT}`

/** Un son PCM de 2 s de silence (8 kHz, 8 bits, mono) : un vrai média, sans fichier de test. */
function wav(): Buffer {
  const n = 16_000
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + n, 4)
  h.write('WAVEfmt ', 8)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(1, 22)
  h.writeUInt32LE(8000, 24)
  h.writeUInt32LE(8000, 28)
  h.writeUInt16LE(1, 32)
  h.writeUInt16LE(8, 34)
  h.write('data', 36)
  h.writeUInt32LE(n, 40)
  return Buffer.concat([h, Buffer.alloc(n, 128)])
}
const SON = wav()

const PAGES: Record<string, string> = {
  // Le script inline est le premier script de la page : il mesure le style avant tout rendu (aucune peinture, corps pas encore analysé)
  // et au premier DOMContentLoaded.
  '/style': `<!doctype html><title>style</title><script>
    window.__auScript = { valeur: getComputedStyle(document.documentElement).getPropertyValue('--lyra-perso').trim(), peintures: performance.getEntriesByType('paint').length, corps: document.body === null }
    document.addEventListener('DOMContentLoaded', function () {
      window.__auDcl = { valeur: getComputedStyle(document.documentElement).getPropertyValue('--lyra-perso').trim(), fond: getComputedStyle(document.body).backgroundColor, peintures: performance.getEntriesByType('paint').length }
    })
  </script><body><p>style</p></body>`,
  // Page hôte avec une iframe d'un autre site (localhost) : elle ne reçoit ni les scripts perso ni le style du site hôte.
  '/hote': '<!doctype html><title>hote</title><body><p>hote</p><iframe src="%TIERS%/zoom"></iframe></body>',
  '/zoom': '<!doctype html><title>zoom</title><body><p>zoom</p></body>',
  // Lecture sans geste : le play() de la page, au chargement, n'est précédé d'aucune activation utilisateur.
  '/media': `<!doctype html><title>media</title><body>
    <audio id="a" src="/son.wav" preload="auto"></audio>
    <audio id="auto" src="/son.wav" autoplay></audio>
    <script>
      window.__play = 'en-cours'
      var p = document.getElementById('a').play()
      p.then(function () { window.__play = 'ok' }, function (e) { window.__play = e instanceof DOMException ? e.name : String(e) })
      // Sans geste : « Sans le son » ignore muted = false (le média reste muet).
      document.getElementById('a').muted = false
      window.__muetApres = document.getElementById('a').muted
    </script></body>`,
  // Monde isolé : la page pose une variable et lit celle du script (et le script fait l'inverse).
  '/monde': `<!doctype html><title>monde</title><script>window.variablePage = 'page'</script><body><p>monde</p>
    <script>window.addEventListener('load', function () { setTimeout(function () { window.__pageVoit = typeof window.variableScript }, 300) })</script></body>`
}

test.beforeAll(async () => {
  serveur = createServer((q, r) => {
    const chemin = new URL(q.url ?? '/', 'http://x').pathname
    if (chemin === '/son.wav') {
      r.setHeader('content-type', 'audio/wav')
      return r.end(SON)
    }
    const page = PAGES[chemin]
    if (!page) {
      r.statusCode = 404
      return r.end()
    }
    r.setHeader('content-type', 'text/html; charset=utf-8')
    r.end(page.replace('%TIERS%', `http://localhost:${PORT}`))
  })
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok))
  PORT = (serveur.address() as AddressInfo).port
})
test.afterAll(() => new Promise((ok) => serveur.close(ok)))

const regle = (f: Page, cle: string, r: Record<string, unknown>): Promise<void> => f.evaluate(([c, x]) => window.lyra.invoke('sites:ecrire', { cle: c as string, regle: x as Record<string, unknown> }), [cle, r])
const globaux = (f: Page, styles: { css?: string; scripts?: Array<{ nom: string; code: string; actif: boolean }> }): Promise<unknown> => f.evaluate((s) => window.lyra.invoke('settings:set', { styles: { css: '', scripts: [], ...s } }), styles)
const pageDe = (app: ElectronApplication, adresse: string): Page | undefined => app.windows().find((w) => w.url() === adresse)

/** Ouvre l'adresse dans une nouvelle étoile de la fenêtre et rend la page web (une adresse par ouverture : la page s'y reconnaît par son URL). */
async function ouvrir(app: ElectronApplication, f: Page, chemin: string): Promise<Page> {
  const url = `${SITE()}${chemin}`
  await f.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), url)
  await expect.poll(() => pageDe(app, url)).toBeDefined()
  const p = pageDe(app, url)!
  await expect.poll(() => p.evaluate(() => document.readyState)).toBe('complete')
  return p
}
const zoomDe = (app: ElectronApplication, adresse: string): Promise<number> =>
  app.evaluate(({ webContents }, u) => webContents.getAllWebContents().find((w) => w.getURL() === u)?.getZoomFactor() ?? 0, adresse)

test('style personnalisé : présent avant le premier rendu (au premier script de la page et au premier DOMContentLoaded)', async () => {
  test.setTimeout(120_000)
  const { app, fenetre } = await lancerLyra()
  try {
    // Témoin : sans règle, rien. Ce qui est mesuré est bien l'effet de la règle.
    const t = await ouvrir(app, fenetre, '/style?temoin')
    expect(await t.evaluate(() => (window as unknown as { __auScript: { valeur: string } }).__auScript.valeur)).toBe('')

    // Règle Strict + style perso sur le site de test (et un style global, concaténé avant celui du site).
    await regle(fenetre, '127.0.0.1', { boucliers: 'strict', style: 'html { --lyra-perso: site } body { background: rgb(1, 2, 3) }' })
    await globaux(fenetre, { css: 'html { --lyra-global: global }' })
    for (let i = 0; i < 3; i++) {
      const p = await ouvrir(app, fenetre, `/style?${i}`)
      const mesure = await p.evaluate(() => {
        const w = window as unknown as { __auScript: Record<string, unknown>; __auDcl: Record<string, unknown> }
        return { script: w.__auScript, dcl: w.__auDcl, global: getComputedStyle(document.documentElement).getPropertyValue('--lyra-global').trim() }
      })
      // Premier script de la page : la feuille est déjà là, le corps n'est pas encore analysé, rien n'a été peint.
      expect(mesure.script).toEqual({ valeur: 'site', peintures: 0, corps: true })
      // Premier DOMContentLoaded : style du site appliqué au corps, avant toute peinture.
      expect(mesure.dcl).toMatchObject({ valeur: 'site', fond: 'rgb(1, 2, 3)' })
      expect(mesure.global).toBe('global')
    }
  } finally {
    await app.close()
  }
})

test('zoom par site : appliqué sans recharger, « Par défaut » (champ retiré) le retire', async () => {
  test.setTimeout(120_000)
  const { app, fenetre } = await lancerLyra()
  try {
    const url = `${SITE()}/zoom`
    const p = await ouvrir(app, fenetre, '/zoom')
    expect(await zoomDe(app, url)).toBe(1)
    await p.evaluate(() => ((window as unknown as { __marque: string }).__marque = 'chargee'))

    await regle(fenetre, '127.0.0.1', { zoom: 1.1 })
    await expect.poll(() => zoomDe(app, url)).toBeCloseTo(1.1, 5)
    // Sans rechargement de la page.
    expect(await p.evaluate(() => (window as unknown as { __marque?: string }).__marque)).toBe('chargee')
    // Une nouvelle navigation du site garde le zoom de la règle.
    await ouvrir(app, fenetre, '/zoom?2')
    await expect.poll(() => zoomDe(app, `${SITE()}/zoom?2`)).toBeCloseTo(1.1, 5)

    // « Par défaut » : le champ est retiré, toutes les étoiles du site reviennent à 100 % sans recharger.
    await regle(fenetre, '127.0.0.1', { zoom: null })
    await expect.poll(() => zoomDe(app, url)).toBe(1)
    await expect.poll(() => zoomDe(app, `${SITE()}/zoom?2`)).toBe(1)
    expect(await p.evaluate(() => (window as unknown as { __marque?: string }).__marque)).toBe('chargee')
  } finally {
    await app.close()
  }
})

/** État des médias de la page `/media` : leur lecture, leur son, leur attribut autoplay. */
const etatMedias = (p: Page) =>
  p.evaluate(() => {
    const a = document.getElementById('a') as HTMLAudioElement
    const auto = document.getElementById('auto') as HTMLAudioElement
    return {
      play: (window as unknown as { __play: string }).__play,
      muet: a.muted,
      muetApres: (window as unknown as { __muetApres: boolean }).__muetApres,
      autoplayAttribut: auto.hasAttribute('autoplay'),
      autoMuet: auto.muted,
      autoEnPause: auto.paused
    }
  })

test('lecture automatique : « Autoriser » laisse faire, « Bloquer » rejette play() sans geste et retire autoplay, « Sans le son » force muted', async () => {
  test.setTimeout(180_000)
  const { app, fenetre } = await lancerLyra()
  try {
    // Témoin (aucune règle) : play() sans geste réussit avec le son, et le média autoplay démarre.
    const t = await ouvrir(app, fenetre, '/media')
    await expect.poll(async () => (await etatMedias(t)).play).toBe('ok')
    expect(await etatMedias(t)).toMatchObject({ muet: false, muetApres: false, autoplayAttribut: true, autoMuet: false })
    await expect.poll(async () => (await etatMedias(t)).autoEnPause).toBe(false)

    // « Bloquer » : play() sans geste rejeté par NotAllowedError, autoplay bloqué.
    await regle(fenetre, '127.0.0.1', { lectureAuto: 'bloquer' })
    const b = await ouvrir(app, fenetre, '/media?bloquer')
    await expect.poll(async () => (await etatMedias(b)).play).toBe('NotAllowedError')
    await new Promise((ok) => setTimeout(ok, 1000))
    expect(await etatMedias(b)).toMatchObject({ autoplayAttribut: false, autoEnPause: true })
    // Avec un geste (l'évaluation Playwright en simule un), la lecture passe : « Bloquer » ne gêne que l'automatique.
    expect(await b.evaluate(() => (document.getElementById('a') as HTMLAudioElement).play().then(() => 'ok', (e: DOMException) => e.name))).toBe('ok')

    // « Sans le son » : la lecture démarre mais muette, y compris le média autoplay.
    await regle(fenetre, '127.0.0.1', { lectureAuto: 'sans-son' })
    const m = await ouvrir(app, fenetre, '/media?sans-son')
    await expect.poll(async () => (await etatMedias(m)).play).toBe('ok')
    expect(await etatMedias(m)).toMatchObject({ muet: true, muetApres: true, autoplayAttribut: true, autoMuet: true })

    // « Autoriser » explicite : comme le témoin.
    await regle(fenetre, '127.0.0.1', { lectureAuto: 'autoriser' })
    const a = await ouvrir(app, fenetre, '/media?autoriser')
    await expect.poll(async () => (await etatMedias(a)).play).toBe('ok')
    expect(await etatMedias(a)).toMatchObject({ muet: false, autoMuet: false })
  } finally {
    await app.close()
  }
})

test('lecture automatique : un média lancé par l’utilisateur peut reprendre 6 s plus tard sans geste ; un autre reste refusé', async () => {
  test.setTimeout(120_000)
  const { app, fenetre } = await lancerLyra()
  try {
    await regle(fenetre, '127.0.0.1', { lectureAuto: 'bloquer' })
    const p = await ouvrir(app, fenetre, '/media?reprise')
    await expect.poll(async () => (await etatMedias(p)).play).toBe('NotAllowedError')
    // Clic simulé (évaluation avec geste) : play(), pause() ; puis, après 6 s (activation expirée), play() sans geste.
    await p.evaluate(() => {
      const a = document.getElementById('a') as HTMLAudioElement
      const w = window as unknown as { __reprise?: string; __autre?: string }
      void a.play()
      a.pause()
      setTimeout(() => {
        ;(w as unknown as { __act: unknown }).__act = navigator.userActivation.isActive
        a.play().then(() => (w.__reprise = 'ok'), (e: DOMException) => (w.__reprise = e.name))
        ;(document.getElementById('auto') as HTMLAudioElement).play().then(() => (w.__autre = 'ok'), (e: DOMException) => (w.__autre = e.name))
      }, 6000)
    })
    // Aucune évaluation (chacune simule un geste) pendant l'attente : l'activation transitoire doit expirer.
    await new Promise((ok) => setTimeout(ok, 7000))
    expect(await p.evaluate(() => (window as unknown as { __act: unknown }).__act)).toBe(false)
    expect(await p.evaluate(() => (window as unknown as { __reprise?: string }).__reprise)).toBe('ok')
    expect(await p.evaluate(() => (window as unknown as { __autre?: string }).__autre)).toBe('NotAllowedError')
  } finally {
    await app.close()
  }
})

test('scripts personnalisés : une iframe d’un autre site ne reçoit ni scripts ni style du site hôte ; ils s’exécutent même sous « Scripts : Bloqués »', async () => {
  test.setTimeout(120_000)
  const { app, fenetre } = await lancerLyra()
  try {
    await regle(fenetre, '127.0.0.1', { style: 'html { --lyra-perso: hote }', scriptsPerso: [{ nom: 's', code: "document.documentElement.dataset.perso = 'oui'", actif: true }] })
    const p = await ouvrir(app, fenetre, '/hote')
    await expect.poll(() => p.evaluate(() => document.documentElement.dataset.perso)).toBe('oui')
    expect(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--lyra-perso').trim())).toBe('hote')
    const tiers = p.frames().find((f) => f.url().startsWith(`http://localhost:${PORT}`))!
    await expect.poll(() => tiers.evaluate(() => document.readyState)).toBe('complete')
    await new Promise((ok) => setTimeout(ok, 500))
    expect(await tiers.evaluate(() => ({ perso: document.documentElement.dataset.perso ?? null, style: getComputedStyle(document.documentElement).getPropertyValue('--lyra-perso').trim() }))).toEqual({ perso: null, style: '' })

    // « Scripts : Bloqués » bloque les scripts de la PAGE (CSP) ; les scripts personnalisés de l'utilisateur, eux, s'exécutent (voulu).
    await regle(fenetre, '127.0.0.1', { scripts: 'bloques', style: 'html { --lyra-perso: hote }', scriptsPerso: [{ nom: 's', code: "document.documentElement.dataset.perso = 'oui'", actif: true }] })
    const b = await ouvrir(app, fenetre, '/zoom?bloques')
    await expect.poll(() => b.evaluate(() => document.documentElement.dataset.perso)).toBe('oui')
  } finally {
    await app.close()
  }
})

test('script personnalisé : monde isolé (ne voit pas les variables de la page, et inversement), actifs seulement, globaux + site', async () => {
  test.setTimeout(120_000)
  const { app, fenetre } = await lancerLyra()
  try {
    const code = (nom: string): string => `document.documentElement.dataset.${nom} = [typeof window.variablePage, typeof variablePage].join(':'); window.variableScript = '${nom}'`
    await regle(fenetre, '127.0.0.1', {
      scriptsPerso: [
        { nom: 'site', code: code('site'), actif: true },
        { nom: 'eteint', code: code('eteint'), actif: false },
        // `const` homonyme : chaque script a son bloc, aucune collision ; un script en erreur n'arrête pas les suivants.
        { nom: 'erreur', code: 'const x = 1; throw new Error("echec volontaire")', actif: true },
        { nom: 'apres', code: 'const x = 2; document.documentElement.dataset.apres = String(x)', actif: true }
      ]
    })
    await globaux(fenetre, { scripts: [{ nom: 'global', code: code('global'), actif: true }, { nom: 'global-eteint', code: code('globalEteint'), actif: false }] })
    const p = await ouvrir(app, fenetre, '/monde')
    await expect.poll(() => p.evaluate(() => (window as unknown as { __pageVoit?: string }).__pageVoit)).toBeDefined()
    const dataset = await p.evaluate(() => ({ ...document.documentElement.dataset }))
    // Le script voit le DOM mais ni `window.variablePage` ni `variablePage` (monde isolé) ; l'ordre global puis site importe peu ici.
    expect(dataset).toEqual({ global: 'undefined:undefined', site: 'undefined:undefined', apres: '2' })
    // La page, dans le monde principal, ne voit pas la variable du script.
    expect(await p.evaluate(() => (window as unknown as { __pageVoit: string }).__pageVoit)).toBe('undefined')
    expect(await p.evaluate(() => typeof (window as unknown as { variableScript?: string }).variableScript)).toBe('undefined')
    expect(await p.evaluate(() => (window as unknown as { variablePage: string }).variablePage)).toBe('page')

    // Autre site (autre hôte) : pas de script du site ; seul le script global s'exécute.
    const autre = `http://localhost:${PORT}/monde`
    await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), autre)
    await expect.poll(() => pageDe(app, autre)).toBeDefined()
    const q = pageDe(app, autre)!
    await expect.poll(() => q.evaluate(() => document.readyState)).toBe('complete')
    await expect.poll(() => q.evaluate(() => Object.keys(document.documentElement.dataset).sort().join(','))).toBe('global')
  } finally {
    await app.close()
  }
})

const interfaces = (app: ElectronApplication): Page[] => app.windows().filter((p) => p.url().includes('ui.html') && !p.url().includes('#overlay'))

test('fenêtre privée : les règles sont lues (zoom, style, script), jamais écrites', async () => {
  test.setTimeout(120_000)
  const { app, fenetre } = await lancerLyra()
  try {
    await regle(fenetre, '127.0.0.1', { zoom: 1.25, style: 'html { --lyra-perso: prive }', scriptsPerso: [{ nom: 's', code: "document.documentElement.dataset.script = 'oui'", actif: true }] })
    const avant = await fenetre.evaluate(() => window.lyra.invoke('sites:lister'))
    await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.getMenuItemById('fenetre-privee')!.click())
    await expect.poll(() => interfaces(app).find((p) => p.url().includes('#privee'))).toBeDefined()
    const privee = interfaces(app).find((p) => p.url().includes('#privee'))!
    const url = `${SITE()}/zoom?privee`
    await privee.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), url)
    await expect.poll(() => pageDe(app, url)).toBeDefined()
    const p = pageDe(app, url)!
    await expect.poll(() => zoomDe(app, url)).toBeCloseTo(1.25, 5)
    expect(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--lyra-perso').trim())).toBe('prive')
    await expect.poll(() => p.evaluate(() => document.documentElement.dataset.script)).toBe('oui')
    // Une règle modifiée depuis la fenêtre normale s'applique aussi aux étoiles de la fenêtre privée ; aucune écriture n'en vient.
    await regle(fenetre, '127.0.0.1', { zoom: null })
    await expect.poll(() => zoomDe(app, url)).toBe(1)
    expect(await fenetre.evaluate(() => window.lyra.invoke('sites:lister'))).toEqual({ '127.0.0.1': { ...avant['127.0.0.1'], zoom: undefined } })
  } finally {
    await app.close()
  }
})
