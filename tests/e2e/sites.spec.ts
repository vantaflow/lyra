import { test, expect } from '@playwright/test'
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
