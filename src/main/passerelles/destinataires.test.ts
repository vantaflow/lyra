import { describe, it, expect } from 'vitest'
import { recoitPasserelles } from './destinataires'

describe('recoitPasserelles', () => {
  it('pages lyra:// des fenêtres normales seulement', () => {
    expect(recoitPasserelles('lyra://settings', false)).toBe(true)
    expect(recoitPasserelles('lyra://settings', true)).toBe(false)
    expect(recoitPasserelles('file:///app/renderer/ui.html', false)).toBe(false)
    expect(recoitPasserelles('https://evil.test/ui.html?lyra://', false)).toBe(false)
  })
})
