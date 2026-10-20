import { describe, expect, it } from 'vitest'
import { lireJsonTolerant } from './jsonc'

describe('manifest avec commentaires', () => {
  it('retire //, /* */ et le BOM, jamais dans une chaîne', () => {
    const t = '﻿{ // nom\n "name": "a // b", /* x */ "url": "https://x/*y*/", "v": 1 // fin\n}'
    expect(lireJsonTolerant(t)).toEqual({ name: 'a // b', url: 'https://x/*y*/', v: 1 })
  })
  it('un JSON sans commentaire est inchangé, une chaîne avec guillemet échappé aussi', () => {
    expect(lireJsonTolerant('{"a":"q\\"//r"}')).toEqual({ a: 'q"//r' })
  })
})
