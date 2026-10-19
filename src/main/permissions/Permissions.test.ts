import { describe, expect, it, vi } from 'vitest'
import { Permissions, type DepsPermissions, type SessionPermissions } from './Permissions'
import type { DecisionPermission, TypePermission } from '../../shared/types'

function monter(regles: Record<string, Partial<Record<TypePermission, DecisionPermission>>> = {}, reponse: { decision: DecisionPermission; memoriser: boolean } = { decision: 'refuser', memoriser: false }) {
  const memoire = structuredClone(regles)
  const deps: DepsPermissions = {
    lire: (o, t) => memoire[o]?.[t],
    memoriser: vi.fn((o, t, d) => {
      memoire[o] = { ...memoire[o], [t]: d }
    }),
    demander: vi.fn(async () => reponse)
  }
  let requete!: Parameters<SessionPermissions['setPermissionRequestHandler']>[0]
  let verif!: Parameters<SessionPermissions['setPermissionCheckHandler']>[0]
  const ses: SessionPermissions = {
    setPermissionRequestHandler: (h) => void (requete = h),
    setPermissionCheckHandler: (h) => void (verif = h)
  }
  new Permissions(deps).attacher(ses)
  const demander = (wc: object | null, permission: string, details: object): Promise<boolean> =>
    new Promise((ok) => requete(wc as never, permission, ok, details))
  return { deps, demander, verifier: (wc: object | null, permission: string, origine: string, details: object = {}) => verif(wc as never, permission, origine, details) }
}

const WC = { id: 1 }
const SITE = 'https://exemple.fr'

