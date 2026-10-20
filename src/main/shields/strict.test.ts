import { describe, expect, it } from 'vitest'
import { bloqueScriptTiers } from './strict'

const haut = 'https://www.exemple.test/page'

describe('garde Strict : script tiers hors liste', () => {
  it('autorise un script de la 1re partie', () => {
    expect(bloqueScriptTiers('https://www.exemple.test/app.js', 'script', haut)).toBe(false)
  })
  it('autorise un sous-domaine de la 1re partie (même domaine enregistrable)', () => {
    expect(bloqueScriptTiers('https://static.exemple.test/app.js', 'script', haut)).toBe(false)
    expect(bloqueScriptTiers('https://exemple.test/app.js', 'script', haut)).toBe(false)
  })
  it('autorise un CDN connu et ses sous-domaines', () => {
    expect(bloqueScriptTiers('https://cdn.jsdelivr.net/npm/x.js', 'script', haut)).toBe(false)
    expect(bloqueScriptTiers('https://cdnjs.cloudflare.com/a.js', 'script', haut)).toBe(false)
    expect(bloqueScriptTiers('https://unpkg.com/x.js', 'script', haut)).toBe(false)
    expect(bloqueScriptTiers('https://ajax.googleapis.com/a.js', 'script', haut)).toBe(false)
  })
  it('bloque un script tiers inconnu', () => {
    expect(bloqueScriptTiers('https://tiers-inconnu.test/x.js', 'script', haut)).toBe(true)
    expect(bloqueScriptTiers('https://exemple.test.autre.test/x.js', 'script', haut)).toBe(true)
  })
  it('ne touche ni les autres types ni les protocoles non web', () => {
    expect(bloqueScriptTiers('https://tiers-inconnu.test/x.png', 'image', haut)).toBe(false)
    expect(bloqueScriptTiers('data:text/javascript,1', 'script', haut)).toBe(false)
    expect(bloqueScriptTiers('https://tiers-inconnu.test/', 'mainFrame', haut)).toBe(false)
  })
  it('frame inconnue (page de premier niveau introuvable) → autorisé', () => {
    expect(bloqueScriptTiers('https://tiers-inconnu.test/x.js', 'script', '')).toBe(false)
    expect(bloqueScriptTiers('https://tiers-inconnu.test/x.js', 'script', 'about:blank')).toBe(false)
  })
  it('hôtes sans domaine enregistrable (IP, localhost) : comparés tels quels', () => {
    expect(bloqueScriptTiers('http://127.0.0.1:2/a.js', 'script', 'http://127.0.0.1:1/')).toBe(false)
    expect(bloqueScriptTiers('http://localhost:2/a.js', 'script', 'http://127.0.0.1:1/')).toBe(true)
  })
  it('page file:// : tout script http(s) hors liste est tiers', () => {
    expect(bloqueScriptTiers('https://tiers-inconnu.test/x.js', 'script', 'file:///C:/a/index.html')).toBe(true)
    expect(bloqueScriptTiers('https://cdn.jsdelivr.net/x.js', 'script', 'file:///C:/a/index.html')).toBe(false)
  })
})
