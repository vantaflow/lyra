/** Mise à jour périodique des listes : l'intervalle suit le réglage `boucliers.majHeures`, sans redémarrage. */
export interface DepsMajPeriodique {
  tache(): void
  setInterval(fn: () => void, ms: number): unknown
  clearInterval(id: unknown): void
}

export function creerMajPeriodique(deps: DepsMajPeriodique) {
  let id: unknown
  let heures = 0
  return {
    /** (Re)planifie si la fréquence a changé ; sans effet sinon. */
    regler(h: number): void {
      if (h === heures) return
      heures = h
      if (id !== undefined) deps.clearInterval(id)
      id = deps.setInterval(deps.tache, h * 3600_000)
    },
    arreter(): void {
      if (id !== undefined) deps.clearInterval(id)
      id = undefined
      heures = 0
    }
  }
}
