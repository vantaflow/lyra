import { test, expect } from '@playwright/test'
import { lancerLyra } from './helpers'

test('mise en page : ciel à gauche, page décalée de 272 px', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const l = await fenetre.evaluate(() => window.lyra.invoke('layout:get'))
    expect(l.ciel.position).toBe('gauche')
    expect(l.bounds.page.x).toBe(272)
    expect(l.bounds.chrome.width).toBe(272)
  } finally {
    await app.close()
  }
})
