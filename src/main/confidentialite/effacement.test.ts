import { describe, expect, it, vi } from 'vitest'
import { effacerALaFermeture, effacerMaintenant, type ActionsEffacement } from './effacement'

function actions(surcharges: Partial<ActionsEffacement> = {}): ActionsEffacement & { appels: string[] } {
  const appels: string[] = []
  return {
    appels,
    historique: () => void appels.push('historique'),
    cookies: async () => void appels.push('cookies'),
    cache: async () => void appels.push('cache'),
    ...surcharges
  }
}

describe('effacerALaFermeture', () => {
  it('appelle seulement les actions des cases cochées', async () => {
    const a = actions()
    await effacerALaFermeture({ effacerHistorique: true, effacerCookies: false, effacerCache: true }, a)
    expect(a.appels.sort()).toEqual(['cache', 'historique'])
  })

  it('aucune case cochée : aucune action', async () => {
    const a = actions()
    const fait = await effacerALaFermeture({ effacerHistorique: false, effacerCookies: false, effacerCache: false }, a)
    expect(a.appels).toEqual([])
    expect(fait).toEqual([])
  })

  it('renvoie ce qui a été effacé', async () => {
    const fait = await effacerALaFermeture({ effacerHistorique: false, effacerCookies: true, effacerCache: false }, actions())
    expect(fait).toEqual(['cookies'])
  })

  it("une action qui échoue n'empêche pas les autres et n'est pas comptée", async () => {
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const a = actions({ cookies: async () => Promise.reject(new Error('session détruite')) })
    const fait = await effacerALaFermeture({ effacerHistorique: true, effacerCookies: true, effacerCache: true }, a)
    expect(a.appels.sort()).toEqual(['cache', 'historique'])
    expect(fait.sort()).toEqual(['cache', 'historique'])
    erreur.mockRestore()
  })

  it('une action synchrone qui lève est aussi absorbée', async () => {
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const a = actions({ historique: () => { throw new Error('disque plein') } })
    const fait = await effacerALaFermeture({ effacerHistorique: true, effacerCookies: true, effacerCache: false }, a)
    expect(fait).toEqual(['cookies'])
    erreur.mockRestore()
  })
})

describe('effacerMaintenant', () => {
  it("efface tout, quelles que soient les cases de l'effacement à la fermeture", async () => {
    const a = actions()
    const fait = await effacerMaintenant(a)
    expect(a.appels.sort()).toEqual(['cache', 'cookies', 'historique'])
    expect(fait.sort()).toEqual(['cache', 'cookies', 'historique'])
  })
})
