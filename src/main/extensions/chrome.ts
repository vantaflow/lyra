/**
 * Installation d'extensions Chrome : Chrome Web Store (identifiant ou URL), fichier .crx / .zip, dossier décompressé et
 * uBlock Origin (release GitHub). Tout passe par l'extraction sûre de `archives.ts` puis par le registre et le chargeur.
 * Réseau : clients2.google.com (et ses redirections Google), api.github.com / github.com (uBO) ; délai de 30 s.
 */
import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { ExtensionInstallee, MagasinExtension, ResultatInstallation, SourceExtension } from '../../shared/types'
import { DELAI_RESEAU_MS, requeteSure } from './reseau'
import { copierDossier, extraireZip, idDepuisCle, verifierCrx3, MAX_ARCHIVE, ErreurArchive } from './archives'
import type { Chargeur } from './chargeur'
import { appliquerStubs, type ShimsStubs } from './stubs'
import { dossierAbsolu, dossierRelatifValide, ID_EXTENSION, type Registre } from './registre'

export { DELAI_RESEAU_MS }

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

const hoteCws = (h: string): boolean => h === 'clients2.google.com' || h === 'clients2.googleusercontent.com' || h.endsWith('.gvt1.com')
const hoteApiGithub = (h: string): boolean => h === 'api.github.com'
const hoteGithub = (h: string): boolean => h === 'github.com' || h === 'objects.githubusercontent.com' || h === 'release-assets.githubusercontent.com'

function urlCrx(id: string): string {
  const u = new URL('https://clients2.google.com/service/update2/crx')
  u.searchParams.set('response', 'redirect')
  u.searchParams.set('acceptformat', 'crx3')
  u.searchParams.set('x', new URLSearchParams({ id, uc: '' }).toString())
  u.searchParams.set('prodversion', process.versions.chrome ?? '131.0.6778.109')
  return u.toString()
}

function urlVersionCws(id: string): string {
  const u = new URL('https://clients2.google.com/service/update2/crx')
  u.searchParams.set('response', 'updatecheck')
  u.searchParams.set('acceptformat', 'crx3')
  u.searchParams.set('prodversion', process.versions.chrome ?? '131.0.6778.109')
  u.searchParams.set('x', new URLSearchParams({ id, uc: '' }).toString())
  return u.toString()
}

/** Version annoncée par la réponse XML de l'endpoint de mise à jour (`<updatecheck status="ok" version="…"/>`). */
export function versionDepuisReponseMaj(xml: string, id: string): string | undefined {
  // Balises `<app …>` une à une : une balise auto-fermante (`<app appid="…" status="error-…"/>`) n'a pas de corps et ne doit
  // pas happer l'`updatecheck` de l'application suivante.
  let corps: string | undefined
  for (const m of xml.matchAll(/<app\b([^>]*?)(\/?)>/g)) {
    if (!new RegExp(`\\bappid="${id}"`).test(m[1])) continue
    if (m[2] === '/') return undefined
    const debut = (m.index ?? 0) + m[0].length
    const fin = xml.indexOf('</app>', debut)
    corps = xml.slice(debut, fin < 0 ? undefined : fin)
    break
  }
  const balise = corps !== undefined ? /<updatecheck\b([^>]*)>/.exec(corps) : null
  if (!balise) return undefined
  if (!/\bstatus="ok"/.test(balise[1])) return undefined
  const v = /\bversion="([0-9][0-9.]{0,40})"/.exec(balise[1])
  return v?.[1]
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
  /** Shims MV2 (resources/extensions) : absents, aucun stub n'est injecté. */
  shims?: ShimsStubs
  /** Délai d'attente d'une requête, en ms (30 000 par défaut). */
  delaiMs?: number
}

export interface InstallateurChrome {
  installerChrome(source: string): Promise<ResultatInstallation>
  /** `miseAJour` : l'extension doit déjà être installée (une désinstallation entre-temps l'emporte). */
  installerUbo(miseAJour?: boolean): Promise<ResultatInstallation>
  /** Version de la dernière release GitHub de uBlock Origin. */
  derniereVersionUbo(): Promise<string>
  /** Version la plus récente d'une extension du Chrome Web Store (undefined si le magasin n'en propose pas). */
  versionDistanteCws(id: string): Promise<string | undefined>
  /** Retélécharge et réinstalle une extension du Chrome Web Store (même chemin que l'installation : bornes, signature, registre). */
  mettreAJourCws(id: string): Promise<ResultatInstallation>
}

export interface Finalisation {
  /** Dossier extrait (ou copié), éventuellement avec un sous-dossier racine. */
  extrait: string
  source: SourceExtension
  magasin: MagasinExtension
  /** Clé publique (DER) fournie par l'en-tête CRX. */
  cle?: Buffer
  idAttendu?: string
  /** Extension Firefox convertie. */
  convertie?: boolean
  /** Identifiant AMO (slug) de l'extension, pour les mises à jour. */
  slugAmo?: string
  /** Mise à jour : abandon si l'extension n'est plus au registre une fois le verrou pris (désinstallée entre-temps). */
  exigerInstallee?: boolean
}

