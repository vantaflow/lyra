import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { lancerLyra } from './helpers'

/**
 * Référence visuelle du thème par défaut (Indigo nuit, clair), figée AVANT la tokenisation du CSS (jalon D, tâche 7) :
 * la couleur calculée de chaque élément rendu (texte, fond, bordures, contour, ombre, dégradé…) de chaque vue.
 * `LYRA_REF_ECRIRE=1` réécrit le fichier ; hors cela, le test compare.
 */
const FICHIER = resolve(__dirname, 'fixtures/couleurs-reference.json')

// La page « Importer » détecte les navigateurs installés : on la pointe vers les profils fabriqués d'import.spec.ts
// (jamais les vrais profils de la machine, dont l'état rendrait la référence instable).
const FIXTURES = resolve(__dirname, '../../src/main/import/fixtures')
let racine = ''
test.beforeAll(() => {
  racine = mkdtempSync(join(tmpdir(), 'lyra-theme-tokens-racine-'))
  for (const [source, cible] of [['chromium/chrome', 'chrome'], ['chromium/edge', 'edge'], ['chromium/brave', 'brave'], ['firefox', 'firefox'], ['safari', 'safari'], ['orion', 'orion']]) {
    mkdirSync(join(racine, cible), { recursive: true })
    cpSync(join(FIXTURES, source), join(racine, cible), { recursive: true })
  }
})
test.afterAll(() => rmSync(racine, { recursive: true, force: true }))
type Reference = Record<string, Record<string, string[]>>

const trouver = (app: { windows(): Page[] }, debut: string): Page | undefined => app.windows().find((w) => w.url().startsWith(debut))

/** Signature des couleurs calculées : clé = balise + id + classes triées, valeur = signatures distinctes (indépendant du nombre d'éléments). */
async function capturer(p: Page): Promise<Record<string, string[]>> {
  return p.evaluate(() => {
    const props = ['color', 'backgroundColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'outlineColor', 'boxShadow', 'textDecorationColor', 'caretColor', 'fill', 'stroke', 'backgroundImage'] as const
    const sortie: Record<string, Set<string>> = {}
    for (const el of Array.from(document.body.querySelectorAll('*')).concat(document.documentElement)) {
      if (['SCRIPT', 'STYLE', 'LINK', 'META', 'TITLE'].includes(el.tagName)) continue
      const classes = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).sort().join('.')
      const cle = `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${classes ? '.' + classes : ''}`
      const cs = getComputedStyle(el)
      const sig = props.map((n) => `${n}=${cs[n]}`).join(' | ')
      ;(sortie[cle] ??= new Set()).add(sig)
    }
    return Object.fromEntries(Object.entries(sortie).map(([k, v]) => [k, [...v].sort()]))
  })
}

/** Attend que la feuille de style soit appliquée et que le rendu soit stable (deux captures identiques). */
async function stable(p: Page): Promise<Record<string, string[]>> {
  let derniere = JSON.stringify(await capturer(p))
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 150))
    const courante = JSON.stringify(await capturer(p))
    if (courante === derniere) return JSON.parse(courante)
    derniere = courante
  }
  return JSON.parse(derniere)
}

async function aller(app: ElectronApplication, fenetre: Page, url: string, prefixe: string): Promise<Page> {
  await fenetre.evaluate((u) => window.lyra.invoke('test:navigate', u), url)
  await expect.poll(() => trouver(app, prefixe)?.url()).toContain(prefixe)
  const p = trouver(app, prefixe)!
  await p.waitForLoadState('domcontentloaded')
  await expect(p.locator('body *').first()).toBeAttached()
  await p.emulateMedia({ colorScheme: 'light' })
  return p
}

