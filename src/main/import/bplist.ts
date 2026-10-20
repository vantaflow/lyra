/**
 * Lecteur de plist Apple en JavaScript pur (aucune dépendance) : format binaire `bplist00` (cas principal : Safari,
 * Orion) et, pour les fixtures lisibles, plist XML minimal.
 *
 * Valeurs rendues : dict → objet simple sans prototype (`Object.create(null)`, donc `__proto__` n'est qu'une clé
 * comme une autre), array → tableau, string → string, int/real → number, bool → boolean, date → `Date`, data →
 * `Uint8Array`, uid → `UidPlist`, null → `null`, set → tableau.
 *
 * Entrée non fiable : toute structure invalide (offsets hors du fichier, tailles absurdes, récursion au-delà de 200
 * niveaux, références cycliques) lève une `ErreurImport` au message en français, jamais une `RangeError`.
 */
import { ErreurImport } from './types'

export type ValeurPlist = null | boolean | number | string | Date | Uint8Array | UidPlist | ValeurPlist[] | { [cle: string]: ValeurPlist }

/** Référence d'objet « UID » (archives NSKeyedArchiver) : sans autre sens ici que sa valeur. */
export class UidPlist {
  readonly valeur: number
  constructor(valeur: number) {
    this.valeur = valeur
  }
}

/** Profondeur maximale d'imbrication acceptée. */
export const PROFONDEUR_MAX_PLIST = 200
/** Nombre maximal d'objets décodés par plist (chacun une seule fois, grâce à la mémoïsation) : protège des fichiers hostiles aux références (ou aux objets) en nombre démesuré. */
export const NOEUDS_MAX = 5_000_000
/** Budget par défaut des octets produits par la lecture d'un plist binaire (voir `lireBplist`). */
export const BUDGET_OCTETS_PLIST = 64 * 1024 * 1024
/** Les dates plist comptent en secondes depuis le 1er janvier 2001 UTC. */
export const EPOQUE_APPLE_MS = Date.UTC(2001, 0, 1)

const corrompu = (detail: string, cause?: unknown): ErreurImport =>
  new ErreurImport(`Fichier plist corrompu ou d'un format inattendu (${detail}).`, cause === undefined ? undefined : { cause })

// ---------------------------------------------------------------------------------------------------------------------
// Binaire

const ENTETE = [0x62, 0x70, 0x6c, 0x69, 0x73, 0x74, 0x30, 0x30] // « bplist00 »

export const estBplist = (octets: Uint8Array): boolean => octets.length >= 8 && ENTETE.every((o, i) => octets[i] === o)

class LecteurBinaire {
  private readonly o: Uint8Array
  private readonly vue: DataView
  private readonly budget: number
  /** Objets déjà décodés, par index : un objet partagé (référencé N fois) n'est décodé et alloué qu'une fois. */
  private readonly memo = new Map<number, ValeurPlist>()
  /** Index en cours de décodage : en retrouver un en descendant, c'est un cycle. */
  private readonly enCours = new Set<number>()
  private depense = 0
  private noeuds = 0
  private tailleRef = 0
  private tailleOffset = 0
  private nbObjets = 0
  private debutTable = 0
  private finObjets = 0

