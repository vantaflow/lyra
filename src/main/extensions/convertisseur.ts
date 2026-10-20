/**
 * Convertisseur d'extension Firefox (dossier d'un .xpi déjà extrait) en extension chargeable par Chromium.
 * Pur : aucune dépendance à Electron (la conversion des icônes SVG est injectée). Chaque modification du manifest est
 * consignée dans le rapport (`cles_retirees`, `permissions_retirees`, `transformations`, `avertissements`) ; un refus motivé
 * (`refus`) laisse le dossier intact. Le dossier est modifié en place : l'appelant le jette si l'extension est refusée.
 */
import { existsSync, readFileSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs'
import { join, posix, resolve, sep } from 'node:path'
import type { RapportConversion } from '../../shared/types'

export type { RapportConversion }

export interface FichierEnTete {
  /** Nom du fichier à la racine de l'extension convertie (ex. `browser-polyfill.js`). */
  nom: string
  /** Chemin du fichier à copier. */
  source: string
}

export interface OptionsConversion {
  /** Fichiers chargés avant tout script de l'extension (polyfill, puis stubs MV2) : arrière-plan, content scripts, pages HTML. */
  enTete: FichierEnTete[]
  /** Rend un PNG carré du SVG, ou undefined si la conversion est impossible (l'icône est alors retirée). */
  svgVersPng?: (svg: Buffer, taille: number) => Promise<Buffer | undefined>
  /** Clé publique (base64, DER) écrite dans le manifest : identité stable de l'extension convertie. */
  cle?: string
}

type Json = Record<string, unknown>

const objet = (v: unknown): Json | undefined => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Json) : undefined)
const tableauTexte = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/** Permissions que Chromium connaît (hors motifs d'hôtes). Toute autre permission est retirée et journalisée. */
const PERMISSIONS_CHROME = new Set([
  'activeTab', 'alarms', 'background', 'bookmarks', 'browsingData', 'certificateProvider', 'clipboardRead', 'clipboardWrite',
  'contentSettings', 'contextMenus', 'cookies', 'debugger', 'declarativeContent', 'declarativeNetRequest',
  'declarativeNetRequestFeedback', 'declarativeNetRequestWithHostAccess', 'desktopCapture', 'downloads', 'downloads.open',
  'downloads.shelf', 'favicon', 'fontSettings', 'gcm', 'geolocation', 'history', 'identity', 'identity.email', 'idle',
  'management', 'nativeMessaging', 'notifications', 'offscreen', 'pageCapture', 'power', 'printing', 'privacy', 'processes',
  'proxy', 'readingList', 'scripting', 'search', 'sessions', 'sidePanel', 'storage', 'system.cpu', 'system.display',
  'system.memory', 'system.storage', 'tabCapture', 'tabGroups', 'tabs', 'topSites', 'tts', 'ttsEngine', 'unlimitedStorage',
  'webNavigation', 'webRequest', 'webRequestBlocking', 'webRequestAuthProvider'
])

const estHote = (p: string): boolean => p === '<all_urls>' || /^(\*|https?|ftp|file|wss?):\/\//.test(p)

/** Clés de premier niveau que Chromium ne connaît pas (ou que Lyra ne peut pas honorer) : retirées et journalisées. */
const CLES_RETIREES = ['browser_specific_settings', 'applications', 'sidebar_action', 'theme_experiment', 'protocol_handlers', 'user_scripts', 'developer', 'dictionaries']

/** Sous-clés Firefox seulement, par bloc. */
const SOUS_CLES_RETIREES: Array<[string, string[]]> = [
  ['browser_action', ['browser_style', 'default_area', 'theme_icons']],
  ['action', ['browser_style', 'default_area', 'theme_icons']],
  ['page_action', ['browser_style', 'show_matches', 'hide_matches', 'pinned']],
  ['options_ui', ['browser_style']]
]

/** Moyens d'interaction que Chromium sait offrir sans barre latérale : si aucun n'existe, `sidebar_action` était le seul. */
const INTERACTIONS = ['browser_action', 'action', 'page_action', 'content_scripts', 'devtools_page', 'chrome_url_overrides', 'omnibox']

const sansCommentaires = (texte: string): string => texte.replace(/^﻿/, '').replace(/^\s*\/\/.*$/gm, '')

