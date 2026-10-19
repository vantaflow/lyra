import { test, expect } from '@playwright/test'
import { lancerLyra } from './helpers'

test('Lyra démarre et affiche sa fenêtre', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    expect(await fenetre.title()).toContain('Lyra')
  } finally {
    await app.close()
  }
})
