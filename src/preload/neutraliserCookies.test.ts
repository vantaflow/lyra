import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { SCRIPT_COOKIES_NEUTRALISES } from './neutraliserCookies'

/** Une « fenêtre » minimale : Document.prototype.cookie stocke ce qu'on y écrit, `cookieStore` existe. */
function fenetre(): Record<string, unknown> {
  const w: Record<string, unknown> = {}
  w.window = w
  class Document {
    _c = ''
    get cookie(): string {
      return this._c
    }
    set cookie(v: string) {
      this._c = v
    }
  }
  w.Document = Document
  w.cookieStore = { get: () => Promise.resolve(null) }
  return w
}

describe('neutralisation des cookies JavaScript d’une frame', () => {
  it('document.cookie : lecture vide, écriture ignorée ; cookieStore absent', () => {
    const w = fenetre()
    runInNewContext(SCRIPT_COOKIES_NEUTRALISES, w)
    const doc = runInNewContext('new Document()', w) as { cookie: string }
    doc.cookie = 'a=1'
    expect(doc.cookie).toBe('')
    expect(runInNewContext("'cookieStore' in window ? typeof cookieStore : 'absent'", w)).toMatch(/absent|undefined/)
    expect(runInNewContext('window.cookieStore', w)).toBeUndefined()
  })
  it('sans le script, la frame lit et écrit (témoin)', () => {
    const w = fenetre()
    const doc = runInNewContext('new Document()', w) as { cookie: string }
    doc.cookie = 'a=1'
    expect(doc.cookie).toBe('a=1')
  })
  it('ne casse pas une page sans cookieStore ni Document', () => {
    expect(() => runInNewContext(SCRIPT_COOKIES_NEUTRALISES, { window: {} })).not.toThrow()
  })
})
