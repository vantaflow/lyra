// Heures de lever et de coucher du Soleil par fuseau IANA et par mois : table statique, sans réseau ni géolocalisation.
//
// Source : équation du lever/coucher du Soleil de la NOAA (« General Solar Position Calculations »,
// https://gml.noaa.gov/grad/solcalc/calcdetails.html), évaluée au 15 de chaque mois pour la ville de référence du fuseau
// (déclinaison et équation du temps de l'année 2026, soleil à -0,833°), puis convertie en heure STANDARD du fuseau
// (sans heure d'été) et arrondie au quart d'heure ; `heuresSoleilLocales` ajoute le décalage d'été courant (Intl). Le script `scripts/generer-fuseaux-soleil.mjs` régénère la table.
// Un fuseau absent de la table (ou invalide) retombe sur 19 h – 7 h.

/** Par mois (janvier = 0) : [lever, coucher] en heures décimales, heure standard du fuseau (7,75 = 7 h 45). */
export const FUSEAUX_SOLEIL: Readonly<Record<string, ReadonlyArray<readonly [number, number]>>> = {
  'Europe/Paris': [[8.75,17.25],[8,18.25],[7,19],[6,19.75],[5.25,20.5],[4.75,21],[5,20.75],[5.75,20],[6.5,19],[7.25,18],[8,17.25],[8.75,17]],
  'Europe/London': [[8,16.25],[7.25,17.25],[6.25,18],[5,19],[4.25,19.75],[3.75,20.25],[4,20.25],[4.75,19.5],[5.5,18.25],[6.5,17.25],[7.25,16.25],[8,15.75]],
  'Europe/Berlin': [[8.25,16.25],[7.5,17.25],[6.25,18.25],[5.25,19],[4.25,20],[3.75,20.5],[4,20.5],[4.75,19.5],[5.75,18.25],[6.5,17.25],[7.5,16.25],[8.25,16]],
  'Europe/Madrid': [[8.5,18.25],[8.25,18.75],[7.5,19.25],[6.5,20],[6,20.5],[5.75,20.75],[6,20.75],[6.5,20.25],[7,19.5],[7.5,18.5],[8,18],[8.5,17.75]],
  'Europe/Rome': [[7.5,17],[7,17.75],[6.25,18.25],[5.5,18.75],[4.75,19.5],[4.5,19.75],[4.75,19.75],[5.25,19.25],[5.75,18.25],[6.25,17.5],[7,16.75],[7.5,16.75]],
  'Europe/Lisbon': [[8,17.75],[7.5,18.25],[6.75,18.75],[6,19.25],[5.5,19.75],[5.25,20],[5.5,20],[5.75,19.5],[6.25,18.75],[6.75,18],[7.25,17.5],[7.75,17.25]],
  'Europe/Amsterdam': [[8.75,17],[8,18],[7,18.75],[5.75,19.75],[4.75,20.5],[4.25,21],[4.5,21],[5.5,20],[6.25,19],[7,17.75],[8,16.75],[8.75,16.5]],
  'Europe/Brussels': [[8.75,17],[8,18],[7,18.75],[5.75,19.5],[5,20.5],[4.5,21],[4.75,20.75],[5.5,20],[6.25,19],[7,17.75],[8,17],[8.75,16.5]],
  'Europe/Zurich': [[8.25,17],[7.5,17.75],[6.75,18.5],[5.5,19.25],[4.75,20],[4.5,20.5],[4.75,20.25],[5.25,19.75],[6,18.75],[6.75,17.75],[7.5,16.75],[8,16.5]],
  'Europe/Vienna': [[7.75,16.5],[7,17.25],[6.25,18],[5,18.75],[4.25,19.5],[4,20],[4.25,19.75],[4.75,19.25],[5.5,18.25],[6.25,17],[7,16.25],[7.75,16]],
  'Europe/Stockholm': [[8.5,15.5],[7.5,16.75],[6,17.75],[4.5,19],[3.25,20.25],[2.5,21],[3,20.75],[4,19.75],[5.25,18.25],[6.5,16.75],[7.75,15.5],[8.75,14.75]],
  'Europe/Athens': [[7.75,17.5],[7.25,18],[6.5,18.5],[5.75,19],[5.25,19.5],[5,19.75],[5.25,19.75],[5.75,19.25],[6,18.5],[6.5,17.75],[7,17.25],[7.5,17]],
  'Europe/Istanbul': [[8.5,18],[8,18.75],[7.25,19.25],[6.5,19.75],[5.75,20.25],[5.5,20.75],[5.75,20.5],[6.25,20],[6.75,19.25],[7.25,18.5],[7.75,17.75],[8.25,17.5]],
  'Europe/Moscow': [[8.75,16.5],[8,17.5],[6.75,18.5],[5.5,19.5],[4.25,20.5],[3.75,21.25],[4,21],[5,20],[6,18.75],[7,17.5],[8,16.5],[9,16]],
  'Europe/Kiev': [[7.75,16.25],[7.25,17.25],[6.25,18],[5,18.75],[4.25,19.75],[3.75,20.25],[4,20],[4.75,19.25],[5.5,18.25],[6.25,17],[7.25,16.25],[7.75,16]],
  'Europe/Warsaw': [[7.75,15.75],[6.75,16.75],[5.75,17.75],[4.75,18.5],[3.75,19.5],[3.25,20],[3.5,19.75],[4.25,19],[5.25,17.75],[6,16.75],[7,15.75],[7.75,15.5]],
  'Africa/Casablanca': [[8.5,18.75],[8.25,19.25],[7.75,19.75],[7,20],[6.5,20.5],[6.25,20.75],[6.5,20.75],[7,20.25],[7.25,19.5],[7.5,19],[8,18.5],[8.5,18.5]],
  'Africa/Algiers': [[8,18],[7.5,18.5],[7,19],[6.25,19.25],[5.75,19.75],[5.5,20.25],[5.75,20],[6,19.75],[6.5,19],[7,18.25],[7.5,17.75],[8,17.5]],
  'Africa/Tunis': [[7.5,17.5],[7.25,18],[6.5,18.5],[5.75,19],[5.25,19.25],[5,19.75],[5.25,19.75],[5.5,19.25],[6,18.5],[6.5,17.75],[7,17.25],[7.5,17]],
  'Africa/Cairo': [[6.75,17.25],[6.5,17.75],[6,18],[5.5,18.25],[5,18.75],[5,19],[5,19],[5.5,18.5],[5.75,18],[6,17.5],[6.25,17],[6.75,17]],
  'Africa/Lagos': [[7,18.75],[7,19],[7,19],[6.75,19],[6.5,19],[6.5,19],[6.75,19],[6.75,19],[6.5,18.75],[6.5,18.5],[6.5,18.5],[6.75,18.5]],
  'Africa/Johannesburg': [[5.5,19],[6,18.75],[6.25,18.5],[6.5,17.75],[6.75,17.5],[7,17.5],[7,17.5],[6.5,17.75],[6,18],[5.5,18.25],[5.25,18.5],[5.25,19]],
  'Africa/Nairobi': [[6.5,18.75],[6.75,18.75],[6.75,18.75],[6.5,18.5],[6.5,18.5],[6.5,18.5],[6.5,18.75],[6.5,18.75],[6.5,18.5],[6.25,18.25],[6.25,18.5],[6.25,18.5]],
  'Africa/Dakar': [[7.75,19],[7.5,19.25],[7.25,19.25],[7,19.5],[6.75,19.5],[6.75,19.75],[6.75,19.75],[7,19.5],[7,19.25],[7,18.75],[7.25,18.75],[7.5,18.75]],
  'Africa/Abidjan': [[6.5,18.25],[6.5,18.5],[6.5,18.5],[6.25,18.5],[6,18.5],[6,18.5],[6.25,18.5],[6.25,18.5],[6,18.25],[6,18],[6,18],[6.25,18]],
  'Africa/Douala': [[6.5,18.5],[6.5,18.5],[6.5,18.5],[6.25,18.5],[6.25,18.5],[6.25,18.5],[6.25,18.5],[6.25,18.5],[6.25,18.25],[6,18],[6.25,18],[6.25,18.25]],
  'America/New_York': [[7.25,16.75],[6.75,17.5],[6.25,18],[5.25,18.5],[4.75,19],[4.5,19.5],[4.75,19.5],[5,19],[5.5,18],[6,17.25],[6.75,16.75],[7.25,16.5]],
  'America/Chicago': [[7.25,16.75],[6.75,17.5],[6,18],[5.25,18.5],[4.5,19],[4.25,19.5],[4.5,19.5],[5,18.75],[5.5,18],[6,17.25],[6.75,16.5],[7.25,16.25]],
  'America/Denver': [[7.25,17],[7,17.5],[6.25,18],[5.25,18.75],[4.75,19],[4.5,19.5],[4.75,19.5],[5.25,19],[5.75,18.25],[6.25,17.25],[6.75,16.75],[7.25,16.5]],
  'America/Los_Angeles': [[7,17],[6.75,17.5],[6,18],[5.25,18.5],[4.75,18.75],[4.75,19],[5,19],[5.25,18.75],[5.5,18],[6,17.25],[6.5,16.75],[6.75,16.75]],
  'America/Toronto': [[7.75,17],[7.25,17.75],[6.5,18.5],[5.5,19],[4.75,19.5],[4.5,20],[4.75,20],[5.25,19.25],[6,18.5],[6.5,17.5],[7.25,17],[7.75,16.75]],
  'America/Mexico_City': [[7.25,18.25],[7,18.5],[6.75,18.75],[6.25,19],[6,19],[6,19.25],[6,19.25],[6.25,19],[6.5,18.75],[6.5,18.25],[6.75,18],[7,18]],
  'America/Bogota': [[6.25,18],[6.25,18.25],[6,18.25],[5.75,18],[5.75,18],[5.75,18.25],[5.75,18.25],[6,18.25],[5.75,18],[5.75,17.75],[5.75,17.75],[6,17.75]],
  'America/Sao_Paulo': [[5.5,19],[6,18.75],[6.25,18.5],[6.25,18],[6.5,17.5],[6.75,17.5],[6.75,17.5],[6.5,17.75],[6,18],[5.5,18.25],[5.25,18.5],[5.25,18.75]],
  'America/Argentina/Buenos_Aires': [[6,20.25],[6.5,19.75],[7,19.25],[7.25,18.5],[7.75,18],[8,17.75],[8,18],[7.5,18.5],[7,18.75],[6.25,19],[5.75,19.5],[5.5,20]],
  'America/Santiago': [[5.75,20],[6.25,19.5],[6.75,19],[7,18.25],[7.5,17.75],[7.75,17.75],[7.75,18],[7.25,18.25],[6.75,18.5],[6,19],[5.5,19.5],[5.5,19.75]],
  'Asia/Tokyo': [[6.75,16.75],[6.5,17.5],[5.75,17.75],[5.25,18.25],[4.5,18.75],[4.5,19],[4.5,19],[5,18.5],[5.5,17.75],[5.75,17],[6.25,16.5],[6.75,16.5]],
  'Asia/Seoul': [[7.75,17.5],[7.25,18.25],[6.75,18.75],[6,19],[5.25,19.5],[5.25,20],[5.5,20],[5.75,19.5],[6.25,18.75],[6.75,18],[7.25,17.25],[7.75,17.25]],
  'Asia/Shanghai': [[7,17.25],[6.5,17.75],[6,18],[5.5,18.25],[5,18.75],[4.75,19],[5,19],[5.25,18.75],[5.75,18],[6,17.25],[6.25,17],[6.75,17]],
  'Asia/Hong_Kong': [[7,18],[7,18.25],[6.5,18.5],[6,18.75],[5.75,19],[5.75,19.25],[5.75,19.25],[6,19],[6.25,18.5],[6.25,18],[6.5,17.75],[7,17.75]],
  'Asia/Singapore': [[7.25,19.25],[7.25,19.25],[7.25,19.25],[7,19.25],[7,19],[7,19.25],[7,19.25],[7,19.25],[7,19],[6.75,19],[6.75,18.75],[7,19]],
  'Asia/Bangkok': [[6.75,18.25],[6.75,18.5],[6.5,18.5],[6,18.5],[5.75,18.5],[5.75,18.75],[6,18.75],[6,18.75],[6,18.25],[6.25,18],[6.25,17.75],[6.5,18]],
  'Asia/Kolkata': [[7.25,17.75],[7,18.25],[6.5,18.5],[6,18.75],[5.5,19],[5.5,19.25],[5.5,19.25],[5.75,19],[6,18.5],[6.25,17.75],[6.75,17.5],[7,17.5]],
  'Asia/Dubai': [[7,17.75],[7,18.25],[6.5,18.5],[6,18.75],[5.5,19],[5.5,19.25],[5.75,19.25],[6,19],[6,18.5],[6.25,17.75],[6.5,17.5],[7,17.5]],
  'Asia/Riyadh': [[6.75,17.5],[6.5,17.75],[6,18],[5.5,18.25],[5.25,18.5],[5,18.75],[5.25,18.75],[5.5,18.5],[5.75,18],[5.75,17.5],[6.25,17],[6.5,17]],
  'Asia/Tehran': [[7.25,17.25],[6.75,17.75],[6.25,18.25],[5.5,18.5],[5,19],[4.75,19.25],[5,19.25],[5.5,19],[5.75,18.25],[6.25,17.5],[6.75,17],[7,17]],
  'Asia/Karachi': [[7.25,18],[7,18.5],[6.75,18.75],[6.25,19],[5.75,19.25],[5.75,19.25],[5.75,19.5],[6,19],[6.25,18.5],[6.5,18],[6.75,17.75],[7.25,17.75]],
  'Asia/Jakarta': [[5.75,18.25],[6,18.25],[6,18],[6,17.75],[6,17.75],[6,17.75],[6,17.75],[6,18],[5.75,17.75],[5.5,17.75],[5.5,17.75],[5.5,18]],
  'Asia/Jerusalem': [[6.75,17],[6.25,17.5],[5.75,17.75],[5.25,18.25],[4.75,18.5],[4.5,18.75],[4.75,18.75],[5,18.5],[5.5,17.75],[5.75,17],[6.25,16.75],[6.5,16.5]],
  'Asia/Beirut': [[6.75,16.75],[6.5,17.25],[5.75,17.75],[5,18.25],[4.5,18.5],[4.5,18.75],[4.75,18.75],[5,18.5],[5.25,17.75],[5.75,17],[6.25,16.5],[6.5,16.5]],
  'Australia/Sydney': [[5,19.25],[5.5,18.75],[6,18.25],[6.25,17.5],[6.75,17],[7,17],[7,17],[6.5,17.5],[6,17.75],[5.25,18.25],[4.75,18.5],[4.75,19]],
  'Australia/Perth': [[5.5,19.5],[6,19],[6.25,18.5],[6.5,18],[7,17.5],[7.25,17.25],[7.25,17.5],[7,17.75],[6.25,18.25],[5.5,18.5],[5.25,19],[5,19.25]],
  'Pacific/Auckland': [[5.25,19.75],[5.75,19.25],[6.25,18.75],[6.75,18],[7.25,17.25],[7.5,17.25],[7.5,17.5],[7,17.75],[6.25,18.25],[5.5,18.5],[5,19.25],[5,19.5]],
}

