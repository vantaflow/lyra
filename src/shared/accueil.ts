/** Page d'accueil et démarrage (module pur, partagé par l'interface des réglages et le processus principal). */

export const NOUVEL_ONGLET = 'lyra://newtab'

/** Adresses acceptées : http, https ou lyra://, sans espace ni caractère de contrôle (jamais javascript:, file:, data:…). */
const ADRESSE = /^(https?|lyra):\/\/[^\s\u0000-\u001f]+$/i

/** Vide (= le nouvel onglet) ou une adresse http, https ou lyra://. */
export function adresseAccueilValide(v: string): boolean {
  return v === '' || ADRESSE.test(v)
}

/**
 * Saisie de l'utilisateur → valeur enregistrée : une adresse sans schéma reçoit `https://` ;
 * `null` si la saisie n'est pas une adresse acceptée (`javascript:`, `file:`, texte avec espaces…).
 */
export function normaliserAccueil(saisie: string): string | null {
  const t = saisie.trim()
  if (t === '') return ''
  const avecSchema = /^[a-z][a-z0-9+.-]*:/i.test(t) && !/^[^/\s:]+:\d+(\/|$)/.test(t)
  const adresse = avecSchema ? t : `https://${t}`
  if (!ADRESSE.test(adresse)) return null
  return adresseAccueilValide(adresse) ? adresse : null
}

/** Première page d'une fenêtre ouverte au démarrage : la page d'accueil si elle est valable, sinon le nouvel onglet. */
export function pageDeDemarrage(pageAccueil: string): string {
  const t = pageAccueil.trim()
  return t !== '' && ADRESSE.test(t) ? t : NOUVEL_ONGLET
}

/** Session à rouvrir au démarrage : celle qui a été sauvegardée, seulement si « restaurer » est coché. */
export function restaurerSession<T>(restaurer: boolean, sauvegardee: T | null): T | null {
  return restaurer ? sauvegardee : null
}
