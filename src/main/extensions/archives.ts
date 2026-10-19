/**
 * Archives d'extensions : lecture de l'en-tête CRX3, extraction sûre d'un zip (pure JS, `fflate`) et copie d'un dossier.
 * Aucune dépendance à Electron. Tout refus lève `ErreurArchive` (message lisible), jamais autre chose.
 */
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { Inflate } from 'fflate'

export const MAX_ENTREES = 10_000
export const MAX_OCTETS = 128 * 1024 * 1024
/** Taille maximale d'un CRX3 ou d'un zip lu en mémoire. */
export const MAX_ARCHIVE = 128 * 1024 * 1024
const MAX_ENTETE_CRX = 1024 * 1024

export class ErreurArchive extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ErreurArchive'
  }
}

export interface LimitesArchive {
  entrees?: number
  /** Octets décompressés, annoncés ou réels. */
  octets?: number
}

const enLettres = (hex: string): string => [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('')

function idDepuisOctets(octets: Uint8Array): string {
  return enLettres(createHash('sha256').update(octets).digest('hex').slice(0, 32))
}

/** Id Chrome d'une extension à clé : sha256 de la clé publique (DER, en base64), 16 premiers octets → lettres a-p. */
export function idDepuisCle(cleBase64: string): string {
  return idDepuisOctets(Buffer.from(cleBase64, 'base64'))
}

// ---------------------------------------------------------------------------------------------------------- CRX3

/** Lecteur protobuf minimal (varint, champs délimités) pour l'en-tête CRX3. */
function champsProto(b: Uint8Array): Array<{ num: number; octets?: Uint8Array }> {
  const sortie: Array<{ num: number; octets?: Uint8Array }> = []
  let i = 0
  const varint = (): number => {
    let v = 0
    for (let decal = 0; decal < 35; decal += 7) {
      if (i >= b.length) throw new Error('fin inattendue')
      const o = b[i++]
      v += (o & 0x7f) * 2 ** decal
      if (!(o & 0x80)) return v
    }
    throw new Error('varint trop long')
  }
  while (i < b.length) {
    const tag = varint()
    const type = tag % 8
    const num = Math.floor(tag / 8)
    if (num === 0) throw new Error('champ 0')
    if (type === 2) {
      const n = varint()
      if (i + n > b.length) throw new Error('champ tronqué')
      sortie.push({ num, octets: b.subarray(i, i + n) })
      i += n
    } else if (type === 0) {
      varint()
    } else if (type === 1) {
      i += 8
    } else if (type === 5) {
      i += 4
    } else throw new Error('type protobuf inconnu')
  }
  return sortie
}

/** Clé publique (DER) de l'en-tête dont l'id correspond au `crx_id` déclaré, sinon la première clé RSA ; undefined si illisible. */
function cleDeEntete(entete: Uint8Array): Buffer | undefined {
  try {
    const champs = champsProto(entete)
    const cles = champs
      .filter((c) => c.num === 2 && c.octets)
      .map((c) => champsProto(c.octets!).find((p) => p.num === 1)?.octets)
      .filter((k): k is Uint8Array => k !== undefined && k.length > 0)
    const signe = champs.find((c) => c.num === 10000)?.octets
    const crxId = signe ? champsProto(signe).find((c) => c.num === 1)?.octets : undefined
    const attendu = crxId && crxId.length === 16 ? enLettres(Buffer.from(crxId).toString('hex')) : undefined
    const choisie = (attendu && cles.find((k) => idDepuisOctets(k) === attendu)) || cles[0]
    return choisie ? Buffer.from(choisie) : undefined
  } catch {
    return undefined
  }
}

/** CRX3 → zip (payload) et clé publique de l'extension si l'en-tête la donne. Refuse tout autre format. */
export function lireCrx3(octets: Uint8Array): { zip: Uint8Array; cle?: Buffer } {
  if (octets.length < 12) throw new ErreurArchive('fichier .crx trop court')
  const v = new DataView(octets.buffer, octets.byteOffset, octets.byteLength)
  if (v.getUint32(0, false) !== 0x43723234) throw new ErreurArchive("ce fichier n'est pas un .crx (en-tête « Cr24 » absent)")
  const version = v.getUint32(4, true)
  if (version !== 3) throw new ErreurArchive(`format .crx version ${version} non pris en charge (version 3 attendue)`)
  const tailleEntete = v.getUint32(8, true)
  if (tailleEntete > MAX_ENTETE_CRX || 12 + tailleEntete >= octets.length) throw new ErreurArchive("taille d'en-tête .crx invalide")
  const zip = octets.subarray(12 + tailleEntete)
  if (!(zip[0] === 0x50 && zip[1] === 0x4b && ((zip[2] === 3 && zip[3] === 4) || (zip[2] === 5 && zip[3] === 6)))) {
    throw new ErreurArchive("le contenu du .crx n'est pas une archive zip")
  }
  return { zip, cle: cleDeEntete(octets.subarray(12, 12 + tailleEntete)) }
}

// ---------------------------------------------------------------------------------------------------------- ZIP

interface EntreeZip {
  nom: string
  methode: number
  tailleCompressee: number
  tailleReelle: number
  decalageLocal: number
  lien: boolean
}

/** Répertoire central du zip (EOCD → entrées) : seule source de confiance pour les contrôles avant écriture. */
function lireRepertoire(zip: Uint8Array, limites: Required<LimitesArchive>): EntreeZip[] {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  let eocd = -1
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65_535); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new ErreurArchive('archive zip illisible (fin de répertoire introuvable)')
  const total = v.getUint16(eocd + 10, true)
  const tailleRep = v.getUint32(eocd + 12, true)
  const decalageRep = v.getUint32(eocd + 16, true)
  if (total === 0xffff || tailleRep === 0xffffffff || decalageRep === 0xffffffff) throw new ErreurArchive('archives zip64 non prises en charge')
  if (total > limites.entrees) throw new ErreurArchive(`archive refusée : plus de ${limites.entrees} entrées`)
  if (decalageRep + tailleRep > zip.length) throw new ErreurArchive("répertoire zip hors de l'archive")
  const entrees: EntreeZip[] = []
  let annonce = 0
  let p = decalageRep
  for (let n = 0; n < total; n++) {
    if (p + 46 > zip.length || v.getUint32(p, true) !== 0x02014b50) throw new ErreurArchive('répertoire zip corrompu')
    const faitPar = v.getUint16(p + 4, true)
    const attributs = v.getUint32(p + 38, true)
    const lgNom = v.getUint16(p + 28, true)
    const lgExtra = v.getUint16(p + 30, true)
    const lgComm = v.getUint16(p + 32, true)
    if (p + 46 + lgNom > zip.length) throw new ErreurArchive('répertoire zip corrompu')
    const nom = Buffer.from(zip.subarray(p + 46, p + 46 + lgNom)).toString('utf8')
    const tailleReelle = v.getUint32(p + 24, true)
    annonce += tailleReelle
    if (annonce > limites.octets) throw new ErreurArchive(`archive refusée : plus de ${Math.round(limites.octets / 1048576)} Mio décompressés annoncés`)
    entrees.push({
      nom,
      methode: v.getUint16(p + 10, true),
      tailleCompressee: v.getUint32(p + 20, true),
      tailleReelle,
      decalageLocal: v.getUint32(p + 42, true),
      lien: faitPar >> 8 === 3 && ((attributs >>> 16) & 0o170000) === 0o120000
    })
    p += 46 + lgNom + lgExtra + lgComm
  }
  return entrees
}