/** « catalogue » (Chrome Web Store, AMO, uBlock Origin de Lyra) ou « local » (zip, crx, dossier, xpi) : deux provenances qui ne se remplacent pas. */
const provenance = (s: SourceExtension): 'catalogue' | 'local' => (s === 'cws' || s === 'amo' || s === 'ubo' ? 'catalogue' : 'local')
const origineTexte = (s: SourceExtension): string =>
  s === 'cws' ? 'le Chrome Web Store' : s === 'amo' ? 'addons.mozilla.org' : s === 'ubo' ? "l'installation de uBlock Origin par Lyra" : 'un fichier ou un dossier local'

/** Briques communes aux installateurs (Chrome, Firefox) : réseau borné, extraction, finalisation (registre + chargement). */
export function creerBaseInstallation(d: DepsInstallateurChrome) {
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
    // Paquet signé : un `key` du manifest qui n'est pas la clé signataire ferait prendre l'extension pour une autre.
    if (o.cle && typeof m.key === 'string' && m.key && !Buffer.from(m.key, 'base64').equals(o.cle)) return echec("la clé du manifest n'est pas celle qui signe le paquet")
    let cle = typeof m.key === 'string' && m.key ? m.key : o.cle?.toString('base64')
    if (!cle) cle = cleStable(nom, o.source)
    if (m.key !== cle) {
      m.key = cle
      writeFileSync(join(racine, 'manifest.json'), JSON.stringify(m, null, 2))
    }
    // Couche de compatibilité MV2 : avant tout renommage, le dossier est encore celui d'attente.
    if (d.shims) {
      try {
        appliquerStubs(racine, m as Record<string, unknown>, d.shims)
      } catch (err) {
        journal(`stubs MV2 non appliqués : ${message(err)}`)
      }
    }
    const id = idDepuisCle(cle)
    if (o.idAttendu && id !== o.idAttendu) return echec(`le paquet n'est pas celui demandé (identifiant ${id} au lieu de ${o.idAttendu})`)
    const version = m.version
    if (!dossierRelatifValide(`${id}/${version}`)) return echec(`version « ${version.slice(0, 40)} » illisible`)

    return d.chargeur.verrou(id, async () => {
      const precedente = d.registre.trouver(id)
      // Mise à jour : l'extension a pu être désinstallée entre la vérification et ici (le verrou rend la lecture fiable) ; elle ne ressuscite pas.
      if (o.exigerInstallee && !precedente) return echec("l'extension a été désinstallée pendant la mise à jour")
      // Même identité mais autre provenance (catalogue ↔ fichier ou dossier local) : jamais de remplacement silencieux.
      if (precedente && provenance(precedente.source) !== provenance(o.source)) {
        return echec(`ce paquet remplacerait l'extension ${precedente.nom} installée depuis ${origineTexte(precedente.source)} : désinstalle-la d'abord si c'est voulu`)
      }
      const cible = join(d.base, id, version)
      // Une version déjà chargée sous cet id est retirée de la session avant de charger la nouvelle (retrait de session seulement :
      // le registre garde « actif », une interruption ne désactive donc jamais l'extension).
      if (precedente) await d.chargeur.retirerSession(id)
      // Le dossier existant (même version) est mis de côté, pas supprimé : il revient si l'installation échoue.
      mkdirSync(join(d.base, id), { recursive: true })
      const ancien = existsSync(cible) ? `${cible}.ancien-${randomUUID().slice(0, 8)}` : undefined
      if (ancien) renameSync(cible, ancien)
      // Retour à l'état d'avant : chaque étape est protégée (une restauration qui échoue ne masque ni l'erreur d'origine ni les étapes suivantes).
      const restaurer = async (): Promise<void> => {
        const etape = async (etapeNom: string, f: () => unknown): Promise<void> => {
          try {
            await f()
          } catch (err) {
            journal(`${nom} ${version} : restauration incomplète (${etapeNom} : ${err instanceof Error ? err.message : String(err)})`)
          }
        }
        await etape('suppression', () => rmSync(cible, { recursive: true, force: true }))
        if (ancien) await etape('ancien dossier', () => renameSync(ancien, cible))
        if (precedente) {
          await etape('registre', () => d.registre.ajouter(precedente))
          if (precedente.active) await etape('rechargement', () => d.chargeur.charger(id))
        } else {
          await etape('registre', () => d.registre.retirer(id))
          await etape('dossier', () => rmSync(join(d.base, id), { recursive: true, force: true }))
        }
      }
      try {
        renameSync(racine, cible)
      } catch (err) {
        await restaurer()
        throw err
      }
      const maintenantIso = maintenant().toISOString()
      const entree: ExtensionInstallee = {
        id,
        nom,
        version,
        source: o.source,
        magasin: o.magasin,
        dossier: `${id}/${version}`,
        active: precedente?.active ?? true,
        ...(o.convertie ? { convertie: true } : {}),
        ...(o.slugAmo ? { slugAmo: o.slugAmo } : {}),
        installeeLe: precedente?.installeeLe ?? maintenantIso,
        miseAJourLe: maintenantIso
      }
      d.registre.ajouter(entree)
      if (entree.active) {
        const r = await d.chargeur.charger(id)
        if (!r.ok) {
          await restaurer()
          return echec(`chargement impossible : ${r.erreur ?? 'erreur inconnue'}`)
        }
      }
      if (ancien) rmSync(ancien, { recursive: true, force: true })
      // Versions antérieures : supprimées une fois la nouvelle en place.
      for (const v of readdirSync(join(d.base, id))) if (v !== version) rmSync(join(d.base, id, v), { recursive: true, force: true })
      journal(`${nom} ${version} installée (${o.source}, ${id})`)
      return { etat: 'installee', id, nom, version }
    })
  }

  /** Dossier d'attente sous `base` (même volume : le renommage final est atomique), supprimé à la fin quoi qu'il arrive. */
  async function enAttente<T>(travail: (attente: string) => Promise<T>): Promise<T> {
    const attente = join(d.base, `.attente-${randomUUID().slice(0, 8)}`)
    try {
      mkdirSync(d.base, { recursive: true })
      return await travail(attente)
    } finally {
      rmSync(attente, { recursive: true, force: true })
    }
  }

  /** Extrait le zip dans un dossier d'attente, puis finalise. */
  const depuisZip = (zip: Uint8Array, o: Omit<Finalisation, 'extrait'>): Promise<ResultatInstallation> =>
    enAttente(async (attente) => {
      extraireZip(zip, attente)
      return finaliser({ ...o, extrait: attente })
    })

  const lireFichier = (chemin: string): Uint8Array => {
    const st = statSync(chemin)
    if (!st.isFile()) throw new ErreurArchive("ce n'est pas un fichier")
    if (st.size > MAX_ARCHIVE) throw new ErreurArchive('fichier trop volumineux (128 Mio au plus)')
    return readFileSync(chemin)
  }

  const requete = (url: string, accepte: (hote: string) => boolean, max: number, entetes?: Record<string, string>): Promise<Uint8Array> =>
    requeteSure({ fetch: f, delaiMs: delai }, url, accepte, max, entetes)

  return { f, journal, echec, finaliser, enAttente, depuisZip, lireFichier, requete }
}

