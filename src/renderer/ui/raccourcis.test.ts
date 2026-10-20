import { describe, expect, it } from 'vitest'
import { afficherAccelerateur, raccourci } from './raccourcis'

describe('raccourci', () => {
  it('garde les symboles sur macOS', () => {
    expect(raccourci('⌘ ⇧ N', 'darwin')).toBe('⌘ ⇧ N')
  })
  it('traduit en Ctrl+Maj+N ailleurs', () => {
    expect(raccourci('⌘ ⇧ N', 'win32')).toBe('Ctrl+Maj+N')
    expect(raccourci('⌥ ⌘ I', 'linux')).toBe('Alt+Ctrl+I')
  })
  it('traduit aussi ⌃ (Ctrl explicite)', () => {
    expect(raccourci('⌃ ⇥', 'win32')).toBe('Ctrl+Tab')
  })
})

describe('afficherAccelerateur', () => {
  it('macOS : symboles du design', () => {
    expect(afficherAccelerateur('CmdOrCtrl+Shift+D', 'darwin')).toBe('⌘ ⇧ D')
    expect(afficherAccelerateur('Ctrl+Cmd+F', 'darwin')).toBe('⌃ ⌘ F')
    expect(afficherAccelerateur('Cmd+Alt+I', 'darwin')).toBe('⌥ ⌘ I')
    expect(afficherAccelerateur('Ctrl+Tab', 'darwin')).toBe('⌃ ⇥')
    expect(afficherAccelerateur('F12', 'darwin')).toBe('F12')
  })
  it('Windows et Linux : Ctrl+Maj+D', () => {
    expect(afficherAccelerateur('CmdOrCtrl+Shift+D', 'win32')).toBe('Ctrl+Maj+D')
    expect(afficherAccelerateur('Ctrl+Tab', 'win32')).toBe('Ctrl+Tab')
    expect(afficherAccelerateur('CmdOrCtrl+Plus', 'linux')).toBe('Ctrl++')
    expect(afficherAccelerateur('F11', 'win32')).toBe('F11')
  })
  it('accélérateur invalide : affiché tel quel', () => {
    expect(afficherAccelerateur('zzz', 'darwin')).toBe('zzz')
  })
})
