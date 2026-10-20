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

const NOMMEES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

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

const ATTRIBUT = /([a-zA-Z_][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g
const NOM_BALISE = /^(\/?)([a-zA-Z][a-zA-Z0-9]*)/
/** Une balise plus longue est ignorée pour ses attributs (évite un travail démesuré sur un fichier hostile). */
const ATTRIBUTS_MAX = 16 * 1024

function attributs(brut: string): Map<string, string> {
  const m = new Map<string, string>()
  for (const a of brut.slice(0, ATTRIBUTS_MAX).matchAll(ATTRIBUT)) m.set(a[1].toLowerCase(), decoder(a[2] ?? a[3] ?? a[4] ?? ''))
  return m
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
  const prochaineFermeture = (nom: 'a' | 'h3', depuis: number): number => {
    const m = fermeture[nom]
    if (m.de <= depuis && (m.a === -1 ? m.de === -2 : m.a >= depuis)) return m.a
    m.a = bas.indexOf(`</${nom}`, depuis)
    m.de = m.a === -1 ? -2 : depuis
    return m.a
  }
  let pos = 0
  while (pos < html.length) {
    const i = html.indexOf('<', pos)
    if (i === -1) break
    const fin = html.indexOf('>', i)
    if (fin === -1) break
    const n = NOM_BALISE.exec(html.slice(i + 1, i + 24))
    pos = fin + 1
    if (!n) continue
    const ferme = n[1] === '/'
    const nom = n[2].toLowerCase()
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
      const attr = attributs(html.slice(i + 1 + n[0].length, fin))
      if (nom === 'h3') {
        const dossier: DossierFavori = { type: 'dossier', titre: texte, date: dateMs(attr.get('add_date')), enfants: [] }
        courant.push(dossier)
        attente = dossier
      } else {
        attente = undefined
        const url = (attr.get('href') ?? '').trim()
        if (url) courant.push({ type: 'lien', titre: texte, url, date: dateMs(attr.get('add_date')) })
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
