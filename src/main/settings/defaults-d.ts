import type { ReglagesD } from '../../shared/types-reglages'

/** Défauts des blocs du jalon D : ceux du design (`*.dc.html`) quand il les donne, sinon le comportement antérieur. */
export function reglagesParDefautD(): ReglagesD {
  return {
    apparence: {
      relierEnfants: true,
      iconesSites: false,
      archiverApresJours: null,
      nouvelleEtoile: 'sous-active',
      regrouperParSite: false,
      police: 'Manrope',
      tailleTexte: 13,
      densite: 'confortable',
      coinsArrondis: true,
      capsuleAuto: false
    },
    couleurs: {
      actif: 'indigo-nuit',
      privee: 'aurore',
      passage: 'systeme',
      heureSombre: '21:00',
      heureClair: '07:00',
      personnalisees: null,
      depart: 'indigo-nuit',
      cielTeinteParSite: false,
      couleurParConstellation: true,
      prefersColorScheme: true
    },
    palette: { suggestionsHistorique: true, suggestionsFavoris: true, suggestionsEnPrivee: false },
    confidentialite: { effacerHistorique: false, effacerCookies: false, effacerCache: false },
    raccourcis: {},
    gestes: { defilementHorizontal: true, clicMolette: true, molettePlusCmdZoom: true },
    dnd: { duree: 60 },
    demarrage: { restaurer: true, pageAccueil: '', nouvelleFenetre: 'accueil' },
    styles: { css: '', scripts: [] },
    labo: {}
  }
}
