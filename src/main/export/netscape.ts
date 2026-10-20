/**
 * Favoris au format « Netscape Bookmark » (le HTML que tous les navigateurs savent importer et exporter).
 * Pur (sans Electron) : export à partir de la liste de Lyra, lecture tolérante vers l'arbre neutre de l'import.
 * Le dossier d'un favori Lyra est un chemin « A / B / C » (voir `appliquerFavoris`).
 */
import type { Favori } from '../bookmarks/Bookmarks'
import type { DossierFavori, FavorisImportes, NoeudFavori } from '../import/types'

const SEPARATEUR = ' / '
const PROFONDEUR_MAX = 64

const echapper = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const NOMMEES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë', agrave: 'à', acirc: 'â', auml: 'ä', ccedil: 'ç', icirc: 'î', iuml: 'ï', ocirc: 'ô', ouml: 'ö', ugrave: 'ù', ucirc: 'û', uuml: 'ü', yuml: 'ÿ',
  Eacute: 'É', Egrave: 'È', Ecirc: 'Ê', Euml: 'Ë', Agrave: 'À', Acirc: 'Â', Auml: 'Ä', Ccedil: 'Ç', Icirc: 'Î', Iuml: 'Ï', Ocirc: 'Ô', Ouml: 'Ö', Ugrave: 'Ù', Ucirc: 'Û', Uuml: 'Ü', Yuml: 'Ÿ',
  laquo: '«', raquo: '»', hellip: '…', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', euro: '€'
}

function decoder(s: string): string {
  return s.replace(/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z]+));/g, (m, dec: string | undefined, hex: string | undefined, nom: string | undefined) => {
    if (nom) return NOMMEES[nom] ?? m
    const code = dec !== undefined ? parseInt(dec, 10) : parseInt(hex!, 16)
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : m
  })
}

// --- Export ----------------------------------------------------------------------------------------------------------

interface NoeudSortie {
  dossiers: Map<string, NoeudSortie>
  /** Dans l'ordre d'apparition : un favori ou un sous-dossier (par son nom). */
  ordre: Array<Favori | string>
}

const nouveau = (): NoeudSortie => ({ dossiers: new Map(), ordre: [] })

export function exporterFavorisHtml(favoris: Favori[]): string {
  const racine = nouveau()
  for (const f of favoris) {
    let n = racine
    for (const nom of (f.dossier ?? '').split(SEPARATEUR).map((x) => x.trim()).filter(Boolean)) {
      let sous = n.dossiers.get(nom)
      if (!sous) {
        sous = nouveau()
        n.dossiers.set(nom, sous)
        n.ordre.push(nom)
      }
      n = sous
    }
    n.ordre.push(f)
  }
  const sortie: string[] = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- Fichier généré par Lyra. Importable dans tous les navigateurs. -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Favoris</TITLE>',
    '<H1>Favoris</H1>'
  ]
  const ecrire = (n: NoeudSortie, indent: string): void => {
    sortie.push(`${indent}<DL><p>`)
    for (const e of n.ordre) {
      if (typeof e === 'string') {
        sortie.push(`${indent}    <DT><H3>${echapper(e)}</H3>`)
        ecrire(n.dossiers.get(e)!, `${indent}    `)
      } else {
        const date = e.date > 0 ? ` ADD_DATE="${Math.floor(e.date / 1000)}"` : ''
        sortie.push(`${indent}    <DT><A HREF="${echapper(e.url)}"${date}>${echapper(e.title)}</A>`)
      }
    }
    sortie.push(`${indent}</DL><p>`)
  }
  ecrire(racine, '')
  return sortie.join('\n') + '\n'
}

// --- Lecture ---------------------------------------------------------------------------------------------------------

const ESPACE = /\s/

interface Balise {
  ferme: boolean
  nom: string
  /** Seulement `href` et `add_date`, décodés. */
  attr: Map<string, string>
  /** Position du `>` qui la termine. */
  fin: number
}

/**
 * Lit la balise qui commence à `i` (un « < »), sans regex à retour arrière : chaque caractère est vu une fois.
 * Un `>` entre guillemets (valeur d'attribut) ne termine pas la balise ; `null` si la balise n'est jamais fermée.
 */
function lireBalise(html: string, i: number): Balise | null {
  const n = html.length
  let k = i + 1
  const ferme = html[k] === '/'
  if (ferme) k++
  const debutNom = k
  while (k < n && /[a-zA-Z0-9]/.test(html[k])) k++
  const nom = html.slice(debutNom, k).toLowerCase()
  const attr = new Map<string, string>()
  if (nom === '' || !/^[a-z]/.test(nom)) {
    const fin = html.indexOf('>', i)
    return fin === -1 ? null : { ferme, nom: '', attr, fin }
  }
  while (k < n) {
    const c = html[k]
    if (c === '>') return { ferme, nom, attr, fin: k }
    if (ESPACE.test(c) || c === '/') {
      k++
      continue
    }
    const debut = k
    while (k < n && !ESPACE.test(html[k]) && html[k] !== '=' && html[k] !== '>' && html[k] !== '/') k++
    if (k === debut) k++ // caractère isolé (guillemet, « = » sans nom) : on avance toujours
    const cle = html.slice(debut, k).toLowerCase()
    while (k < n && ESPACE.test(html[k])) k++
    if (html[k] !== '=') continue
    k++
    while (k < n && ESPACE.test(html[k])) k++
    let valeur: string
    if (html[k] === '"' || html[k] === "'") {
      const fin = html.indexOf(html[k], k + 1)
      if (fin === -1) return null
      valeur = html.slice(k + 1, fin)
      k = fin + 1
    } else {
      const d = k
      while (k < n && !ESPACE.test(html[k]) && html[k] !== '>') k++
      valeur = html.slice(d, k)
    }
    if ((cle === 'href' || cle === 'add_date') && !attr.has(cle)) attr.set(cle, decoder(valeur))
  }
  return null
}

