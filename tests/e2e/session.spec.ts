import { test, expect } from '@playwright/test'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { lancerLyra } from './helpers'

const LIENS = pathToFileURL(resolve(__dirname, 'fixtures/liens.html')).href
const PUB = pathToFileURL(resolve(__dirname, 'fixtures/pub.html')).href
const dossier = (): string => mkdtempSync(join(tmpdir(), 'lyra-session-e2e-'))

test('la session est restaurée : active réveillée, autres endormies, un clic réveille', async () => {
  const userData = dossier()
  const premier = await lancerLyra({ LYRA_USER_DATA: userData })
  await premier.fenetre.evaluate((u) => window.lyra.invoke('test:navigate', u), LIENS)
  await premier.fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), PUB)
  await expect(premier.fenetre.locator('.star')).toHaveCount(2)
  await expect(premier.fenetre.locator('.star').first().locator('.t')).toHaveText('Liens')
  await premier.app.close()

  const { app, fenetre } = await lancerLyra({ LYRA_USER_DATA: userData })
  try {
    const etoiles = fenetre.locator('.star')
    await expect(etoiles).toHaveCount(2)
    await expect(etoiles.last()).toHaveClass(/active/)
    await expect(etoiles.last()).not.toHaveClass(/dim/)
    await expect(etoiles.first()).toHaveClass(/dim/)
    await expect(etoiles.first().locator('.t')).toHaveText('Liens')

    const id = (await fenetre.evaluate(() => window.lyra.invoke('sky:get'))).sky.stars[0].id
    await etoiles.first().click()
    await expect(etoiles.first()).toHaveClass(/active/)
    await expect(etoiles.first()).not.toHaveClass(/dim/)
    await expect
      .poll(async () => (await fenetre.evaluate(() => window.lyra.invoke('sky:get'))).etats[id]?.url)
      .toBe(LIENS)
  } finally {
    await app.close()
  }
})

test('une étoile endormie garde son historique de navigation', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate((u) => window.lyra.invoke('test:navigate', u), LIENS)
    await fenetre.evaluate((u) => window.lyra.invoke('test:navigate', u), PUB)
    const id = (await fenetre.evaluate(() => window.lyra.invoke('sky:get'))).sky.stars[0].id
    // L'active ne s'endort jamais.
    expect(await fenetre.evaluate((i) => window.lyra.invoke('test:endormir', i), id)).toBe(false)
    await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), 'lyra://newtab')
    expect(await fenetre.evaluate((i) => window.lyra.invoke('test:endormir', i), id)).toBe(true)
    await expect(fenetre.locator('.star').first()).toHaveClass(/dim/)

    await fenetre.locator('.star').first().click()
    await expect
      .poll(async () => (await fenetre.evaluate(() => window.lyra.invoke('sky:get'))).etats[id]?.url)
      .toBe(PUB)
    await expect
      .poll(async () => (await fenetre.evaluate(() => window.lyra.invoke('sky:get'))).etats[id]?.canGoBack)
      .toBe(true)
  } finally {
    await app.close()
  }
})

test('un session.json corrompu donne une seule étoile lyra://newtab', async () => {
  const userData = dossier()
  writeFileSync(join(userData, 'session.json'), '{"version":1,"fenetres":[{"ciel":')
  const { app, fenetre } = await lancerLyra({ LYRA_USER_DATA: userData })
  try {
    await expect(fenetre.locator('.star')).toHaveCount(1)
    await expect(fenetre.locator('.star .t')).toHaveText('Nouvelle étoile')
    const { sky, etats } = await fenetre.evaluate(() => window.lyra.invoke('sky:get'))
    expect(etats[sky.stars[0].id].url).toMatch(/^lyra:\/\/newtab/)
  } finally {
    await app.close()
  }
  expect(JSON.parse(readFileSync(join(userData, 'session.json'), 'utf8')).version).toBe(1)
})