/** Heures utilisées pour un fuseau inconnu. */
export const DEFAUT_SOLEIL = { lever: 7, coucher: 19 } as const

/** Lever et coucher du fuseau pour un mois (0 à 11). */
export function heuresSoleil(fuseau: string, mois: number): { lever: number; coucher: number } {
  const ligne = Object.hasOwn(FUSEAUX_SOLEIL, fuseau) ? FUSEAUX_SOLEIL[fuseau][mois] : undefined
  return ligne ? { lever: ligne[0], coucher: ligne[1] } : { ...DEFAUT_SOLEIL }
}

/** Décalage UTC (minutes) du fuseau à `date` ; `null` si le fuseau est invalide. */
function decalageMinutes(date: Date, fuseau: string): number | null {
  try {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', { timeZone: fuseau, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
        .formatToParts(date)
        .map((x) => [x.type, Number(x.value)])
    )
    return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(date.getTime() / 60000) * 60000) / 60000
  } catch {
    return null
  }
}

/** Avance (heures) de l'heure d'été sur l'heure standard du fuseau à `date` : 0 ou 1 (0 pour un fuseau invalide ou sans heure d'été). */
export function decalageEte(date: Date, fuseau: string): number {
  const maintenant = decalageMinutes(date, fuseau)
  const an = date.getUTCFullYear()
  const janvier = decalageMinutes(new Date(Date.UTC(an, 0, 15, 12)), fuseau)
  const juillet = decalageMinutes(new Date(Date.UTC(an, 6, 15, 12)), fuseau)
  if (maintenant === null || janvier === null || juillet === null) return 0
  return Math.max(0, (maintenant - Math.min(janvier, juillet)) / 60)
}

