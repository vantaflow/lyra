import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { lancerLyra } from './helpers'
import { COULEURS_INDIGO_NUIT } from '../../src/shared/types-reglages'

const trouver = (app: { windows(): Page[] }, debut: string): Page | undefined => app.windows().find((w) => w.url().startsWith(debut))
const variable = (p: Page, nom: string): Promise<string> => p.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), nom)
const lire = (p: Page) => p.evaluate(() => window.lyra.invoke('settings:get'))

async function ouvrirCouleurs(app: ElectronApplication, fenetre: Page): Promise<Page> {
  await fenetre.evaluate(() => window.lyra.invoke('test:navigate', 'lyra://settings#/couleurs'))
  await expect.poll(() => trouver(app, 'lyra://settings')).toBeDefined()
  const r = trouver(app, 'lyra://settings')!
  await expect(r.locator('h1')).toHaveText('Couleurs et thèmes')
  await expect(r.locator('.themes .th')).toHaveCount(8)
  return r
}

test('couleurs : conforme au design (8 vignettes, 13 couleurs, libellés et hex d\'Indigo nuit)', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    const r = await ouvrirCouleurs(app, fenetre)
    await expect(r.getByText("Chaque couleur de Lyra se change, en clair comme en sombre. Partez d'un thème ou faites le vôtre.")).toBeVisible()
    await expect(r.getByRole('button', { name: 'Importer un thème' })).toBeVisible()
    await expect(r.getByRole('button', { name: 'Exporter « Mes couleurs »' })).toBeVisible()
    expect(await r.locator('.themes .th').allInnerTexts()).toEqual([
      'Indigo nuit par défaut', 'Encre', 'Forêt', 'Sable', 'Aurore', 'Clair total', 'Nuit complète', 'Mes couleurs'
    ])
    await expect(r.locator('.th[aria-pressed="true"]')).toHaveText('Indigo nuit par défaut')
    const lignes = r.locator('.card:has(.hex) .row:has(.hex)')
    await expect(lignes).toHaveCount(13)
    const titres = await lignes.locator('.lbl > span:first-child').allInnerTexts()
    expect(titres).toEqual([
      'Ciel — fond', 'Ciel — texte', 'Étoile active', 'Étoile active — fond', 'Étoiles', 'Étoiles endormies', 'Lignes de constellation',
      'Capsule — fond', 'Capsule — texte', 'Accent', 'Boucliers', 'Pages de Lyra — fond', 'Nouvel onglet — ciel'
    ])
    expect(await lignes.first().locator('.hex-val').allInnerTexts()).toEqual(['#15152E', '#0E0E1E'])
    expect(await lignes.nth(9).locator('.hex-val').allInnerTexts()).toEqual(['#5452C8', '#8B8AF0'])
    expect(await lignes.last().locator('.hex-val').allInnerTexts()).toEqual(['#0F0F26', '#090916'])
    await expect(r.getByRole('switch', { name: 'Teinte du site' })).toHaveAttribute('aria-checked', 'false')
    await expect(r.getByRole('switch', { name: 'Couleur par constellation' })).toHaveAttribute('aria-checked', 'true')
    await expect(r.getByRole('switch', { name: 'Sombre pour les sites' })).toHaveAttribute('aria-checked', 'true')
  } finally {
    await app.close()
  }
})

test('couleurs : « Nuit complète » change --ciel dans la vue UI et la page réglages sans rechargement', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    const r = await ouvrirCouleurs(app, fenetre)
    await fenetre.evaluate(() => ((window as unknown as { __marque: number }).__marque = 1))
    await r.evaluate(() => ((window as unknown as { __marque: number }).__marque = 1))
    await expect.poll(() => variable(fenetre, '--ciel')).toBe('#15152e')
    await r.getByRole('button', { name: 'Nuit complète' }).click()
    await expect.poll(() => variable(fenetre, '--ciel')).toBe('#0e0e1e')
    await expect.poll(() => variable(r, '--ciel')).toBe('#0e0e1e')
    expect(await fenetre.evaluate(() => (window as unknown as { __marque?: number }).__marque)).toBe(1)
    expect(await r.evaluate(() => (window as unknown as { __marque?: number }).__marque)).toBe(1)
    await expect(r.locator('.th[aria-pressed="true"]')).toHaveText('Nuit complète')
    // Un thème prêt restaure toutes ses valeurs dans le tableau.
    await expect(r.locator('.hex-val').first()).toHaveText('#0E0E1E')
    await r.getByRole('button', { name: 'Indigo nuit' }).click()
    await expect.poll(() => variable(fenetre, '--ciel')).toBe('#15152e')
    await expect(r.locator('.hex-val').first()).toHaveText('#15152E')
  } finally {
    await app.close()
  }
})