/** Segments d'un nom d'entrée ; lève si le chemin est absolu, remonte (`..`) ou contient un caractère interdit. */
function segmentsSurs(nom: string): string[] {
  const n = nom.replace(/\\/g, '/')
  if (n.includes('\0')) throw new ErreurArchive(`nom d'entrée invalide : ${JSON.stringify(nom)}`)
  if (n.startsWith('/') || /^[A-Za-z]:/.test(n)) throw new ErreurArchive(`chemin absolu refusé : ${nom}`)
  const segments = n.split('/').filter((s) => s !== '' && s !== '.')
  if (segments.some((s) => s === '..')) throw new ErreurArchive(`chemin avec « .. » refusé : ${nom}`)
  if (segments.some((s) => s.includes(':'))) throw new ErreurArchive(`nom d'entrée invalide : ${nom}`)
  return segments
}

function decompresser(zip: Uint8Array, e: EntreeZip, restant: { octets: number }): Uint8Array {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const o = e.decalageLocal
  if (o + 30 > zip.length || v.getUint32(o, true) !== 0x04034b50) throw new ErreurArchive(`en-tête local introuvable pour ${e.nom}`)
  const debut = o + 30 + v.getUint16(o + 26, true) + v.getUint16(o + 28, true)
  if (debut + e.tailleCompressee > zip.length) throw new ErreurArchive(`données tronquées pour ${e.nom}`)
  const donnees = zip.subarray(debut, debut + e.tailleCompressee)
  const morceaux: Uint8Array[] = []
  let n = 0
  const ajouter = (c: Uint8Array): void => {
    n += c.length
    restant.octets -= c.length
    if (restant.octets < 0) throw new ErreurArchive('archive refusée : taille décompressée réelle au-delà de la limite')
    morceaux.push(c)
  }
  if (e.methode === 0) ajouter(donnees)
  else if (e.methode === 8) {
    const inf = new Inflate((c) => ajouter(c))
    try {
      inf.push(donnees, true)
    } catch (err) {
      if (err instanceof ErreurArchive) throw err
      throw new ErreurArchive(`données corrompues pour ${e.nom}`)
    }
  } else throw new ErreurArchive(`méthode de compression ${e.methode} non prise en charge (${e.nom})`)
  if (n !== e.tailleReelle) throw new ErreurArchive(`taille annoncée incohérente pour ${e.nom}`)
  return Buffer.concat(morceaux)
}

