import { describe, expect, it } from 'vitest'
import { enTest } from './modeTest'

describe('enTest', () => {
  it('vrai seulement avec LYRA_TEST=1 et une application non empaquetée', () => {
    expect(enTest({ LYRA_TEST: '1' }, () => false)).toBe(true)
    expect(enTest({}, () => false)).toBe(false)
    expect(enTest({ LYRA_TEST: '0' }, () => false)).toBe(false)
  })

  it('app.isPackaged simulé à vrai : toujours faux', () => {
    expect(enTest({ LYRA_TEST: '1' }, () => true)).toBe(false)
  })

  it('sans Electron (vitest) : l’application est considérée comme non empaquetée', () => {
    expect(enTest({ LYRA_TEST: '1' })).toBe(true)
  })
})
