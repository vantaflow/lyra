/** Ce que la page lyra://extensions déduit du manifest (pur, sans Electron) : page d'options et portée. */
import type { PorteeExtension } from '../../shared/types'

type Obj = Record<string, unknown>
const estObjet = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const textes = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/** Chemin relatif sûr (pas de schéma, pas de `..`, pas d'antislash) d'une page de l'extension, ou undefined. */
function cheminPage(v: unknown): string | undefined {
  if (typeof v !== 'string' || v === '' || v.length > 300) return undefined
  if (/^[a-z][a-z0-9+.-]*:/i.test(v) || v.includes('\\') || v.includes('\0')) return undefined
  const chemin = v.replace(/^\/+/, '')
  return chemin.split('/').includes('..') ? undefined : chemin
}

/** URL de la page d'options (`options_ui.page` puis `options_page`) ; undefined si l'extension n'en a pas. */
export function urlOptions(id: string, manifest: Obj): string | undefined {
  const ui = estObjet(manifest.options_ui) ? cheminPage(manifest.options_ui.page) : undefined
  const page = ui ?? cheminPage(manifest.options_page)
  return page ? `chrome-extension://${id}/${page}` : undefined
}

const TOUS = /^(<all_urls>|\*:\/\/\*\/\*|https?:\/\/\*\/\*|\*:\/\/\*|https?:\/\/\*)$/
const HOTE = /^(?:\*|https?|\*:)?:?\/\/([^/]+)\//

/** Hôte lisible d'un motif de correspondance (« *://*.youtube.com/* » → « youtube.com »), ou undefined. */
function hoteDuMotif(motif: string): string | undefined {
  const m = HOTE.exec(motif)
  if (!m) return undefined
  const h = m[1].replace(/^\*\./, '').replace(/:\d+$/, '')
  return /^[a-z0-9.-]+$/i.test(h) && h.includes('.') ? h.toLowerCase() : undefined
}

/** Sites sur lesquels l'extension agit : content scripts et permissions d'hôtes. */
export function porteeDuManifest(manifest: Obj): PorteeExtension {
  const motifs = new Set<string>()
  for (const p of textes(manifest.permissions)) if (p === '<all_urls>' || p.includes('://')) motifs.add(p)
  for (const p of textes(manifest.host_permissions)) motifs.add(p)
  if (Array.isArray(manifest.content_scripts)) {
    for (const cs of manifest.content_scripts) if (estObjet(cs)) for (const m of textes(cs.matches)) motifs.add(m)
  }
  const liste = [...motifs]
  if (liste.some((m) => TOUS.test(m))) return { tous: true, hotes: [] }
  const tous = [...new Set(liste.map(hoteDuMotif).filter((h): h is string => h !== undefined))]
  // Un hôte et ses sous-domaines (« *.youtube.com », « www.youtube.com ») comptent pour un seul : « youtube.com ».
  const hotes = tous.filter((h) => !tous.some((g) => g !== h && h.endsWith(`.${g}`))).sort()
  return { tous: false, hotes }
}
