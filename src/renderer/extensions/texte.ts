/** Textes de la page lyra://extensions (purs, testables sans DOM). */
import type { InfoExtension, JournalExtension } from '../../shared/types'

/** « il y a 2 h » (Extensions.dc.html : « Vérifiées il y a 2 h »). */
export function depuis(iso: string | undefined, maintenant = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN
  if (!Number.isFinite(t)) return 'Pas encore vérifiées'
  const min = Math.max(0, Math.floor((maintenant - t) / 60_000))
  if (min < 1) return "Vérifiées à l'instant"
  if (min < 60) return `Vérifiées il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `Vérifiées il y a ${h} h`
  return `Vérifiées il y a ${Math.floor(h / 24)} j`
}

/** Hôte d'une origine (« https://www.youtube.com » → « www.youtube.com »). */
export const hoteDe = (origine: string): string => origine.replace(/^https?:\/\//i, '')

/** Origines exclues pour une extension, d'après `settings.sites[origine].extensions[id] === false`. */
export function sitesExclus(sites: Record<string, { extensions?: Record<string, boolean> }>, id: string): string[] {
  return Object.entries(sites)
    .filter(([, r]) => r.extensions?.[id] === false)
    .map(([o]) => o)
    .sort()
}

/** Ligne de portée : « Tous les sites », « youtube.com seulement », « Tous les sites sauf youtube.com (règle par site) ». */
export function porteeTexte(e: Pick<InfoExtension, 'portee'>, exclus: string[]): string {
  const h = e.portee.hotes
  const base = e.portee.tous ? 'Tous les sites' : h.length === 0 ? 'Aucun site' : h.length === 1 ? `${h[0]} seulement` : h.length <= 3 ? h.join(', ') : `${h.slice(0, 3).join(', ')} et ${h.length - 3} autres`
  if (exclus.length === 0) return base
  const sauf = exclus.map(hoteDe).join(', ')
  return e.portee.tous ? `${base} sauf ${sauf} (règle par site)` : `${base} · sauf ${sauf} (règle par site)`
}

const pluriel = (n: number, un: string, plusieurs: string): string => `${n} ${n > 1 ? plusieurs : un}`

/** Nombre de fonctions Firefox ignorées par la conversion (clés et permissions retirées, API simulées). */
export function fonctionsIgnorees(j: JournalExtension | undefined): number {
  if (!j) return 0
  return (j.conversion ? j.conversion.cles_retirees.length + j.conversion.permissions_retirees.length : 0) + Object.keys(j.apiStubees).length
}

/** État affiché après la portée (« fonctionne ; 2 fonctions Firefox ignorées », « s'ajoute aux Boucliers, ne les remplace pas »). */
export function etatTexte(e: Pick<InfoExtension, 'active' | 'chargee' | 'convertie'>, j: JournalExtension | undefined): string | undefined {
  if (!e.active) return 'désactivée'
  if (!e.chargee) return undefined
  const morceaux: string[] = []
  if (j?.redondanceBoucliers) morceaux.push("s'ajoute aux Boucliers, ne les remplace pas")
  const n = fonctionsIgnorees(j)
  if (e.convertie && n > 0) morceaux.push(`fonctionne ; ${pluriel(n, 'fonction Firefox ignorée', 'fonctions Firefox ignorées')}`)
  const c = j?.conflitsRaccourcis.length ?? 0
  if (c > 0) morceaux.push(`${pluriel(c, 'raccourci en conflit', 'raccourcis en conflit')} avec une autre extension`)
  return morceaux.length > 0 ? morceaux.join(' · ') : undefined
}

/** Origine de l'extension : « Chrome », « Firefox · convertie » ou « Firefox ». */
export const origineTexte = (e: Pick<InfoExtension, 'magasin' | 'convertie'>): string => (e.magasin === 'firefox' ? (e.convertie ? 'Firefox · convertie' : 'Firefox') : 'Chrome')

/** Lignes du journal au format du design : ✓ ce qui marche, – ce qui est ignoré, ℹ ce qu'il faut savoir. */
export function lignesJournal(j: JournalExtension | undefined): string[] {
  if (!j) return ['ℹ Aucun journal pour cette extension.']
  const l: string[] = []
  for (const t of j.conversion?.transformations ?? []) l.push(`✓ ${t}`)
  for (const k of j.conversion?.cles_retirees ?? []) l.push(`– ${k}  — retirée du manifest (sans effet dans Lyra)`)
  for (const p of j.conversion?.permissions_retirees ?? []) l.push(`– ${p}  — permission Firefox retirée`)
  for (const a of j.conversion?.avertissements ?? []) l.push(`– ${a}`)
  for (const [api, n] of Object.entries(j.apiStubees).sort()) l.push(`– ${api}${n > 1 ? ` ×${n}` : ''}  — absente de Lyra : appel ignoré`)
  for (const api of j.apiManquantes) l.push(`– ${api}  — non supportée par Lyra`)
  for (const c of j.conflitsRaccourcis) l.push(`– ${c}  — raccourci déjà pris par une autre extension`)
  for (const m of j.avertissementsChargement) l.push(`– ${m}`)
  if (j.redondanceBoucliers) l.push(`ℹ ${j.noteBoucliers ?? 'Blocage réseau assuré par les Boucliers.'}`)
  if (j.conversion?.refus) l.push(`– ${j.conversion.refus}`)
  if (l.length === 0) l.push('✓ Aucun avertissement : rien à signaler.')
  return l
}

/** Limites honnêtes (spec §7, affichées dans lyra://extensions). */
export const LIMITES: string[] = [
  "Pas de declarativeNetRequest (uBlock Origin Lite est inopérant) ; le blocage réseau est assuré par les Boucliers.",
  "Pas de commands (raccourcis d'extension), de contextMenus.update, de tabs.move, tabs.duplicate, tabs.captureVisibleTab ni tabs.discard.",
  "Pas de sidePanel ni de sidebar_action : le ciel de Lyra fait déjà ce travail.",
  "Pas de messagerie native (nativeMessaging), de fontSettings, de theme ni de contextualIdentities.",
  "Les extensions ne s'exécutent pas en fenêtre privée (limite d'electron-chrome-extensions).",
  "Manifest V2 déprécié par Electron : risque de retrait dans une version future. Lyra reste sur Electron 44 tant que le MV2 des extensions clés en dépend, et pousse les auteurs vers MV3."
]
