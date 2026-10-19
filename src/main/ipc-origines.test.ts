import { describe, it, expect } from 'vitest'
import { expediteurAutorise } from './ipc-origines'

const prod = 'file:///app/out/renderer/'

describe('expediteurAutorise', () => {
  it('accepte lyra://', () => {
    expect(expediteurAutorise('lyra://newtab', { prod })).toBe(true)
  })
  it('accepte la vue UI en prod', () => {
    expect(expediteurAutorise('file:///app/out/renderer/ui.html', { prod })).toBe(true)
  })
  it('accepte la vue UI en dev', () => {
    const o = { dev: 'http://localhost:5173', prod }
    expect(expediteurAutorise('http://localhost:5173/ui.html', o)).toBe(true)
  })
  it('refuse une origine externe, un faux préfixe dev et la chaîne vide', () => {
    const o = { dev: 'http://localhost:5173', prod }
    expect(expediteurAutorise('https://evil.example', o)).toBe(false)
    expect(expediteurAutorise('http://localhost:5173.evil.example/', o)).toBe(false)
    expect(expediteurAutorise('file:///autre/ui.html', { prod })).toBe(false)
    expect(expediteurAutorise('', o)).toBe(false)
  })
  it('en dev, prod seul ne suffit pas', () => {
    expect(expediteurAutorise('file:///app/out/renderer/ui.html', { dev: 'http://localhost:5173', prod })).toBe(false)
  })
})
