import { describe, expect, it } from 'vitest'
import {
  SEUIL_DEFILEMENT,
  SEUIL_ZOOM,
  VERROU_MS,
  OUBLI_MS,
  decisionMolette,
  decisionSwipe,
  etatMolette,
  etatSwipe,
  installerGestesMolette,
  validerMolette,
  type Molette,
  type ReglagesGestes
} from './gestes'

const tout: ReglagesGestes = { defilementHorizontal: true, clicMolette: true, molettePlusCmdZoom: true }
const m = (o: Partial<Molette> = {}): Molette => ({ dx: 0, dy: 0, ctrl: false, meta: false, shift: false, alt: false, ...o })
const lin = 'linux' as const

describe('validerMolette', () => {
  it('accepte des deltas finis et des modificateurs booléens', () => {
    expect(validerMolette({ dx: -30, dy: 2.5, ctrl: false, meta: true, shift: false, alt: false })).toEqual({ dx: -30, dy: 2.5, ctrl: false, meta: true, shift: false, alt: false })
  })
  it('refuse ce qui n’est pas un objet, un nombre fini, un booléen', () => {
    for (const v of [null, undefined, 3, 'x', [], { dx: 'a', dy: 0, ctrl: false, meta: false, shift: false, alt: false }]) expect(validerMolette(v)).toBeNull()
    expect(validerMolette({ dx: NaN, dy: 0, ctrl: false, meta: false, shift: false, alt: false })).toBeNull()
    expect(validerMolette({ dx: 0, dy: Infinity, ctrl: false, meta: false, shift: false, alt: false })).toBeNull()
    expect(validerMolette({ dx: 0, dy: 0, ctrl: 1, meta: false, shift: false, alt: false })).toBeNull()
    expect(validerMolette({ dx: 0, dy: 0, ctrl: false, meta: false, shift: false })).toBeNull()
  })
  it('borne les deltas démesurés', () => {
    expect(validerMolette({ dx: 1e9, dy: -1e9, ctrl: false, meta: false, shift: false, alt: false })).toMatchObject({ dx: 5000, dy: -5000 })
  })
  it('ignore les champs en trop (aucune donnée de page)', () => {
    expect(Object.keys(validerMolette({ dx: 1, dy: 1, ctrl: false, meta: false, shift: false, alt: false, url: 'https://x.fr', titre: 'x' })!).sort()).toEqual(['alt', 'ctrl', 'dx', 'dy', 'meta', 'shift'])
  })
})

describe('défilement horizontal : précédent / suivant', () => {
  it('sous le seuil : rien ; au seuil : précédent (vers la gauche) ou suivant (vers la droite)', () => {
    let e = etatMolette()
    expect(decisionMolette(e, m({ dx: -(SEUIL_DEFILEMENT - 1) }), 1000, tout, lin)).toBeNull()
    expect(decisionMolette(e, m({ dx: -1 }), 1010, tout, lin)).toBe('precedent')
    e = etatMolette()
    expect(decisionMolette(e, m({ dx: SEUIL_DEFILEMENT }), 1000, tout, lin)).toBe('suivant')
  })
  it('cumule les petits deltas d’un même geste', () => {
    const e = etatMolette()
    let t = 1000
    let g = null
    for (let i = 0; i < 20 && !g; i++) g = decisionMolette(e, m({ dx: 15 }), (t += 16), tout, lin)
    expect(g).toBe('suivant')
  })
  it('oublie le cumul après une pause', () => {
    const e = etatMolette()
    expect(decisionMolette(e, m({ dx: 100 }), 1000, tout, lin)).toBeNull()
    expect(decisionMolette(e, m({ dx: 100 }), 1000 + OUBLI_MS + 1, tout, lin)).toBeNull()
  })
  it('un changement de sens repart de zéro', () => {
    const e = etatMolette()
    expect(decisionMolette(e, m({ dx: 100 }), 1000, tout, lin)).toBeNull()
    expect(decisionMolette(e, m({ dx: -100 }), 1010, tout, lin)).toBeNull()
  })
  it('verrou anti-rebond : l’inertie du pavé ne déclenche pas deux fois', () => {
    const e = etatMolette()
    expect(decisionMolette(e, m({ dx: -200 }), 1000, tout, lin)).toBe('precedent')
    for (let t = 1016; t < 1000 + VERROU_MS; t += 16) expect(decisionMolette(e, m({ dx: -200 }), t, tout, lin)).toBeNull()
  })
  it('l’inertie qui se prolonge repousse le verrou ; un nouveau geste après le calme déclenche', () => {
    const e = etatMolette()
    expect(decisionMolette(e, m({ dx: -200 }), 1000, tout, lin)).toBe('precedent')
    // inertie jusqu’à 2 s
    for (let t = 1016; t < 2000; t += 16) expect(decisionMolette(e, m({ dx: -200 }), t, tout, lin)).toBeNull()
    // pause, puis nouveau geste
    expect(decisionMolette(e, m({ dx: -200 }), 3000, tout, lin)).toBe('precedent')
  })
  it('ignore un défilement surtout vertical (diagonale)', () => {
    const e = etatMolette()
    expect(decisionMolette(e, m({ dx: 300, dy: 200 }), 1000, tout, lin)).toBeNull()
    expect(decisionMolette(e, m({ dx: 300, dy: 100 }), 1010, tout, lin)).toBe('suivant')
  })
  it('ignore Maj, Alt et les défilements verticaux purs', () => {
    expect(decisionMolette(etatMolette(), m({ dx: 300, shift: true }), 1000, tout, lin)).toBeNull()
    expect(decisionMolette(etatMolette(), m({ dx: 300, alt: true }), 1000, tout, lin)).toBeNull()
    expect(decisionMolette(etatMolette(), m({ dy: 300 }), 1000, tout, lin)).toBeNull()
  })
  it('désactivé : rien', () => {
    expect(decisionMolette(etatMolette(), m({ dx: 500 }), 1000, { ...tout, defilementHorizontal: false }, lin)).toBeNull()
  })
  it('macOS : le balayage passe par l’évènement « swipe », jamais par la molette', () => {
    expect(decisionMolette(etatMolette(), m({ dx: 500 }), 1000, tout, 'darwin')).toBeNull()
  })
  it('l’interrupteur coupé pendant un geste ne laisse pas de cumul', () => {
    const e = etatMolette()
    decisionMolette(e, m({ dx: 100 }), 1000, tout, lin)
    expect(decisionMolette(e, m({ dx: 100 }), 1010, { ...tout, defilementHorizontal: false }, lin)).toBeNull()
    expect(decisionMolette(e, m({ dx: 100 }), 1020, tout, lin)).toBeNull()
  })
})

