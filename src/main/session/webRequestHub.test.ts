import { describe, expect, it, vi } from 'vitest'
import { hubDe, apresBoucliers, PRIORITE_BOUCLIERS, PRIORITE_APRES_BOUCLIERS, type SessionWeb } from './webRequestHub'

type Rappel = (r: Record<string, unknown>) => void
type Ecouteur = (d: Record<string, unknown>, cb: Rappel) => void

function fausseSession(): SessionWeb & { avant?: Ecouteur; envoi?: Ecouteur; entetes?: Ecouteur; inscriptions: number } {
  const s: SessionWeb & { avant?: Ecouteur; envoi?: Ecouteur; entetes?: Ecouteur; inscriptions: number } = {
    inscriptions: 0,
    webRequest: {
      onBeforeRequest: (_f: unknown, fn: unknown) => void (s.inscriptions++, (s.avant = fn as Ecouteur)),
      onBeforeSendHeaders: (_f: unknown, fn: unknown) => void (s.inscriptions++, (s.envoi = fn as Ecouteur)),
      onHeadersReceived: (_f: unknown, fn: unknown) => void (s.inscriptions++, (s.entetes = fn as Ecouteur))
    }
  } as never
  return s
}

const appeler = (fn: Ecouteur | undefined, d: Record<string, unknown> = {}): Record<string, unknown> => {
  let r: Record<string, unknown> | undefined
  fn!(d, (x) => (r = x))
  return r!
}

