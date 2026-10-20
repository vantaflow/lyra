import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { lancerLyra } from './helpers'

test('sites:* : écrire, lister, supprimer sans redémarrage ; clé invalide refusée', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate(() => window.lyra.invoke('sites:ecrire', { cle: '*.exemple.net', regle: { zoom: 1.5, cookies: 'bloques' } }))
    await fenetre.evaluate(() => window.lyra.invoke('sites:ecrire', { cle: '*', regle: { zoom: 2 } }))
    await fenetre.evaluate(() => window.lyra.invoke('sites:ecrire', { cle: '*.exemple.net', regle: { boucliers: 'strict' } }))
    const l = await fenetre.evaluate(() => window.lyra.invoke('sites:lister'))
    expect(l).toEqual({ '*.exemple.net': { zoom: 1.5, cookies: 'bloques', boucliers: 'strict' } })
    await fenetre.evaluate(() => window.lyra.invoke('sites:supprimer', '*.exemple.net'))
    expect(await fenetre.evaluate(() => window.lyra.invoke('sites:lister'))).toEqual({})
  } finally {
    await app.close()
  }
})

// ---------- Page « Règles par site » des réglages (Tâche 14) ----------

const page = (app: ElectronApplication, debut: string): Page | undefined => app.windows().find((w) => w.url().startsWith(debut))

async function ouvrirReglages(app: ElectronApplication, fenetre: Page, route: string): Promise<Page> {
  await fenetre.evaluate((u) => window.lyra.invoke('test:navigate', u), `lyra://settings#/${route}`)
  await expect.poll(() => page(app, 'lyra://settings')).toBeDefined()
  const r = page(app, 'lyra://settings')!
  await r.evaluate((h) => { location.hash = h }, `#/${route}`)
  return r
}
const lister = (f: Page) => f.evaluate(() => window.lyra.invoke('sites:lister'))
const ligne = (r: Page, id: string) => r.locator(`[data-reglage="sites.${id}"]`)