describe('⌘ / Ctrl + molette : zoom', () => {
  it('Ctrl ou ⌘ + molette vers le haut agrandit, vers le bas réduit', () => {
    expect(decisionMolette(etatMolette(), m({ dy: -SEUIL_ZOOM, ctrl: true }), 1000, tout, lin)).toBe('zoom-plus')
    expect(decisionMolette(etatMolette(), m({ dy: SEUIL_ZOOM, meta: true }), 1000, tout, 'darwin')).toBe('zoom-moins')
  })
  it('sous le seuil : cumule (pavé tactile, deltas fins)', () => {
    const e = etatMolette()
    expect(decisionMolette(e, m({ dy: -SEUIL_ZOOM / 2, ctrl: true }), 1000, tout, lin)).toBeNull()
    expect(decisionMolette(e, m({ dy: -SEUIL_ZOOM / 2, ctrl: true }), 1010, tout, lin)).toBe('zoom-plus')
  })
  it('un palier à la fois : cadence limitée', () => {
    const e = etatMolette()
    expect(decisionMolette(e, m({ dy: -500, ctrl: true }), 1000, tout, lin)).toBe('zoom-plus')
    expect(decisionMolette(e, m({ dy: -500, ctrl: true }), 1010, tout, lin)).toBeNull()
    expect(decisionMolette(e, m({ dy: -500, ctrl: true }), 1200, tout, lin)).toBe('zoom-plus')
  })
  it('un changement de sens repart de zéro', () => {
    const e = etatMolette()
    expect(decisionMolette(e, m({ dy: -SEUIL_ZOOM * 0.8, ctrl: true }), 1000, tout, lin)).toBeNull()
    expect(decisionMolette(e, m({ dy: SEUIL_ZOOM * 0.8, ctrl: true }), 1010, tout, lin)).toBeNull()
  })
  it('sans modificateur : aucun zoom ; modificateur + deltaY nul : rien', () => {
    expect(decisionMolette(etatMolette(), m({ dy: -500 }), 1000, tout, lin)).toBeNull()
    expect(decisionMolette(etatMolette(), m({ ctrl: true }), 1000, tout, lin)).toBeNull()
  })
  it('désactivé : rien', () => {
    expect(decisionMolette(etatMolette(), m({ dy: -500, ctrl: true }), 1000, { ...tout, molettePlusCmdZoom: false }, lin)).toBeNull()
  })
  it('avec un modificateur de zoom, un défilement horizontal ne navigue jamais', () => {
    expect(decisionMolette(etatMolette(), m({ dx: 500, ctrl: true }), 1000, tout, lin)).toBeNull()
    expect(decisionMolette(etatMolette(), m({ dx: 500, meta: true }), 1000, { ...tout, molettePlusCmdZoom: false }, lin)).toBeNull()
  })
  it('les deux interrupteurs sont indépendants', () => {
    const seulementZoom = { ...tout, defilementHorizontal: false }
    expect(decisionMolette(etatMolette(), m({ dx: 500 }), 1000, seulementZoom, lin)).toBeNull()
    expect(decisionMolette(etatMolette(), m({ dy: -500, ctrl: true }), 1000, seulementZoom, lin)).toBe('zoom-plus')
  })
})

