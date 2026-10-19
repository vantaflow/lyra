import { test, expect } from '@playwright/test'
import { lancerLyra } from './helpers'

test('window.lyra : réglages lisibles et modifiables via IPC', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const s = await fenetre.evaluate(() => window.lyra.invoke('settings:get'))
    expect(s.theme).toBe('systeme')
    const m = await fenetre.evaluate(() => window.lyra.invoke('settings:set', { theme: 'sombre' }))
    expect(m.theme).toBe('sombre')
  } finally {
    await app.close()
  }
})
