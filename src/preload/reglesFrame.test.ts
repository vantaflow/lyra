import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { FONCTION_COOKIES_NEUTRALISES } from './neutraliserCookies'
import { scriptRegles } from './reglesFrame'

/** Une fenêtre minimale (Document.prototype.cookie, Navigator.prototype.userAgent) ; `enfant` : ce que renvoie `iframe.contentWindow`. */
function fenetre(ua = 'reel'): Record<string, unknown> {
  const w: Record<string, unknown> = {}
  w.window = w
  w.Document = class {
    _c = ''
    get cookie(): string {
      return this._c
    }
    set cookie(v: string) {
      this._c = v
    }
  }
  w.Navigator = class {
    get userAgent(): string {
      return ua
    }
  }
  return w
}
const FONCTION_UA = `function (w) { Object.defineProperty(w.Navigator.prototype, 'userAgent', { get: function () { return 'alternatif' }, configurable: true }) }`

function avecIframe(enfant: () => unknown) {
  const w = fenetre()
  w.HTMLIFrameElement = class {
    get contentWindow(): unknown {
      return enfant()
    }
    get contentDocument(): unknown {
      const e = enfant() as { Document?: unknown } | undefined
      return e ? { defaultView: e } : null
    }
  }
  return w
}

describe('script de règles d’une frame', () => {
  it('applique les fonctions à la frame elle-même', () => {
    const w = fenetre()
    runInNewContext(scriptRegles([FONCTION_UA, FONCTION_COOKIES_NEUTRALISES]), w)
    expect(runInNewContext('new Navigator().userAgent', w)).toBe('alternatif')
    const doc = runInNewContext('new Document()', w) as { cookie: string }
    doc.cookie = 'a=1'
    expect(doc.cookie).toBe('')
  })

  it('une iframe créée par le DOM (about:blank, sans preload) est alignée dès qu’on touche contentWindow', () => {
    const enfant = fenetre()
    const w = avecIframe(() => enfant)
    runInNewContext(scriptRegles([FONCTION_UA, FONCTION_COOKIES_NEUTRALISES]), w)
    expect(runInNewContext('new Navigator().userAgent', enfant)).toBe('reel')
    runInNewContext('new HTMLIFrameElement().contentWindow', w)
    expect(runInNewContext('new Navigator().userAgent', enfant)).toBe('alternatif')
    const doc = runInNewContext('new Document()', enfant) as { cookie: string }
    doc.cookie = 'a=1'
    expect(doc.cookie).toBe('')
  })

  it('contentDocument (via defaultView) est relayé aussi', () => {
    const enfant = fenetre()
    const w = avecIframe(() => enfant)
    runInNewContext(scriptRegles([FONCTION_UA]), w)
    runInNewContext('new HTMLIFrameElement().contentDocument', w)
    expect(runInNewContext('new Navigator().userAgent', enfant)).toBe('alternatif')
  })

  it('une iframe d’une autre origine (accès refusé) ne casse pas la page, et contentWindow reste ce que le navigateur renvoie', () => {
    const interdit = new Proxy({}, { get: () => { throw new Error('SecurityError') }, has: () => { throw new Error('SecurityError') } })
    const w = avecIframe(() => interdit)
    runInNewContext(scriptRegles([FONCTION_UA, FONCTION_COOKIES_NEUTRALISES]), w)
    expect(runInNewContext('new HTMLIFrameElement().contentWindow', w)).toBe(interdit)
    expect(runInNewContext('new HTMLIFrameElement().contentDocument', w)).toBeTruthy()
  })

  it('sans iframe dans la fenêtre : appliqué à la frame, sans erreur', () => {
    const w = fenetre()
    expect(() => runInNewContext(scriptRegles([FONCTION_UA]), w)).not.toThrow()
  })

  it('n’utilise jamais eval (une CSP sans unsafe-eval ne l’empêche pas)', () => {
    expect(scriptRegles([FONCTION_UA])).not.toMatch(/\beval\b|new Function|Function\(/)
  })
})
