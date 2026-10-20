import { describe, expect, it } from 'vitest'
import { pageDeReglagesEnCapture, raccourciPage, type ToucheEntree } from './raccourcis'

const t = (key: string, extra: Partial<ToucheEntree> = {}): ToucheEntree => ({
  type: 'keyDown',
  key,
  code: '',
  control: false,
  meta: true,
  alt: false,
  shift: false,
  isAutoRepeat: false,
  ...extra
})

describe('raccourciPage (table par défaut)', () => {
  it('⌘ L, T, F et ⌘ ⇧ D sur macOS', () => {
    expect(raccourciPage(t('l'), {}, 'darwin')).toEqual({ nom: 'palette', agir: true })
    expect(raccourciPage(t('T'), {}, 'darwin')).toEqual({ nom: 'nouvelle-etoile', agir: true })
    expect(raccourciPage(t('f'), {}, 'darwin')).toEqual({ nom: 'recherche', agir: true })
    expect(raccourciPage(t('d', { shift: true }), {}, 'darwin')).toEqual({ nom: 'ne-pas-deranger', agir: true })
  })
  it('Ctrl L, T, F et Ctrl ⇧ D sur Windows', () => {
    const c = { meta: false, control: true }
    expect(raccourciPage(t('l', c), {}, 'win32')).toEqual({ nom: 'palette', agir: true })
    expect(raccourciPage(t('f', c), {}, 'win32')).toEqual({ nom: 'recherche', agir: true })
    expect(raccourciPage(t('D', { ...c, shift: true }), {}, 'win32')).toEqual({ nom: 'ne-pas-deranger', agir: true })
  })
  it('la table est facultative (défauts)', () => {
    expect(raccourciPage(t('l'), undefined, 'darwin')).toEqual({ nom: 'palette', agir: true })
  })
  it('répétition automatique (touche maintenue) : reconnu mais sans action', () => {
    for (const k of ['l', 't', 'f']) expect(raccourciPage(t(k, { isAutoRepeat: true }), {}, 'darwin')).toMatchObject({ agir: false })
    expect(raccourciPage(t('d', { shift: true, isAutoRepeat: true }), {}, 'darwin')).toEqual({ nom: 'ne-pas-deranger', agir: false })
  })
  it('touche F sans modificateur : reconnue quand elle est affectée ; la frappe ordinaire n’est jamais prise', () => {
    const nu = { meta: false, control: false }
    expect(raccourciPage(t('F6', nu), { palette: 'F6' }, 'win32')).toEqual({ nom: 'palette', agir: true })
    expect(raccourciPage(t('F6', nu), {}, 'win32')).toBeNull()
    for (const k of ['l', 'F', ' ', 'Enter', 'Backspace']) expect(raccourciPage(t(k, nu), { palette: 'F6' }, 'win32'), k).toBeNull()
  })
  it('autres cas : aucun raccourci', () => {
    expect(raccourciPage(t('l', { shift: true }), {}, 'darwin')).toBeNull()
    expect(raccourciPage(t('d'), {}, 'darwin')).toBeNull()
    expect(raccourciPage(t('l', { alt: true }), {}, 'darwin')).toBeNull()
    expect(raccourciPage(t('l', { meta: false }), {}, 'darwin')).toBeNull()
    expect(raccourciPage(t('l', { meta: false, control: true }), {}, 'darwin')).toBeNull()
    expect(raccourciPage(t('l', { type: 'keyUp' }), {}, 'darwin')).toBeNull()
  })
})

describe('raccourciPage (table personnalisée)', () => {
  const perso = { palette: 'CmdOrCtrl+Shift+K', trouver: 'CmdOrCtrl+Alt+F', nouvelleEtoile: 'F6' }
  it("l'ancienne combinaison ne fait plus rien, la nouvelle agit", () => {
    expect(raccourciPage(t('l'), perso, 'darwin')).toBeNull()
    expect(raccourciPage(t('K', { shift: true }), perso, 'darwin')).toEqual({ nom: 'palette', agir: true })
    expect(raccourciPage(t('f'), perso, 'darwin')).toBeNull()
    expect(raccourciPage(t('f', { alt: true }), perso, 'darwin')).toEqual({ nom: 'recherche', agir: true })
  })
  it('touche F sans modificateur', () => {
    expect(raccourciPage(t('F6', { meta: false }), perso, 'darwin')).toEqual({ nom: 'nouvelle-etoile', agir: true })
    expect(raccourciPage(t('t'), perso, 'darwin')).toBeNull()
  })
  it('une commande non personnalisée garde son défaut', () => {
    expect(raccourciPage(t('d', { shift: true }), perso, 'darwin')).toEqual({ nom: 'ne-pas-deranger', agir: true })
  })
  it('une valeur invalide ou en conflit retombe sur le défaut', () => {
    expect(raccourciPage(t('l'), { palette: 'zzz' }, 'darwin')).toEqual({ nom: 'palette', agir: true })
    expect(raccourciPage(t('l'), { palette: 'CmdOrCtrl+F' }, 'darwin')).toEqual({ nom: 'palette', agir: true })
  })
  it('« Par défaut » (valeur vide) rétablit', () => {
    expect(raccourciPage(t('l'), { palette: '' }, 'darwin')).toEqual({ nom: 'palette', agir: true })
  })
  it('AZERTY : la touche produite compte, pas la position physique', () => {
    expect(raccourciPage(t('a', { shift: true, code: 'KeyQ' }), { palette: 'CmdOrCtrl+Shift+A' }, 'darwin')).toEqual({ nom: 'palette', agir: true })
    expect(raccourciPage(t('q', { shift: true, code: 'KeyA' }), { palette: 'CmdOrCtrl+Shift+A' }, 'darwin')).toBeNull()
  })
})

describe('pageDeReglagesEnCapture', () => {
  it('la section Raccourcis des réglages capte les touches (la page ne doit pas les voir traitées avant elle)', () => {
    expect(pageDeReglagesEnCapture('lyra://settings/#/raccourcis')).toBe(true)
    expect(pageDeReglagesEnCapture('lyra://settings#/raccourcis')).toBe(true)
    expect(pageDeReglagesEnCapture('lyra://settings/#/general')).toBe(false)
    expect(pageDeReglagesEnCapture('lyra://settings/')).toBe(false)
    expect(pageDeReglagesEnCapture('https://exemple.fr/#/raccourcis')).toBe(false)
  })
})
