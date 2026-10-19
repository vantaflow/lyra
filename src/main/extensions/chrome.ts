/**
 * Installation d'extensions Chrome : Chrome Web Store (identifiant ou URL), fichier .crx / .zip, dossier décompressé et
 * uBlock Origin (release GitHub). Tout passe par l'extraction sûre de `archives.ts` puis par le registre et le chargeur.
 * Réseau : clients2.google.com (et ses redirections Google), api.github.com / github.com (uBO) ; délai de 30 s.
 */
import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { ExtensionInstallee, MagasinExtension, ResultatInstallation, SourceExtension } from '../../shared/types'
import { copierDossier, extraireZip, idDepuisCle, lireCrx3, MAX_ARCHIVE, ErreurArchive } from './archives'
import type { Chargeur } from './chargeur'
import { dossierAbsolu, dossierRelatifValide, ID_EXTENSION, type Registre } from './registre'

export const DELAI_RESEAU_MS = 30_000

// ------------------------------------------------------------------------------------------------- analyse

export interface SourceChrome {
  type: 'id' | 'url' | 'crx' | 'zip' | 'dossier' | 'ubo'
  id?: string
}

const CHEMIN_ABSOLU = /^(\/|~[\\/]|[A-Za-z]:[\\/])/

/** Reconnaît ce que l'utilisateur a saisi ou choisi ; undefined si ce n'est rien de pris en charge. */
export function analyserSourceChrome(texte: string): SourceChrome | undefined {
  const t = texte.trim()
  if (t.length === 0 || t.length > 2000) return undefined
  if (t.toLowerCase() === 'ubo') return { type: 'ubo' }
  if (ID_EXTENSION.test(t)) return { type: 'id', id: t }
  if (/^https?:\/\//i.test(t)) {
    let u: URL
    try {
      u = new URL(t)
    } catch {
      return undefined
    }
    const segments = u.pathname.split('/').filter(Boolean)
    const ok =
      u.protocol === 'https:' &&
      ((u.hostname === 'chromewebstore.google.com' && segments[0] === 'detail') || (u.hostname === 'chrome.google.com' && segments[0] === 'webstore' && segments[1] === 'detail'))
    const id = segments.at(-1)
    return ok && id && ID_EXTENSION.test(id) && segments.length >= (u.hostname === 'chrome.google.com' ? 3 : 2) ? { type: 'url', id } : undefined
  }
  if (/\.crx$/i.test(t)) return { type: 'crx' }
  if (/\.zip$/i.test(t)) return { type: 'zip' }
  if (CHEMIN_ABSOLU.test(t)) return { type: 'dossier' }
  return undefined
}

// ------------------------------------------------------------------------------------------------- manifest

interface Manifeste {
  manifest_version?: unknown
  name?: unknown
  version?: unknown
  key?: unknown
  default_locale?: unknown
  theme?: unknown
}

/** Nom lisible : résout `__MSG_x__` dans `_locales/<langue par défaut>/messages.json`. */
function nomManifeste(racine: string, m: Manifeste): string {
  const brut = String(m.name).trim()
  const msg = /^__MSG_(.+)__$/.exec(brut)
  if (!msg) return brut
  for (const langue of [typeof m.default_locale === 'string' ? m.default_locale : 'en', 'en']) {
    try {
      if (!/^[A-Za-z0-9_-]+$/.test(langue)) continue
      const messages = JSON.parse(readFileSync(join(racine, '_locales', langue, 'messages.json'), 'utf8')) as Record<string, { message?: unknown }>
      const cle = Object.keys(messages).find((k) => k.toLowerCase() === msg[1].toLowerCase())
      const texte = cle && messages[cle]?.message
      if (typeof texte === 'string' && texte.trim()) return texte.trim().slice(0, 200)
    } catch {
      /* langue absente : on essaie la suivante */
    }
  }
  return brut
}