/** Directive CSP acceptée par Chromium en MV3 : uniquement 'self', 'none' et 'wasm-unsafe-eval'. */
function cspMv3Valide(csp: string): boolean {
  return csp
    .split(';')
    .map((d) => d.trim().split(/\s+/).filter(Boolean))
    .filter((d) => d.length > 0)
    .every(([nom, ...sources]) => !['script-src', 'object-src', 'worker-src'].includes(nom) || sources.every((s) => ["'self'", "'none'", "'wasm-unsafe-eval'"].includes(s)))
}

export async function convertir(dossier: string, o: OptionsConversion): Promise<{ manifest: Json; rapport: RapportConversion }> {
  const rapport: RapportConversion = { cles_retirees: [], permissions_retirees: [], transformations: [], avertissements: [] }
  const refuser = (motif: string, m: Json = {}): { manifest: Json; rapport: RapportConversion } => {
    rapport.refus = motif
    return { manifest: m, rapport }
  }
  const retirer = (parent: Json, cle: string, chemin: string): void => {
    if (!Object.hasOwn(parent, cle)) return
    delete parent[cle]
    rapport.cles_retirees.push(chemin)
  }

  let m: Json
  try {
    const brut = JSON.parse(sansCommentaires(readFileSync(join(dossier, 'manifest.json'), 'utf8'))) as unknown
    const o2 = objet(brut)
    if (!o2) return refuser('manifest.json invalide')
    m = o2
  } catch {
    return refuser('manifest.json illisible')
  }
  const mv = m.manifest_version
  if (mv !== 2 && mv !== 3) return refuser(`manifest_version ${String(mv)} non pris en charge (2 ou 3)`)

  // ---------------------------------------------------------------------------------------------- refus motivés
  if (m.theme !== undefined) return refuser("c'est un thème : Lyra n'installe pas de thèmes", m)
  if (m.experiment_apis !== undefined) return refuser("l'extension utilise « experiment_apis » (API expérimentales de Firefox) : Chromium n'a aucun équivalent", m)
  if (m.sidebar_action !== undefined && !INTERACTIONS.some((k) => m[k] !== undefined && !(Array.isArray(m[k]) && (m[k] as unknown[]).length === 0))) {
    return refuser("« sidebar_action » est le seul moyen d'interaction de l'extension : Chromium n'a pas de barre latérale d'extension, il n'y aurait rien à utiliser", m)
  }

  // ---------------------------------------------------------------------------------------------- META-INF et clés
  if (existsSync(join(dossier, 'META-INF'))) {
    rmSync(join(dossier, 'META-INF'), { recursive: true, force: true })
    rapport.transformations.push('META-INF/ supprimé (signature Mozilla, sans objet pour Chromium)')
  }
  for (const cle of CLES_RETIREES) retirer(m, cle, cle)
  for (const [bloc, sous] of SOUS_CLES_RETIREES) {
    const b = objet(m[bloc])
    if (b) for (const s of sous) retirer(b, s, `${bloc}.${s}`)
  }
  const bgBrut = objet(m.background)
  if (bgBrut) retirer(bgBrut, 'preferred_environment', 'background.preferred_environment')
  if (typeof m.incognito === 'string' && m.incognito === 'split') {
    rapport.avertissements.push("incognito « split » : Lyra ne charge jamais les extensions en fenêtre privée")
  }

  // ---------------------------------------------------------------------------------------------- permissions
  const hotesDeplaces: string[] = []
  const optionnellesHotes: string[] = []
  const trierPermissions = (cle: 'permissions' | 'optional_permissions'): void => {
    if (!Array.isArray(m[cle])) return
    const gardees: string[] = []
    for (const brut of tableauTexte(m[cle])) {
      let p = brut
      if (p === 'menus') {
        p = 'contextMenus'
        rapport.transformations.push(`${cle} : menus → contextMenus`)
      }
      if (estHote(p)) {
        if (mv === 3) (cle === 'permissions' ? hotesDeplaces : optionnellesHotes).push(p)
        else gardees.push(p)
        continue
      }
      if (p === 'webRequestBlocking' && mv === 3) {
        rapport.permissions_retirees.push(p)
        rapport.avertissements.push("webRequestBlocking n'existe pas en MV3 sous Chromium : retirée (le blocage réseau reste assuré par les Boucliers)")
        continue
      }
      if (PERMISSIONS_CHROME.has(p)) gardees.push(p)
      else rapport.permissions_retirees.push(p)
    }
    m[cle] = [...new Set(gardees)]
  }
  trierPermissions('permissions')
  trierPermissions('optional_permissions')
  if (mv === 3) {
    if (hotesDeplaces.length > 0) {
      m.host_permissions = [...new Set([...tableauTexte(m.host_permissions), ...hotesDeplaces])]
      rapport.transformations.push(`permissions d'hôtes déplacées vers host_permissions (${hotesDeplaces.length})`)
    }
    if (optionnellesHotes.length > 0) {
      m.optional_host_permissions = [...new Set([...tableauTexte(m.optional_host_permissions), ...optionnellesHotes])]
      rapport.transformations.push(`optional_permissions d'hôtes déplacées vers optional_host_permissions (${optionnellesHotes.length})`)
    }
  }
  if (Array.isArray(m.permissions) && m.permissions.length === 0) delete m.permissions
  if (Array.isArray(m.optional_permissions) && m.optional_permissions.length === 0) delete m.optional_permissions

  // ---------------------------------------------------------------------------------------------- actions
  if (mv === 3) {
    if (m.browser_action !== undefined) {
      if (m.action === undefined) {
        m.action = m.browser_action
        rapport.transformations.push('browser_action → action')
      } else rapport.avertissements.push('browser_action ignorée : le manifest a déjà « action »')
      delete m.browser_action
    }
    if (m.page_action !== undefined) {
      if (m.action === undefined) {
        m.action = m.page_action
        rapport.transformations.push('page_action → action')
      } else rapport.avertissements.push('page_action ignorée : le manifest a déjà « action »')
      delete m.page_action
    }
  }

  // ---------------------------------------------------------------------------------------------- commandes
  const commandes = objet(m.commands)
  if (commandes) {
    for (const [nom, def] of Object.entries(commandes)) {
      if (nom === '_execute_sidebar_action') {
        delete commandes[nom]
        rapport.cles_retirees.push(`commands.${nom}`)
      } else if (mv === 3 && (nom === '_execute_browser_action' || nom === '_execute_page_action')) {
        delete commandes[nom]
        if (commandes._execute_action === undefined) {
          commandes._execute_action = def
          rapport.transformations.push(`commands.${nom} → _execute_action`)
        }
      } else if (!nom.startsWith('_execute_') && objet(def) && typeof objet(def)?.description !== 'string') {
        // Chromium exige une description pour une commande ordinaire.
        ;(objet(def) as Json).description = nom
        rapport.transformations.push(`commands.${nom} : description ajoutée (obligatoire pour Chromium)`)
      }
    }
  }

  // ---------------------------------------------------------------------------------------------- fichiers d'en-tête
  const enTete = placerEnTete(dossier, o.enTete)
  const lienEnTete = (depuis: string): string[] => enTete.map((n) => posix.relative(posix.dirname(depuis), n) || n)
  const sansBarre = (p: string): string => p.replace(/^\.?\//, '')

  // ---------------------------------------------------------------------------------------------- arrière-plan
  const pages = new Set<string>()
  const bg = objet(m.background)
  if (bg) {
    const scripts = tableauTexte(bg.scripts).map(sansBarre)
    if (scripts.length > 0) {
      const module = bg.type === 'module'
      if (mv === 3) {
        const liste = [...enTete, ...scripts]
        const contenu = module
          ? liste.map((s) => `import ${JSON.stringify('./' + s)};`).join('\n') + '\n'
          : `importScripts(${liste.map((s) => JSON.stringify(s)).join(', ')});\n`
        const nomSw = existsSync(join(dossier, 'background.sw.js')) ? 'lyra-background.sw.js' : 'background.sw.js'
        writeFileSync(join(dossier, nomSw), contenu)
        m.background = { service_worker: nomSw, ...(module ? { type: 'module' } : {}) }
        rapport.transformations.push(`background.scripts → ${nomSw} (${module ? 'modules ES' : 'importScripts'}), avec ${enTete.join(', ')} en tête`)
      } else {
        bg.scripts = [...enTete, ...scripts]
        bg.persistent = true
        retirer(bg, 'type', 'background.type')
        if (module) rapport.avertissements.push('scripts d\'arrière-plan de type « module » : Chromium MV2 les charge comme des scripts classiques, ils peuvent échouer')
        rapport.transformations.push('MV2 conservé : background.scripts gardé (persistent: true), avec ' + enTete.join(', ') + ' en tête')
      }
    } else if (typeof bg.page === 'string') {
      if (mv === 3) {
        delete m.background
        rapport.cles_retirees.push('background.page')
        rapport.avertissements.push('background.page n\'existe pas en MV3 sous Chromium : arrière-plan retiré')
      } else {
        bg.persistent = true
        pages.add(sansBarre(bg.page))
        rapport.transformations.push(`MV2 conservé : background.page ${bg.page} gardée (persistent: true)`)
      }
    } else if (mv === 3 && typeof bg.service_worker !== 'string') {
      delete m.background
      rapport.avertissements.push('background sans script exploitable : retiré')
    }
  }

  // ---------------------------------------------------------------------------------------------- CSP
  const csp = m.content_security_policy
  if (mv === 3) {
    const ep = typeof csp === 'string' ? csp : typeof objet(csp)?.extension_pages === 'string' ? (objet(csp)?.extension_pages as string) : undefined
    if (ep !== undefined) {
      if (cspMv3Valide(ep)) {
        if (typeof csp === 'string') {
          m.content_security_policy = { extension_pages: csp }
          rapport.transformations.push('content_security_policy (chaîne) → { extension_pages }')
        }
      } else {
        delete m.content_security_policy
        rapport.cles_retirees.push('content_security_policy')
        rapport.avertissements.push("content_security_policy retirée : Chromium MV3 n'accepte que 'self', 'none' et 'wasm-unsafe-eval' (politique par défaut appliquée)")
      }
    }
  }

  // ---------------------------------------------------------------------------------------------- web_accessible_resources
  if (Array.isArray(m.web_accessible_resources)) {
    const war = (m.web_accessible_resources as unknown[]).map((x) => (typeof x === 'string' ? sansBarre(x) : x))
    if (mv === 3) {
      if (war.some((x) => typeof x === 'string')) {
        const chaines = war.filter((x): x is string => typeof x === 'string')
        const objets = war.filter((x) => typeof x === 'object' && x !== null)
        m.web_accessible_resources = [...objets, { resources: chaines, matches: ['<all_urls>'] }]
        rapport.transformations.push('web_accessible_resources → [{ resources, matches: ["<all_urls>"] }]')
      } else m.web_accessible_resources = war
    } else m.web_accessible_resources = war
  }

  // ---------------------------------------------------------------------------------------------- content scripts
  if (Array.isArray(m.content_scripts)) {
    let n = 0
    for (const cs of m.content_scripts as unknown[]) {
      const c = objet(cs)
      if (!c || !Array.isArray(c.js) || c.js.length === 0) continue
      if (c.world === 'MAIN') {
        rapport.avertissements.push('content script en monde MAIN : sans polyfill (browser.* y est absent)')
        continue
      }
      c.js = [...enTete, ...tableauTexte(c.js)]
      n++
    }
    if (n > 0) rapport.transformations.push(`${enTete.join(', ')} ajouté en tête de ${n} content script(s)`)
  }

  // ---------------------------------------------------------------------------------------------- pages HTML
  for (const a of [m.browser_action, m.action, m.page_action]) {
    const dp = objet(a)?.default_popup
    if (typeof dp === 'string') pages.add(sansBarre(dp))
  }
  const opt = objet(m.options_ui)?.page
  if (typeof opt === 'string') pages.add(sansBarre(opt))
  if (typeof m.options_page === 'string') pages.add(sansBarre(m.options_page))
  if (typeof m.devtools_page === 'string') pages.add(sansBarre(m.devtools_page))
  for (const v of Object.values(objet(m.chrome_url_overrides) ?? {})) if (typeof v === 'string') pages.add(sansBarre(v))
  const racine = resolve(dossier)
  const dansDossier = (rel: string): string | undefined => {
    const abs = resolve(racine, rel)
    return abs === racine || abs.startsWith(racine + sep) ? abs : undefined
  }
  const patchees: string[] = []
  for (const rel of pages) {
    const f = dansDossier(rel)
    if (!f || !existsSync(f)) {
      rapport.avertissements.push(`page introuvable dans le paquet : ${rel}`)
      continue
    }
    let html = readFileSync(f, 'utf8')
    const balises = lienEnTete(rel).map((s) => `<script src="${s}"></script>`).join('')
    if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, (x) => x + balises)
    else if (/<html[^>]*>/i.test(html)) html = html.replace(/<html[^>]*>/i, (x) => x + balises)
    else html = balises + html
    writeFileSync(f, html)
    patchees.push(rel)
  }
  if (patchees.length > 0) rapport.transformations.push(`${enTete.join(', ')} ajouté en tête des pages : ${patchees.join(', ')}`)

  // ---------------------------------------------------------------------------------------------- icônes SVG
  await convertirIcones(dossier, m, o, rapport)

  if (o.cle) m.key = o.cle
  writeFileSync(join(dossier, 'manifest.json'), JSON.stringify(m, null, 2))
  return { manifest: m, rapport }
}

