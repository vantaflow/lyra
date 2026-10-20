import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { lancerLyra } from './helpers'

const trouver = (app: { windows(): Page[] }, debut: string): Page | undefined => app.windows().find((w) => w.url().startsWith(debut))
const variable = (p: Page, nom: string): Promise<string> => p.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), nom)
const lire = (p: Page) => p.evaluate(() => window.lyra.invoke('settings:get'))
const ecrire = (p: Page, patch: Record<string, unknown>) => p.evaluate((x) => window.lyra.invoke('settings:set', x as never), patch)

async function ouvrir(app: ElectronApplication, fenetre: Page): Promise<Page> {
  await fenetre.evaluate(() => window.lyra.invoke('test:navigate', 'lyra://settings#/apparence'))
  await expect.poll(() => trouver(app, 'lyra://settings')).toBeDefined()
  const r = trouver(app, 'lyra://settings')!
  await expect(r.locator('h1')).toHaveText("Le ciel et l'apparence")
  return r
}

test('apparence : la section reprend chaque ligne du design, dans l\'ordre', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    const r = await ouvrir(app, fenetre)
    await expect(r.getByText('Où vit le ciel, comment brillent les étoiles, et à quoi ressemble Lyra.')).toBeVisible()
    expect(await r.locator('h2.titre-section').allTextContents()).toEqual(['Position du ciel', 'Étoiles et constellations', 'Apparence'])
    const titres = (n: number) => r.locator('.card').nth(n).locator('.row > .lbl > span:first-child').allInnerTexts()
    expect(await titres(1)).toEqual([
      "Relier un onglet à celui qui l'a ouvert", 'Afficher les icônes des sites à la place des points', 'Ternir une étoile inactive après',
      'Endormir une étoile inactive après', 'Archiver les étoiles éteintes depuis', 'Nouvelle étoile ouverte', 'Regrouper automatiquement par site'
    ])
    expect(await titres(2)).toEqual([
      'Thème', "Couleur de l'étoile active", 'Couleur du ciel', "Police de l'interface", "Taille du texte de l'interface", 'Densité',
      'Coins arrondis de la page', 'Masquer la capsule quand la souris ne bouge plus'
    ])
    expect(await r.locator('[data-reglage="apparence.theme"] .seg button').allInnerTexts()).toEqual(['Système', 'Clair', 'Sombre', 'Programmé'])
    await expect(r.getByRole('button', { name: 'Ternir une étoile inactive après' })).toHaveText('30 minutes')
    await expect(r.getByRole('button', { name: 'Endormir une étoile inactive après' })).toHaveText('2 heures')
    await expect(r.getByRole('button', { name: 'Archiver les étoiles éteintes depuis' })).toHaveText('Jamais')
    await expect(r.locator('[data-reglage="apparence.tailleTexte"] .hint')).toHaveText('13 px')
    expect(await r.locator('[data-reglage="apparence.couleurEtoile"] .sw').evaluateAll((l) => l.map((e) => (e as HTMLElement).getAttribute('aria-label')))).toEqual(['Or', 'Menthe', 'Bleu Véga', 'Rose', 'Blanc'])
    expect(await r.locator('[data-reglage="apparence.couleurCiel"] .sw').evaluateAll((l) => l.map((e) => (e as HTMLElement).getAttribute('aria-label')))).toEqual(['Indigo nuit', 'Noir', 'Ardoise', 'Forêt'])
    await expect(r.locator('[data-reglage="apparence.couleurEtoile"] .sw[aria-pressed="true"]')).toHaveAttribute('aria-label', 'Or')
    await expect(r.locator('[data-reglage="apparence.couleurCiel"] .sw[aria-pressed="true"]')).toHaveAttribute('aria-label', 'Indigo nuit')
  } finally {
    await app.close()
  }
})

test('apparence : choisir la pastille Menthe change --etoile-active (ciel et page réglages), Autre… reste un choix libre', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    const r = await ouvrir(app, fenetre)
    expect(await variable(fenetre, '--etoile-active')).toBe('#f4c56a')
    await r.getByRole('button', { name: 'Menthe' }).click()
    await expect.poll(() => variable(fenetre, '--etoile-active')).toBe('#5fd3b3')
    await expect.poll(() => variable(r, '--etoile-active')).toBe('#5fd3b3')
    const s = await lire(fenetre)
    expect(s.couleurs.actif).toBe('mes-couleurs')
    expect(s.couleurs.depart).toBe('indigo-nuit')
    await expect(r.locator('[data-reglage="apparence.couleurEtoile"] .sw[aria-pressed="true"]')).toHaveAttribute('aria-label', 'Menthe')
    // Le ciel : Noir, puis une couleur hors pastilles (« Autre… » actif).
    await r.getByRole('button', { name: 'Noir' }).click()
    await expect.poll(() => variable(fenetre, '--ciel')).toBe('#0b0b12')
    await ecrire(fenetre, { couleurs: { personnalisees: { ...(await lire(fenetre)).couleurs.personnalisees!, 'ciel-fond': { clair: '#123456', sombre: '#0E0E1E' } } } })
    await expect(r.locator('[data-reglage="apparence.couleurCiel"] .sw[aria-pressed="true"]')).toHaveCount(0)
    await expect(r.locator('[data-reglage="apparence.couleurCiel"] .btn')).toHaveAttribute('aria-pressed', 'true')
  } finally {
    await app.close()
  }
})