test('Règles par site : création → tableau et détail ; Boucliers, Cookies et Ne pas déranger reflétés par sites:lister', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    const r = await ouvrirReglages(app, fenetre, 'sites')
    await expect(r.locator('h1')).toHaveText('Règles par site')
    await expect(r.locator('.sous-titre')).toContainText('La règle la plus précise gagne.')
    await expect(r.locator('#aucune-regle')).toBeVisible()
    // En-têtes dans l'ordre du design.
    await expect(r.locator('.tableau-sites th')).toHaveText(['Site', 'Boucliers', 'Cookies', 'Scripts', 'Extensions', 'Zoom', 'Ne pas déranger', 'Style'])

    // Création : une saisie invalide est refusée, puis une valide ouvre le détail.
    await r.getByRole('button', { name: 'Nouvelle règle' }).click()
    await r.locator('#nouvelle-regle-site').fill('pas un site')
    await r.locator('#creer-regle').click()
    await expect(r.getByRole('alert')).toBeVisible()
    await r.locator('#nouvelle-regle-site').fill('YouTube.com')
    await r.locator('#creer-regle').click()
    const rangee = r.locator('tr[data-site="youtube.com"]')
    await expect(rangee).toBeVisible()
    await expect(rangee).toHaveClass(/on/)
    await expect(rangee.locator('td').nth(1)).toHaveText('Standard')
    await expect(rangee.locator('td').nth(5)).toHaveText('—')
    await expect(r.locator('h2.titre-section')).toHaveText('youtube.com — détail de la règle')
    await expect(r.locator('.site-regle i').first()).toHaveText('Y')
    expect(await lister(fenetre)).toEqual({ 'youtube.com': { boucliers: 'standard' } })
    expect(r.url()).toContain('#/sites/youtube.com')

    // Libellés et ordre du détail.
    await expect(r.locator('.detail-regle .row .lbl > span:first-child')).toHaveText([
      'Boucliers',
      'Scriptlets anti-publicité YouTube',
      'Cookies',
      'Scripts',
      'Zoom',
      'Lecture automatique des vidéos',
      'Notifications',
      'Extensions autorisées sur ce site',
      'Ne pas déranger : laisser passer les notifications de ce site',
      'Identité du navigateur (user-agent)',
      'Style personnalisé',
      'Script personnalisé'
    ])
    await expect(r.getByRole('button', { name: 'Modifier', exact: true })).toBeDisabled()

    // Boucliers : Strict.
    await ligne(r, 'boucliers').getByRole('button', { name: 'Strict' }).click()
    await expect.poll(async () => (await lister(fenetre))['youtube.com']?.boucliers).toBe('strict')
    await expect(rangee.locator('td').nth(1)).toHaveText('Strict')
    // Désactivés : le niveau Strict est mémorisé ; Standard le retire.
    await ligne(r, 'boucliers').getByRole('button', { name: 'Désactivés' }).click()
    await expect.poll(async () => (await lister(fenetre))['youtube.com']).toEqual({ boucliers: 'desactives', bouclierAvant: 'strict' })
    await expect(rangee.locator('td').nth(1)).toHaveText('Désactivés')
    await ligne(r, 'boucliers').getByRole('button', { name: 'Standard' }).click()
    await expect.poll(async () => (await lister(fenetre))['youtube.com']).toEqual({ boucliers: 'standard' })

    // Cookies et Ne pas déranger.
    await ligne(r, 'cookies').getByRole('button', { name: '1re partie' }).click()
    await expect.poll(async () => (await lister(fenetre))['youtube.com']?.cookies).toBe('premiere-partie')
    await expect(rangee.locator('td').nth(2)).toHaveText('1re partie')
    await r.getByRole('switch', { name: 'Exception Ne pas déranger' }).click()
    await expect.poll(async () => (await lister(fenetre))['youtube.com']?.exceptionDnd).toBe(true)
    await expect(rangee.locator('td').nth(6)).toHaveText('Exception')
    await r.getByRole('switch', { name: 'Exception Ne pas déranger' }).click()
    await expect.poll(async () => (await lister(fenetre))['youtube.com']?.exceptionDnd).toBeUndefined()

    // Scripts (Tâche 14b) : Autorisés par défaut, Bloqués → colonne rouge ; la cellule reste en lecture seule.
    await expect(ligne(r, 'scripts').getByRole('button', { name: 'Autorisés' })).toHaveAttribute('aria-pressed', 'true')
    await ligne(r, 'scripts').getByRole('button', { name: 'Bloqués' }).click()
    await expect.poll(async () => (await lister(fenetre))['youtube.com']?.scripts).toBe('bloques')
    await expect(rangee.locator('td').nth(3).locator('.etiq.rouge')).toHaveText('Bloqués')
    await ligne(r, 'scripts').getByRole('button', { name: 'Autorisés' }).dispatchEvent('click')
    // Revenir à la valeur par défaut retire le champ (aucune valeur explicite écrite).
    await expect.poll(async () => 'scripts' in (await lister(fenetre))['youtube.com']).toBe(false)

    // Zoom : paliers, puis « Par défaut » retire `zoom` de la règle.
    await expect(ligne(r, 'zoom').getByRole('button', { name: 'Zoom' })).toHaveText('Par défaut')
    await ligne(r, 'zoom').getByRole('button', { name: 'Zoom' }).click()
    await expect(r.getByRole('option')).toHaveText(['Par défaut', '50 %', '67 %', '75 %', '80 %', '90 %', '100 %', '110 %', '125 %', '150 %', '175 %', '200 %'])
    await r.getByRole('option', { name: '110 %' }).click()
    await expect.poll(async () => (await lister(fenetre))['youtube.com']?.zoom).toBe(1.1)
    await expect(rangee.locator('td').nth(5)).toHaveText('110 %')
    await ligne(r, 'zoom').getByRole('button', { name: 'Zoom' }).click()
    await r.getByRole('option', { name: '67 %' }).click()
    await expect.poll(async () => (await lister(fenetre))['youtube.com']?.zoom).toBe(0.67)
    await ligne(r, 'zoom').getByRole('button', { name: 'Zoom' }).click()
    await r.getByRole('option', { name: 'Par défaut' }).click()
    await expect.poll(async () => 'zoom' in (await lister(fenetre))['youtube.com']).toBe(false)
    await expect(rangee.locator('td').nth(5)).toHaveText('—')
    // Un zoom hors palier (zoom au clavier) reste affiché et choisissable.
    await fenetre.evaluate(() => window.lyra.invoke('sites:ecrire', { cle: 'youtube.com', regle: { zoom: 1.2 } }))
    await expect(ligne(r, 'zoom').getByRole('button', { name: 'Zoom' })).toHaveText('120 %')

    // Lecture automatique, notifications, user-agent.
    await ligne(r, 'lectureAuto').getByRole('button', { name: 'Sans le son' }).click()
    await expect.poll(async () => (await lister(fenetre))['youtube.com']?.lectureAuto).toBe('sans-son')
    await ligne(r, 'notifications').getByRole('button', { name: 'Refuser' }).click()
    await expect.poll(async () => (await lister(fenetre))['youtube.com']?.permissions).toEqual({ notifications: 'refuser' })
    await ligne(r, 'notifications').getByRole('button', { name: 'Demander' }).click()
    await expect.poll(async () => (await lister(fenetre))['youtube.com']?.permissions).toBeUndefined()
    await ligne(r, 'ua').getByRole('button', { name: "Identité du navigateur" }).click()
    await r.getByRole('option', { name: 'Firefox (Windows)' }).click()
    await expect.poll(async () => (await lister(fenetre))['youtube.com']?.ua).toBe('firefox')
  } finally {
    await app.close()
  }
})