function sousDossier(parent: string, segments: string[]): string {
  const racine = resolve(parent)
  const chemin = resolve(racine, ...segments)
  if (chemin !== racine && !chemin.startsWith(racine + sep)) throw new ErreurArchive(`chemin hors du dossier cible : ${segments.join('/')}`)
  return chemin
}

/** Écrit sous `<cible>.tmp-…` puis renomme : en cas de refus, rien ne reste. Remplace `cible` si elle existe. */
function ecrireAtomique(cible: string, remplir: (tmp: string) => void): void {
  const dest = resolve(cible)
  const tmp = `${dest}.tmp-${randomUUID().slice(0, 8)}`
  try {
    mkdirSync(tmp, { recursive: true })
    remplir(tmp)
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
    mkdirSync(dirname(dest), { recursive: true })
    renameSync(tmp, dest)
  } catch (err) {
    rmSync(tmp, { recursive: true, force: true })
    throw err instanceof ErreurArchive ? err : new ErreurArchive(`extraction impossible : ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Extrait un zip sous `cible`. Refus : `..`, chemins absolus, liens symboliques, plus de 10 000 entrées, plus de 128 Mio
 * décompressés (annoncés ou réels), doublons, archive illisible. Tous les contrôles d'en-tête précèdent la première écriture.
 */
export function extraireZip(zip: Uint8Array, cible: string, limites: LimitesArchive = {}): void {
  const lim = { entrees: limites.entrees ?? MAX_ENTREES, octets: limites.octets ?? MAX_OCTETS }
  if (zip.length > MAX_ARCHIVE) throw new ErreurArchive('archive trop volumineuse')
  const entrees = lireRepertoire(zip, lim)
  for (const e of entrees) {
    if (e.lien) throw new ErreurArchive(`lien symbolique refusé : ${e.nom}`)
    segmentsSurs(e.nom)
  }
  ecrireAtomique(cible, (tmp) => {
    const restant = { octets: lim.octets }
    for (const e of entrees) {
      const segments = segmentsSurs(e.nom)
      if (segments.length === 0) continue
      if (/[\\/]$/.test(e.nom)) {
        mkdirSync(sousDossier(tmp, segments), { recursive: true })
        continue
      }
      const chemin = sousDossier(tmp, segments)
      const contenu = decompresser(zip, e, restant)
      mkdirSync(dirname(chemin), { recursive: true })
      try {
        writeFileSync(chemin, contenu, { flag: 'wx' })
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'EEXIST') throw new ErreurArchive(`entrée en double refusée : ${e.nom}`)
        throw err
      }
    }
  })
}

/** Copie un dossier décompressé sous `cible` (mêmes bornes que l'extraction ; les liens symboliques sont refusés). */
export function copierDossier(source: string, cible: string, limites: LimitesArchive = {}): void {
  const lim = { entrees: limites.entrees ?? MAX_ENTREES, octets: limites.octets ?? MAX_OCTETS }
  ecrireAtomique(cible, (tmp) => {
    let entrees = 0
    let octets = 0
    const marcher = (src: string, dst: string): void => {
      for (const nom of readdirSync(src)) {
        if (++entrees > lim.entrees) throw new ErreurArchive(`dossier refusé : plus de ${lim.entrees} entrées`)
        const s = join(src, nom)
        const d = join(dst, nom)
        const st = lstatSync(s)
        if (st.isSymbolicLink()) throw new ErreurArchive(`lien symbolique refusé : ${nom}`)
        if (st.isDirectory()) {
          mkdirSync(d)
          marcher(s, d)
        } else if (st.isFile()) {
          octets += st.size
          if (octets > lim.octets) throw new ErreurArchive(`dossier refusé : plus de ${Math.round(lim.octets / 1048576)} Mio`)
          writeFileSync(d, readFileSync(s))
        }
      }
    }
    if (!lstatSync(source).isDirectory()) throw new ErreurArchive("la source n'est pas un dossier")
    marcher(source, tmp)
  })
}