test('couleurs : modifier une couleur affiche « Mes couleurs — modifié » et la diffuse', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    const r = await ouvrirCouleurs(app, fenetre)
    const mes = r.locator('.th', { hasText: 'Mes couleurs' })
    await expect(mes).not.toContainText('modifié')
    await r.getByRole('button', { name: 'Ciel — fond, clair : #15152E', exact: true }).click()
    await r.getByLabel('Ciel — fond, clair : valeur').fill('#204060')
    await r.getByLabel('Ciel — fond, clair : valeur').press('Enter')
    await expect(mes).toContainText('Mes couleurs')
    await expect(mes).toContainText('modifié')
    await expect(mes).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => variable(fenetre, '--ciel')).toBe('#204060')
    await expect.poll(async () => (await lire(fenetre)).couleurs.personnalisees?.['ciel-fond'].clair).toBe('#204060')
    // Remise à la valeur de départ : plus « modifié ».
    await r.getByRole('button', { name: 'Ciel — fond, clair : #204060', exact: true }).click()
    await r.getByLabel('Ciel — fond, clair : valeur').fill('15152e')
    await r.getByLabel('Ciel — fond, clair : valeur').press('Enter')
    await expect(mes).not.toContainText('modifié')
    // Une valeur invalide est ignorée.
    await r.getByRole('button', { name: 'Accent, sombre : #8B8AF0', exact: true }).click()
    await r.getByLabel('Accent, sombre : valeur').fill('rouge')
    await r.getByLabel('Accent, sombre : valeur').press('Enter')
    await expect(mes).not.toContainText('modifié')
  } finally {
    await app.close()
  }
})