test('Règles par site : style et script personnalisés édités (sauvegarde différée) ; suppression de la règle', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate(() => window.lyra.invoke('sites:ecrire', { cle: 'github.com', regle: { boucliers: 'standard' } }))
    const r = await ouvrirReglages(app, fenetre, 'sites')
    const rangee = r.locator('tr[data-site="github.com"]')
    await expect(rangee).toBeVisible()
    await expect(rangee.locator('td').nth(7)).toHaveText('—')
    await rangee.click()
    await expect(r.locator('h2.titre-section')).toHaveText('github.com — détail de la règle')

    await r.getByLabel('Style personnalisé', { exact: true }).fill('body { color: red }')
    await expect.poll(async () => (await lister(fenetre))['github.com']?.style).toBe('body { color: red }')
    await expect(rangee.locator('td').nth(7)).toHaveText('CSS')

    await r.getByRole('button', { name: 'Ajouter un script…' }).click()
    await expect.poll(async () => (await lister(fenetre))['github.com']?.scriptsPerso).toEqual([{ nom: 'Script 1', code: '', actif: true }])
    await r.getByLabel('Code du script « Script 1 »').fill('console.log(1)')
    await expect.poll(async () => (await lister(fenetre))['github.com']?.scriptsPerso?.[0].code).toBe('console.log(1)')
    await expect(rangee.locator('td').nth(7)).toHaveText('CSS + script')
    await r.getByRole('switch', { name: 'Script « Script 1 » actif' }).click()
    await expect.poll(async () => (await lister(fenetre))['github.com']?.scriptsPerso?.[0].actif).toBe(false)
    await r.getByRole('button', { name: 'Supprimer le script « Script 1 »' }).click()
    await expect.poll(async () => (await lister(fenetre))['github.com']?.scriptsPerso).toBeUndefined()

    // Style vidé : champ retiré.
    await r.getByLabel('Style personnalisé', { exact: true }).fill('')
    await expect.poll(async () => (await lister(fenetre))['github.com']?.style).toBeUndefined()

    // Suppression de la règle.
    await r.locator('#supprimer-regle').click()
    await expect(rangee).toHaveCount(0)
    await expect(r.locator('#aucune-regle')).toBeVisible()
    await expect(r.locator('.detail-regle')).toHaveCount(0)
    expect(await lister(fenetre)).toEqual({})
  } finally {
    await app.close()
  }
})