describe('Permissions', () => {
  it('une règle mémorisée répond sans prompt', async () => {
    const { deps, demander } = monter({ [SITE]: { notifications: 'autoriser', camera: 'refuser' } })
    expect(await demander(WC, 'notifications', { requestingUrl: `${SITE}/page` })).toBe(true)
    expect(await demander(WC, 'media', { requestingUrl: SITE, mediaTypes: ['video'] })).toBe(false)
    expect(deps.demander).not.toHaveBeenCalled()
  })

  it('une décision inconnue ouvre le prompt et se mémorise si demandé', async () => {
    const { deps, demander } = monter({}, { decision: 'autoriser', memoriser: true })
    expect(await demander(WC, 'geolocation', { requestingUrl: `${SITE}/x` })).toBe(true)
    expect(deps.demander).toHaveBeenCalledWith(WC, SITE, ['geolocalisation'])
    expect(deps.memoriser).toHaveBeenCalledWith(SITE, 'geolocalisation', 'autoriser')
  })

  it('une réponse sans « se souvenir » ne mémorise rien', async () => {
    const { deps, demander } = monter({}, { decision: 'refuser', memoriser: false })
    expect(await demander(WC, 'notifications', { requestingUrl: SITE })).toBe(false)
    expect(deps.memoriser).not.toHaveBeenCalled()
  })

  it('caméra et micro : on ne demande que ce qui est inconnu, tout doit être autorisé', async () => {
    const { deps, demander } = monter({ [SITE]: { camera: 'autoriser' } }, { decision: 'autoriser', memoriser: false })
    expect(await demander(WC, 'media', { requestingUrl: SITE, mediaTypes: ['video', 'audio'] })).toBe(true)
    expect(deps.demander).toHaveBeenCalledWith(WC, SITE, ['micro'])
    const refus = monter({ [SITE]: { camera: 'autoriser', micro: 'refuser' } })
    expect(await refus.demander(WC, 'media', { requestingUrl: SITE, mediaTypes: ['video', 'audio'] })).toBe(false)
  })

  it('webContents null : décision par origine seulement, jamais de prompt', async () => {
    const { deps, demander } = monter({ [SITE]: { notifications: 'autoriser' } })
    expect(await demander(null, 'notifications', { requestingUrl: SITE })).toBe(true)
    expect(await demander(null, 'geolocation', { requestingUrl: SITE })).toBe(false)
    expect(deps.demander).not.toHaveBeenCalled()
  })

  it('plein écran, verrouillage du pointeur et écriture du presse-papiers sont autorisés ; le reste est refusé', async () => {
    const { deps, demander } = monter()
    for (const p of ['fullscreen', 'pointerLock', 'clipboard-sanitized-write']) expect(await demander(WC, p, { requestingUrl: SITE })).toBe(true)
    for (const p of ['display-capture', 'midi', 'hid', 'openExternal']) expect(await demander(WC, p, { requestingUrl: SITE })).toBe(false)
    expect(deps.demander).not.toHaveBeenCalled()
  })

  it('la vérification synchrone suit les règles mémorisées (inconnu : refus)', () => {
    const { verifier } = monter({ [SITE]: { notifications: 'autoriser', micro: 'autoriser' } })
    expect(verifier(WC, 'notifications', SITE)).toBe(true)
    expect(verifier(WC, 'geolocation', SITE)).toBe(false)
    expect(verifier(null, 'media', SITE, { mediaType: 'audio' })).toBe(true)
    expect(verifier(null, 'media', SITE, { mediaType: 'video' })).toBe(false)
    expect(verifier(WC, 'fullscreen', SITE)).toBe(true)
  })

  it('les prompts passent un par un', async () => {
    const ordre: string[] = []
    let liberer!: () => void
    const deps: DepsPermissions = {
      lire: () => undefined,
      memoriser: () => undefined,
      demander: async (_wc, _o, types) => {
        ordre.push(`debut-${types[0]}`)
        if (types[0] === 'notifications') await new Promise<void>((r) => (liberer = r))
        ordre.push(`fin-${types[0]}`)
        return { decision: 'refuser', memoriser: false }
      }
    }
    let requete!: Parameters<SessionPermissions['setPermissionRequestHandler']>[0]
    new Permissions(deps).attacher({ setPermissionRequestHandler: (h) => void (requete = h), setPermissionCheckHandler: () => undefined })
    const a = new Promise<boolean>((ok) => requete(WC as never, 'notifications', ok, { requestingUrl: SITE }))
    const b = new Promise<boolean>((ok) => requete(WC as never, 'geolocation', ok, { requestingUrl: SITE }))
    await new Promise((r) => setTimeout(r, 10))
    expect(ordre).toEqual(['debut-notifications'])
    liberer()
    await Promise.all([a, b])
    expect(ordre).toEqual(['debut-notifications', 'fin-notifications', 'debut-geolocalisation', 'fin-geolocalisation'])
  })

  it('une demande abandonnée (refus) ne bloque pas la suivante, même si le prompt échoue', async () => {
    const reponses: Array<() => Promise<{ decision: DecisionPermission; memoriser: boolean }>> = [
      async () => ({ decision: 'refuser', memoriser: false }),
      async () => {
        throw new Error('overlay détruit')
      },
      async () => ({ decision: 'autoriser', memoriser: false })
    ]
    const deps: DepsPermissions = { lire: () => undefined, memoriser: () => undefined, demander: async () => reponses.shift()!() }
    let requete!: Parameters<SessionPermissions['setPermissionRequestHandler']>[0]
    new Permissions(deps).attacher({ setPermissionRequestHandler: (h) => void (requete = h), setPermissionCheckHandler: () => undefined })
    const demande = (p: string): Promise<boolean> => new Promise((ok) => requete(WC as never, p, ok, { requestingUrl: SITE }))
    expect(await demande('notifications')).toBe(false)
    expect(await demande('geolocation')).toBe(false)
    expect(await demande('clipboard-read')).toBe(true)
  })
  it("Ne pas déranger : la demande de notifications attend la sortie du mode, puis affiche l'invite (pas de refus)", async () => {
    let sortie!: () => void
    const attente = new Promise<void>((ok) => (sortie = ok))
    const demander = vi.fn(async () => ({ decision: 'autoriser' as DecisionPermission, memoriser: false }))
    const deps: DepsPermissions = { lire: () => undefined, memoriser: () => undefined, demander, retenir: (_wc, o) => (o === SITE ? attente : undefined) }
    let requete!: Parameters<SessionPermissions['setPermissionRequestHandler']>[0]
    new Permissions(deps).attacher({ setPermissionRequestHandler: (h) => void (requete = h), setPermissionCheckHandler: () => undefined })
    const n = new Promise<boolean>((ok) => requete(WC as never, 'notifications', ok, { requestingUrl: SITE }))
    // Autre permission, ou autre site : aucune retenue.
    const g = new Promise<boolean>((ok) => requete(WC as never, 'geolocation', ok, { requestingUrl: SITE }))
    expect(await g).toBe(true)
    expect(demander).toHaveBeenCalledTimes(1)
    await new Promise((r) => setTimeout(r, 10))
    expect(demander).toHaveBeenCalledTimes(1)
    sortie()
    expect(await n).toBe(true)
    expect(demander).toHaveBeenCalledTimes(2)
    expect(demander).toHaveBeenLastCalledWith(WC, SITE, ['notifications'])
  })

  it("Ne pas déranger : une décision mémorisée n'attend pas", async () => {
    const deps: DepsPermissions = { lire: () => 'autoriser', memoriser: () => undefined, demander: vi.fn(), retenir: () => new Promise<void>(() => undefined) }
    let requete!: Parameters<SessionPermissions['setPermissionRequestHandler']>[0]
    new Permissions(deps).attacher({ setPermissionRequestHandler: (h) => void (requete = h), setPermissionCheckHandler: () => undefined })
    expect(await new Promise<boolean>((ok) => requete(WC as never, 'notifications', ok, { requestingUrl: SITE }))).toBe(true)
  })

  it("Ne pas déranger : la vérification des notifications répond « refusé » tant qu'elles sont suspendues (service workers)", () => {
    const deps: DepsPermissions = { lire: () => 'autoriser', memoriser: () => undefined, demander: vi.fn(), suspendues: (wc, o) => wc === null && o === SITE }
    let verif!: Parameters<SessionPermissions['setPermissionCheckHandler']>[0]
    new Permissions(deps).attacher({ setPermissionRequestHandler: () => undefined, setPermissionCheckHandler: (h) => void (verif = h) })
    expect(verif(null, 'notifications', SITE, {})).toBe(false)
    expect(verif(WC as never, 'notifications', SITE, {})).toBe(true)
    expect(verif(null, 'notifications', 'https://autre.fr', {})).toBe(true)
    expect(verif(null, 'geolocation', SITE, {})).toBe(true)
  })
})
