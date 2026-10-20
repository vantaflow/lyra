import { describe, expect, it } from 'vitest'
import { canonique, valider } from './accelerateur'
import { COMMANDES, GROUPES, commandeParId, defautDe, estParDefaut, messageRefus, natives, patchToutParDefaut, redefinissable, tableEffective, tenterAttribution } from './commandes'

const PLATEFORMES = ['darwin', 'win32', 'linux'] as const

describe('COMMANDES', () => {
  it('couvre les commandes de la spec §4 « Raccourcis »', () => {
    const libelles = COMMANDES.map((c) => c.libelle)
    for (const l of ['Nouvelle étoile', "Fermer l'étoile", 'Rouvrir la dernière étoile', 'Nouvelle fenêtre', 'Nouvelle fenêtre privée', 'Aller à…', 'Recharger', 'Rechercher dans la page', 'Étoile suivante', 'Étoile précédente', 'Dernière étoile', 'Zoom avant', 'Zoom arrière', 'Taille réelle', 'Historique', 'Favoris', 'Téléchargements', 'Ajouter aux favoris', 'Plein écran', 'Outils de développement', 'Quitter']) {
      expect(libelles, l).toContain(l)
    }
    for (let i = 1; i <= 8; i++) expect(libelles).toContain(`Étoile ${i}`)
  })
  it('ids de commande et de menu uniques, groupes connus, ids acceptés par la validation des réglages', () => {
    expect(new Set(COMMANDES.map((c) => c.id)).size).toBe(COMMANDES.length)
    expect(new Set(COMMANDES.map((c) => c.idMenu)).size).toBe(COMMANDES.length)
    for (const c of COMMANDES) {
      expect(GROUPES, c.id).toContain(c.groupe)
      expect(c.id, c.id).toMatch(/^[A-Za-z0-9]+$/)
    }
  })
  it('conserve les ids de menu historiques', () => {
    const ids = COMMANDES.map((c) => c.idMenu)
    for (const i of ['nouvelle-etoile', 'fermer-etoile', 'rouvrir-etoile', 'nouvelle-fenetre', 'fenetre-privee', 'palette', 'quitter', 'recharger', 'trouver', 'zoom-plus', 'zoom-moins', 'zoom-zero', 'ne-pas-deranger', 'basculer-ciel', 'imprimer', 'etoile-suivante', 'etoile-precedente', 'favori', 'historique', 'reglages', 'etoile-1', 'etoile-9']) {
      expect(ids, i).toContain(i)
    }
  })
  it('défauts de la spec : ⌘ T, W, ⇧ T, N, ⇧ N, L, R, F, Ctrl+Tab, 1-9, +/-/0, Y, ⇧ B, ⇧ J, D, F11, F12', () => {
    const d = (id: string, p = 'win32'): string => defautDe(commandeParId(id)!, p)
    expect(d('nouvelleEtoile')).toBe('CmdOrCtrl+T')
    expect(d('fermerEtoile')).toBe('CmdOrCtrl+W')
    expect(d('rouvrirEtoile')).toBe('CmdOrCtrl+Shift+T')
    expect(d('nouvelleFenetre')).toBe('CmdOrCtrl+N')
    expect(d('fenetrePrivee')).toBe('CmdOrCtrl+Shift+N')
    expect(d('palette')).toBe('CmdOrCtrl+L')
    expect(d('recharger')).toBe('CmdOrCtrl+R')
    expect(d('trouver')).toBe('CmdOrCtrl+F')
    expect(d('etoileSuivante')).toBe('Ctrl+Tab')
    expect(d('etoilePrecedente')).toBe('Ctrl+Shift+Tab')
    expect(d('etoile1')).toBe('CmdOrCtrl+1')
    expect(d('derniereEtoile')).toBe('CmdOrCtrl+9')
    expect(d('zoomAvant')).toBe('CmdOrCtrl+Plus')
    expect(d('zoomArriere')).toBe('CmdOrCtrl+-')
    expect(d('zoomZero')).toBe('CmdOrCtrl+0')
    expect(d('historique')).toBe('Ctrl+H')
    expect(d('historique', 'linux')).toBe('Ctrl+H')
    expect(d('historique', 'darwin')).toBe('CmdOrCtrl+Y')
    expect(d('favoris')).toBe('CmdOrCtrl+Shift+B')
    expect(d('telechargements')).toBe('CmdOrCtrl+Shift+J')
    expect(d('favori')).toBe('CmdOrCtrl+D')
    expect(d('quitter')).toBe('CmdOrCtrl+Q')
    expect(d('pleinEcran', 'win32')).toBe('F11')
    expect(d('pleinEcran', 'darwin')).toBe('Ctrl+Cmd+F')
    expect(d('outils', 'win32')).toBe('F12')
    expect(d('outils', 'darwin')).toBe('Cmd+Alt+I')
  })
  it('conserve les raccourcis déjà en place (⇧ D, ⌘ \\, ⌘ P, ⌘ ,)', () => {
    expect(defautDe(commandeParId('dnd')!, 'darwin')).toBe('CmdOrCtrl+Shift+D')
    expect(defautDe(commandeParId('basculerCiel')!, 'darwin')).toBe('CmdOrCtrl+\\')
    expect(defautDe(commandeParId('imprimer')!, 'darwin')).toBe('CmdOrCtrl+P')
    expect(defautDe(commandeParId('reglages')!, 'darwin')).toBe('CmdOrCtrl+,')
  })
  it('les défauts sont valides et sans conflit, sur chaque plateforme', () => {
    for (const p of PLATEFORMES) {
      const vus = new Map<string, string>()
      for (const c of COMMANDES) {
        if (!redefinissable(c, p)) continue
        const a = defautDe(c, p)
        expect(valider(a, p).ok, `${c.id} ${a} ${p}`).toBe(true)
        const cano = canonique(a, p)!
        expect(vus.get(cano), `${c.id} / ${vus.get(cano)} : ${a} (${p})`).toBeUndefined()
        vus.set(cano, c.id)
      }
    }
  })
  it('seules 4 commandes sont traitées dans before-input-event (la page ne doit pas les avaler)', () => {
    expect(COMMANDES.filter((c) => c.page).map((c) => [c.id, c.page])).toEqual([
      ['nouvelleEtoile', 'nouvelle-etoile'],
      ['palette', 'palette'],
      ['trouver', 'recherche'],
      ['dnd', 'ne-pas-deranger']
    ])
  })
})