test('couleurs : « Avec le système » et « Jamais » modifient theme, en phase avec Apparence', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    const r = await ouvrirCouleurs(app, fenetre)
    const pose = (nom: string) => r.locator('.seg button', { hasText: nom })
    expect(await r.locator('.seg button').allInnerTexts()).toEqual(['Avec le système', 'Au coucher du soleil', 'À une heure fixe', 'Jamais'])
    await expect(pose('Avec le système')).toHaveAttribute('aria-pressed', 'true')
    await pose('Jamais').click()
    await expect.poll(async () => (await lire(fenetre)).theme).toBe('clair')
    await expect(pose('Jamais')).toHaveAttribute('aria-pressed', 'true')
    await pose('Avec le système').click()
    await expect.poll(async () => (await lire(fenetre)).theme).toBe('systeme')
    await pose('Au coucher du soleil').click()
    await expect.poll(async () => (await lire(fenetre)).theme).toBe('programme')
    expect((await lire(fenetre)).couleurs.passage).toBe('coucher')
    // Réglé depuis ailleurs (Apparence : Sombre) : aucun segment allumé.
    await fenetre.evaluate(() => window.lyra.invoke('settings:set', { theme: 'sombre' }))
    await expect(r.locator('.seg button[aria-pressed="true"]')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('couleurs : « À une heure fixe » est active, montre la plage et l\'écrit', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    const r = await ouvrirCouleurs(app, fenetre)
    const heure = r.locator('.seg button', { hasText: 'À une heure fixe' })
    await expect(heure).toBeEnabled()
    await expect(r.getByLabel('Début du mode sombre')).toHaveCount(0)
    await heure.click()
    await expect.poll(async () => (await lire(fenetre)).couleurs.passage).toBe('heure')
    expect((await lire(fenetre)).theme).toBe('programme')
    await expect(r.getByLabel('Début du mode sombre')).toHaveValue('21:00')
    await expect(r.getByLabel('Fin du mode sombre')).toHaveValue('07:00')
    await r.getByLabel('Début du mode sombre').fill('22:30')
    await r.getByLabel('Fin du mode sombre').fill('06:15')
    await expect.poll(async () => (await lire(fenetre)).couleurs.heureSombre).toBe('22:30')
    await expect.poll(async () => (await lire(fenetre)).couleurs.heureClair).toBe('06:15')
    await r.locator('.seg button', { hasText: 'Jamais' }).click()
    await expect(r.getByLabel('Début du mode sombre')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('couleurs : la recherche « plage » saute à « Passer en sombre » quand la plage est masquée', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate(() => window.lyra.invoke('test:navigate', 'lyra://settings#/general'))
    await expect.poll(() => trouver(app, 'lyra://settings')).toBeDefined()
    const r = trouver(app, 'lyra://settings')!
    await r.locator('#chercher-reglage').fill('plage')
    await r.locator('[data-resultat="couleurs.heure"]').click()
    await expect(r.locator('h1')).toHaveText('Couleurs et thèmes')
    await expect(r.locator('[data-reglage="couleurs.passage"]')).toHaveClass(/trouve/)
    await expect(r.getByLabel('Début du mode sombre')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('couleurs : Échap n\'applique rien, Entrée n\'écrit qu\'une fois', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    const r = await ouvrirCouleurs(app, fenetre)
    const mes = r.locator('.th', { hasText: 'Mes couleurs' })
    await r.getByRole('button', { name: 'Ciel — fond, clair : #15152E', exact: true }).click()
    await r.getByLabel('Ciel — fond, clair : valeur').fill('#204060')
    await r.getByLabel('Ciel — fond, clair : valeur').press('Escape')
    await expect(r.getByLabel('Ciel — fond, clair : valeur')).toHaveCount(0)
    await r.waitForTimeout(300)
    expect((await lire(fenetre)).couleurs.personnalisees).toBeNull()
    await expect(mes).not.toContainText('modifié')
    expect(await variable(fenetre, '--ciel')).toBe('#15152e')

    // Entrée : une seule écriture de « Mes couleurs ».
    await r.evaluate(() => {
      const w = window as unknown as { __ecritures: number }
      w.__ecritures = 0
      window.lyra.on('settings:changed', (x) => {
        if (x.couleurs.personnalisees) w.__ecritures++
      })
    })
    await r.getByRole('button', { name: 'Ciel — fond, clair : #15152E', exact: true }).click()
    await r.getByLabel('Ciel — fond, clair : valeur').fill('#204060')
    await r.getByLabel('Ciel — fond, clair : valeur').press('Enter')
    await expect(mes).toContainText('modifié')
    await r.waitForTimeout(400)
    expect(await r.evaluate(() => (window as unknown as { __ecritures: number }).__ecritures)).toBe(1)
  } finally {
    await app.close()
  }
})

test('couleurs : éditer depuis un thème prêt demande confirmation avant de remplacer « Mes couleurs »', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    const r = await ouvrirCouleurs(app, fenetre)
    // Une personnalisation existe déjà (accent), puis on affiche Forêt.
    await r.getByRole('button', { name: 'Accent, clair : #5452C8', exact: true }).click()
    await r.getByLabel('Accent, clair : valeur').fill('#010203')
    await r.getByLabel('Accent, clair : valeur').press('Enter')
    await expect.poll(async () => (await lire(fenetre)).couleurs.personnalisees?.accent.clair).toBe('#010203')
    await r.getByRole('button', { name: 'Forêt' }).click()
    await expect.poll(async () => (await lire(fenetre)).couleurs.actif).toBe('foret')
    const ciel = (await lire(fenetre)).couleurs.personnalisees!['ciel-fond'].clair

    const champ = async (): Promise<void> => {
      await r.getByRole('button', { name: /^Ciel — fond, clair : #/ }).click()
      await r.getByLabel('Ciel — fond, clair : valeur').fill('#204060')
      await r.getByLabel('Ciel — fond, clair : valeur').press('Enter')
    }
    await champ()
    await expect(r.getByText('Remplacer Mes couleurs par une copie de Forêt ?')).toBeVisible()
    // Le focus passe à « Remplacer » ; Échap = Annuler.
    await expect(r.getByRole('button', { name: 'Remplacer' })).toBeFocused()
    await r.keyboard.press('Escape')
    await expect(r.getByText('Remplacer Mes couleurs par une copie de Forêt ?')).toHaveCount(0)
    await r.waitForTimeout(300)
    expect((await lire(fenetre)).couleurs.actif).toBe('foret')
    await champ()
    await expect(r.getByText('Remplacer Mes couleurs par une copie de Forêt ?')).toBeVisible()
    await r.getByRole('button', { name: 'Annuler' }).click()
    await expect(r.getByText('Remplacer Mes couleurs par une copie de Forêt ?')).toHaveCount(0)
    await r.waitForTimeout(300)
    const apres = (await lire(fenetre)).couleurs
    expect(apres.actif).toBe('foret')
    expect(apres.personnalisees!.accent.clair).toBe('#010203')
    expect(apres.personnalisees!['ciel-fond'].clair).toBe(ciel)

    await champ()
    await r.getByRole('button', { name: 'Remplacer' }).click()
    await expect.poll(async () => (await lire(fenetre)).couleurs.actif).toBe('mes-couleurs')
    const fin = (await lire(fenetre)).couleurs
    expect(fin.depart).toBe('foret')
    expect(fin.personnalisees!['ciel-fond'].clair).toBe('#204060')
    expect(fin.personnalisees!.accent.clair).not.toBe('#010203')
    await expect(r.locator('.th', { hasText: 'Mes couleurs' })).toContainText('modifié')
  } finally {
    await app.close()
  }
})

const contrasteLigne = (r: Page) => r.locator('.row', { hasText: 'Contraste insuffisant ?' })

test('couleurs : un texte trop pâle est ajusté sans clic dans la vue UI, l\'étiquette le dit, la couleur choisie reste', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    const r = await ouvrirCouleurs(app, fenetre)
    await expect(contrasteLigne(r)).toContainText('Lyra vérifie chaque paire texte/fond (4,5:1) et corrige la couleur du texte')
    await expect(contrasteLigne(r)).not.toContainText('bientôt')
    const interrupteur = contrasteLigne(r).getByRole('switch', { name: 'Corriger le contraste' })
    await expect(interrupteur).toBeEnabled()
    await expect(interrupteur).toHaveAttribute('aria-checked', 'true')
    // Thème par défaut : aucune paire fautive, aucune étiquette.
    await expect(r.locator('.contraste-etiquette')).toHaveCount(0)

    const perso = structuredClone(COULEURS_INDIGO_NUIT)
    perso['ciel-texte'].clair = '#3A3A60'
    await fenetre.evaluate((p) => window.lyra.invoke('settings:set', { couleurs: { actif: 'mes-couleurs', personnalisees: p, reference: p } } as never), perso)
    const etiquette = r.locator('.row', { hasText: 'Ciel — texte' }).locator('.contraste-etiquette[data-mode="clair"]')
    await expect(etiquette).toHaveText(/^Ajustée : \d,\d:1 → 4,\d:1$/)
    await expect(r.locator('.contraste-etiquette')).toHaveCount(1)
    // Diffusée : la variable de la vue UI est corrigée (≥ 4,5:1), la valeur choisie reste affichée et enregistrée.
    await expect.poll(() => variable(fenetre, '--ciel-texte')).not.toBe('#3a3a60')
    const ratio = await fenetre.evaluate(() => {
      const lum = (hex: string): number => {
        const [R, G, B] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        return 0.2126 * R + 0.7152 * G + 0.0722 * B
      }
      const v = (n: string): string => getComputedStyle(document.documentElement).getPropertyValue(n).trim()
      const [a, b] = [lum(v('--ciel-texte')), lum(v('--ciel'))].sort((x, y) => y - x)
      return (a + 0.05) / (b + 0.05)
    })
    expect(ratio).toBeGreaterThanOrEqual(4.5)
    await expect(r.getByRole('button', { name: 'Ciel — texte, clair : #3A3A60', exact: true })).toBeVisible()
    expect((await lire(fenetre)).couleurs.personnalisees!['ciel-texte'].clair).toBe('#3A3A60')
  } finally {
    await app.close()
  }
})

test('couleurs : correction désactivée, la couleur choisie est diffusée telle quelle et l\'étiquette indique le contraste', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    const r = await ouvrirCouleurs(app, fenetre)
    const perso = structuredClone(COULEURS_INDIGO_NUIT)
    perso['ciel-texte'].clair = '#3A3A60'
    await fenetre.evaluate((p) => window.lyra.invoke('settings:set', { couleurs: { actif: 'mes-couleurs', personnalisees: p, reference: p } } as never), perso)
    await expect.poll(() => variable(fenetre, '--ciel-texte')).not.toBe('#3a3a60')
    await contrasteLigne(r).getByRole('switch', { name: 'Corriger le contraste' }).click()
    await expect.poll(async () => (await lire(fenetre)).couleurs.corrigerContraste).toBe(false)
    await expect.poll(() => variable(fenetre, '--ciel-texte')).toBe('#3a3a60')
    await expect.poll(() => variable(r, '--ciel-texte')).toBe('#3a3a60')
    await expect(r.locator('.row', { hasText: 'Ciel — texte' }).locator('.contraste-etiquette[data-mode="clair"]')).toHaveText(/^Contraste \d,\d:1$/)
    // Réactivé : de nouveau corrigée.
    await contrasteLigne(r).getByRole('switch', { name: 'Corriger le contraste' }).click()
    await expect.poll(() => variable(fenetre, '--ciel-texte')).not.toBe('#3a3a60')
  } finally {
    await app.close()
  }
})
