import { describe, expect, it } from 'vitest'
import { bloqueePar } from './blocageExtensions'
import type { RegleSite } from './types'

const ID = 'a'.repeat(32)
const bloque: RegleSite = { extensions: { [ID]: false } }
const autorise: RegleSite = { extensions: { [ID]: true } }

describe('bloqueePar', () => {
  it('un motif plus large qui bloque l’emporte sur la règle du sous-domaine', () => {
    const sites = { '*.d.fr': bloque, 'www.d.fr': autorise }
    expect(bloqueePar(sites, 'www.d.fr', ID)).toBe('*.d.fr')
  })
  it('le motif couvre aussi l’hôte nu et ses origines', () => {
    expect(bloqueePar({ '*.d.fr': bloque }, 'd.fr', ID)).toBe('*.d.fr')
    expect(bloqueePar({ '*.d.fr': bloque }, 'https://www.d.fr:8443', ID)).toBe('*.d.fr')
  })
  it('un hôte bloqué couvre ses origines, pas les autres hôtes', () => {
    expect(bloqueePar({ 'd.fr': bloque }, 'https://d.fr:8443', ID)).toBe('d.fr')
    expect(bloqueePar({ 'd.fr': bloque }, 'www.d.fr', ID)).toBeNull()
  })
  it('sa propre règle, une autre extension ou une autorisation ne comptent pas', () => {
    expect(bloqueePar({ 'www.d.fr': bloque }, 'www.d.fr', ID)).toBeNull()
    expect(bloqueePar({ '*.d.fr': { extensions: { ['b'.repeat(32)]: false } } }, 'www.d.fr', ID)).toBeNull()
    expect(bloqueePar({ '*.d.fr': autorise }, 'www.d.fr', ID)).toBeNull()
    expect(bloqueePar({}, 'www.d.fr', ID)).toBeNull()
  })
  it('un motif plus étroit ne bloque pas un motif plus large', () => {
    expect(bloqueePar({ '*.a.d.fr': bloque }, '*.d.fr', ID)).toBeNull()
  })
})