/** Collecte les vues Lyra ; `avant` est appelé sur chaque page (par ex. pour poser data-mode). */
async function collecter(app: ElectronApplication, fenetre: Page, avant?: (p: Page) => Promise<void>): Promise<Reference> {
  const ref: Reference = {}
  const prendre = async (nom: string, p: Page): Promise<void> => {
    if (avant) await avant(p)
    ref[nom] = await stable(p)
  }
  await prendre('ciel-capsule', fenetre)
  // Palette (overlay).
  await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.getMenuItemById('palette')!.click())
  await expect.poll(() => app.windows().some((w) => w.url().includes('#overlay'))).toBe(true)
  const overlay = app.windows().find((w) => w.url().includes('#overlay'))!
  await expect(overlay.locator('#palette')).toBeVisible()
  await prendre('palette', overlay)
  await overlay.keyboard.press('Escape')
  // Panneaux de l'overlay : Boucliers et Téléchargements.
  for (const [canal, nom] of [['shields:open', 'panneau-boucliers'], ['downloads:panel', 'panneau-telechargements']] as const) {
    await fenetre.evaluate((c) => window.lyra.invoke(c as 'shields:open'), canal)
    await expect(overlay.locator('.pn-fond').first()).toBeVisible()
    await prendre(nom, overlay)
    await overlay.keyboard.press('Escape')
  }
  // Nouvel onglet.
  await prendre('newtab', await aller(app, fenetre, 'lyra://newtab', 'lyra://newtab'))
  // Réglages : quelques sections de natures différentes.
  for (const route of ['general', 'apparence', 'reseau', 'importer', 'historique', 'telechargements', 'favoris']) {
    const p = await aller(app, fenetre, `lyra://settings#/${route}`, 'lyra://settings')
    await p.evaluate((r) => { location.hash = `#/${r}` }, route)
    await expect(p.locator('h1')).toBeVisible()
    // La détection puis l'aperçu du premier navigateur (étiquettes « Prêt »…) arrivent après le rendu : on attend le bouton actif.
    if (route === 'importer') await expect(p.locator('#importer-maintenant')).toBeEnabled()
    await prendre(`settings-${route}`, p)
  }
  await prendre('history', await aller(app, fenetre, 'lyra://history', 'lyra://history'))
  await prendre('downloads', await aller(app, fenetre, 'lyra://downloads', 'lyra://downloads'))
  // Pages d'erreur : introuvable et réseau.
  const id = (await fenetre.evaluate(() => window.lyra.invoke('sky:get'))).sky.activeId!
  await fenetre.evaluate((i) => window.lyra.invoke('tabs:navigate', { id: i, url: 'file:///nexiste/pas.html' }), id)
  await expect.poll(() => trouver(app, 'lyra://erreur')?.url()).toContain('lyra://erreur')
  const e1 = trouver(app, 'lyra://erreur')!
  await expect(e1.locator('h1')).toHaveText('Cette page est introuvable')
  await prendre('erreur-introuvable', e1)
  await fenetre.evaluate((i) => window.lyra.invoke('tabs:navigate', { id: i, url: 'http://127.0.0.1:1/' }), id)
  await expect.poll(() => trouver(app, 'lyra://erreur')?.url()).toContain('type=reseau')
  const e2 = trouver(app, 'lyra://erreur')!
  await expect(e2.locator('h1')).toHaveText('Connexion impossible')
  await prendre('erreur-reseau', e2)
  return ref
}

test('thème clair par défaut : les couleurs calculées de toutes les vues Lyra sont celles de la référence', async () => {
  test.setTimeout(120_000)
  const { app, fenetre } = await lancerLyra({ LYRA_IMPORT_RACINE: racine })
  try {
    const actuel = await collecter(app, fenetre)
    if (process.env.LYRA_REF_ECRIRE === '1' || !existsSync(FICHIER)) {
      writeFileSync(FICHIER, JSON.stringify(actuel, null, 1) + '\n')
      return
    }
    const reference = JSON.parse(readFileSync(FICHIER, 'utf8')) as Reference
    expect(Object.keys(actuel).sort()).toEqual(Object.keys(reference).sort())
    for (const vue of Object.keys(reference)) expect(actuel[vue], vue).toEqual(reference[vue])
  } finally {
    await app.close()
  }
})

/** Attend que la vue ait reçu le thème sombre diffusé par le processus principal (`theme:variables`, tâche 8a). */
const SOMBRE = (p: Page): Promise<void> => expect(p.locator('html')).toHaveAttribute('data-mode', 'sombre')