describe('redefinissable', () => {
  it('Quitter est un rôle natif sur macOS, redéfinissable ailleurs', () => {
    expect(redefinissable(commandeParId('quitter')!, 'darwin')).toBe(false)
    expect(redefinissable(commandeParId('quitter')!, 'win32')).toBe(true)
    expect(redefinissable(commandeParId('palette')!, 'darwin')).toBe(true)
  })
})

describe('natives', () => {
  it('rôles du menu Édition (non redéfinissables)', () => {
    expect(natives('darwin').map((n) => n.libelle)).toEqual(['Annuler', 'Rétablir', 'Couper', 'Copier', 'Coller', 'Tout sélectionner'])
    expect(natives('darwin')[1].accelerateur).toBe('CmdOrCtrl+Shift+Z')
    expect(natives('win32')[1].accelerateur).toBe('CmdOrCtrl+Y')
    expect(natives('linux')[1].accelerateur).toBe('CmdOrCtrl+Shift+Z')
  })
  it('Windows : Ctrl+Y reste à « Rétablir » ; « Historique » prend Ctrl+H (comme Chrome et Edge)', () => {
    expect(tableEffective({}, 'win32').historique).toBe('Ctrl+H')
    expect(tableEffective({ historique: 'CmdOrCtrl+Y' }, 'win32').historique).toBe('Ctrl+H')
    expect(tableEffective({ historique: 'CmdOrCtrl+Y' }, 'darwin').historique).toBe('CmdOrCtrl+Y')
    expect(tenterAttribution({}, 'favori', 'CmdOrCtrl+Y', 'win32')).toEqual({ ok: false, raison: 'natif' })
  })
})

