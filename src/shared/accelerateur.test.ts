import { describe, expect, it } from 'vitest'
import { analyser, canonique, correspond, detecterConflit, normaliser, toucheDeEvenement, valider, versSymboles } from './accelerateur'

describe('analyser / normaliser', () => {
  it('normalise la casse, les alias et l’ordre des modificateurs', () => {
    expect(normaliser('cmdorctrl+shift+d')).toBe('CmdOrCtrl+Shift+D')
    expect(normaliser('Shift+CommandOrControl+d')).toBe('CmdOrCtrl+Shift+D')
    expect(normaliser('Option+Command+i')).toBe('Cmd+Alt+I')
    expect(normaliser('Control+Tab')).toBe('Ctrl+Tab')
    expect(normaliser('CmdOrCtrl+plus')).toBe('CmdOrCtrl+Plus')
    expect(normaliser('f12')).toBe('F12')
    expect(normaliser('CmdOrCtrl+,')).toBe('CmdOrCtrl+,')
  })
  it('refuse une chaîne invalide', () => {
    for (const a of ['', '+', 'CmdOrCtrl+', 'CmdOrCtrl+A+B', 'Super+A', 'CmdOrCtrl+Shift', 'CmdOrCtrl+F99', 'CmdOrCtrl+ab']) expect(normaliser(a), a).toBeNull()
  })
  it('analyse les modificateurs', () => {
    expect(analyser('CmdOrCtrl+Shift+D')).toEqual({ cmdOuCtrl: true, cmd: false, ctrl: false, alt: false, shift: true, touche: 'D' })
  })
})

describe('canonique (CmdOrCtrl résolu selon la plateforme)', () => {
  it('CmdOrCtrl = Cmd sur macOS, Ctrl ailleurs', () => {
    expect(canonique('CmdOrCtrl+L', 'darwin')).toBe('Cmd+L')
    expect(canonique('CmdOrCtrl+L', 'win32')).toBe('Ctrl+L')
    expect(canonique('Ctrl+Tab', 'win32')).toBe(canonique('CmdOrCtrl+Tab', 'win32'))
    expect(canonique('Ctrl+Tab', 'darwin')).not.toBe(canonique('CmdOrCtrl+Tab', 'darwin'))
  })
})

describe('toucheDeEvenement (AZERTY)', () => {
  it('lettre : la touche produite, pas la position physique', () => {
    expect(toucheDeEvenement({ key: 'a', code: 'KeyQ' })).toBe('A')
    expect(toucheDeEvenement({ key: 'L', code: 'KeyL' })).toBe('L')
  })
  it('chiffre : le code physique (AZERTY : & é " ...)', () => {
    expect(toucheDeEvenement({ key: '&', code: 'Digit1' })).toBe('1')
    expect(toucheDeEvenement({ key: '1', code: 'Digit1' })).toBe('1')
    expect(toucheDeEvenement({ key: '!', code: 'Digit1' })).toBe('1')
  })
  it('lettre composée par Option (macOS) : repli sur le code', () => {
    expect(toucheDeEvenement({ key: 'ˆ', code: 'KeyI' })).toBe('I')
  })
  it('touches spéciales et de fonction', () => {
    expect(toucheDeEvenement({ key: 'Tab', code: 'Tab' })).toBe('Tab')
    expect(toucheDeEvenement({ key: ' ', code: 'Space' })).toBe('Space')
    expect(toucheDeEvenement({ key: 'ArrowUp', code: 'ArrowUp' })).toBe('Up')
    expect(toucheDeEvenement({ key: 'F12', code: 'F12' })).toBe('F12')
    expect(toucheDeEvenement({ key: '+', code: 'Equal' })).toBe('Plus')
    expect(toucheDeEvenement({ key: '=', code: 'Equal' })).toBe('=')
    expect(toucheDeEvenement({ key: ',', code: 'Comma' })).toBe(',')
    expect(toucheDeEvenement({ key: '\\', code: 'Backslash' })).toBe('\\')
  })
  it('modificateur seul ou touche inconnue : null', () => {
    expect(toucheDeEvenement({ key: 'Shift', code: 'ShiftLeft' })).toBeNull()
    expect(toucheDeEvenement({ key: 'Meta', code: 'MetaLeft' })).toBeNull()
    expect(toucheDeEvenement({ key: 'Dead', code: '' })).toBeNull()
  })
})

