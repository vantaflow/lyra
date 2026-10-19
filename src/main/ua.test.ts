import { describe, expect, it } from 'vitest'
import { nettoyerUserAgent } from './ua'

describe('nettoyerUserAgent', () => {
  it('retire Electron et le nom de l’application', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) lyra/0.1.0 Chrome/140.0.0.0 Electron/44.9.0 Safari/537.36'
    const net = nettoyerUserAgent(ua)
    expect(net).toBe('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36')
  })
})