describe('swipe (macOS)', () => {
  it('gauche : précédent, droite : suivant ; haut et bas : rien', () => {
    expect(decisionSwipe('left', tout, etatSwipe(), 1000)).toBe('precedent')
    expect(decisionSwipe('right', tout, etatSwipe(), 1000)).toBe('suivant')
    expect(decisionSwipe('up', tout, etatSwipe(), 1000)).toBeNull()
    expect(decisionSwipe('down', tout, etatSwipe(), 1000)).toBeNull()
    expect(decisionSwipe(42, tout, etatSwipe(), 1000)).toBeNull()
  })
  it('désactivé ou sans réglages : rien', () => {
    expect(decisionSwipe('left', { ...tout, defilementHorizontal: false }, etatSwipe(), 1000)).toBeNull()
    expect(decisionSwipe('left', undefined, etatSwipe(), 1000)).toBeNull()
  })
  it('anti-rebond : deux balayages rapprochés ne comptent que pour un', () => {
    const e = etatSwipe()
    expect(decisionSwipe('left', tout, e, 1000)).toBe('precedent')
    expect(decisionSwipe('left', tout, e, 1100)).toBeNull()
    expect(decisionSwipe('left', tout, e, 1000 + VERROU_MS + 1)).toBe('precedent')
  })
})

describe('canal IPC « gestes:molette »', () => {
  function monter(o: { reglages?: ReglagesGestes; possede?: boolean; active?: boolean; principal?: boolean } = {}) {
    const journal: string[] = []
    let ecouteur: ((e: unknown, brut: unknown) => void) | undefined
    const ipcMain = { on: (canal: string, cb: (e: unknown, brut: unknown) => void) => void (canal === 'gestes:molette' && (ecouteur = cb)) }
    const wc = { id: 1, mainFrame: { id: 'principal' }, once: () => undefined }
    const tabs = {
      idDe: () => 'e1',
      idActif: () => (o.active === false ? 'autre' : 'e1'),
      precedent: (id: string) => journal.push('precedent ' + id),
      suivant: (id: string) => journal.push('suivant ' + id),
      zoomer: (id: string, d: { delta: 1 | -1 }) => journal.push(`zoom ${id} ${d.delta}`)
    }
    let t = 1000
    installerGestesMolette(
      ipcMain as never,
      {
        possede: () => (o.possede === false ? undefined : (tabs as never)),
        reglages: () => o.reglages ?? tout,
        maintenant: () => (t += 1000),
        plateforme: 'linux'
      }
    )
    const envoyer = (brut: unknown, expediteur: unknown = { sender: wc, senderFrame: o.principal === false ? { id: 'iframe' } : wc.mainFrame }): void => ecouteur!(expediteur, brut)
    return { envoyer, journal }
  }
  const bon = (o: Partial<Molette> = {}): Molette => m(o)

  it('précédent, suivant et zoom agissent sur l’étoile expéditrice', () => {
    const { envoyer, journal } = monter()
    envoyer(bon({ dx: -300 }))
    envoyer(bon({ dx: 300 }))
    envoyer(bon({ dy: -100, ctrl: true }))
    envoyer(bon({ dy: 100, meta: true }))
    expect(journal).toEqual(['precedent e1', 'suivant e1', 'zoom e1 1', 'zoom e1 -1'])
  })
  it('refuse un expéditeur qui n’est pas une étoile', () => {
    const { envoyer, journal } = monter({ possede: false })
    envoyer(bon({ dx: -300 }))
    expect(journal).toEqual([])
  })
  it('refuse une iframe et une étoile qui n’est pas affichée', () => {
    const a = monter({ principal: false })
    a.envoyer(bon({ dx: -300 }))
    expect(a.journal).toEqual([])
    const b = monter({ active: false })
    b.envoyer(bon({ dx: -300 }))
    expect(b.journal).toEqual([])
  })
  it('refuse une charge invalide', () => {
    const { envoyer, journal } = monter()
    envoyer({ dx: 'x' })
    envoyer(null)
    envoyer({ dx: NaN, dy: 0, ctrl: false, meta: false, shift: false, alt: false })
    expect(journal).toEqual([])
  })
  it('respecte les interrupteurs courants (relus à chaque message)', () => {
    const { envoyer, journal } = monter({ reglages: { defilementHorizontal: false, clicMolette: true, molettePlusCmdZoom: false } })
    envoyer(bon({ dx: -300 }))
    envoyer(bon({ dy: -100, ctrl: true }))
    expect(journal).toEqual([])
  })
})
