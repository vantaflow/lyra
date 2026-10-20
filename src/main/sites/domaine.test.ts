import { describe, expect, it } from 'vitest'
import { domaineEnregistrable, memePartie } from './domaine'

describe('domaineEnregistrable (section privée de la PSL comprise)', () => {
  it('domaine ordinaire et sous-domaines', () => {
    expect(domaineEnregistrable('https://www.exemple.com/x')).toBe('exemple.com')
    expect(domaineEnregistrable('https://a.b.exemple.com:8443/x')).toBe('exemple.com')
  })
  it('suffixe public à deux niveaux (co.uk)', () => {
    expect(domaineEnregistrable('https://www.a.co.uk/')).toBe('a.co.uk')
    expect(domaineEnregistrable('https://b.co.uk/')).toBe('b.co.uk')
  })
  it('hébergeurs de la section privée : a.github.io ≠ b.github.io', () => {
    expect(domaineEnregistrable('https://a.github.io/')).toBe('a.github.io')
    expect(domaineEnregistrable('https://cdn.a.github.io/')).toBe('a.github.io')
    expect(domaineEnregistrable('https://b.github.io/')).toBe('b.github.io')
  })
  it('IP et localhost : l’hôte lui-même', () => {
    expect(domaineEnregistrable('http://127.0.0.1:3000/')).toBe('127.0.0.1')
    expect(domaineEnregistrable('http://localhost:3000/')).toBe('localhost')
    expect(domaineEnregistrable('http://[::1]:3000/')).toBe('[::1]')
  })
  it('URL illisible : chaîne vide', () => {
    expect(domaineEnregistrable('')).toBe('')
    expect(domaineEnregistrable('pas une url')).toBe('')
  })
})

describe('memePartie', () => {
  it('même domaine enregistrable, ports et sous-domaines ignorés', () => {
    expect(memePartie('https://static.exemple.com/a', 'https://www.exemple.com/')).toBe(true)
    expect(memePartie('http://localhost:1/a', 'http://localhost:2/')).toBe(true)
  })
  it('sites différents', () => {
    expect(memePartie('https://tiers.test/a', 'https://exemple.com/')).toBe(false)
    expect(memePartie('https://a.github.io/', 'https://b.github.io/')).toBe(false)
    expect(memePartie('https://a.co.uk/', 'https://b.co.uk/')).toBe(false)
    expect(memePartie('http://127.0.0.1:1/', 'http://localhost:1/')).toBe(false)
  })
})
