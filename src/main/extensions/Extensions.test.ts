import { beforeEach, describe, expect, it, vi } from 'vitest'

const lib = vi.hoisted(() => ({ opts: undefined as Record<string, (...a: unknown[]) => unknown> | undefined, crx: vi.fn(), removeTab: vi.fn(), addTab: vi.fn(), selectTab: vi.fn() }))

vi.mock('electron-chrome-extensions', () => ({
  ElectronChromeExtensions: class {
    static handleCRXProtocol = lib.crx
    constructor(opts: Record<string, (...a: unknown[]) => unknown>) {
      lib.opts = opts
    }
    addTab = lib.addTab
    removeTab = (wc: unknown) => {
      lib.removeTab(wc)
      // La bibliothèque rappelle `removeTab` de l'application, comme dans la vraie.
      lib.opts!.removeTab(wc, {})
    }
    selectTab = lib.selectTab
  }
}))

describe('creerExtensions', () => {
  beforeEach(() => {
    vi.resetModules()
    lib.crx.mockClear()
  })

  const charger = async () => {
    const { creerExtensions } = await import('./Extensions')
    const wc = { id: 7 } as never
    const win = { id: 1 } as never
    const tabs = { ouvrir: vi.fn(() => ({ wc, win })), activer: vi.fn(), fermer: vi.fn() }
    const fenetres = { creer: vi.fn(() => win), fermer: vi.fn() }
    const session = { id: 'ses' } as never
    const ext = creerExtensions({ session, tabs, fenetres })
    return { ext, tabs, fenetres, wc, win, session }
  }

  it('déclare la licence GPL-3.0 et la session persist:lyra', async () => {
    const { session } = await charger()
    expect(lib.opts!.license).toBe('GPL-3.0')
    expect(lib.opts!.session).toBe(session)
  })

  it("le protocole crx:// n'est servi qu'à la session de l'interface, jamais aux sites de persist:lyra", async () => {
    const { creerExtensions } = await import('./Extensions')
    const session = { id: 'pages' } as never
    const sessionUI = { id: 'ui' } as never
    creerExtensions({ session, sessionUI, tabs: {} as never, fenetres: {} as never })
    expect(lib.crx).toHaveBeenCalledTimes(1)
    expect(lib.crx).toHaveBeenCalledWith(sessionUI)
    expect(lib.crx).not.toHaveBeenCalledWith(session)
  })

  it('sans session d’interface distincte, aucun protocole crx:// n’est servi', async () => {
    await charger()
    expect(lib.crx).not.toHaveBeenCalled()
  })

  it('createTab ouvre une étoile et rend [webContents, fenêtre]', async () => {
    const { tabs, wc, win } = await charger()
    const r = await lib.opts!.createTab({ url: 'https://a.test/', windowId: 3, active: false })
    expect(r).toEqual([wc, win])
    expect(tabs.ouvrir).toHaveBeenCalledWith('https://a.test/', { fenetreId: 3, actif: false })
  })

  it('createTab sans fenêtre disponible échoue proprement', async () => {
    const { tabs } = await charger()
    tabs.ouvrir.mockReturnValueOnce(undefined as never)
    await expect(lib.opts!.createTab({})).rejects.toThrow('impossible')
  })

  it('createWindow passe par la création de fenêtre de Lyra', async () => {
    const { fenetres, win } = await charger()
    expect(await lib.opts!.createWindow({ url: ['https://b.test/'] })).toBe(win)
    expect(fenetres.creer).toHaveBeenCalledWith('https://b.test/')
    lib.opts!.removeWindow(win)
    expect(fenetres.fermer).toHaveBeenCalledWith(win)
  })

  it("une fermeture demandée par Lyra ne referme pas l'étoile ; celle d'une extension, si", async () => {
    const { ext, tabs, wc } = await charger()
    ext.removeTab(wc)
    expect(lib.removeTab).toHaveBeenCalledWith(wc)
    expect(tabs.fermer).not.toHaveBeenCalled()
    lib.opts!.removeTab(wc, {})
    expect(tabs.fermer).toHaveBeenCalledWith(wc)
  })

  it('refuse un second exemplaire ; les permissions optionnelles sont refusées', async () => {
    const { creerExtensions } = await import('./Extensions')
    await charger().catch(() => undefined)
    expect(await lib.opts!.requestPermissions()).toBe(false)
    expect(() => creerExtensions({ session: {} as never, tabs: {} as never, fenetres: {} as never })).toThrow()
  })
})