  constructor(
    octets: Uint8Array,
    budget: number,
    private noeudsMax = NOEUDS_MAX
  ) {
    this.o = octets
    this.vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength)
    this.budget = budget
  }

  /** Décompte cumulé des octets produits (chaînes, données, éléments de conteneurs) : refuse au-delà du budget. */
  private depenser(octets: number): void {
    this.depense += octets
    if (this.depense > this.budget) {
      const limite = this.budget >= 1048576 ? `${Math.round(this.budget / 1048576)} Mo` : `${this.budget} octets`
      throw corrompu(`contenu décodé trop volumineux, plus de ${limite}`)
    }
  }

  /** Offset de l'objet `index`, lu dans la table à la demande (jamais matérialisée) et contrôlé. */
  private offsetObjet(index: number): number {
    if (!Number.isInteger(index) || index < 0 || index >= this.nbObjets) throw corrompu("référence d'objet invalide")
    const off = this.entier(this.debutTable + index * this.tailleOffset, this.tailleOffset)
    if (off < 8 || off >= this.debutTable) throw corrompu("offset d'objet hors du fichier")
    return off
  }

  /** Entier non signé big-endian de `n` octets (1 à 8) ; au-delà de 2^53 : refusé. */
  private entier(pos: number, n: number): number {
    if (n < 1 || n > 8 || pos < 0 || pos + n > this.o.length) throw corrompu('lecture hors du fichier')
    let v = 0
    for (let i = 0; i < n; i++) v = v * 256 + this.o[pos + i]
    if (!Number.isSafeInteger(v)) throw corrompu('entier trop grand')
    return v
  }

  lire(): ValeurPlist {
    const o = this.o
    if (!estBplist(o)) throw corrompu('en-tête « bplist00 » absent')
    if (o.length < 8 + 1 + 32) throw corrompu('fichier tronqué')
    const fin = o.length - 32
    const tailleOffset = o[fin + 6]
    this.tailleRef = o[fin + 7]
    if (tailleOffset < 1 || tailleOffset > 8 || this.tailleRef < 1 || this.tailleRef > 8) throw corrompu('tailles de la table invalides')
    const nbObjets = this.entier(fin + 8, 8)
    const racine = this.entier(fin + 16, 8)
    const debutTable = this.entier(fin + 24, 8)
    if (nbObjets < 1 || racine >= nbObjets) throw corrompu('objet racine invalide')
    if (debutTable < 9 || debutTable > fin || nbObjets > (fin - debutTable) / tailleOffset) throw corrompu('table des offsets hors du fichier')
    this.tailleOffset = tailleOffset
    this.nbObjets = nbObjets
    this.debutTable = debutTable
    this.finObjets = debutTable
    return this.objet(racine, 0)
  }

  /** Taille d'un objet (4 bits de poids faible du marqueur, ou entier qui suit si 0xF) → [taille, position des données]. */
  private taille(pos: number, bas: number): [number, number] {
    if (bas !== 0xf) return [bas, pos + 1]
    if (pos + 1 >= this.finObjets) throw corrompu('taille hors du fichier')
    const m = this.o[pos + 1]
    if (m >> 4 !== 1) throw corrompu('taille mal formée')
    const n = 1 << (m & 0xf)
    if (n > 8) throw corrompu('taille trop grande')
    return [this.entier(pos + 2, n), pos + 2 + n]
  }

  private verifier(debut: number, longueur: number): void {
    if (!Number.isSafeInteger(longueur) || longueur < 0 || debut + longueur > this.finObjets) throw corrompu('objet débordant du fichier')
  }

  /** Valeur de l'objet `index` : mémoïsée (chaque objet est décodé une seule fois), cycles refusés. */
  private objet(index: number, profondeur: number): ValeurPlist {
    if (profondeur > PROFONDEUR_MAX_PLIST) throw corrompu(`imbrication au-delà de ${PROFONDEUR_MAX_PLIST} niveaux`)
    const pos = this.offsetObjet(index) // valide aussi l'index
    if (this.memo.has(index)) return this.memo.get(index) as ValeurPlist
    if (this.enCours.has(index)) throw corrompu('référence cyclique')
    if (++this.noeuds > this.noeudsMax) throw corrompu("trop d'objets")
    this.enCours.add(index)
    try {
      const valeur = this.decoder(pos, profondeur)
      this.memo.set(index, valeur)
      return valeur
    } finally {
      this.enCours.delete(index)
    }
  }

  private decoder(pos: number, profondeur: number): ValeurPlist {
    const marqueur = this.o[pos]
    const haut = marqueur >> 4
    const bas = marqueur & 0xf
    switch (haut) {
      case 0x0:
        if (bas === 0x0) return null
        if (bas === 0x8) return false
        if (bas === 0x9) return true
        throw corrompu('valeur simple inconnue')
      case 0x1: {
        if (bas > 4) throw corrompu('entier trop large')
        const n = 1 << bas
        this.verifier(pos + 1, n)
        if (n === 8) return Number(this.vue.getBigInt64(pos + 1)) // seul cas signé du format
        if (n === 16) return Number(this.vue.getBigInt64(pos + 9)) // 128 bits : poids faible seulement
        return this.entier(pos + 1, n)
      }
      case 0x2: {
        if (bas > 4) throw corrompu('nombre réel de taille inconnue')
        const n = 1 << bas
        this.verifier(pos + 1, n)
        if (n === 4) return this.vue.getFloat32(pos + 1)
        if (n === 8) return this.vue.getFloat64(pos + 1)
        throw corrompu('nombre réel de taille inconnue')
      }
      case 0x3: {
        if (bas !== 3) throw corrompu('date de taille inconnue')
        this.verifier(pos + 1, 8)
        return new Date(EPOQUE_APPLE_MS + this.vue.getFloat64(pos + 1) * 1000)
      }
      case 0x4: {
        const [n, debut] = this.taille(pos, bas)
        this.verifier(debut, n)
        this.depenser(n)
        return new Uint8Array(this.o.subarray(debut, debut + n)) // copie (un Buffer renverrait une simple vue)
      }
      case 0x5: {
        const [n, debut] = this.taille(pos, bas)
        this.verifier(debut, n)
        this.depenser(n)
        let s = ''
        for (let i = 0; i < n; i += 8192) s += String.fromCharCode(...this.o.subarray(debut + i, debut + Math.min(n, i + 8192)))
        return s
      }
      case 0x6: {
        const [n, debut] = this.taille(pos, bas)
        this.verifier(debut, n * 2)
        this.depenser(n * 2)
        let s = ''
        const unites: number[] = []
        for (let i = 0; i < n; i++) {
          unites.push(this.vue.getUint16(debut + i * 2))
          if (unites.length === 4096) {
            s += String.fromCharCode(...unites)
            unites.length = 0
          }
        }
        return s + String.fromCharCode(...unites)
      }
      case 0x8:
        if (bas > 7) throw corrompu('UID trop large')
        this.verifier(pos + 1, bas + 1)
        return new UidPlist(this.entier(pos + 1, bas + 1))
      case 0xa:
      case 0xc: {
        const [n, debut] = this.taille(pos, bas)
        this.verifier(debut, n * this.tailleRef)
        this.depenser(n * 8)
        const liste: ValeurPlist[] = []
        for (let i = 0; i < n; i++) liste.push(this.objet(this.entier(debut + i * this.tailleRef, this.tailleRef), profondeur + 1))
        return liste
      }
      case 0xd: {
        const [n, debut] = this.taille(pos, bas)
        this.verifier(debut, n * this.tailleRef * 2)
        this.depenser(n * 16)
        const dict: { [cle: string]: ValeurPlist } = Object.create(null) as { [cle: string]: ValeurPlist }
        for (let i = 0; i < n; i++) {
          const cle = this.objet(this.entier(debut + i * this.tailleRef, this.tailleRef), profondeur + 1)
          const valeur = this.objet(this.entier(debut + (n + i) * this.tailleRef, this.tailleRef), profondeur + 1)
          dict[String(cle)] = valeur
        }
        return dict
      }
      default:
        throw corrompu("type d'objet inconnu")
    }
  }
}