/** Lever et coucher à `date` en heure locale réelle : table standard + heure d'été du moment (Intl). */
export function heuresSoleilLocales(fuseau: string, date: Date, mois: number): { lever: number; coucher: number } {
  const { lever, coucher } = heuresSoleil(fuseau, mois)
  if (!Object.hasOwn(FUSEAUX_SOLEIL, fuseau)) return { lever, coucher }
  const ete = decalageEte(date, fuseau)
  return { lever: lever + ete, coucher: coucher + ete }
}

/** Mois (0-11) et heure décimale locale de `date` dans `fuseau` ; un fuseau invalide donne l'heure du système. */
function heureLocale(date: Date, fuseau: string): { mois: number; heure: number } {
  try {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', { timeZone: fuseau, hourCycle: 'h23', month: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
        .formatToParts(date)
        .map((x) => [x.type, Number(x.value)])
    )
    return { mois: p.month - 1, heure: p.hour + p.minute / 60 + p.second / 3600 }
  } catch {
    return { mois: date.getMonth(), heure: date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600 }
  }
}

/** Vrai entre le coucher et le lever du Soleil. */
export function estNuit(maintenant: Date, fuseau: string): boolean {
  const { mois, heure } = heureLocale(maintenant, fuseau)
  const { lever, coucher } = heuresSoleilLocales(fuseau, maintenant, mois)
  return heure >= coucher || heure < lever
}

/** Prochain lever ou coucher (le plus proche dans le futur) ; l'appelant le recalcule à l'échéance. */
export function prochainChangement(maintenant: Date, fuseau: string): Date {
  const { mois, heure } = heureLocale(maintenant, fuseau)
  const { lever, coucher } = heuresSoleilLocales(fuseau, maintenant, mois)
  let attente = 24
  for (const borne of [lever, coucher]) {
    const d = borne - heure
    attente = Math.min(attente, d > 0 ? d : d + 24)
  }
  return new Date(maintenant.getTime() + attente * 3_600_000)
}
