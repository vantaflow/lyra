import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'

vi.mock('electron', () => ({
  app: { quit: vi.fn() },
  Menu: { setApplicationMenu: vi.fn(), buildFromTemplate: vi.fn((m: unknown) => m) }
}))

import { construireModele, reconstructeurDiffere, type ActionsMenu } from './appMenu'
import { COMMANDES } from '../../shared/commandes'

function actions(): ActionsMenu {
  return { nouvelleFenetre: vi.fn(), nouvelleFenetrePrivee: vi.fn(), basculerFavori: vi.fn(), basculerCiel: vi.fn(), basculerDnd: vi.fn() }
}
function manager() {
  return {
    idActif: () => 'e1',
    ouvrir: vi.fn(),
    ouvrirPalette: vi.fn(),
    ouvrirRecherche: vi.fn(),
    outilsDeveloppement: vi.fn(),
    basculerPleinEcran: vi.fn(),
    numero: vi.fn(),
    zoomer: vi.fn(),
    fermer: vi.fn(),
    recharger: vi.fn(),
    voisine: vi.fn(),
    imprimer: vi.fn(),
    rouvrirDerniere: vi.fn()
  }
}

/** Tous les éléments du modèle, à plat. */
function aplatir(modele: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  return modele.flatMap((i) => [i, ...(Array.isArray(i.submenu) ? aplatir(i.submenu) : [])])
}
const parId = (m: MenuItemConstructorOptions[], id: string): MenuItemConstructorOptions | undefined => aplatir(m).find((i) => i.id === id)