/** Copie les fichiers d'en-tête à la racine ; un fichier de même nom mais différent est écarté : le nôtre prend `lyra-<nom>`. */
function placerEnTete(dossier: string, fichiers: FichierEnTete[]): string[] {
  const noms: string[] = []
  for (const f of fichiers) {
    const contenu = readFileSync(f.source)
    let nom = f.nom
    let essai = 0
    while (existsSync(join(dossier, nom)) && !readFileSync(join(dossier, nom)).equals(contenu)) nom = `lyra${essai++ === 0 ? '' : essai}-${f.nom}`
    if (!existsSync(join(dossier, nom))) copyFileSync(f.source, join(dossier, nom))
    noms.push(nom)
  }
  return noms
}

const SVG = /\.svg$/i

async function convertirIcones(dossier: string, m: Json, o: OptionsConversion, rapport: RapportConversion): Promise<void> {
  const racine = resolve(dossier)
  const faits = new Map<string, string | undefined>()
  /** Chemin relatif du PNG qui remplace ce SVG, ou undefined (icône à retirer). */
  async function remplacer(ref: string, taille: number): Promise<string | undefined> {
    const rel = ref.replace(/^\.?\//, '')
    const cle = `${rel}@${taille}`
    if (faits.has(cle)) return faits.get(cle)
    let sortie: string | undefined
    const abs = resolve(racine, rel)
    if (!abs.startsWith(racine + sep) || !existsSync(abs) || statSync(abs).size > 1024 * 1024) {
      rapport.avertissements.push(`icône SVG introuvable ou trop lourde, retirée : ${ref}`)
    } else if (!o.svgVersPng) {
      rapport.avertissements.push(`icône SVG retirée (conversion en PNG indisponible) : ${ref}`)
    } else {
      let png: Buffer | undefined
      try {
        png = await o.svgVersPng(readFileSync(abs), taille)
      } catch {
        png = undefined
      }
      if (!png || png.length === 0) rapport.avertissements.push(`icône SVG retirée (conversion en PNG impossible) : ${ref}`)
      else {
        sortie = posix.join(posix.dirname(rel), `${posix.basename(rel).replace(SVG, '')}-${taille}.png`)
        writeFileSync(join(dossier, ...sortie.split('/')), png)
        rapport.transformations.push(`icône SVG → PNG : ${ref} (${taille} px) → ${sortie}`)
      }
    }
    faits.set(cle, sortie)
    return sortie
  }
  const traiter = async (parent: Json, cle: string, chemin: string): Promise<void> => {
    const v = parent[cle]
    if (typeof v === 'string' && SVG.test(v)) {
      const r = await remplacer(v, 128)
      if (r) parent[cle] = r
      else {
        delete parent[cle]
        rapport.cles_retirees.push(chemin)
      }
    } else if (objet(v)) {
      const carte = v as Json
      for (const [taille, ref] of Object.entries(carte)) {
        if (typeof ref !== 'string' || !SVG.test(ref)) continue
        const n = Number(taille)
        const r = await remplacer(ref, Number.isFinite(n) && n > 0 && n <= 512 ? n : 128)
        if (r) carte[taille] = r
        else {
          delete carte[taille]
          rapport.cles_retirees.push(`${chemin}.${taille}`)
        }
      }
    }
  }
  await traiter(m, 'icons', 'icons')
  for (const bloc of ['browser_action', 'action', 'page_action']) {
    const b = objet(m[bloc])
    if (b) await traiter(b, 'default_icon', `${bloc}.default_icon`)
  }
}