test('Règles par site : route profonde avec port, motif, et site sans règle', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate(() => window.lyra.invoke('sites:ecrire', { cle: 'https://x.fr:8443', regle: { cookies: 'bloques', scripts: 'bloques' } }))
    await fenetre.evaluate(() => window.lyra.invoke('sites:ecrire', { cle: '*.tracking-exemple.net', regle: { boucliers: 'strict' } }))
    const r = await ouvrirReglages(app, fenetre, `sites/${encodeURIComponent('https://x.fr:8443')}`)
    await expect(r.locator('h1')).toHaveText('Règles par site')
    await expect(r.locator('h2.titre-section')).toHaveText('https://x.fr:8443 — détail de la règle')
    await expect(r.locator('tr[data-site="https://x.fr:8443"]')).toHaveClass(/on/)
    await expect(ligne(r, 'cookies').getByRole('button', { name: 'Bloqués' })).toHaveAttribute('aria-pressed', 'true')
    // Étiquette rouge « Bloqués » de la colonne Scripts ; pastille grise d'un motif.
    await expect(r.locator('tr[data-site="https://x.fr:8443"] td').nth(3).locator('.etiq.rouge')).toHaveText('Bloqués')
    await expect(r.locator('tr[data-site="*.tracking-exemple.net"] .site-regle i')).toHaveText('*')

    // Changer de hash change de détail ; un site sans règle ouvre un détail aux valeurs par défaut (Supprimer inactif).
    await r.evaluate((h) => { location.hash = h }, `#/sites/${encodeURIComponent('*.tracking-exemple.net')}`)
    await expect(r.locator('h2.titre-section')).toHaveText('*.tracking-exemple.net — détail de la règle')
    await expect(ligne(r, 'boucliers').getByRole('button', { name: 'Strict' })).toHaveAttribute('aria-pressed', 'true')
    await r.evaluate((h) => { location.hash = h }, `#/sites/${encodeURIComponent('https://nouveau.fr')}`)
    await expect(r.locator('h2.titre-section')).toHaveText('https://nouveau.fr — détail de la règle')
    await expect(r.locator('#supprimer-regle')).toBeDisabled()
    // Hash invalide : pas de détail.
    await r.evaluate(() => { location.hash = '#/sites/pas%20un%20site' })
    await expect(r.locator('.detail-regle')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('Règles par site : le suffixe /style ouvre le détail avec le focus sur « Style personnalisé »', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate(() => window.lyra.invoke('sites:ecrire', { cle: 'https://x.fr:8443', regle: { style: 'a { color: red }' } }))
    const r = await ouvrirReglages(app, fenetre, `sites/${encodeURIComponent('https://x.fr:8443')}/style`)
    await expect(r.locator('h2.titre-section')).toHaveText('https://x.fr:8443 — détail de la règle')
    const editeur = r.getByLabel('Style personnalisé', { exact: true })
    await expect(editeur).toBeFocused()
    await expect(editeur).toHaveValue('a { color: red }')
    // Sans le suffixe, le focus n'est pas volé ; avec lui, il revient sur l'éditeur.
    await r.evaluate((h) => { location.hash = h }, `#/sites/${encodeURIComponent('https://x.fr:8443')}`)
    await r.locator('h1').focus()
    await r.evaluate((h) => { location.hash = h }, `#/sites/${encodeURIComponent('https://x.fr:8443')}/style`)
    await expect(editeur).toBeFocused()
    // Même route sur un site qui n'a pas encore de règle (Tâche 15) : l'éditeur est là, vide, et sa saisie crée la règle.
    await r.evaluate((h) => { location.hash = h }, `#/sites/${encodeURIComponent('https://neuf.fr')}/style`)
    await expect(r.locator('h2.titre-section')).toHaveText('https://neuf.fr — détail de la règle')
    await expect(editeur).toBeFocused()
    await editeur.fill('p { margin: 0 }')
    await expect.poll(async () => (await lister(fenetre))['https://neuf.fr']).toEqual({ style: 'p { margin: 0 }' })
  } finally {
    await app.close()
  }
})

// ---------- Corrections 14a/14b ----------

