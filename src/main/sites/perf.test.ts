import { describe, expect, it } from 'vitest'
import type { RegleSite } from '../../shared/types'
import { resoudre } from '../settings/sites'
import { ciblesCookies, MODE_BLOQUES } from './cookies'
import { originesScriptsBloques } from './scripts'

function beaucoup(): Record<string, RegleSite> {
  const sites: Record<string, RegleSite> = {}
  for (let i = 0; i < 10000; i++) sites[`*.site${i}.test`] = { cookies: 'bloques', scripts: 'bloques' }
  return sites
}

describe('performance avec 10 000 motifs', () => {
  it('ciblesCookies et originesScriptsBloques restent sous 200 ms', () => {
    const sites = beaucoup()
    let t = performance.now()
    expect(ciblesCookies(sites, MODE_BLOQUES)).toHaveLength(10000)
    expect(performance.now() - t).toBeLessThan(200)
    t = performance.now()
    originesScriptsBloques(sites)
    expect(performance.now() - t).toBeLessThan(200)
  })
  it('le motif le plus long gagne, même parmi beaucoup de motifs', () => {
    const sites = { ...beaucoup(), '*.a.b.test': { zoom: 1.5 }, '*.b.test': { zoom: 2, cookies: 'tous' } as RegleSite }
    const r = resoudre(sites, 'https://x.a.b.test/')
    expect(r.zoom).toBe(1.5)
    expect(r.cookies).toBe('tous')
    expect(resoudre(sites, 'https://b.test/').zoom).toBeUndefined()
  })
})
