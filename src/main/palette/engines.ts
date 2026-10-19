/** Moteurs de recherche et mots-clés (pur, sans Electron). */

export interface Moteur {
  id: string
  nom: string
  /** Mot-clé : « w véga » cherche sur Wikipédia. */
  motCle: string
  /** %s est remplacé par la requête encodée. */
  url: string
  couleur: string
  lettre: string
}

export const MOTEURS: Moteur[] = [
  { id: 'duckduckgo', nom: 'DuckDuckGo', motCle: 'd', url: 'https://duckduckgo.com/?q=%s', couleur: '#3A3A62', lettre: 'D' },
  { id: 'kagi', nom: 'Kagi', motCle: 'k', url: 'https://kagi.com/search?q=%s', couleur: '#D97A2B', lettre: 'K' },
  { id: 'google', nom: 'Google', motCle: 'g', url: 'https://www.google.com/search?q=%s', couleur: '#3B6FD4', lettre: 'G' },
  { id: 'brave', nom: 'Brave Search', motCle: 'b', url: 'https://search.brave.com/search?q=%s', couleur: '#D4511F', lettre: 'B' },
  { id: 'startpage', nom: 'Startpage', motCle: 's', url: 'https://www.startpage.com/do/search?q=%s', couleur: '#4A5FD0', lettre: 'S' },
  { id: 'qwant', nom: 'Qwant', motCle: 'q', url: 'https://www.qwant.com/?q=%s', couleur: '#5452C8', lettre: 'Q' },
  { id: 'wikipedia', nom: 'Wikipédia', motCle: 'w', url: 'https://fr.wikipedia.org/w/index.php?search=%s', couleur: '#2D5BD1', lettre: 'W' },
  { id: 'youtube', nom: 'YouTube', motCle: 'yt', url: 'https://www.youtube.com/results?search_query=%s', couleur: '#C0392B', lettre: '▶' }
]

/** Moteur par identifiant ; DuckDuckGo si inconnu. */
export function moteurParId(id: string): Moteur {
  return MOTEURS.find((m) => m.id === id) ?? MOTEURS[0]
}

export function moteurParMotCle(motCle: string): Moteur | undefined {
  return MOTEURS.find((m) => m.motCle === motCle)
}

export function urlDeRecherche(moteur: Moteur, texte: string): string {
  return moteur.url.replace('%s', encodeURIComponent(texte))
}