describe('tableEffective', () => {
  it('table vide : tous les défauts', () => {
    const t = tableEffective({}, 'darwin')
    expect(t.palette).toBe('CmdOrCtrl+L')
    expect(t.outils).toBe('Cmd+Alt+I')
    expect(Object.keys(t)).toHaveLength(COMMANDES.filter((c) => redefinissable(c, 'darwin')).length)
  })
  it('personnalisation valide, normalisée ; vide = défaut ; commande inconnue ignorée', () => {
    const t = tableEffective({ palette: 'cmdorctrl+shift+k', recharger: '', 'onglet.nouveau': 'CmdOrCtrl+T' }, 'darwin')
    expect(t.palette).toBe('CmdOrCtrl+Shift+K')
    expect(t.recharger).toBe('CmdOrCtrl+R')
    expect(t['onglet.nouveau']).toBeUndefined()
  })
  it('valeur invalide, réservée ou sans ⌘/Ctrl : défaut', () => {
    const t = tableEffective({ palette: 'zzz', recharger: 'CmdOrCtrl+Q', trouver: 'Shift+K' }, 'darwin')
    expect(t.palette).toBe('CmdOrCtrl+L')
    expect(t.recharger).toBe('CmdOrCtrl+R')
    expect(t.trouver).toBe('CmdOrCtrl+F')
  })
  it('table hostile (importée) : touches d’édition, AltGr, rôles natifs, valeurs non textuelles ou prototype : défauts', () => {
    const hostile = JSON.parse('{"palette":"CmdOrCtrl+Backspace","recharger":"CmdOrCtrl+Alt+R","trouver":"CmdOrCtrl+C","__proto__":"CmdOrCtrl+K","constructor":"CmdOrCtrl+J","favori":42,"imprimer":["CmdOrCtrl+K"],"zoomZero":"CmdOrCtrl+Y"}')
    const t = tableEffective(hostile, 'win32')
    expect(t.palette).toBe('CmdOrCtrl+L')
    expect(t.recharger).toBe('CmdOrCtrl+R')
    expect(t.trouver).toBe('CmdOrCtrl+F')
    expect(t.favori).toBe('CmdOrCtrl+D')
    expect(t.imprimer).toBe('CmdOrCtrl+P')
    expect(t.zoomZero).toBe('CmdOrCtrl+0')
  })
  it('une personnalisation qui entre en conflit avec une autre commande est ignorée (le défaut revient)', () => {
    const t = tableEffective({ palette: 'CmdOrCtrl+R' }, 'darwin')
    expect(t.palette).toBe('CmdOrCtrl+L')
    expect(t.recharger).toBe('CmdOrCtrl+R')
  })
  it('un échange de deux combinaisons est accepté', () => {
    const t = tableEffective({ palette: 'CmdOrCtrl+R', recharger: 'CmdOrCtrl+L' }, 'darwin')
    expect(t.palette).toBe('CmdOrCtrl+R')
    expect(t.recharger).toBe('CmdOrCtrl+L')
  })
  it('deux personnalisations identiques : les deux reviennent au défaut', () => {
    const t = tableEffective({ palette: 'CmdOrCtrl+K', recharger: 'CmdOrCtrl+K' }, 'darwin')
    expect(t.palette).toBe('CmdOrCtrl+L')
    expect(t.recharger).toBe('CmdOrCtrl+R')
  })
  it('quitter sur macOS : fixe, jamais redéfini', () => {
    expect(tableEffective({ quitter: 'CmdOrCtrl+K' }, 'darwin').quitter).toBeUndefined()
    expect(tableEffective({ quitter: 'CmdOrCtrl+K' }, 'win32').quitter).toBe('CmdOrCtrl+K')
  })
})

describe('estParDefaut', () => {
  it('compare les formes canoniques (Ctrl+Tab = CmdOrCtrl+Tab sous Windows)', () => {
    expect(estParDefaut('palette', {}, 'darwin')).toBe(true)
    expect(estParDefaut('palette', { palette: 'cmdorctrl+l' }, 'darwin')).toBe(true)
    expect(estParDefaut('palette', { palette: 'CmdOrCtrl+K' }, 'darwin')).toBe(false)
    expect(estParDefaut('etoileSuivante', { etoileSuivante: 'CmdOrCtrl+Tab' }, 'win32')).toBe(true)
    expect(estParDefaut('etoileSuivante', { etoileSuivante: 'CmdOrCtrl+Tab' }, 'darwin')).toBe(false)
  })
})