describe('correspond (événement clavier ↔ accélérateur)', () => {
  const ev = (key: string, m: Partial<{ control: boolean; meta: boolean; alt: boolean; shift: boolean }> = {}, code = '') => ({
    key, code, control: false, meta: false, alt: false, shift: false, ...m
  })
  it('CmdOrCtrl = meta sur macOS, control ailleurs, exactement', () => {
    expect(correspond('CmdOrCtrl+L', ev('l', { meta: true }), 'darwin')).toBe(true)
    expect(correspond('CmdOrCtrl+L', ev('l', { control: true }), 'darwin')).toBe(false)
    expect(correspond('CmdOrCtrl+L', ev('l', { control: true }), 'win32')).toBe(true)
    expect(correspond('CmdOrCtrl+L', ev('l', { meta: true }), 'win32')).toBe(false)
  })
  it('modificateurs en trop ou en moins : pas de correspondance', () => {
    expect(correspond('CmdOrCtrl+L', ev('l', { meta: true, shift: true }), 'darwin')).toBe(false)
    expect(correspond('CmdOrCtrl+Shift+D', ev('D', { meta: true, shift: true }), 'darwin')).toBe(true)
    expect(correspond('CmdOrCtrl+Shift+D', ev('d', { meta: true }), 'darwin')).toBe(false)
    expect(correspond('CmdOrCtrl+L', ev('l', { meta: true, alt: true }), 'darwin')).toBe(false)
  })
  it('Ctrl explicite et touches F', () => {
    expect(correspond('Ctrl+Tab', ev('Tab', { control: true }), 'darwin')).toBe(true)
    expect(correspond('F12', ev('F12'), 'win32')).toBe(true)
  })
  it('accélérateur invalide : faux', () => {
    expect(correspond('n’importe quoi', ev('l', { meta: true }), 'darwin')).toBe(false)
  })
})

describe('valider', () => {
  it('accepte une combinaison avec ⌘/Ctrl ou une touche F', () => {
    expect(valider('CmdOrCtrl+Shift+K', 'darwin')).toEqual({ ok: true, accelerateur: 'CmdOrCtrl+Shift+K' })
    expect(valider('F5', 'win32')).toEqual({ ok: true, accelerateur: 'F5' })
    expect(valider('Ctrl+Tab', 'darwin')).toEqual({ ok: true, accelerateur: 'Ctrl+Tab' })
  })
  it('refuse une combinaison sans ⌘/Ctrl (hors touches F)', () => {
    expect(valider('Shift+K', 'darwin')).toEqual({ ok: false, raison: 'modificateur' })
    expect(valider('Alt+K', 'win32')).toEqual({ ok: false, raison: 'modificateur' })
    expect(valider('K', 'win32')).toEqual({ ok: false, raison: 'modificateur' })
  })
  it('refuse les raccourcis réservés au système', () => {
    expect(valider('CmdOrCtrl+Q', 'darwin')).toEqual({ ok: false, raison: 'reserve' })
    expect(valider('CmdOrCtrl+H', 'darwin')).toEqual({ ok: false, raison: 'reserve' })
    expect(valider('Cmd+Alt+Escape', 'darwin')).toEqual({ ok: false, raison: 'reserve' })
    expect(valider('Alt+F4', 'win32')).toEqual({ ok: false, raison: 'reserve' })
    expect(valider('CmdOrCtrl+Q', 'win32').ok).toBe(true)
  })
  it('refuse les rôles natifs (copier, coller…)', () => {
    for (const a of ['CmdOrCtrl+C', 'CmdOrCtrl+V', 'CmdOrCtrl+X', 'CmdOrCtrl+Z', 'CmdOrCtrl+A']) expect(valider(a, 'darwin'), a).toEqual({ ok: false, raison: 'natif' })
  })
  it('refuse une chaîne invalide', () => {
    expect(valider('zzz', 'darwin')).toEqual({ ok: false, raison: 'invalide' })
  })
})

describe('detecterConflit', () => {
  const table = { a: 'CmdOrCtrl+L', b: 'Ctrl+Tab', c: 'CmdOrCtrl+Plus' }
  it('renvoie la commande qui porte déjà la combinaison, CmdOrCtrl résolu', () => {
    expect(detecterConflit(table, 'z', 'Cmd+L', 'darwin')).toBe('a')
    expect(detecterConflit(table, 'z', 'Ctrl+L', 'win32')).toBe('a')
    expect(detecterConflit(table, 'z', 'Ctrl+L', 'darwin')).toBeNull()
  })
  it('ignore la commande elle-même', () => {
    expect(detecterConflit(table, 'a', 'CmdOrCtrl+L', 'darwin')).toBeNull()
  })
  it('aucun conflit', () => {
    expect(detecterConflit(table, 'z', 'CmdOrCtrl+K', 'darwin')).toBeNull()
  })
})

describe('versSymboles', () => {
  it('écrit la combinaison au format du design', () => {
    expect(versSymboles('CmdOrCtrl+Shift+D')).toBe('⌘ ⇧ D')
    expect(versSymboles('Cmd+Alt+I')).toBe('⌥ ⌘ I')
    expect(versSymboles('Ctrl+Cmd+F')).toBe('⌃ ⌘ F')
    expect(versSymboles('Ctrl+Tab')).toBe('⌃ ⇥')
    expect(versSymboles('CmdOrCtrl+Plus')).toBe('⌘ +')
    expect(versSymboles('F12')).toBe('F12')
    expect(versSymboles('CmdOrCtrl+,')).toBe('⌘ ,')
  })
})
