import { describe, it, expect, beforeEach } from 'vitest'
import { t, definirFournisseurLangue, langueActive } from './index'

describe('i18n', () => {
  beforeEach(() => definirFournisseurLangue(() => 'fr-FR'))

  it('lit le français par défaut', () => {
    expect(t('bonjour', { nom: 'Lyra' })).toBe('Bienvenue dans Lyra')
  })

  it("lit l'anglais quand la langue système est en", () => {
    definirFournisseurLangue(() => 'en-US')
    expect(t('bonjour', { nom: 'Lyra' })).toBe('Welcome to Lyra')
  })

  it('se replie sur le français pour une langue inconnue', () => {
    definirFournisseurLangue(() => 'ja-JP')
    expect(langueActive()).toBe('fr')
  })

  it('renvoie la clé si elle est inconnue', () => {
    expect(t('inexistant')).toBe('inexistant')
  })
})