const switchScriptlets = (r: Page) => r.getByRole('switch', { name: 'Scriptlets YouTube' })
/** Scriptlets que `shields:scriptlets` renverrait à la page ouverte (onglet de Lyra) pour cette URL : appel direct du canal, côté principal. */
const scriptletsPour = (app: ElectronApplication, url: string): Promise<string[]> =>
  app.evaluate(({ ipcMain, webContents }, u) => {
    const wc = webContents.getAllWebContents().find((w) => /^lyra:\/\/(newtab|settings)/.test(w.getURL()))!
    const e = { sender: wc, senderFrame: null, returnValue: undefined as unknown }
    ipcMain.emit('shields:scriptlets', e, u)
    return e.returnValue as string[]
  }, url)

test('Scriptlets YouTube : l’interrupteur écrit scriptletsYoutube et shields:scriptlets n’en renvoie plus pour le site ; inerte si Boucliers désactivés', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    const URL_YT = 'https://youtube.com/watch?v=x'
    expect((await scriptletsPour(app, URL_YT)).length).toBeGreaterThan(0)
    await fenetre.evaluate(() => window.lyra.invoke('sites:ecrire', { cle: 'youtube.com', regle: { boucliers: 'standard' } }))
    const r = await ouvrirReglages(app, fenetre, 'sites/youtube.com')
    await expect(switchScriptlets(r)).toHaveAttribute('aria-checked', 'true')
    await switchScriptlets(r).click()
    await expect.poll(async () => (await lister(fenetre))['youtube.com']?.scriptletsYoutube).toBe(false)
    await expect.poll(() => scriptletsPour(app, URL_YT)).toEqual([])
    await switchScriptlets(r).click()
    await expect.poll(async () => 'scriptletsYoutube' in (await lister(fenetre))['youtube.com']).toBe(false)
    await expect.poll(async () => (await scriptletsPour(app, URL_YT)).length).toBeGreaterThan(0)
    // Boucliers désactivés : interrupteur éteint et inerte.
    await ligne(r, 'boucliers').getByRole('button', { name: 'Désactivés' }).click()
    await expect(switchScriptlets(r)).toBeDisabled()
    await expect(switchScriptlets(r)).toHaveAttribute('aria-checked', 'false')
  } finally {
    await app.close()
  }
})

test('Nouvelle règle : un site couvert par un motif Strict reste Strict ; une URL collée est ramenée à son origine ; la valeur héritée est affichée', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate(() => window.lyra.invoke('sites:ecrire', { cle: '*.x.test', regle: { boucliers: 'strict', cookies: 'bloques' } }))
    const r = await ouvrirReglages(app, fenetre, 'sites')
    await r.getByRole('button', { name: 'Nouvelle règle' }).click()
    await r.locator('#nouvelle-regle-site').fill('https://a.x.test/une/page?q=1')
    await r.locator('#creer-regle').click()
    await expect(r.locator('tr[data-site="https://a.x.test"]')).toBeVisible()
    await expect(r.locator('tr[data-site="https://a.x.test"]')).toHaveAttribute('aria-current', 'true')
    expect((await lister(fenetre))['https://a.x.test']).toEqual({ boucliers: 'strict' })
    // Cookies : valeur héritée du motif, affichée avec la mention ; la choisir ne l'écrit pas.
    await expect(ligne(r, 'cookies').getByRole('button', { name: 'Bloqués' })).toHaveAttribute('aria-pressed', 'true')
    await expect(ligne(r, 'cookies').locator('.herite')).toHaveText('hérité')
    await expect(r.locator('tr[data-site="https://a.x.test"] td').nth(2)).toContainText('Bloqués')
    await expect(r.locator('tr[data-site="https://a.x.test"] td').nth(2).locator('.herite')).toHaveText('hérité')
    await ligne(r, 'cookies').getByRole('button', { name: 'Tous' }).click()
    await expect.poll(async () => (await lister(fenetre))['https://a.x.test']?.cookies).toBe('tous')
    await ligne(r, 'cookies').getByRole('button', { name: 'Bloqués' }).click()
    await expect.poll(async () => 'cookies' in (await lister(fenetre))['https://a.x.test']).toBe(false)
    // Erreur reliée au champ.
    await r.getByRole('button', { name: 'Nouvelle règle' }).click()
    await r.locator('#nouvelle-regle-site').fill('pas un site')
    await r.locator('#creer-regle').click()
    await expect(r.locator('#nouvelle-regle-site')).toHaveAttribute('aria-describedby', 'erreur-nouvelle-regle')
    await r.locator('#nouvelle-regle-site').press('Escape')
    await expect(r.locator('#nouvelle-regle')).toBeFocused()
  } finally {
    await app.close()
  }
})