describe('tenterAttribution', () => {
  it('accepte une combinaison libre, normalisée', () => {
    expect(tenterAttribution({}, 'palette', 'cmdorctrl+shift+k', 'darwin')).toEqual({ ok: true, valeur: 'CmdOrCtrl+Shift+K' })
  })
  it('combinaison égale au défaut : écart effacé (valeur vide)', () => {
    expect(tenterAttribution({ palette: 'CmdOrCtrl+K' }, 'palette', 'CmdOrCtrl+L', 'darwin')).toEqual({ ok: true, valeur: '' })
    expect(tenterAttribution({}, 'etoileSuivante', 'CmdOrCtrl+Tab', 'win32')).toEqual({ ok: true, valeur: '' })
  })
  it('signale le conflit avec une autre commande (défaut ou personnalisée)', () => {
    expect(tenterAttribution({}, 'palette', 'CmdOrCtrl+R', 'darwin')).toEqual({ ok: false, raison: 'conflit', avec: 'Recharger' })
    expect(tenterAttribution({ recharger: 'CmdOrCtrl+K' }, 'palette', 'CmdOrCtrl+K', 'darwin')).toEqual({ ok: false, raison: 'conflit', avec: 'Recharger' })
  })
  it('une combinaison libérée par une autre commande est attribuable', () => {
    expect(tenterAttribution({ recharger: 'CmdOrCtrl+K' }, 'palette', 'CmdOrCtrl+R', 'darwin')).toEqual({ ok: true, valeur: 'CmdOrCtrl+R' })
  })
  it('refuse sans ⌘/Ctrl, réservés, natifs, invalides', () => {
    expect(tenterAttribution({}, 'palette', 'Shift+K', 'darwin')).toEqual({ ok: false, raison: 'modificateur' })
    expect(tenterAttribution({}, 'palette', 'CmdOrCtrl+Q', 'darwin')).toEqual({ ok: false, raison: 'reserve' })
    expect(tenterAttribution({}, 'palette', 'CmdOrCtrl+C', 'darwin')).toEqual({ ok: false, raison: 'natif' })
    expect(tenterAttribution({}, 'palette', 'zzz', 'darwin')).toEqual({ ok: false, raison: 'invalide' })
  })
  it('accepte une touche F sans modificateur', () => {
    expect(tenterAttribution({}, 'palette', 'F6', 'darwin')).toEqual({ ok: true, valeur: 'F6' })
  })
  it('commande inconnue ou non redéfinissable : refus', () => {
    expect(tenterAttribution({}, 'inconnue', 'CmdOrCtrl+K', 'darwin')).toEqual({ ok: false, raison: 'invalide' })
    expect(tenterAttribution({}, 'quitter', 'CmdOrCtrl+K', 'darwin')).toEqual({ ok: false, raison: 'natif' })
  })
})

describe('messageRefus', () => {
  it('une phrase par raison', () => {
    expect(messageRefus({ ok: false, raison: 'conflit', avec: 'Recharger' })).toBe('Déjà utilisée par « Recharger ».')
    expect(messageRefus({ ok: false, raison: 'modificateur' })).toMatch(/⌘|Ctrl/)
    expect(messageRefus({ ok: false, raison: 'reserve' })).toMatch(/système/)
    expect(messageRefus({ ok: false, raison: 'natif' })).toMatch(/copier|coller/i)
    expect(messageRefus({ ok: false, raison: 'saisie' })).toMatch(/texte/)
    expect(messageRefus({ ok: false, raison: 'invalide' })).toBeTruthy()
  })
})

describe('patchToutParDefaut', () => {
  it('met à vide chaque commande personnalisée (le patch fusionne, il ne supprime pas de clé)', () => {
    expect(patchToutParDefaut({ palette: 'CmdOrCtrl+K', recharger: '', inconnue: 'CmdOrCtrl+J' })).toEqual({ palette: '', inconnue: '' })
    expect(patchToutParDefaut({})).toEqual({})
  })
})