/**
 * Lit un plist binaire `bplist00`. `budgetOctets` borne le total des octets produits (chaînes, données, éléments de
 * tableaux et de dictionnaires) : un fichier hostile ne peut pas gonfler la mémoire du processus principal.
 */
/** `noeudsMax` : plafond d'objets décodés (tests seulement ; `NOEUDS_MAX` par défaut). */
export function lireBplist(octets: Uint8Array, budgetOctets = BUDGET_OCTETS_PLIST, noeudsMax = NOEUDS_MAX): ValeurPlist {
  try {
    return new LecteurBinaire(octets, budgetOctets, noeudsMax).lire()
  } catch (e) {
    if (e instanceof ErreurImport) throw e
    throw corrompu('lecture impossible', e) // filet de sécurité : jamais de RangeError vers l'appelant
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// XML (minimal : dict, array, string, integer, real, true, false, date, data)

const ENTITES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }

function decoderEntites(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (tout, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : tout
    }
    return ENTITES[e] ?? tout
  })
}

interface Balise {
  nom: string
  ouvrante: boolean
  fermante: boolean
}

class LecteurXml {
  private readonly t: string
  private pos = 0
  private noeuds = 0

  constructor(texte: string) {
    this.t = texte
  }

  lire(): ValeurPlist {
    this.sauterProlog()
    const b = this.balise()
    if (!b || b.nom !== 'plist' || !b.ouvrante) throw corrompu('balise <plist> absente')
    if (b.fermante) throw corrompu('plist vide')
    const v = this.valeur(0)
    const fin = this.balise()
    if (!fin || fin.nom !== 'plist' || fin.ouvrante) throw corrompu('balise </plist> absente')
    return v
  }

