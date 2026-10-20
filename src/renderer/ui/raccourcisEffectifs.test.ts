import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { aideCommande, aideSuggestion } from './raccourcisEffectifs'

describe('aideCommande : le raccourci effectif d’une commande, au format de la plateforme', () => {
  it('défauts', () => {
    expect(aideCommande('nouvelleEtoile', {}, 'darwin')).toBe('⌘ T')
    expect(aideCommande('nouvelleEtoile', {}, 'win32')).toBe('Ctrl+T')
    expect(aideCommande('fenetrePrivee', {}, 'win32')).toBe('Ctrl+Maj+N')
    expect(aideCommande('outils', {}, 'darwin')).toBe('⌥ ⌘ I')
    expect(aideCommande('outils', {}, 'win32')).toBe('F12')
    expect(aideCommande('basculerCiel', {}, 'win32')).toBe('Ctrl+\\')
  })
  it('Historique : ⌘ Y sur macOS, Ctrl+H ailleurs', () => {
    expect(aideCommande('historique', {}, 'darwin')).toBe('⌘ Y')
    expect(aideCommande('historique', {}, 'win32')).toBe('Ctrl+H')
  })
  it('suit les redéfinitions', () => {
    expect(aideCommande('palette', { palette: 'CmdOrCtrl+Shift+K' }, 'darwin')).toBe('⌘ ⇧ K')
    expect(aideCommande('palette', { palette: 'CmdOrCtrl+Shift+K' }, 'win32')).toBe('Ctrl+Maj+K')
    expect(aideCommande('dnd', { dnd: 'F6' }, 'win32')).toBe('F6')
  })
  it('un réglage invalide, réservé ou en conflit ne change rien (c’est le défaut qui joue, donc qui s’affiche)', () => {
    expect(aideCommande('palette', { palette: 'zzz' }, 'darwin')).toBe('⌘ L')
    expect(aideCommande('palette', { palette: 'CmdOrCtrl+R' }, 'darwin')).toBe('⌘ L')
    expect(aideCommande('palette', { palette: 'CmdOrCtrl+Backspace' }, 'darwin')).toBe('⌘ L')
  })
  it('Quitter sur macOS (rôle natif) : le défaut, jamais le réglage ; commande inconnue : vide', () => {
    expect(aideCommande('quitter', { quitter: 'CmdOrCtrl+K' }, 'darwin')).toBe('⌘ Q')
    expect(aideCommande('quitter', { quitter: 'CmdOrCtrl+K' }, 'win32')).toBe('Ctrl+K')
    expect(aideCommande('inconnue', {}, 'darwin')).toBe('')
  })
})

describe('aideSuggestion : la palette affiche le raccourci effectif de ses commandes', () => {
  it('commandes de la palette liées à une commande redéfinissable', () => {
    expect(aideSuggestion({ id: 'nouvelle-etoile', sousTitre: '⌘ T' }, {}, 'win32')).toBe('Ctrl+T')
    expect(aideSuggestion({ id: 'nouvelle-etoile', sousTitre: '⌘ T' }, { nouvelleEtoile: 'CmdOrCtrl+Shift+E' }, 'darwin')).toBe('⌘ ⇧ E')
    expect(aideSuggestion({ id: 'fenetre-privee', sousTitre: '⌘ ⇧ N' }, { fenetrePrivee: 'CmdOrCtrl+Alt+P' }, 'darwin')).toBe('⌥ ⌘ P')
    expect(aideSuggestion({ id: 'reglages', sousTitre: '⌘ ,' }, {}, 'win32')).toBe('Ctrl+,')
    expect(aideSuggestion({ id: 'dnd-60', sousTitre: '⌘ ⇧ D' }, { dnd: 'F6' }, 'win32')).toBe('F6')
  })
  it('les autres lignes gardent leur sous-titre (« Échap », « réglage », libellés d’étoiles)', () => {
    expect(aideSuggestion({ id: 'dnd-sortir', sousTitre: 'Échap' }, {}, 'darwin')).toBe('Échap')
    expect(aideSuggestion({ id: 'ciel-gauche', sousTitre: 'réglage' }, {}, 'darwin')).toBe('réglage')
    expect(aideSuggestion({ id: 'dnd-30' }, {}, 'darwin')).toBe('')
  })
})

describe('aucun raccourci de commande écrit en dur dans l’interface', () => {
  // Une redéfinition doit se voir partout : menu ⋯, ciel, bande, rail, info-bulles.
  for (const f of ['MenuPanel', 'Sky', 'Bande', 'Rail']) {
    it(`${f}.tsx`, () => {
      const src = readFileSync(join(__dirname, `${f}.tsx`), 'utf8')
      expect(src).not.toMatch(/raccourci\(\s*['"`]/)
      expect(src).not.toMatch(/['"`][^'"`\n]*[⌘⇧⌥⌃]\s*[A-Z,\\]/)
      expect(src).not.toMatch(/\$\{touche\}\s+[A-Z\\]/)
      expect(src).not.toMatch(/\{touche\}\s+[A-Z]/)
    })
  }
})
