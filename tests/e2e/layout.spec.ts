import { test, expect } from '@playwright/test'
import { lancerLyra } from './helpers'

test('mise en page : ciel à gauche, page décalée de 272 px et sous la capsule', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const l = await fenetre.evaluate(() => window.lyra.invoke('layout:get'))
    expect(l.ciel.position).toBe('gauche')
    expect(l.bounds.page.x).toBe(272)
    expect(l.bounds.page.y).toBe(46)
    expect(l.bounds.chrome.x).toBe(0)
  } finally {
    await app.close()
  }
})
