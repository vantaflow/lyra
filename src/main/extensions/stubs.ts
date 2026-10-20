/**
 * Couche de compatibilité MV2 : injecte `shim-head.js` (avant le polyfill) et `shim-post.js` (après) en tête des scripts
 * d'arrière-plan et des pages HTML d'une extension MV2. Les shims (resources/extensions) posent des proxys inertes pour
 * les API absentes de `chrome.*` et comptent chaque appel dans `globalThis.__lyraStubs`.
 * MV3 : rien. Idempotent : un fichier marqueur `lyra-stubs.json` à la racine de l'extension.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

export const MARQUEUR_STUBS = 'lyra-stubs.json'
export const FICHIER_HEAD = 'lyra-shim-head.js'
export const FICHIER_POST = 'lyra-shim-post.js'

export interface ShimsStubs {
  /** Chemin de `shim-head.js`. */
  head: string
  /** Chemin de `shim-post.js`. */
  post: string
}

export interface ResultatStubs {
  applique: boolean
  /** Pourquoi rien n'a été fait (« mv3 », « deja-applique »). */
  raison?: string
  scripts?: boolean
  pages?: string[]
}

type Json = Record<string, unknown>
const objet = (v: unknown): Json | undefined => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Json) : undefined)
const sansBarre = (p: string): string => p.replace(/^\.?\//, '')
const EST_POLYFILL = /(^|\/)(lyra\d*-)?browser-polyfill\.js$/
const BALISE_POLYFILL = /<script\b[^>]*\bsrc\s*=\s*["'][^"']*browser-polyfill\.js["'][^>]*>\s*<\/script>/i

/** Pages HTML de l'extension qui exécutent du code d'extension (arrière-plan, popup, options, devtools, remplacements). */
function pagesExtension(m: Json): Set<string> {
  const pages = new Set<string>()
  const bg = objet(m.background)
  if (typeof bg?.page === 'string') pages.add(sansBarre(bg.page))
  for (const a of [m.browser_action, m.action, m.page_action]) {
    const dp = objet(a)?.default_popup
    if (typeof dp === 'string') pages.add(sansBarre(dp))
  }
  const opt = objet(m.options_ui)?.page
  if (typeof opt === 'string') pages.add(sansBarre(opt))
  if (typeof m.options_page === 'string') pages.add(sansBarre(m.options_page))
  if (typeof m.devtools_page === 'string') pages.add(sansBarre(m.devtools_page))
  for (const v of Object.values(objet(m.chrome_url_overrides) ?? {})) if (typeof v === 'string') pages.add(sansBarre(v))
  return pages
}

/** Insère les balises : head avant la balise du polyfill et post juste après ; sans polyfill, les deux en tête de page. */
function patcherHtml(html: string): string {
  const head = `<script src="/${FICHIER_HEAD}"></script>`
  const post = `<script src="/${FICHIER_POST}"></script>`
  const poly = BALISE_POLYFILL.exec(html)
  if (poly) return html.slice(0, poly.index) + head + poly[0] + post + html.slice(poly.index + poly[0].length)
  const balises = head + post
  if (/<head(\s[^>]*)?>/i.test(html)) return html.replace(/<head(\s[^>]*)?>/i, (x) => x + balises)
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (x) => x + balises)
  return balises + html
}

/**
 * Applique les stubs à l'extension dont `dossier` est la racine (là où est `manifest.json`) ; `manifest` est son manifest
 * (déjà lu, mis à jour sur place puis réécrit). Sans effet pour une extension MV3 ou déjà marquée.
 */
export function appliquerStubs(dossier: string, manifest: Record<string, unknown>, shims: ShimsStubs): ResultatStubs {
  if (manifest.manifest_version !== 2) return { applique: false, raison: 'mv3' }
  if (existsSync(join(dossier, MARQUEUR_STUBS))) return { applique: false, raison: 'deja-applique' }
  copyFileSync(shims.head, join(dossier, FICHIER_HEAD))
  copyFileSync(shims.post, join(dossier, FICHIER_POST))

  let scripts = false
  const bg = objet(manifest.background)
  if (bg && Array.isArray(bg.scripts) && bg.scripts.some((s) => typeof s === 'string')) {
    const liste = (bg.scripts as unknown[]).filter((s): s is string => typeof s === 'string')
    const i = liste.findIndex((s) => EST_POLYFILL.test(sansBarre(s)))
    // head en tête de tout ; post juste après le polyfill, sinon juste après head.
    liste.splice(i < 0 ? 0 : i, 0, FICHIER_HEAD)
    liste.splice(i < 0 ? 1 : i + 2, 0, FICHIER_POST)
    bg.scripts = liste
    scripts = true
    writeFileSync(join(dossier, 'manifest.json'), JSON.stringify(manifest, null, 2))
  }

  const racine = resolve(dossier)
  const pages: string[] = []
  for (const rel of pagesExtension(manifest)) {
    const abs = resolve(racine, rel)
    if (!abs.startsWith(racine + sep) || !existsSync(abs)) continue
    writeFileSync(abs, patcherHtml(readFileSync(abs, 'utf8')))
    pages.push(rel)
  }
  writeFileSync(join(dossier, MARQUEUR_STUBS), JSON.stringify({ version: 1, scripts, pages }))
  return { applique: true, scripts, pages }
}