test('Règles par site : le détail d’une règle est désactivé en fenêtre privée', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate(() => window.lyra.invoke('sites:ecrire', { cle: 'prive.test', regle: { boucliers: 'standard' } }))
    await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.getMenuItemById('fenetre-privee')!.click())
    const estPrivee = (p: Page): boolean => p.url().includes('ui.html') && p.url().includes('#privee')
    await expect.poll(() => app.windows().find(estPrivee)).toBeDefined()
    const privee = app.windows().find(estPrivee)!
    await privee.evaluate(() => window.lyra.invoke('tabs:open', { url: 'lyra://settings#/sites/prive.test' }))
    await expect.poll(() => page(app, 'lyra://settings')).toBeDefined()
    const r = page(app, 'lyra://settings')!
    await expect(r.locator('#regles-privee')).toHaveText('Les règles par site ne peuvent pas être modifiées depuis une fenêtre privée.')
    await expect(ligne(r, 'cookies').getByRole('button', { name: '1re partie' })).toBeDisabled()
    await expect(r.locator('#supprimer-regle')).toBeDisabled()
  } finally {
    await app.close()
  }
})

test.describe('la règle ET la page', () => {
  let serveur: Server
  let PORT = 0
  test.beforeAll(async () => {
    serveur = createServer((q, r) => {
      if (new URL(q.url ?? '/', 'http://x').pathname === '/ext.js') {
        r.setHeader('content-type', 'text/javascript')
        return r.end('window.__ext = true')
      }
      r.setHeader('content-type', 'text/html')
      r.end('<!doctype html><title>regle</title><script src="/ext.js"></script>')
    })
    await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok))
    PORT = (serveur.address() as AddressInfo).port
  })
  test.afterAll(() => serveur.close())

  test('Zoom 110 % et Scripts « Bloqués » choisis dans la page : une étoile du site est zoomée et n’exécute aucun script', async () => {
    test.setTimeout(120_000)
    const { app, fenetre } = await lancerLyra()
    try {
      const site = `http://127.0.0.1:${PORT}`
      const r = await ouvrirReglages(app, fenetre, `sites/${encodeURIComponent(site)}`)
      await ligne(r, 'zoom').getByRole('button', { name: 'Zoom' }).click()
      await r.getByRole('option', { name: '110 %' }).click()
      await ligne(r, 'scripts').getByRole('button', { name: 'Bloqués' }).click()
      await expect.poll(async () => (await lister(fenetre))[site]).toEqual({ zoom: 1.1, scripts: 'bloques' })
      await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: `${u}/page` }), site)
      await expect.poll(() => page(app, `${site}/page`)).toBeDefined()
      const p = page(app, `${site}/page`)!
      await expect.poll(() => app.evaluate(({ webContents }, u) => webContents.getAllWebContents().find((w) => w.getURL().startsWith(u))?.getZoomFactor(), site)).toBeCloseTo(1.1, 2)
      await expect.poll(() => p.evaluate(() => document.readyState)).toBe('complete')
      expect(await p.evaluate(() => (window as unknown as { __ext?: boolean }).__ext === true)).toBe(false)
      // Contre-épreuve : la règle retirée, le script s'exécute au chargement suivant.
      await ligne(r, 'scripts').getByRole('button', { name: 'Autorisés' }).dispatchEvent('click')
      await expect.poll(async () => 'scripts' in (await lister(fenetre))[site]).toBe(false)
      await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: `${u}/page2` }), site)
      await expect.poll(() => page(app, `${site}/page2`)).toBeDefined()
      const p2 = page(app, `${site}/page2`)!
      await expect.poll(() => p2.evaluate(() => (window as unknown as { __ext?: boolean }).__ext === true)).toBe(true)
    } finally {
      await app.close()
    }
  })
})