describe('construireModele', () => {
  const faire = (table: Record<string, string>, plateforme: string, m = manager()) =>
    construireModele(() => m as never, actions(), table, plateforme)

  it('un élément de menu par commande redéfinissable, avec son id stable et son accélérateur par défaut (macOS)', () => {
    const modele = faire({}, 'darwin')
    for (const c of COMMANDES) {
      if (c.id === 'quitter') continue
      expect(parId(modele, c.idMenu), c.id).toBeDefined()
    }
    expect(parId(modele, 'palette')!.accelerator).toBe('CmdOrCtrl+L')
    expect(parId(modele, 'nouvelle-etoile')!.accelerator).toBe('CmdOrCtrl+T')
    expect(parId(modele, 'ne-pas-deranger')!.accelerator).toBe('CmdOrCtrl+Shift+D')
    expect(parId(modele, 'etoile-suivante')!.accelerator).toBe('Ctrl+Tab')
    expect(parId(modele, 'etoile-9')!.accelerator).toBe('CmdOrCtrl+9')
    expect(parId(modele, 'plein-ecran')!.accelerator).toBe('Ctrl+Cmd+F')
    expect(parId(modele, 'devtools')!.accelerator).toBe('Cmd+Alt+I')
    expect(parId(modele, 'favoris')!.accelerator).toBe('CmdOrCtrl+Shift+B')
    expect(parId(modele, 'telechargements')!.accelerator).toBe('CmdOrCtrl+Shift+J')
  })
  it('Windows : F11 et F12, entrée Quitter (sur macOS, le rôle natif du menu de l’application)', () => {
    const win = faire({}, 'win32')
    expect(parId(win, 'plein-ecran')!.accelerator).toBe('F11')
    expect(parId(win, 'devtools')!.accelerator).toBe('F12')
    expect(parId(win, 'quitter')!.accelerator).toBe('CmdOrCtrl+Q')
    expect(win.some((i) => i.role === 'appMenu')).toBe(false)
    // « Historique » : Ctrl+H, pour ne pas voler Ctrl+Y (Rétablir) au menu Édition ; macOS garde ⌘ Y.
    expect(parId(win, 'historique')!.accelerator).toBe('Ctrl+H')
    expect(parId(faire({}, 'linux'), 'historique')!.accelerator).toBe('Ctrl+H')
    expect(parId(faire({}, 'darwin'), 'historique')!.accelerator).toBe('CmdOrCtrl+Y')
    expect(aplatir(win).filter((i) => i.accelerator === 'CmdOrCtrl+Y' || i.accelerator === 'Ctrl+Y')).toEqual([])
    const mac = faire({}, 'darwin')
    expect(parId(mac, 'quitter')).toBeUndefined()
    expect(mac[0].role).toBe('appMenu')
  })
  it('les accélérateurs viennent de settings.raccourcis ; l’ancien n’est plus utilisé ; vide = défaut', () => {
    const modele = faire({ palette: 'CmdOrCtrl+Shift+K', recharger: '' }, 'darwin')
    expect(parId(modele, 'palette')!.accelerator).toBe('CmdOrCtrl+Shift+K')
    expect(parId(modele, 'recharger')!.accelerator).toBe('CmdOrCtrl+R')
    expect(aplatir(modele).filter((i) => i.accelerator === 'CmdOrCtrl+L')).toHaveLength(0)
  })
  it('une valeur invalide ou en conflit est ignorée (défaut)', () => {
    const modele = faire({ palette: 'CmdOrCtrl+R', trouver: 'n’importe quoi' }, 'darwin')
    expect(parId(modele, 'palette')!.accelerator).toBe('CmdOrCtrl+L')
    expect(parId(modele, 'trouver')!.accelerator).toBe('CmdOrCtrl+F')
  })
  it('aucun accélérateur n’est utilisé par deux éléments visibles', () => {
    const vus = new Set<string>()
    for (const i of aplatir(faire({ palette: 'CmdOrCtrl+K', recharger: 'CmdOrCtrl+Shift+K' }, 'darwin'))) {
      if (!i.accelerator) continue
      expect(vus.has(i.accelerator), i.accelerator).toBe(false)
      vus.add(i.accelerator)
    }
  })
  it('Zoom avant : alias caché « = » avec les mêmes modificateurs, sauf conflit', () => {
    const defaut = faire({}, 'darwin')
    const alias = aplatir(defaut).find((i) => i.accelerator === 'CmdOrCtrl+=')
    expect(alias).toMatchObject({ visible: false })
    const perso = faire({ zoomAvant: 'CmdOrCtrl+Shift+Plus' }, 'darwin')
    expect(aplatir(perso).find((i) => i.accelerator === 'CmdOrCtrl+Shift+=')).toMatchObject({ visible: false })
    const autre = faire({ zoomAvant: 'CmdOrCtrl+K' }, 'darwin')
    expect(aplatir(autre).filter((i) => i.visible === false)).toHaveLength(0)
    const conflit = faire({ zoomAvant: 'CmdOrCtrl+Plus', recharger: 'CmdOrCtrl+=' }, 'darwin')
    expect(aplatir(conflit).filter((i) => i.visible === false)).toHaveLength(0)
  })
  it('les actions sont câblées comme avant', () => {
    const m = manager()
    const a = actions()
    const modele = construireModele(() => m as never, a, {}, 'win32')
    ;(parId(modele, 'palette')!.click as () => void)()
    ;(parId(modele, 'favoris')!.click as () => void)()
    ;(parId(modele, 'telechargements')!.click as () => void)()
    ;(parId(modele, 'plein-ecran')!.click as () => void)()
    ;(parId(modele, 'devtools')!.click as () => void)()
    ;(parId(modele, 'etoile-3')!.click as () => void)()
    ;(parId(modele, 'etoile-9')!.click as () => void)()
    ;(parId(modele, 'ne-pas-deranger')!.click as () => void)()
    expect(m.ouvrirPalette).toHaveBeenCalled()
    expect(m.ouvrir).toHaveBeenCalledWith('lyra://bookmarks')
    expect(m.ouvrir).toHaveBeenCalledWith('lyra://downloads')
    expect(m.basculerPleinEcran).toHaveBeenCalled()
    expect(m.outilsDeveloppement).toHaveBeenCalled()
    expect(m.numero).toHaveBeenNthCalledWith(1, 3)
    expect(m.numero).toHaveBeenNthCalledWith(2, 9)
    expect(a.basculerDnd).toHaveBeenCalled()
  })
  it('le menu Édition garde ses rôles natifs', () => {
    const roles = aplatir(faire({}, 'darwin')).map((i) => i.role)
    for (const r of ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll']) expect(roles).toContain(r)
  })
})

describe('reconstructeurDiffere', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const faire = (table: { v: Record<string, string> }, ouvert = { v: false }) => {
    const construire = vi.fn()
    const r = reconstructeurDiffere({ delaiMs: 300, lire: () => table.v, plateforme: 'darwin', construire, menuOuvert: () => ouvert.v })
    return { r, construire, ouvert }
  }

  it('reconstruit après 300 ms, une seule fois pour une rafale de changements', () => {
    const table = { v: {} as Record<string, string> }
    const { r, construire } = faire(table)
    table.v = { palette: 'CmdOrCtrl+K' }
    r.planifier()
    table.v = { palette: 'CmdOrCtrl+J' }
    r.planifier()
    vi.advanceTimersByTime(299)
    expect(construire).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2)
    expect(construire).toHaveBeenCalledTimes(1)
  })
  it('ne reconstruit pas si les accélérateurs effectifs sont inchangés (autre réglage, valeur équivalente)', () => {
    const table = { v: {} as Record<string, string> }
    const { r, construire } = faire(table)
    r.planifier()
    table.v = { palette: 'cmdorctrl+l', recharger: '' }
    r.planifier()
    vi.advanceTimersByTime(1000)
    expect(construire).not.toHaveBeenCalled()
  })
  it('revenir à la valeur appliquée avant l’échéance annule la reconstruction', () => {
    const table = { v: {} as Record<string, string> }
    const { r, construire } = faire(table)
    table.v = { palette: 'CmdOrCtrl+K' }
    r.planifier()
    table.v = {}
    r.planifier()
    vi.advanceTimersByTime(1000)
    expect(construire).not.toHaveBeenCalled()
  })
  it('attend la fermeture d’un menu ouvert, puis reconstruit', () => {
    const table = { v: {} as Record<string, string> }
    const { r, construire, ouvert } = faire(table)
    table.v = { palette: 'CmdOrCtrl+K' }
    ouvert.v = true
    r.planifier()
    vi.advanceTimersByTime(900)
    expect(construire).not.toHaveBeenCalled()
    ouvert.v = false
    vi.advanceTimersByTime(300)
    expect(construire).toHaveBeenCalledTimes(1)
  })
  it('un état « ouvert » jamais levé ne bloque pas indéfiniment', () => {
    const table = { v: {} as Record<string, string> }
    const { r, construire } = faire(table, { v: true })
    table.v = { palette: 'CmdOrCtrl+K' }
    r.planifier()
    vi.advanceTimersByTime(300 * 20)
    expect(construire).toHaveBeenCalledTimes(1)
  })
  it('reconstruire() applique tout de suite (installation initiale)', () => {
    const table = { v: {} as Record<string, string> }
    const { r, construire } = faire(table)
    table.v = { palette: 'CmdOrCtrl+K' }
    r.reconstruire()
    expect(construire).toHaveBeenCalledTimes(1)
    r.planifier()
    vi.advanceTimersByTime(1000)
    expect(construire).toHaveBeenCalledTimes(1)
  })
})
