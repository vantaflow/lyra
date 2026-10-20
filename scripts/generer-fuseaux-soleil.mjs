// Génère la table de `src/shared/fuseaux-soleil.ts` : `node scripts/generer-fuseaux-soleil.mjs > /tmp/table.txt`.
// Méthode : équation du lever/coucher du Soleil (NOAA, « General Solar Position Calculations »,
// https://gml.noaa.gov/grad/solcalc/calcdetails.html), évaluée au 15 de chaque mois (année 2026) pour la ville de référence de chaque fuseau.
// Heures légales locales (heure d'été comprise), arrondies au quart d'heure. Aucun réseau, aucune géolocalisation à l'exécution de Lyra.
const VILLES = {
  'Europe/Paris': [48.85, 2.35], 'Europe/London': [51.51, -0.13], 'Europe/Berlin': [52.52, 13.4], 'Europe/Madrid': [40.42, -3.7],
  'Europe/Rome': [41.9, 12.5], 'Europe/Lisbon': [38.72, -9.14], 'Europe/Amsterdam': [52.37, 4.9], 'Europe/Brussels': [50.85, 4.35],
  'Europe/Zurich': [47.38, 8.54], 'Europe/Vienna': [48.21, 16.37], 'Europe/Stockholm': [59.33, 18.07], 'Europe/Athens': [37.98, 23.73],
  'Europe/Istanbul': [41.01, 28.98], 'Europe/Moscow': [55.75, 37.62], 'Europe/Kiev': [50.45, 30.52], 'Europe/Warsaw': [52.23, 21.01],
  'Africa/Casablanca': [33.57, -7.59], 'Africa/Algiers': [36.75, 3.06], 'Africa/Tunis': [36.81, 10.18], 'Africa/Cairo': [30.04, 31.24],
  'Africa/Lagos': [6.52, 3.38], 'Africa/Johannesburg': [-26.2, 28.05], 'Africa/Nairobi': [-1.29, 36.82], 'Africa/Dakar': [14.69, -17.45],
  'Africa/Abidjan': [5.36, -4.01], 'Africa/Douala': [4.05, 9.77], 'America/New_York': [40.71, -74.0], 'America/Chicago': [41.88, -87.63],
  'America/Denver': [39.74, -104.99], 'America/Los_Angeles': [34.05, -118.24], 'America/Toronto': [43.65, -79.38], 'America/Mexico_City': [19.43, -99.13],
  'America/Bogota': [4.71, -74.07], 'America/Sao_Paulo': [-23.55, -46.63], 'America/Argentina/Buenos_Aires': [-34.6, -58.38], 'America/Santiago': [-33.45, -70.67],
  'Asia/Tokyo': [35.68, 139.69], 'Asia/Seoul': [37.57, 126.98], 'Asia/Shanghai': [31.23, 121.47], 'Asia/Hong_Kong': [22.32, 114.17],
  'Asia/Singapore': [1.35, 103.82], 'Asia/Bangkok': [13.76, 100.5], 'Asia/Kolkata': [28.61, 77.21], 'Asia/Dubai': [25.2, 55.27],
  'Asia/Riyadh': [24.71, 46.68], 'Asia/Tehran': [35.69, 51.39], 'Asia/Karachi': [24.86, 67.01], 'Asia/Jakarta': [-6.21, 106.85],
  'Asia/Jerusalem': [31.77, 35.21], 'Asia/Beirut': [33.89, 35.5], 'Australia/Sydney': [-33.87, 151.21], 'Australia/Perth': [-31.95, 115.86],
  'Pacific/Auckland': [-36.85, 174.76]
}
const rad = (d) => (d * Math.PI) / 180
const deg = (r) => (r * 180) / Math.PI
/** Minutes UTC du lever (`lever`) ou du coucher, le jour `jour` (jour de l'année), à (lat, lon). */
function evenement(jour, lat, lon, lever) {
  const g = rad((360 / 365) * (jour - 1))
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g))
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g)
  const cosH = Math.cos(rad(90.833)) / (Math.cos(rad(lat)) * Math.cos(decl)) - Math.tan(rad(lat)) * Math.tan(decl)
  const h = deg(Math.acos(Math.max(-1, Math.min(1, cosH))))
  return 720 - 4 * (lon + (lever ? h : -h)) - eqt
}
function decalageMinutes(tz, date) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, +x.value]))
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - date.getTime()) / 60000
}
const quart = (min) => Math.round(min / 15) / 4
for (const [tz, [lat, lon]] of Object.entries(VILLES)) {
  const mois = []
  for (let m = 0; m < 12; m++) {
    const date = new Date(Date.UTC(2026, m, 15, 12))
    const jour = Math.round((date - Date.UTC(2026, 0, 0)) / 86400000)
    const off = decalageMinutes(tz, date)
    const loc = (min) => (((min + off) % 1440) + 1440) % 1440
    mois.push([quart(loc(evenement(jour, lat, lon, true))), quart(loc(evenement(jour, lat, lon, false)))])
  }
  console.log(`  '${tz}': [${mois.map(([l, c]) => `[${l},${c}]`).join(',')}],`)
}
