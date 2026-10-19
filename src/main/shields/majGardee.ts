/** Garde de `shields:update` : appels concurrents partagés, rafale refusée (délai minimal entre deux mises à jour). */
export type ResultatMaj<T> = T | { ignore: true; date: string }

export function creerMajGardee<T>(
  executer: () => Promise<T>,
  options: { delaiMs: number; maintenant?: () => number }
): () => Promise<ResultatMaj<T>> {
  const maintenant = options.maintenant ?? Date.now
  let enCours: Promise<T> | undefined
  let derniere: number | undefined
  return () => {
    if (enCours) return enCours
    if (derniere !== undefined && maintenant() - derniere < options.delaiMs) {
      return Promise.resolve({ ignore: true as const, date: new Date(derniere).toISOString() })
    }
    enCours = executer().finally(() => {
      derniere = maintenant()
      enCours = undefined
    })
    return enCours
  }
}