/** Racine de l'extension dans un dossier extrait : lui-même, ou son unique sous-dossier (ex. `uBlock0.chromium`). */
function racineManifest(dossier: string): string {
  if (existsSync(join(dossier, 'manifest.json'))) return dossier
  const sous = readdirSync(dossier, { withFileTypes: true }).filter((e) => e.isDirectory())
  if (sous.length === 1 && existsSync(join(dossier, sous[0].name, 'manifest.json'))) return join(dossier, sous[0].name)
  throw new ErreurArchive("manifest.json introuvable à la racine de l'extension")
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

// ------------------------------------------------------------------------------------------------- réseau

async function lireCorps(r: Response, max: number): Promise<Uint8Array> {
  const annonce = Number(r.headers.get('content-length'))
  if (Number.isFinite(annonce) && annonce > max) throw new Error('téléchargement trop volumineux')
  if (!r.body) return new Uint8Array(await r.arrayBuffer())
  const lecteur = r.body.getReader()
  const morceaux: Uint8Array[] = []
  let n = 0
  for (;;) {
    const { done, value } = await lecteur.read()
    if (done) break
    n += value.length
    if (n > max) {
      await lecteur.cancel().catch(() => {})
      throw new Error('téléchargement trop volumineux')
    }
    morceaux.push(value)
  }
  return Buffer.concat(morceaux)
}

const hoteGoogle = (h: string): boolean => h === 'google.com' || h.endsWith('.google.com') || h.endsWith('.googleusercontent.com')
const hoteGithub = (h: string): boolean => h === 'github.com' || h.endsWith('.githubusercontent.com')

function urlCrx(id: string): string {
  const u = new URL('https://clients2.google.com/service/update2/crx')
  u.searchParams.set('response', 'redirect')
  u.searchParams.set('acceptformat', 'crx3')
  u.searchParams.set('x', new URLSearchParams({ id, uc: '' }).toString())
  u.searchParams.set('prodversion', process.versions.chrome ?? '131.0.6778.109')
  return u.toString()
}

// ------------------------------------------------------------------------------------------------- installateur

export interface DepsInstallateurChrome {
  /** `userData/extensions`. */
  base: string
  registre: Registre
  chargeur: Chargeur
  fetch?: typeof fetch
  maintenant?: () => Date
  journal?: (m: string) => void
  /** Délai d'attente d'une requête, en ms (30 000 par défaut). */
  delaiMs?: number
}

export interface InstallateurChrome {
  installerChrome(source: string): Promise<ResultatInstallation>
  installerUbo(): Promise<ResultatInstallation>
  /** Version de la dernière release GitHub de uBlock Origin. */
  derniereVersionUbo(): Promise<string>
}

interface Finalisation {
  /** Dossier extrait (ou copié), éventuellement avec un sous-dossier racine. */
  extrait: string
  source: SourceExtension
  magasin: MagasinExtension
  /** Clé publique (DER) fournie par l'en-tête CRX. */
  cle?: Buffer
  idAttendu?: string
}

export function creerInstallateurChrome(d: DepsInstallateurChrome): InstallateurChrome {
  const f = d.fetch ?? fetch
  const maintenant = d.maintenant ?? ((): Date => new Date())
  const journal = d.journal ?? ((m: string) => console.warn(`[extensions] ${m}`))
  const delai = d.delaiMs ?? DELAI_RESEAU_MS
  const echec = (raison: string): ResultatInstallation => {
    journal(`installation refusée : ${raison}`)
    return { etat: 'erreur', raison }
  }

  /** Clé d'une extension sans clé : celle de la version déjà installée (même nom, même type de source), sinon une nouvelle. */
  const cleStable = (nom: string, source: SourceExtension): string => {
    const precedente = d.registre.lister().find((e) => e.nom === nom && e.source === source)
    if (precedente) {
      try {
        const m = JSON.parse(readFileSync(join(dossierAbsolu(d.base, precedente.dossier), 'manifest.json'), 'utf8')) as Manifeste
        if (typeof m.key === 'string' && m.key) return m.key
      } catch {
        /* version précédente illisible : nouvelle clé */
      }
    }
    return generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
  }

  /** Valide le manifest, fixe l'identité (clé → id), place le dossier sous `<id>/<version>`, inscrit au registre et charge. */
  async function finaliser(o: Finalisation): Promise<ResultatInstallation> {
    const racine = racineManifest(o.extrait)
    let m: Manifeste
    try {
      m = JSON.parse(readFileSync(join(racine, 'manifest.json'), 'utf8')) as Manifeste
    } catch {
      return echec('manifest.json illisible')
    }
    if (typeof m !== 'object' || m === null || Array.isArray(m)) return echec('manifest.json invalide')
    if (m.theme !== undefined) return echec("c'est un thème : Lyra n'installe pas de thèmes")
    if (m.manifest_version !== 2 && m.manifest_version !== 3) return echec(`manifest_version ${String(m.manifest_version)} non pris en charge (2 ou 3)`)
    if (typeof m.name !== 'string' || m.name.trim() === '') return echec("le manifest n'a pas de nom")
    if (typeof m.version !== 'string' || m.version === '') return echec("le manifest n'a pas de version")
    const nom = nomManifeste(racine, m)
    let cle = typeof m.key === 'string' && m.key ? m.key : o.cle?.toString('base64')
    if (!cle) cle = cleStable(nom, o.source)
    if (m.key !== cle) {
      m.key = cle
      writeFileSync(join(racine, 'manifest.json'), JSON.stringify(m, null, 2))
    }
    const id = idDepuisCle(cle)
    if (o.idAttendu && id !== o.idAttendu) return echec(`le paquet n'est pas celui demandé (identifiant ${id} au lieu de ${o.idAttendu})`)
    const version = m.version
    if (!dossierRelatifValide(`${id}/${version}`)) return echec(`version « ${version.slice(0, 40)} » illisible`)

    const precedente = d.registre.trouver(id)
    const cible = join(d.base, id, version)
    // Une version déjà chargée sous cet id est retirée de la session avant de charger la nouvelle.
    if (precedente) await d.chargeur.activer(id, false)
    rmSync(cible, { recursive: true, force: true })
    mkdirSync(join(d.base, id), { recursive: true })
    renameSync(racine, cible)
    const maintenantIso = maintenant().toISOString()
    const entree: ExtensionInstallee = {
      id,
      nom,
      version,
      source: o.source,
      magasin: o.magasin,
      dossier: `${id}/${version}`,
      active: precedente?.active ?? true,
      installeeLe: precedente?.installeeLe ?? maintenantIso,
      miseAJourLe: maintenantIso
    }
    d.registre.ajouter(entree)
    if (entree.active) {
      const r = await d.chargeur.charger(id)
      if (!r.ok) {
        // Retour arrière : la version précédente (encore sur disque) reprend sa place.
        rmSync(cible, { recursive: true, force: true })
        if (precedente) {
          d.registre.ajouter(precedente)
          if (precedente.active) await d.chargeur.charger(id)
        } else {
          d.registre.retirer(id)
          rmSync(join(d.base, id), { recursive: true, force: true })
        }
        return echec(`chargement impossible : ${r.erreur ?? 'erreur inconnue'}`)
      }
    }
    // Versions antérieures : supprimées une fois la nouvelle en place.
    for (const v of readdirSync(join(d.base, id))) if (v !== version) rmSync(join(d.base, id, v), { recursive: true, force: true })
    journal(`${nom} ${version} installée (${o.source}, ${id})`)
    return { etat: 'installee', id, nom, version }
  }

  /** Extrait dans un dossier d'attente sous `base` (même volume : le renommage final est atomique), puis finalise. */
  async function depuisZip(zip: Uint8Array, o: Omit<Finalisation, 'extrait'>): Promise<ResultatInstallation> {
    const attente = join(d.base, `.attente-${randomUUID().slice(0, 8)}`)
    try {
      mkdirSync(d.base, { recursive: true })
      extraireZip(zip, attente)
      return await finaliser({ ...o, extrait: attente })
    } finally {
      rmSync(attente, { recursive: true, force: true })
    }
  }

  const lireFichier = (chemin: string): Uint8Array => {
    const st = statSync(chemin)
    if (!st.isFile()) throw new ErreurArchive("ce n'est pas un fichier")
    if (st.size > MAX_ARCHIVE) throw new ErreurArchive('fichier trop volumineux (128 Mio au plus)')
    return readFileSync(chemin)
  }

  async function requete(url: string, accepte: (hote: string) => boolean, max: number, entetes?: Record<string, string>): Promise<Uint8Array> {
    const r = await f(url, { signal: AbortSignal.timeout(delai), redirect: 'follow', headers: entetes })
    if (r.status === 204) throw new Error("le magasin ne propose plus ce paquet (HTTP 204)")
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    if (r.url && !accepte(new URL(r.url).hostname)) throw new Error(`redirection refusée vers ${new URL(r.url).hostname}`)
    return lireCorps(r, max)
  }

  async function installerCws(id: string): Promise<ResultatInstallation> {
    const deja = d.registre.trouver(id)
    if (deja && deja.source === 'cws') return { etat: 'installee', id, nom: deja.nom, version: deja.version }
    const octets = await requete(urlCrx(id), hoteGoogle, MAX_ARCHIVE)
    const { zip, cle } = lireCrx3(octets)
    if (!cle) return echec("l'en-tête du .crx ne contient pas de clé publique")
    return depuisZip(zip, { source: 'cws', magasin: 'chrome', cle, idAttendu: id })
  }

  interface Release {
    version: string
    url: string
  }
  async function releaseUbo(): Promise<Release> {
    const brut = await requete('https://api.github.com/repos/gorhill/uBlock/releases/latest', (h) => h === 'api.github.com', 5 * 1024 * 1024, { accept: 'application/vnd.github+json' })
    const json = JSON.parse(Buffer.from(brut).toString('utf8')) as { assets?: Array<{ name?: unknown; browser_download_url?: unknown }> }
    for (const a of json.assets ?? []) {
      const m = typeof a.name === 'string' ? /^uBlock0_(\d[\w.-]*)\.chromium\.zip$/.exec(a.name) : null
      if (!m || typeof a.browser_download_url !== 'string') continue
      const u = new URL(a.browser_download_url)
      if (u.protocol !== 'https:' || u.hostname !== 'github.com') throw new Error(`lien de téléchargement refusé (${u.hostname})`)
      return { version: m[1], url: u.toString() }
    }
    throw new Error("la dernière release de uBlock Origin n'a pas de paquet « chromium.zip »")
  }

  async function installerUbo(): Promise<ResultatInstallation> {
    const release = await releaseUbo()
    const zip = await requete(release.url, hoteGithub, MAX_ARCHIVE)
    return depuisZip(zip, { source: 'zip', magasin: 'chrome' })
  }

  async function installerChrome(source: string): Promise<ResultatInstallation> {
    const a = analyserSourceChrome(source)
    if (!a) return echec('source non reconnue : identifiant, adresse du Chrome Web Store, fichier .crx ou .zip, ou dossier')
    try {
      switch (a.type) {
        case 'id':
        case 'url':
          return await installerCws(a.id as string)
        case 'ubo':
          return await installerUbo()
        case 'crx': {
          const { zip, cle } = lireCrx3(lireFichier(source.trim()))
          return await depuisZip(zip, { source: 'crx', magasin: 'inconnu', cle })
        }
        case 'zip':
          return await depuisZip(lireFichier(source.trim()), { source: 'zip', magasin: 'inconnu' })
        case 'dossier': {
          const attente = join(d.base, `.attente-${randomUUID().slice(0, 8)}`)
          try {
            mkdirSync(d.base, { recursive: true })
            copierDossier(source.trim(), attente)
            return await finaliser({ extrait: attente, source: 'dossier', magasin: 'inconnu' })
          } finally {
            rmSync(attente, { recursive: true, force: true })
          }
        }
      }
    } catch (e) {
      return echec(e instanceof ErreurArchive ? e.message : `installation impossible : ${message(e)}`)
    }
  }

  return { installerChrome, installerUbo: () => installerUbo().catch((e) => echec(`installation impossible : ${message(e)}`)), derniereVersionUbo: async () => (await releaseUbo()).version }
}
