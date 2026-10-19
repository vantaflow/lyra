import { describe, it, expect } from 'vitest'
import { categorieDe } from './categorie'

describe('categorieDe', () => {
  it('lyra:// est interne, tout le reste est web', () => {
    expect(categorieDe('lyra://newtab')).toBe('interne')
    expect(categorieDe('LYRA://settings/')).toBe('interne')
    expect(categorieDe('https://www.youtube.com/')).toBe('web')
    expect(categorieDe('file:///tmp/a.html')).toBe('web')
    expect(categorieDe('about:blank')).toBe('web')
    expect(categorieDe('https://exemple.fr/?u=lyra://x')).toBe('web')
  })
})
