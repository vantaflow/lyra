/** Profils de user-agent nommés (règle par site, champ `ua`) : clés et libellés, lisibles par le renderer. Pur. */

export const CLES_UA = ['lyra', 'chrome-windows', 'firefox', 'safari', 'chrome-android'] as const
export type CleUa = (typeof CLES_UA)[number]

/** Profil par défaut : l'identité réelle de Lyra (aucune réécriture). */
export const CLE_UA_DEFAUT: CleUa = 'lyra'

export const estCleUa = (cle: unknown): cle is CleUa => typeof cle === 'string' && (CLES_UA as readonly string[]).includes(cle)

const LIBELLES: Record<Exclude<CleUa, 'lyra'>, string> = {
  'chrome-windows': 'Chrome (Windows)',
  firefox: 'Firefox (Windows)',
  safari: 'Safari (Mac)',
  'chrome-android': 'Chrome (Android)'
}

/** « Lyra (Chrome N) » : N est la version réelle du Chrome embarqué (voir `majeurChrome`). */
export const libelleUa = (cle: CleUa, chromeMajeur: number): string => (cle === 'lyra' ? `Lyra (Chrome ${chromeMajeur})` : LIBELLES[cle])

/** Numéro de version majeur : d'un `navigator.userAgent` (« Chrome/152.… ») ou d'une version brute (« 152.0.… »). */
export function majeurChrome(texte: string): number | undefined {
  const m = /Chrome\/(\d+)\./.exec(texte) ?? /^(\d+)\./.exec(texte)
  return m ? Number(m[1]) : undefined
}