export function creerInstallateurChrome(d: DepsInstallateurChrome): InstallateurChrome {
  const { echec, enAttente, depuisZip, lireFichier, requete, finaliser } = creerBaseInstallation(d)

  async function installerCws(id: string, forcer = false): Promise<ResultatInstallation> {
    const deja = d.registre.trouver(id)
    if (!forcer && deja && deja.source === 'cws') return { etat: 'installee', id, nom: deja.nom, version: deja.version }
    const octets = await requete(urlCrx(id), hoteCws, MAX_ARCHIVE)
    // Signature vérifiée : une des preuves RSA porte la clé dont dérive l'identifiant demandé.
    const { zip, cle } = verifierCrx3(octets, id)
    return depuisZip(zip, { source: 'cws', magasin: 'chrome', cle, idAttendu: id, ...(forcer ? { exigerInstallee: true } : {}) })
  }

  async function versionDistanteCws(id: string): Promise<string | undefined> {
    if (!ID_EXTENSION.test(id)) return undefined
    const brut = await requete(urlVersionCws(id), hoteCws, 1024 * 1024)
    return versionDepuisReponseMaj(Buffer.from(brut).toString('utf8'), id)
  }

  interface Release {
    version: string
    url: string
  }
  async function releaseUbo(): Promise<Release> {
    const brut = await requete('https://api.github.com/repos/gorhill/uBlock/releases/latest', hoteApiGithub, 5 * 1024 * 1024, { accept: 'application/vnd.github+json' })
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

  async function installerUbo(miseAJour = false): Promise<ResultatInstallation> {
    const release = await releaseUbo()
    const zip = await requete(release.url, hoteGithub, MAX_ARCHIVE)
    return depuisZip(zip, { source: 'ubo', magasin: 'chrome', ...(miseAJour ? { exigerInstallee: true } : {}) })
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
          const { zip, cle } = verifierCrx3(lireFichier(source.trim()))
          return await depuisZip(zip, { source: 'crx', magasin: 'inconnu', cle })
        }
        case 'zip':
          return await depuisZip(lireFichier(source.trim()), { source: 'zip', magasin: 'inconnu' })
        case 'dossier':
          return await enAttente(async (attente) => {
            copierDossier(source.trim(), attente)
            return finaliser({ extrait: attente, source: 'dossier', magasin: 'inconnu' })
          })
      }
    } catch (e) {
      return echec(e instanceof ErreurArchive ? e.message : `installation impossible : ${message(e)}`)
    }
  }

  return { installerChrome, installerUbo: (miseAJour) => installerUbo(miseAJour === true).catch((e) => echec(`installation impossible : ${message(e)}`)), derniereVersionUbo: async () => (await releaseUbo()).version,
    versionDistanteCws,
    mettreAJourCws: (id) => installerCws(id, true).catch((e) => echec(`mise à jour impossible : ${message(e)}`))
  }
}