function dateMs(brut: string | undefined): number {
  const n = Number(brut)
  if (!Number.isFinite(n) || n <= 0) return 0
  if (n < 1e11) return Math.round(n * 1000)
  return n < 1e14 ? Math.round(n) : 0
}

/** Retire les balises d'un texte, en une seule passe ; un « < » sans « > » reste du texte. */
function sansBalises(s: string): string {
  let sortie = ''
  let depuis = 0
  for (;;) {
    const i = s.indexOf('<', depuis)
    if (i === -1) break
    const j = s.indexOf('>', i)
    if (j === -1) break
    sortie += s.slice(depuis, i)
    depuis = j + 1
  }
  return sortie + s.slice(depuis)
}

/**
 * Lecture tolérante et linéaire : l'analyse avance toujours (un « > » cherché par balise, la prochaine fermeture
 * mémorisée une seule fois), tout ce qui n'est pas un lien ou un dossier est ignoré, la profondeur est bornée.
 */
export function lireFavorisHtml(html: string): FavorisImportes {
  const racine: NoeudFavori[] = []
  const pile: NoeudFavori[][] = [racine]
  let enTrop = 0
  let attente: DossierFavori | undefined
  // Copie en minuscules ASCII (mêmes positions que le texte d'origine) pour chercher les fermetures.
  const bas = html.replace(/[A-Z]/g, (c) => c.toLowerCase())
  const fermeture = { a: { de: -1, a: -1 }, h3: { de: -1, a: -1 } }
  /** Première `</nom\s*>` à partir de `depuis` (`</abbr>` n'est pas `</a>`) ; mémorisée tant qu'on ne l'a pas dépassée. */
  const prochaineFermeture = (nom: 'a' | 'h3', depuis: number): number => {
    const m = fermeture[nom]
    if (m.de >= 0 && m.de <= depuis && (m.a === -1 || m.a >= depuis)) return m.a
    let p = depuis
    let trouve = -1
    for (;;) {
      const c = bas.indexOf(`</${nom}`, p)
      if (c === -1) break
      let k = c + nom.length + 2
      while (k < bas.length && ESPACE.test(bas[k])) k++
      if (bas[k] === '>') {
        trouve = c
        break
      }
      p = c + 1
    }
    m.de = depuis
    m.a = trouve
    return trouve
  }
  let pos = 0
  while (pos < html.length) {
    const i = html.indexOf('<', pos)
    if (i === -1) break
    const b = lireBalise(html, i)
    if (!b) break
    pos = b.fin + 1
    const { ferme, nom } = b
    if (nom === 'dl') {
      if (ferme) {
        if (enTrop > 0) enTrop--
        else if (pile.length > 1) pile.pop()
        attente = undefined
      } else {
        if (pile.length >= PROFONDEUR_MAX) enTrop++
        else pile.push(attente ? attente.enfants : pile[pile.length - 1])
        attente = undefined
      }
    } else if ((nom === 'h3' || nom === 'a') && !ferme) {
      const f = prochaineFermeture(nom, pos)
      const texte = decoder(sansBalises(html.slice(pos, f === -1 ? html.length : f))).trim()
      if (f === -1) pos = html.length
      else {
        const g = html.indexOf('>', f)
        pos = g === -1 ? html.length : g + 1
      }
      const courant = pile[pile.length - 1]
      if (nom === 'h3') {
        const dossier: DossierFavori = { type: 'dossier', titre: texte, date: dateMs(b.attr.get('add_date')), enfants: [] }
        courant.push(dossier)
        attente = dossier
      } else {
        attente = undefined
        const url = (b.attr.get('href') ?? '').trim()
        if (url) courant.push({ type: 'lien', titre: texte, url, date: dateMs(b.attr.get('add_date')) })
      }
    }
  }
  return { barre: [], autres: racine }
}

/** Arbre lu → liste Lyra : le dossier est le chemin « A / B », les dossiers vides disparaissent. */
export function favorisDepuisArbre(f: FavorisImportes): Favori[] {
  const sortie: Favori[] = []
  const parcourir = (noeuds: NoeudFavori[], chemin: string): void => {
    for (const n of noeuds) {
      if (n.type === 'dossier') parcourir(n.enfants, `${chemin}${chemin ? SEPARATEUR : ''}${n.titre.replace(/\//g, '∕').trim() || 'Sans titre'}`)
      else sortie.push({ url: n.url, title: n.titre, ...(chemin ? { dossier: chemin } : {}), date: n.date })
    }
  }
  parcourir(f.barre, '')
  parcourir(f.autres, '')
  return sortie
}

/** Liste Lyra → arbre (le chemin « A / B » redevient des dossiers imbriqués), pour `appliquer`. */
export function arbreDepuisFavoris(favoris: Favori[]): FavorisImportes {
  const racine: NoeudFavori[] = []
  const dossiers = new Map<string, DossierFavori>()
  for (const f of favoris) {
    let liste = racine
    let chemin = ''
    for (const nom of (f.dossier ?? '').split(SEPARATEUR).map((x) => x.trim()).filter(Boolean)) {
      chemin = `${chemin}${SEPARATEUR}${nom}`
      let d = dossiers.get(chemin)
      if (!d) {
        d = { type: 'dossier', titre: nom, date: 0, enfants: [] }
        dossiers.set(chemin, d)
        liste.push(d)
      }
      liste = d.enfants
    }
    liste.push({ type: 'lien', titre: f.title, url: f.url, date: f.date })
  }
  return { barre: [], autres: racine }
}
