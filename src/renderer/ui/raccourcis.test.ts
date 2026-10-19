import { describe, expect, it } from 'vitest'
import { raccourci } from './raccourcis'

describe('raccourci', () => {
  it('garde les symboles sur macOS', () => {
    expect(raccourci('⌘ ⇧ N', 'darwin')).toBe('⌘ ⇧ N')
  })
  it('traduit en Ctrl+Maj+N ailleurs', () => {
    expect(raccourci('⌘ ⇧ N', 'win32')).toBe('Ctrl+Maj+N')
    expect(raccourci('⌥ ⌘ I', 'linux')).toBe('Alt+Ctrl+I')
  })
})
