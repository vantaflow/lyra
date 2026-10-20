import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { lancerLyra } from './helpers'

// Défauts relevés par l'audit des boutons (tests/e2e/audit-*.spec.ts), hors réglages et ciel : un test par correctif.

const page = (app: ElectronApplication, debut: string): Page | undefined => app.windows().find((w) => w.url().startsWith(debut))
const overlay = (app: ElectronApplication): Page | undefined => app.windows().find((w) => w.url().includes('#overlay'))

test('l’étoile active est signalée (aria-current) : un clic dessus n’a rien à faire', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate(() => window.lyra.invoke('tabs:open', { url: 'lyra://newtab' }))
    await expect(fenetre.locator('button.star')).toHaveCount(2)
    await expect(fenetre.locator('button.star[aria-current="page"]')).toHaveCount(1)
    await expect(fenetre.locator('button.star').nth(1)).toHaveAttribute('aria-current', 'page')
    await expect(fenetre.locator('button.star').nth(0)).not.toHaveAttribute('aria-current', /.*/)
  } finally {
    await app.close()
  }
})

test('panneau des Boucliers : « Règles de ce site », « Statistiques » et « Signaler » sont marqués Bientôt et inertes (jalon D)', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate(() => window.lyra.invoke('shields:open'))
    await expect.poll(() => overlay(app)).toBeDefined()
    const o = overlay(app)!
    // Les sections « Règles par site » et « Boucliers » des réglages ne sont pas encore livrées (sections.ts).
    for (const nom of ['Règles de ce site', 'Statistiques', 'Signaler un site cassé']) {
      const lien = o.getByText(nom, { exact: true })
      await expect(lien).toHaveAttribute('aria-disabled', 'true')
      await expect(lien).toHaveAttribute('title', /Bientôt/)
      await expect(lien).not.toHaveAttribute('href', /.*/)
    }
    await expect(o.locator('.pn-bientot')).toHaveText('bientôt')
  } finally {
    await app.close()
  }
})

test('le sommaire des réglages ouvert depuis lyra://history mène à lyra://settings (pas d’IPC refusé)', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate(() => window.lyra.invoke('test:navigate', 'lyra://history'))
    await expect.poll(() => page(app, 'lyra://history')).toBeDefined()
    const h = page(app, 'lyra://history')!
    await expect(h.locator('nav a', { hasText: 'Importer et exporter' })).toHaveAttribute('href', 'lyra://settings#/importer')
    // Sur lyra://settings elle-même, le sommaire reste en ancres.
    await fenetre.evaluate(() => window.lyra.invoke('test:navigate', 'lyra://settings'))
    await expect.poll(() => page(app, 'lyra://settings')).toBeDefined()
    await expect(page(app, 'lyra://settings')!.locator('nav a', { hasText: 'Importer et exporter' })).toHaveAttribute('href', '#/importer')
  } finally {
    await app.close()
  }
})

test('réglages Réseau : « Ajouter » est désactivé tant que le champ est vide', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate(() => window.lyra.invoke('test:navigate', 'lyra://settings#/reseau'))
    await expect.poll(() => page(app, 'lyra://settings')).toBeDefined()
    const r = page(app, 'lyra://settings')!
    const ajouter = r.getByRole('button', { name: 'Ajouter', exact: true })
    await expect(ajouter).toBeDisabled()
    await r.fill('#ajout-site', 'exemple.com')
    await expect(ajouter).toBeEnabled()
  } finally {
    await app.close()
  }
})
