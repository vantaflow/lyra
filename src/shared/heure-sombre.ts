// Plage sombre « À une heure fixe » : `couleurs.heureSombre` → `couleurs.heureClair` (HH:MM, heure locale du fuseau).
// Une plage à cheval sur minuit (21:00 → 07:00) est normale ; début = fin : toujours sombre.

/** `HH:MM` sur 24 h (valeur d'un `<input type="time">`). */
export const HEURE_VALIDE = /^([01]\d|2[0-3]):[0-5]\d$/

/** Minutes depuis minuit d'un `HH:MM` valide. */
export const minutesDe = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

/** Minutes depuis minuit (avec fraction de minute) à l'heure du fuseau. */
function minutesLocales(date: Date, fuseau: string): number {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: fuseau, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(date)
  const n = (t: string): number => Number(p.find((x) => x.type === t)?.value ?? 0)
  return n('hour') * 60 + n('minute') + n('second') / 60
}

/** Vrai dans la plage sombre : début inclus, fin exclue. */
export function estDansPlage(maintenant: Date, debut: string, fin: string, fuseau: string): boolean {
  const d = minutesDe(debut)
  const f = minutesDe(fin)
  if (d === f) return true
  const m = minutesLocales(maintenant, fuseau)
  return d < f ? m >= d && m < f : m >= d || m < f
}

/** Prochain début ou prochaine fin de plage (strictement après `maintenant`) ; égaux : pas de changement, dans 24 h. */
export function prochaineEcheanceHeure(maintenant: Date, debut: string, fin: string, fuseau: string): Date {
  const m = minutesLocales(maintenant, fuseau)
  const attente = (cible: string): number => {
    const diff = (minutesDe(cible) - m + 1440) % 1440
    return diff === 0 ? 1440 : diff
  }
  const minutes = minutesDe(debut) === minutesDe(fin) ? 1440 : Math.min(attente(debut), attente(fin))
  return new Date(maintenant.getTime() + minutes * 60_000)
}