describe('webRequestHub', () => {
  it('sans écouteur, laisse passer la requête', () => {
    const s = fausseSession()
    hubDe(s).onBeforeRequest('a', () => undefined)
    expect(appeler(s.avant, { url: 'x' })).toEqual({})
  })

  it("enchaîne par priorité croissante, à égalité dans l'ordre d'enregistrement", () => {
    const s = fausseSession()
    const h = hubDe(s)
    const ordre: string[] = []
    h.onBeforeRequest('c', () => void ordre.push('c'), 50)
    h.onBeforeRequest('a', () => void ordre.push('a'), 10)
    h.onBeforeRequest('b', () => void ordre.push('b'), 50)
    appeler(s.avant)
    expect(ordre).toEqual(['a', 'c', 'b'])
  })

  it("propage les en-têtes modifiés d'un écouteur au suivant", () => {
    const s = fausseSession()
    const h = hubDe(s)
    h.onHeadersReceived('un', (d) => ({ responseHeaders: { ...d.responseHeaders, A: ['1'] } }), 1)
    let vu: unknown
    h.onHeadersReceived(
      'deux',
      (d) => {
        vu = d.responseHeaders
        return { responseHeaders: { ...d.responseHeaders, B: ['2'] } }
      },
      2
    )
    const r = appeler(s.entetes, { responseHeaders: { X: ['0'] } })
    expect(vu).toEqual({ X: ['0'], A: ['1'] })
    expect(r).toEqual({ responseHeaders: { X: ['0'], A: ['1'], B: ['2'] } })
  })

  it('propage les en-têtes de requête (onBeforeSendHeaders)', () => {
    const s = fausseSession()
    const h = hubDe(s)
    h.onBeforeSendHeaders('ua', (d) => ({ requestHeaders: { ...d.requestHeaders, 'User-Agent': 'x' } }))
    expect(appeler(s.envoi, { requestHeaders: { Accept: '*' } })).toEqual({ requestHeaders: { Accept: '*', 'User-Agent': 'x' } })
  })

  it('cancel coupe la chaîne', () => {
    const s = fausseSession()
    const h = hubDe(s)
    const apres = vi.fn()
    h.onBeforeRequest('garde', () => ({ cancel: true }), 1)
    h.onBeforeRequest('suite', apres, 2)
    expect(appeler(s.avant)).toEqual({ cancel: true })
    expect(apres).not.toHaveBeenCalled()
  })

  it('une redirection coupe aussi la chaîne', () => {
    const s = fausseSession()
    const h = hubDe(s)
    const apres = vi.fn()
    h.onBeforeRequest('r', () => ({ redirectURL: 'https://a.test/' }), 1)
    h.onBeforeRequest('suite', apres, 2)
    expect(appeler(s.avant)).toEqual({ redirectURL: 'https://a.test/' })
    expect(apres).not.toHaveBeenCalled()
  })

  it('enregistrer deux fois le même id remplace le premier', () => {
    const s = fausseSession()
    const h = hubDe(s)
    const premier = vi.fn()
    const second = vi.fn()
    h.onBeforeRequest('x', premier)
    h.onBeforeRequest('x', second)
    appeler(s.avant)
    expect(premier).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
  })

  it("la fonction de retour retire l'écouteur (et pas son remplaçant)", () => {
    const s = fausseSession()
    const h = hubDe(s)
    const ancien = h.onBeforeRequest('x', () => ({ cancel: true }))
    const nouveau = vi.fn()
    h.onBeforeRequest('x', nouveau)
    ancien()
    appeler(s.avant)
    expect(nouveau).toHaveBeenCalledOnce()
    const h2 = fausseSession()
    const r = hubDe(h2).onBeforeRequest('y', () => ({ cancel: true }))
    r()
    expect(appeler(h2.avant)).toEqual({})
  })

  it('un écouteur qui lève est journalisé et sauté', () => {
    const s = fausseSession()
    const h = hubDe(s)
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    h.onBeforeRequest('casse', () => {
      throw new Error('boum')
    }, 1)
    h.onBeforeRequest('ok', () => ({ cancel: true }), 2)
    expect(appeler(s.avant)).toEqual({ cancel: true })
    expect(log).toHaveBeenCalledOnce()
    log.mockRestore()
  })

  it('un seul écouteur Electron par évènement, hub unique par session, sessions indépendantes', () => {
    const s1 = fausseSession()
    const s2 = fausseSession()
    expect(hubDe(s1)).toBe(hubDe(s1))
    hubDe(s1).onBeforeRequest('a', () => ({ cancel: true }))
    hubDe(s1).onBeforeRequest('b', () => undefined)
    expect(s1.inscriptions).toBe(1)
    hubDe(s2).onBeforeRequest('a', () => undefined)
    expect(appeler(s1.avant)).toEqual({ cancel: true })
    expect(appeler(s2.avant)).toEqual({})
  })

  it('appelle le rappel Electron exactement une fois même si la chaîne lève', () => {
    const s = fausseSession()
    const h = hubDe(s)
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    // `r.cancel` lu sur un objet piégé : l'assistant `arret` lève en dehors de l'écouteur.
    h.onBeforeRequest('piege', () => ({ get cancel(): boolean { throw new Error('boum') } }) as never, 1)
    const cb = vi.fn()
    s.avant!({}, cb)
    expect(cb).toHaveBeenCalledOnce()
    log.mockRestore()
  })

  it('trie une seule fois tant que la liste ne change pas', () => {
    const s = fausseSession()
    const h = hubDe(s)
    const tri = vi.spyOn(Array.prototype, 'sort')
    h.onBeforeRequest('a', () => undefined, 2)
    h.onBeforeRequest('b', () => undefined, 1)
    appeler(s.avant)
    const apresPremier = tri.mock.calls.length
    appeler(s.avant)
    appeler(s.avant)
    expect(tri.mock.calls.length).toBe(apresPremier)
    h.onBeforeRequest('c', () => undefined, 0)
    appeler(s.avant)
    expect(tri.mock.calls.length).toBeGreaterThan(apresPremier)
    tri.mockRestore()
  })

  describe('apresBoucliers', () => {
    it('passe après les Boucliers et ne voit jamais les extensions ni le CRX', () => {
      expect(PRIORITE_APRES_BOUCLIERS).toBeGreaterThan(PRIORITE_BOUCLIERS)
      const vu = vi.fn(() => ({ cancel: true }))
      const f = apresBoucliers(vu)
      expect(f({ url: 'chrome-extension://abc/x.js' } as never)).toBeUndefined()
      expect(f({ url: 'https://a.test/x.js', initiatorOrigin: 'chrome-extension://abc' } as never)).toBeUndefined()
      expect(f({ url: 'https://clients2.google.com/service/update2/crx?x=1' } as never)).toBeUndefined()
      expect(f({ url: 'https://clients2.googleusercontent.com/crx/blobs/a/b.crx' } as never)).toBeUndefined()
      expect(vu).not.toHaveBeenCalled()
      expect(f({ url: 'https://a.test/x.js' } as never)).toEqual({ cancel: true })
    })

    it('une réponse {} d’un écouteur précédent ne coupe pas la chaîne : les suivants reçoivent la requête', () => {
      const s = fausseSession()
      const h = hubDe(s)
      const suivant = vi.fn()
      h.onBeforeRequest('boucliers', () => ({}), PRIORITE_BOUCLIERS)
      h.onBeforeRequest('d', suivant, PRIORITE_APRES_BOUCLIERS)
      appeler(s.avant, { url: 'chrome-extension://abc/x.js' })
      expect(suivant).toHaveBeenCalledOnce()
    })
  })
})