  private sauterProlog(): void {
    const t = this.t
    for (;;) {
      while (this.pos < t.length && /\s/.test(t[this.pos])) this.pos++
      if (t.startsWith('<?', this.pos)) {
        const f = t.indexOf('?>', this.pos)
        if (f < 0) throw corrompu('déclaration XML non terminée')
        this.pos = f + 2
      } else if (t.startsWith('<!--', this.pos)) {
        const f = t.indexOf('-->', this.pos)
        if (f < 0) throw corrompu('commentaire non terminé')
        this.pos = f + 3
      } else if (t.startsWith('<!DOCTYPE', this.pos)) {
        const f = t.indexOf('>', this.pos)
        if (f < 0) throw corrompu('DOCTYPE non terminé')
        this.pos = f + 1
      } else return
    }
  }

  /** Lit la prochaine balise (après avoir sauté espaces et commentaires) ; `undefined` en fin de texte. */
  private balise(): Balise | undefined {
    const t = this.t
    for (;;) {
      while (this.pos < t.length && /\s/.test(t[this.pos])) this.pos++
      if (t.startsWith('<!--', this.pos)) {
        const f = t.indexOf('-->', this.pos)
        if (f < 0) throw corrompu('commentaire non terminé')
        this.pos = f + 3
        continue
      }
      break
    }
    if (this.pos >= t.length) return undefined
    if (t[this.pos] !== '<') throw corrompu('texte inattendu entre deux balises')
    const f = t.indexOf('>', this.pos)
    if (f < 0) throw corrompu('balise non terminée')
    const brut = t.slice(this.pos + 1, f)
    this.pos = f + 1
    const m = /^(\/?)([A-Za-z][A-Za-z0-9]*)[^>]*?(\/?)$/.exec(brut)
    if (!m) throw corrompu('balise mal formée')
    return { nom: m[2], ouvrante: m[1] === '', fermante: m[1] === '/' || m[3] === '/' }
  }

  /** Texte jusqu'à la balise fermante `</nom>` (CDATA géré). */
  private texte(nom: string): string {
    const t = this.t
    let brut = ''
    for (;;) {
      const lt = t.indexOf('<', this.pos)
      if (lt < 0) throw corrompu(`balise <${nom}> non fermée`)
      brut += decoderEntites(t.slice(this.pos, lt))
      if (t.startsWith('<![CDATA[', lt)) {
        const f = t.indexOf(']]>', lt)
        if (f < 0) throw corrompu('CDATA non terminé')
        brut += t.slice(lt + 9, f)
        this.pos = f + 3
        continue
      }
      this.pos = lt
      break
    }
    const fin = this.balise()
    if (!fin || fin.ouvrante || fin.nom !== nom) throw corrompu(`balise </${nom}> attendue`)
    return brut
  }