test('apparence : une pastille qui écraserait une personnalisation différente demande confirmation', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    // Mes couleurs personnalisé (étoile Rose), puis thème affiché : Forêt.
    const r0 = await ouvrir(app, fenetre)
    await r0.getByRole('button', { name: 'Rose' }).click()
    await expect.poll(async () => (await lire(fenetre)).couleurs.personnalisees?.['etoile-active'].clair).toBe('#F08FB0')
    await ecrire(fenetre, { couleurs: { actif: 'foret' } })
    await r0.getByRole('button', { name: 'Blanc' }).click()
    await expect(r0.getByRole('alertdialog')).toBeVisible()
    await r0.getByRole('button', { name: 'Annuler' }).click()
    expect((await lire(fenetre)).couleurs.actif).toBe('foret')
    await r0.getByRole('button', { name: 'Blanc' }).click()
    await r0.getByRole('button', { name: 'Remplacer' }).click()
    await expect.poll(async () => (await lire(fenetre)).couleurs.actif).toBe('mes-couleurs')
    const s = await lire(fenetre)
    expect(s.couleurs.depart).toBe('foret')
    expect(s.couleurs.personnalisees?.['etoile-active'].clair).toBe('#FFFFFF')
  } finally {
    await app.close()
  }
})

test('apparence : « Thème » et « Passer en sombre » partagent la même source', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    const r = await ouvrir(app, fenetre)
    await r.locator('[data-reglage="apparence.theme"]').getByRole('button', { name: 'Programmé' }).click()
    await expect.poll(async () => (await lire(fenetre)).theme).toBe('programme')
    expect((await lire(fenetre)).couleurs.passage).toBe('coucher')
    await fenetre.evaluate(() => window.lyra.invoke('test:navigate', 'lyra://settings#/couleurs'))
    await expect(r.locator('[data-reglage="couleurs.passage"] [aria-pressed="true"]')).toHaveText('Au coucher du soleil')
    await ecrire(fenetre, { theme: 'clair', couleurs: { passage: 'jamais' } })
    await fenetre.evaluate(() => window.lyra.invoke('test:navigate', 'lyra://settings#/apparence'))
    await expect(r.locator('[data-reglage="apparence.theme"] [aria-pressed="true"]')).toHaveText('Clair')
  } finally {
    await app.close()
  }
})

test('apparence : densité compacte et coins carrés changent le ciel et le cadre de page', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    const r = await ouvrir(app, fenetre)
    const hauteur = () => fenetre.locator('.star').first().evaluate((e) => e.getBoundingClientRect().height)
    const rayon = () => fenetre.locator('.carte').evaluate((e) => getComputedStyle(e).borderRadius)
    expect(await hauteur()).toBe(32)
    expect(await rayon()).toBe('12px 0px 0px 12px')
    await r.locator('[data-reglage="apparence.densite"]').getByRole('button', { name: 'Compacte' }).click()
    await expect.poll(hauteur).toBeLessThan(32)
    expect(await variable(fenetre, '--densite')).toBe('26px')
    await r.getByRole('switch', { name: 'Coins arrondis' }).click()
    await expect.poll(rayon).toBe('0px')
    await r.getByRole('switch', { name: 'Coins arrondis' }).click()
    await expect.poll(rayon).toBe('12px 0px 0px 12px')
    await ecrire(fenetre, { apparence: { tailleTexte: 16, police: 'Georgia' } })
    await expect.poll(() => variable(fenetre, '--taille-texte')).toBe('16px')
    await expect.poll(() => fenetre.locator('.star').first().evaluate((e) => getComputedStyle(e).fontSize)).toBe('16px')
    await expect.poll(() => fenetre.locator('.star').first().evaluate((e) => getComputedStyle(e).fontFamily)).toContain('Georgia')
  } finally {
    await app.close()
  }
})

test('apparence : lignes de constellation et icônes des sites', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    await ecrire(fenetre, { apparence: { relierEnfants: false } })
    await expect(fenetre.locator('.ciel.sans-lignes')).toBeVisible()
    await ecrire(fenetre, { apparence: { relierEnfants: true } })
    await expect(fenetre.locator('.ciel.sans-lignes')).toHaveCount(0)
    expect(await fenetre.locator('.star .dot').count()).toBeGreaterThan(0)
    await ecrire(fenetre, { apparence: { iconesSites: true } })
    // Aucun favicon connu pour le nouvel onglet : le point reste.
    expect(await fenetre.locator('.star .dot').count()).toBeGreaterThan(0)
  } finally {
    await app.close()
  }
})

