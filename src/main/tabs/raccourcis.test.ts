import { describe, expect, it } from 'vitest'
import { raccourciPage, type ToucheEntree } from './raccourcis'

const t = (key: string, extra: Partial<ToucheEntree> = {}): ToucheEntree => ({
  type: 'keyDown',
  key,
  control: false,
  meta: true,
  alt: false,
  shift: false,
  isAutoRepeat: false,
  ...extra
})

describe('raccourciPage', () => {
  it('⌘ L, T, F et ⌘ ⇧ D', () => {
    expect(raccourciPage(t('l'))).toEqual({ nom: 'palette', agir: true })
    expect(raccourciPage(t('T'))).toEqual({ nom: 'nouvelle-etoile', agir: true })
    expect(raccourciPage(t('f', { meta: false, control: true }))).toEqual({ nom: 'recherche', agir: true })
    expect(raccourciPage(t('d', { shift: true }))).toEqual({ nom: 'ne-pas-deranger', agir: true })
  })
  it('répétition automatique (touche maintenue) : reconnu mais sans action', () => {
    for (const k of ['l', 't', 'f']) expect(raccourciPage(t(k, { isAutoRepeat: true }))).toMatchObject({ agir: false })
    expect(raccourciPage(t('d', { shift: true, isAutoRepeat: true }))).toEqual({ nom: 'ne-pas-deranger', agir: false })
  })
  it('autres cas : aucun raccourci', () => {
    expect(raccourciPage(t('l', { shift: true }))).toBeNull()
    expect(raccourciPage(t('d'))).toBeNull()
    expect(raccourciPage(t('l', { alt: true }))).toBeNull()
    expect(raccourciPage(t('l', { meta: false }))).toBeNull()
    expect(raccourciPage(t('l', { type: 'keyUp' }))).toBeNull()
  })
})
