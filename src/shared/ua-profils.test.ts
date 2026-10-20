import { describe, expect, it } from 'vitest'
import { CLE_UA_DEFAUT, CLES_UA, estCleUa, libelleUa, majeurChrome } from './ua-profils'

describe('profils de user-agent (partagés avec le renderer)', () => {
  it('le profil par défaut est « Lyra (Chrome N) » avec N du vrai Chrome', () => {
    expect(CLE_UA_DEFAUT).toBe('lyra')
    expect(libelleUa('lyra', 152)).toBe('Lyra (Chrome 152)')
    expect(libelleUa('lyra', 160)).toBe('Lyra (Chrome 160)')
  })
  it('clés et libellés des profils alternatifs', () => {
    expect(CLES_UA).toEqual(['lyra', 'chrome-windows', 'firefox', 'safari', 'chrome-android'])
    expect(libelleUa('chrome-windows', 152)).toBe('Chrome (Windows)')
    expect(libelleUa('firefox', 152)).toBe('Firefox (Windows)')
    expect(libelleUa('safari', 152)).toBe('Safari (Mac)')
    expect(libelleUa('chrome-android', 152)).toBe('Chrome (Android)')
  })
  it('estCleUa refuse les clés inconnues', () => {
    expect(estCleUa('safari')).toBe(true)
    expect(estCleUa('netscape')).toBe(false)
    expect(estCleUa(undefined)).toBe(false)
  })
  it('majeurChrome lit le numéro de version d’un navigator.userAgent', () => {
    expect(majeurChrome('Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36')).toBe(152)
    expect(majeurChrome('rien')).toBeUndefined()
    expect(majeurChrome('152.0.7977.167')).toBe(152)
  })
})
