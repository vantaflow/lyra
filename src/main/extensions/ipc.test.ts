import { beforeEach, describe, expect, it, vi } from 'vitest'

const handlers = new Map<string, (d: unknown, e: unknown) => unknown>()
vi.mock('../ipc', () => ({ handle: (canal: string, fn: (d: unknown, e: unknown) => unknown) => void handlers.set(canal, fn) }))

import { installerExtensionsIpc, type OptionsIpcExtensions } from './ipc'

const id = (c: string): string => c.repeat(32)
const sender = {} as never
const evenement = { sender }

function monter(file: unknown, o: Partial<OptionsIpcExtensions> = {}) {
  let courante = file
  const diffusions: string[] = []
  const installerChrome = vi.fn(async (i: string) => ({ etat: 'installee' as const, id: i, nom: 'X', version: '1' }))
  const options = {
    chargeur: { lister: () => [], activer: vi.fn(async () => true), desinstaller: vi.fn(async () => true) },
    installateur: { installerChrome },
    firefox: { installerAmoStrict: vi.fn() },
    miseAJour: {},
    journal: { supprimer: () => undefined },
    pagesExtension: () => [],
    choisir: async () => undefined,
    estPrivee: () => false,
    lireManifest: () => undefined,
    ouvrirEtoile: () => undefined,
    ecrireRegleSite: () => undefined,
    diffuser: (canal: string) => void diffusions.push(canal),
    lireFile: () => courante,
    ecrireFile: (l: unknown[]) => {
      courante = l
    },
    modeTest: false,
    ...o
  } as unknown as OptionsIpcExtensions
  installerExtensionsIpc(options)
  return { appeler: (d?: unknown) => handlers.get('extensions:consommerFile')!(d, evenement) as Promise<{ resultats: Array<{ etat: string }>; restantes: unknown[] }>, diffusions, courante: () => courante, installerChrome, handlers }
}

const entree = (c: string, o: Record<string, unknown> = {}): Record<string, unknown> => ({ id: id(c), nom: `Ext ${c}`, magasin: 'chrome', actif: true, source: 'chrome', date: 1, ...o })

beforeEach(() => handlers.clear())

describe('extensions:consommerFile', () => {
  it('ne se fie pas à la page : les entrées envoyées sont ignorées, la file vient des réglages', async () => {
    const m = monter([entree('a')])
    const r = await m.appeler({ entrees: [entree('z')] } as never)
    expect(m.installerChrome.mock.calls.map((c) => c[0])).toEqual([id('a')])
    expect(r.resultats).toHaveLength(1)
    expect(m.courante()).toEqual([])
    expect(m.diffusions).toContain('extensions:finFile')
  })

  it('une imposée reste dans la file, intacte, tant qu’elle n’est pas confirmée (magasin:id)', async () => {
    const imposee = entree('d', { imposee: true, date: 99, source: 'edge' })
    const m = monter([imposee])
    expect((await m.appeler()).resultats[0].etat).toBe('a-confirmer')
    expect(m.courante()).toEqual([imposee])
    expect((await m.appeler({ confirmees: [`chrome:${id('d')}`] })).resultats[0].etat).toBe('installee')
    expect(m.courante()).toEqual([])
  })

  it('jamais depuis une fenêtre privée, et une seule file à la fois', async () => {
    const privee = monter([entree('a')], { estPrivee: () => true })
    await expect(privee.appeler()).rejects.toThrow()
    expect(privee.installerChrome).not.toHaveBeenCalled()
    handlers.clear()
    let liberer: () => void = () => undefined
    const porte = new Promise<void>((ok) => (liberer = ok))
    const m = monter([entree('a')], {
      installateursFileTest: {
        chrome: async (i) => {
          await porte
          return { etat: 'installee', id: i, nom: 'X', version: '1' }
        }
      }
    })
    const premiere = m.appeler()
    await expect(m.appeler()).rejects.toThrow(/déjà en cours/)
    liberer()
    await premiere
  })

  it('file absente : résultat vide', async () => {
    const m = monter(undefined)
    expect(await m.appeler()).toEqual({ resultats: [], restantes: [] })
  })
})

describe("fenêtre privée : aucune écriture ni installation depuis une page d'une étoile privée", () => {
  it('activer, désinstaller, règle par site, installer, options et mise à jour sont refusés', async () => {
    const activer = vi.fn(async () => true)
    const desinstaller = vi.fn(async () => true)
    const ecrireRegleSite = vi.fn()
    const verifier = vi.fn(async () => ({ misesAJour: [], erreurs: [] }))
    const m = monter([], {
      estPrivee: () => true,
      chargeur: { lister: () => [{ id: id('a'), chargee: true }], activer, desinstaller } as never,
      ecrireRegleSite,
      miseAJour: { verifier } as never
    })
    const appeler = (canal: string, d?: unknown): unknown => m.handlers.get(canal)!(d, evenement)
    expect(await appeler('extensions:activer', { id: id('a'), active: false })).toBe(false)
    expect(await appeler('extensions:desinstaller', { id: id('a') })).toBe(false)
    expect(await appeler('extensions:regleSite', { id: id('a'), origine: 'https://youtube.com', active: false })).toBe(false)
    expect(await appeler('extensions:options', { id: id('a') })).toBe(false)
    expect(await appeler('extensions:installer', { source: id('a') })).toMatchObject({ etat: 'erreur' })
    expect(await appeler('extensions:majTout')).toMatchObject({ misesAJour: [] })
    expect(activer).not.toHaveBeenCalled()
    expect(desinstaller).not.toHaveBeenCalled()
    expect(ecrireRegleSite).not.toHaveBeenCalled()
    expect(verifier).not.toHaveBeenCalled()
    expect(m.installerChrome).not.toHaveBeenCalled()
  })

  it('en fenêtre normale, les mêmes appels passent', async () => {
    const activer = vi.fn(async () => true)
    const m = monter([], { chargeur: { lister: () => [{ id: id('a'), chargee: true }], activer, desinstaller: vi.fn(async () => true) } as never })
    expect(await (m.handlers.get('extensions:activer')!({ id: id('a'), active: false }, evenement) as Promise<boolean>)).toBe(true)
    expect(activer).toHaveBeenCalledWith(id('a'), false)
  })
})