  private valeur(profondeur: number): ValeurPlist {
    if (profondeur > PROFONDEUR_MAX_PLIST) throw corrompu(`imbrication au-delà de ${PROFONDEUR_MAX_PLIST} niveaux`)
    if (++this.noeuds > NOEUDS_MAX) throw corrompu("trop d'objets")
    const b = this.balise()
    if (!b || !b.ouvrante) throw corrompu('valeur attendue')
    switch (b.nom) {
      case 'true':
        return true
      case 'false':
        return false
      case 'string':
        return b.fermante ? '' : this.texte('string')
      case 'integer': {
        const n = Number(this.texte('integer').trim())
        if (!Number.isFinite(n)) throw corrompu('entier invalide')
        return n
      }
      case 'real': {
        const s = this.texte('real').trim()
        const n = s === 'nan' ? NaN : s === 'inf' ? Infinity : s === '-inf' ? -Infinity : Number(s)
        if (Number.isNaN(n) && s !== 'nan') throw corrompu('réel invalide')
        return n
      }
      case 'date': {
        const d = new Date(this.texte('date').trim())
        if (Number.isNaN(d.getTime())) throw corrompu('date invalide')
        return d
      }
      case 'data': {
        const s = this.texte('data').replace(/\s+/g, '')
        return Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
      }
      case 'array': {
        const liste: ValeurPlist[] = []
        if (b.fermante) return liste
        for (;;) {
          const p = this.pos
          const suite = this.balise()
          if (!suite) throw corrompu('<array> non fermé')
          if (!suite.ouvrante) {
            if (suite.nom !== 'array') throw corrompu('</array> attendu')
            return liste
          }
          this.pos = p
          liste.push(this.valeur(profondeur + 1))
        }
      }
      case 'dict': {
        const dict: { [cle: string]: ValeurPlist } = Object.create(null) as { [cle: string]: ValeurPlist }
        if (b.fermante) return dict
        for (;;) {
          const k = this.balise()
          if (!k) throw corrompu('<dict> non fermé')
          if (!k.ouvrante) {
            if (k.nom !== 'dict') throw corrompu('</dict> attendu')
            return dict
          }
          if (k.nom !== 'key') throw corrompu('<key> attendu dans un <dict>')
          const cle = k.fermante ? '' : this.texte('key')
          dict[cle] = this.valeur(profondeur + 1)
        }
      }
      default:
        throw corrompu(`balise <${b.nom}> non gérée`)
    }
  }
}

/** Lit un plist XML (texte). */
export function lirePlistXml(texte: string): ValeurPlist {
  try {
    return new LecteurXml(texte.replace(/^﻿/, '')).lire()
  } catch (e) {
    if (e instanceof ErreurImport) throw e
    throw corrompu('lecture XML impossible', e)
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Entrée commune

/** Lit un plist binaire (`bplist00`) ou XML (`<?xml` / `<plist`) ; `ErreurImport` pour tout autre contenu. */
export function lirePlist(octets: Uint8Array): ValeurPlist {
  if (estBplist(octets)) return lireBplist(octets)
  const debut = new TextDecoder('utf-8').decode(octets.subarray(0, 512)).replace(/^﻿/, '').trimStart()
  if (debut.startsWith('<?xml') || debut.startsWith('<plist') || debut.startsWith('<!DOCTYPE plist')) {
    return lirePlistXml(new TextDecoder('utf-8').decode(octets))
  }
  throw corrompu('ni plist binaire ni plist XML')
}
