import type { RegleSite } from '../../shared/types'

/**
 * Sites en exception « Ne pas déranger » : simple vue des règles par site (`exceptionDnd === true`), triée par clé.
 * Aucun second stockage : retirer une exception écrit la règle (`sites:ecrire`, `exceptionDnd: null`).
 */
export function exceptionsDnd(sites: Record<string, RegleSite>): string[] {
  return Object.entries(sites)
    .filter(([, regle]) => regle.exceptionDnd === true)
    .map(([cle]) => cle)
    .sort((a, b) => a.localeCompare(b, 'fr'))
}
