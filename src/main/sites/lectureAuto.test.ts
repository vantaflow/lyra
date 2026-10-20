import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { fonctionLectureAuto, modeLectureAuto } from './lectureAuto'

/** Une fenêtre minimale : un élément média qui compte ses lectures, `navigator.userActivation`, un observateur et des écouteurs de document. */
function fenetre(o: { geste?: boolean | null } = {}) {
  const lectures: Array<{ muted: boolean }> = []
  const ecouteurs: Record<string, Array<{ f: (e: unknown) => void; capture: boolean }>> = {}
  const observateurs: Array<{ cb: (m: unknown[]) => void; options: unknown }> = []
  const etat = { geste: o.geste ?? false }
  class Media {
    muted = false
    paused = true
    attrs = new Set<string>()
    get autoplay(): boolean {
      return this.attrs.has('autoplay')
    }
    set autoplay(v: boolean) {
      if (v) this.attrs.add('autoplay')
      else this.attrs.delete('autoplay')
    }
    play(): Promise<void> {
      lectures.push({ muted: this.muted })
      this.paused = false
      return Promise.resolve()
    }
    pause(): void {
      this.paused = true
    }
    hasAttribute(n: string): boolean {
      return this.attrs.has(n)
    }
    removeAttribute(n: string): void {
      this.attrs.delete(n)
    }
  }
  const w: Record<string, unknown> = {}
  w.window = w
  w.HTMLMediaElement = Media
  w.Promise = Promise
  w.DOMException = DOMException
  w.navigator = o.geste === null ? {} : { userActivation: { get isActive() { return etat.geste } } }
  w.document = {
    addEventListener: (type: string, f: (e: unknown) => void, capture: boolean) => void (ecouteurs[type] ??= []).push({ f, capture }),
    querySelectorAll: () => []
  }
  w.MutationObserver = class {
    constructor(cb: (m: unknown[]) => void) {
      observateurs.push({ cb, options: undefined })
    }
    observe(_cible: unknown, options: unknown): void {
      observateurs[observateurs.length - 1].options = options
    }
  }
  return { w, Media, lectures, ecouteurs, observateurs, etat }
}
const appliquer = (mode: 'sans-son' | 'bloquer', f: ReturnType<typeof fenetre>): void => {
  runInNewContext(`(${fonctionLectureAuto(mode)})(w)`, { w: f.w })
}

describe('modeLectureAuto : la règle devient un mode à injecter', () => {
  it('« Bloquer » et « Sans le son » s’injectent ; « Autoriser » et l’absence de règle non', () => {
    expect(modeLectureAuto('bloquer')).toBe('bloquer')
    expect(modeLectureAuto('sans-son')).toBe('sans-son')
    expect(modeLectureAuto('autoriser')).toBeUndefined()
    expect(modeLectureAuto(undefined)).toBeUndefined()
    expect(modeLectureAuto('inconnu' as never)).toBeUndefined()
  })
})

describe('lecture automatique « Bloquer »', () => {
  it('play() sans geste est rejeté par NotAllowedError (DOMException), la lecture ne démarre pas', async () => {
    const f = fenetre()
    appliquer('bloquer', f)
    const m = new f.Media()
    const erreur = await (m.play() as Promise<void>).then(() => null, (e: unknown) => e)
    expect(erreur).toBeInstanceOf(DOMException)
    expect((erreur as DOMException).name).toBe('NotAllowedError')
    expect(f.lectures).toEqual([])
    expect(m.paused).toBe(true)
  })
  it('play() pendant une activation utilisateur passe, sans toucher au son', async () => {
    const f = fenetre({ geste: true })
    appliquer('bloquer', f)
    const m = new f.Media()
    await m.play()
    expect(f.lectures).toEqual([{ muted: false }])
  })
  it('sans navigator.userActivation, on ne peut rien décider : la lecture passe', async () => {
    const f = fenetre({ geste: null })
    appliquer('bloquer', f)
    await new f.Media().play()
    expect(f.lectures).toHaveLength(1)
  })
  it('l’attribut autoplay d’un média inséré sans geste est retiré (la lecture ne part pas)', () => {
    const f = fenetre()
    appliquer('bloquer', f)
    const m = new f.Media()
    m.attrs.add('autoplay')
    m.paused = false
    const o = f.observateurs[0]
    expect(o.options).toMatchObject({ childList: true, subtree: true, attributes: true, attributeFilter: ['autoplay'] })
    o.cb([{ type: 'childList', addedNodes: [m] }])
    expect(m.attrs.has('autoplay')).toBe(false)
    expect(m.paused).toBe(true)
  })
  it('filet de sécurité : un évènement play d’un média autoplay sans geste le remet en pause', () => {
    const f = fenetre()
    appliquer('bloquer', f)
    const m = new f.Media()
    m.attrs.add('autoplay')
    m.paused = false
    const l = f.ecouteurs.play[0]
    expect(l.capture).toBe(true)
    l.f({ target: m })
    expect(m.paused).toBe(true)
  })
  it('l’affectation de autoplay sans geste est ignorée', () => {
    const f = fenetre()
    appliquer('bloquer', f)
    const m = new f.Media()
    m.autoplay = true
    expect(m.autoplay).toBe(false)
    f.etat.geste = true
    m.autoplay = true
    expect(m.autoplay).toBe(true)
  })
})

describe('lecture automatique « Sans le son »', () => {
  it('play() sans geste démarre mais muet', async () => {
    const f = fenetre()
    appliquer('sans-son', f)
    const m = new f.Media()
    await m.play()
    expect(m.muted).toBe(true)
    expect(f.lectures).toEqual([{ muted: true }])
  })
  it('play() avec geste garde le son', async () => {
    const f = fenetre({ geste: true })
    appliquer('sans-son', f)
    const m = new f.Media()
    await m.play()
    expect(m.muted).toBe(false)
  })
  it('un média autoplay inséré sans geste est rendu muet dès l’insertion', () => {
    const f = fenetre()
    appliquer('sans-son', f)
    const m = new f.Media()
    m.attrs.add('autoplay')
    f.observateurs[0].cb([{ type: 'childList', addedNodes: [m] }])
    expect(m.muted).toBe(true)
    expect(m.attrs.has('autoplay')).toBe(true)
  })
  it('un média sans autoplay inséré n’est pas touché', () => {
    const f = fenetre()
    appliquer('sans-son', f)
    const m = new f.Media()
    f.observateurs[0].cb([{ type: 'childList', addedNodes: [m] }])
    expect(m.muted).toBe(false)
  })
})

describe('robustesse', () => {
  it('une fenêtre sans HTMLMediaElement est laissée telle quelle', () => {
    const f = fenetre()
    delete f.w.HTMLMediaElement
    expect(() => appliquer('bloquer', f)).not.toThrow()
  })
})
