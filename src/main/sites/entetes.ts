/** En-têtes HTTP : les clés d'Electron gardent la casse reçue ou envoyée, les recherches l'ignorent. Pur. */
type Entetes<V> = Record<string, V>

/** Copie sans les en-têtes dont la clé vérifie `test` ; `null` si aucune clé ne correspond (rien à changer). */
export function sansEntetes<V>(entetes: Entetes<V> | undefined, test: (cle: string) => boolean): Entetes<V> | null {
  if (!entetes || !Object.keys(entetes).some(test)) return null
  return Object.fromEntries(Object.entries(entetes).filter(([k]) => !test(k)))
}

/** Clé réelle d'un en-tête (casse comprise), ou `undefined`. */
export const cleEntete = (entetes: Entetes<unknown>, nom: string): string | undefined => Object.keys(entetes).find((k) => k.toLowerCase() === nom.toLowerCase())