test('apparence : la capsule se masque à l\'immobilité puis se révèle au mouvement ou près du haut', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    const etat = () => fenetre.locator('.capsule').getAttribute('data-masquee')
    expect(await etat()).toBe('0')
    await ecrire(fenetre, { apparence: { capsuleAuto: true } })
    await expect.poll(etat, { timeout: 6000 }).toBe('1')
    await fenetre.mouse.move(400, 300)
    await expect.poll(etat).toBe('0')
    await expect.poll(etat, { timeout: 6000 }).toBe('1')
    // Près du haut (moins de 40 px) : visible et elle le reste bien après 2 s.
    await fenetre.mouse.move(420, 12)
    await expect.poll(etat).toBe('0')
    await fenetre.waitForTimeout(2600)
    expect(await etat()).toBe('0')
    // Désactivé : jamais masquée.
    await ecrire(fenetre, { apparence: { capsuleAuto: false } })
    await fenetre.mouse.move(420, 300)
    await fenetre.waitForTimeout(2600)
    expect(await etat()).toBe('0')
  } finally {
    await app.close()
  }
})

test('apparence : la police choisie atteint la pilule, « Nouvelle étoile » et les étoiles de la bande', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    const famille = (sel: string) => fenetre.locator(sel).first().evaluate((e) => getComputedStyle(e).fontFamily)
    await ecrire(fenetre, { apparence: { police: 'Georgia' } })
    await expect.poll(() => famille('.pilule')).toContain('Georgia')
    expect(await famille('.nouvelle')).toContain('Georgia')
    expect(await famille('.star')).toContain('Georgia')
    expect(await famille('.palette')).toContain('Georgia')
    await ecrire(fenetre, { ciel: { position: 'haut' } })
    await expect(fenetre.locator('.hs').first()).toBeVisible()
    expect(await famille('.hs')).toContain('Georgia')
  } finally {
    await app.close()
  }
})

test('apparence : la taille du texte suit les étoiles (colonne et bande), la pilule et les libellés du ciel, pas les réglages', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    const r = await ouvrir(app, fenetre)
    const taille = (p: Page, sel: string) => p.locator(sel).first().evaluate((e) => getComputedStyle(e).fontSize)
    const avantReglages = await taille(r, '.row .lbl')
    await ecrire(fenetre, { apparence: { tailleTexte: 16 } })
    await expect.poll(() => taille(fenetre, '.star')).toBe('16px')
    expect(await taille(fenetre, '.pilule')).toBe('16.5px')
    expect(await taille(fenetre, '.nouvelle')).toBe('16px')
    expect(await taille(fenetre, '.palette')).toBe('16px')
    expect(await taille(r, '.row .lbl')).toBe(avantReglages)
    await ecrire(fenetre, { ciel: { position: 'haut' } })
    await expect(fenetre.locator('.hs').first()).toBeVisible()
    expect(await taille(fenetre, '.hs')).toBe('16px')
    // Le curseur de la page réglages affiche « N px » pendant le glissement.
    await r.locator('input[aria-label="Taille du texte"]').evaluate((e: HTMLInputElement) => {
      e.value = '15'
      e.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await expect(r.locator('[data-reglage="apparence.tailleTexte"] .hint')).toHaveText('15 px')
  } finally {
    await app.close()
  }
})

test('apparence : la capsule revient au mouvement sur la page, reste visible dessous le curseur et au clavier', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    const etat = () => fenetre.locator('.capsule').getAttribute('data-masquee')
    await ecrire(fenetre, { apparence: { capsuleAuto: true } })
    await expect.poll(etat, { timeout: 6000 }).toBe('1')
    // Mouvement sur la vue de la page (une autre vue que l'interface) : le processus principal le relaie.
    await app.evaluate(({ webContents }) => {
      const page = webContents.getAllWebContents().find((w) => w.getURL().startsWith('lyra://newtab'))!
      page.sendInputEvent({ type: 'mouseMove', x: 300, y: 200 })
    })
    await expect.poll(etat, { timeout: 3000 }).toBe('0')
    await expect.poll(etat, { timeout: 6000 }).toBe('1')
    // Clavier : le focus dans la capsule la révèle.
    await fenetre.locator('.pilule').focus()
    await expect.poll(() => fenetre.locator('.capsule').evaluate((e) => getComputedStyle(e).opacity)).toBe('1')
    await fenetre.locator('.pilule').blur()
    await expect.poll(etat, { timeout: 6000 }).toBe('1')
    // Les 6 derniers px de la capsule (40-46) comptent comme « dessus ».
    await fenetre.mouse.move(400, 44)
    await fenetre.waitForTimeout(2600)
    expect(await etat()).toBe('0')
  } finally {
    await app.close()
  }
})