const lumi = (rgb: string): number | null => {
  const m = rgb.match(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/)
  if (!m || (m[4] !== undefined && Number(m[4]) === 0)) return null
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => {
    const c = Number(x) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

test('mode sombre : la capsule vaut rgb(23,23,42) et la page rgb(18,18,20), plus aucune surface claire', async () => {
  test.setTimeout(120_000)
  const { app, fenetre } = await lancerLyra({ LYRA_IMPORT_RACINE: racine })
  try {
    await fenetre.evaluate(() => window.lyra.invoke('settings:set', { theme: 'sombre' }))
    await SOMBRE(fenetre)
    const fonds = await fenetre.evaluate(() => ({
      carte: getComputedStyle(document.querySelector('.carte')!).backgroundColor,
      capsule: getComputedStyle(document.querySelector('.capsule')!).backgroundColor,
      ciel: getComputedStyle(document.querySelector('.ciel')!).backgroundColor
    }))
    expect(fonds.carte).toBe('rgb(23, 23, 42)')
    expect(fonds.ciel).toBe('rgb(14, 14, 30)')
    // La capsule est transparente sur la carte (fond de capsule) : texte lisible en sombre.
    expect(await fenetre.evaluate(() => getComputedStyle(document.querySelector('.capsule')!).color)).toBe('rgb(232, 232, 244)')

    const clairs: string[] = []
    for (const [url, prefixe, route] of [
      ['lyra://settings', 'lyra://settings', 'general'],
      ['lyra://settings', 'lyra://settings', 'apparence'],
      ['lyra://settings', 'lyra://settings', 'reseau'],
      ['lyra://settings', 'lyra://settings', 'importer'],
      ['lyra://history', 'lyra://history', ''],
      ['lyra://downloads', 'lyra://downloads', '']
    ] as const) {
      const p = await aller(app, fenetre, route ? `${url}#/${route}` : url, prefixe)
      if (route) await p.evaluate((r) => { location.hash = `#/${r}` }, route)
      await expect(p.locator('h1')).toBeVisible()
      await SOMBRE(p)
      await expect.poll(() => p.evaluate(() => getComputedStyle(document.getElementById('app')!).backgroundColor)).toBe('rgb(18, 18, 20)')
      expect(await p.evaluate(() => getComputedStyle(document.getElementById('app')!).color)).toBe('rgb(232, 232, 244)')
      const surfaces = await p.evaluate(() =>
        Array.from(document.body.querySelectorAll('*')).map((e) => ({ cle: e.tagName.toLowerCase() + '.' + (e.getAttribute('class') ?? ''), fond: getComputedStyle(e).backgroundColor, sw: e.classList.contains('sw') }))
      )
      // L'étoile active des aperçus de position est ambre par design (Étoile active), pas une surface.
      // Les pastilles de couleur (classe `sw`) sont des échantillons de couleur par design, pas des surfaces.
      for (const s of surfaces) if (s.fond !== 'rgb(244, 197, 106)' && !s.sw && (lumi(s.fond) ?? 0) > 0.5) clairs.push(`${route || url} ${s.cle} ${s.fond}`)
    }
    expect(clairs).toEqual([])

    // Page d'erreur : fond de page sombre, carte à la couleur de la capsule.
    const id = (await fenetre.evaluate(() => window.lyra.invoke('sky:get'))).sky.activeId!
    await fenetre.evaluate((i) => window.lyra.invoke('tabs:navigate', { id: i, url: 'file:///nexiste/pas.html' }), id)
    await expect.poll(() => trouver(app, 'lyra://erreur')?.url()).toContain('lyra://erreur')
    const e = trouver(app, 'lyra://erreur')!
    await expect(e.locator('h1')).toBeVisible()
    await SOMBRE(e)
    await expect.poll(() => e.evaluate(() => getComputedStyle(document.getElementById('app')!).backgroundColor)).toBe('rgb(18, 18, 20)')
    expect(await e.evaluate(() => getComputedStyle(document.querySelector('.erreur-carte')!).backgroundColor)).toBe('rgb(23, 23, 42)')

    // Nouvel onglet et ciel : suivent les variables sombres.
    const n = await aller(app, fenetre, 'lyra://newtab', 'lyra://newtab')
    await SOMBRE(n)
    await expect.poll(() => n.evaluate(() => getComputedStyle(document.getElementById('app')!).backgroundColor)).toBe('rgb(9, 9, 22)')
  } finally {
    await app.close()
  }
})
