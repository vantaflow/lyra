import { DETAIL_MOTS_DE_PASSE, MESSAGE_MOTS_DE_PASSE } from '../../shared/exportTextes'
import type { ReponseApercuImport } from '../../shared/ipc'
import { NOMS_NAVIGATEURS, type Compteurs, type ElementImport, type ElementResultat, type ExtensionImportee, type Indisponible, type NavigateurSource, type ProfilDetecte } from '../../main/import/types'

/** Logique d'affichage de la page « Importer et exporter » (compteurs, états des cartes et des lignes), sans DOM. */

/** Espace fine insécable : séparateur de milliers français (« 1 284 »). */
export const ESPACE_FINE = ' '

export function formaterNombre(n: number): string {
  const s = String(Math.trunc(Math.abs(n)))
  const groupes = s.replace(/\B(?=(\d{3})+$)/g, ESPACE_FINE)
  return n < 0 ? `-${groupes}` : groupes
}

/** « 1 favori », « 1 284 favoris » (pluriel dès 2). */
export const quantite = (n: number, un: string, plusieurs: string = `${un}s`): string => `${formaterNombre(n)} ${n >= 2 ? plusieurs : un}`

/** Navigateurs proposés, dans l'ordre du design. */
export const NAVIGATEURS_PROPOSES = ['chrome', 'edge', 'brave', 'vivaldi', 'firefox', 'safari', 'orion'] as const satisfies readonly NavigateurSource[]

/** Pastille de chaque carte (Importation.dc.html). */
export const COULEURS_LOGO: Record<(typeof NAVIGATEURS_PROPOSES)[number] | 'fichier', string> = {
  chrome: '#3A3A62',
  edge: '#1F6FB2',
  brave: '#B5452F',
  vivaldi: '#7A3EB1',
  firefox: '#D97A2B',
  safari: '#2D5BD1',
  orion: '#15152E',
  fichier: '#6B6B80'
}

/** Texte d'état d'une carte : « 2 profils détectés · ouvert », « Non installé », « Accès au disque à autoriser ». */
export function etatCarte(profils: readonly ProfilDetecte[], accesRefuse = false): string {
  if (accesRefuse) return 'Accès au disque à autoriser'
  if (profils.length === 0) return 'Non installé'
  const base = `${quantite(profils.length, 'profil détecté', 'profils détectés')}`
  return profils.some((p) => p.ouvert) ? `${base} · ouvert` : base
}

/** Safari / Orion : l'accès refusé par le système se lit dans l'aperçu (`Indisponible` de code `acces`). */
export const accesRefuse = (indisponibles: ReponseApercuImport['indisponibles']): boolean => Object.values(indisponibles).some((i) => i?.code === 'acces')

export type ClasseTag = 'ok' | 'warn' | 'neutre'

export interface LigneElement {
  /** Absent pour les lignes toujours indisponibles (mots de passe, cookies). */
  element?: ElementImport
  cle: string
  titre: string
  hint: string
  tag: { texte: string; classe: ClasseTag }
  /** Case cochable : l'élément est lisible. */
  disponible: boolean
}

export interface ContexteLignes {
  navigateur: NavigateurSource
  profil?: ProfilDetecte
  /** `undefined` tant que l'aperçu n'est pas arrivé. */
  apercu?: Pick<ReponseApercuImport, 'compteurs' | 'indisponibles' | 'extensions'>
  jours: number | null
}

const TITRES: Record<ElementImport, string> = {
  favoris: 'Favoris',
  historique: 'Historique',
  onglets: 'Onglets ouverts et groupes',
  extensions: 'Extensions',
  moteurs: 'Moteurs de recherche et mots-clés',
  reglages: 'Réglages transposables'
}

/** Ordre du design ; mots de passe et cookies (toujours indisponibles) s'intercalent avant les réglages. */
export const ORDRE_LIGNES: readonly ElementImport[] = ['favoris', 'historique', 'onglets', 'extensions', 'moteurs', 'reglages']

const REGLAGES_TEXTE = "Page d'accueil, dossier de téléchargement, langue, zoom par site"

/** Noms des extensions rangés pour l'aperçu : celles d'un magasin connu par leur nom, les autres en « N inconnue(s) ». */
export function resumeExtensions(liste: readonly ExtensionImportee[]): string {
  const noms = liste.filter((e) => e.magasin !== 'inconnu').map((e) => e.nom)
  const inconnues = liste.length - noms.length
  const morceaux = [...noms.slice(0, 5), ...(noms.length > 5 ? [`${noms.length - 5} autres`] : []), ...(inconnues ? [quantite(inconnues, 'inconnue')] : [])]
  return morceaux.join(', ')
}

const jours = (j: number | null): string => (j === null ? 'tout l’historique' : quantite(j, 'jour'))

function ligneIndisponible(element: ElementImport, i: Indisponible, nom: string): LigneElement {
  const base = { element, cle: element, titre: TITRES[element], disponible: false }
  if (i.code === 'verrouille') return { ...base, hint: `${nom} est ouvert : fermez ${nom} puis réessayez.`, tag: { texte: 'Indisponible', classe: 'neutre' } }
  if (i.code === 'acces') return { ...base, hint: i.raison, tag: { texte: 'Accès à autoriser', classe: 'neutre' } }
  return { ...base, hint: i.raison, tag: { texte: 'Indisponible', classe: 'neutre' } }
}

/** Lignes de la liste « Quoi importer » pour un profil d'un navigateur. */
export function lignesElements(c: ContexteLignes): LigneElement[] {
  const nom = NOMS_NAVIGATEURS[c.navigateur]
  const lignes: LigneElement[] = []
  for (const element of ORDRE_LIGNES) {
    const titre = TITRES[element]
    const ind = c.apercu?.indisponibles[element]
    if (ind) {
      lignes.push(ligneIndisponible(element, ind, nom))
      continue
    }
    const k = c.apercu?.compteurs
    const pret: LigneElement['tag'] = { texte: 'Prêt', classe: 'ok' }
    const ligne = (hint: string, tag = pret): LigneElement => ({ element, cle: element, titre, hint, tag, disponible: true })
    if (!k) {
      lignes.push(ligne('', { texte: 'Lecture…', classe: 'neutre' }))
      continue
    }
    switch (element) {
      case 'favoris': {
        const v = k.favoris
        lignes.push(v ? ligne(`${quantite(v.favoris, 'favori')}, ${quantite(v.dossiers, 'dossier')} → barre et dossiers conservés`) : ligne('', { texte: 'Indisponible', classe: 'neutre' }))
        break
      }
      case 'historique': {
        const v = k.historique
        lignes.push(v ? ligne(`${jours(c.jours)}, ${quantite(v.visites, 'visite')} → suggestions de la palette dès le premier jour`) : ligne('', { texte: 'Indisponible', classe: 'neutre' }))
        break
      }
      case 'onglets': {
        const v = k.onglets
        lignes.push(v ? ligne(`${quantite(v.onglets, 'onglet')}, ${quantite(v.groupes, 'groupe')} → ${quantite(v.groupes, 'constellation')}, mêmes noms et couleurs`) : ligne('', { texte: 'Indisponible', classe: 'neutre' }))
        break
      }
      case 'extensions': {
        const v = k.extensions
        if (!v) {
          lignes.push(ligne('', { texte: 'Indisponible', classe: 'neutre' }))
          break
        }
        const noms = c.apercu?.extensions ? resumeExtensions(c.apercu.extensions) : ''
        const hint = `${v.total} ${v.total >= 2 ? 'trouvées' : 'trouvée'}${noms ? ` : ${noms}` : ''} → mises en file pour réinstallation`
        lignes.push(ligne(hint, v.chrome < v.total ? { texte: `${v.chrome} sur ${v.total}`, classe: 'warn' } : pret))
        break
      }
      case 'moteurs': {
        const v = k.moteurs
        lignes.push(v ? ligne(`${quantite(v.moteurs, 'moteur')}, ${quantite(v.motsCles, 'raccourci')}`) : ligne('', { texte: 'Indisponible', classe: 'neutre' }))
        break
      }
      case 'reglages': {
        const v = k.reglages
        lignes.push(v ? ligne(`${quantite(v.total, 'réglage trouvé', 'réglages trouvés')} : ${REGLAGES_TEXTE}`) : ligne('', { texte: 'Indisponible', classe: 'neutre' }))
        break
      }
    }
  }
  // Mots de passe et cookies : indisponibles en v1, avant « Réglages transposables » comme dans le design.
  const fixes: LigneElement[] = [
    { cle: 'mots-de-passe', titre: 'Mots de passe', hint: `${MESSAGE_MOTS_DE_PASSE} ${DETAIL_MOTS_DE_PASSE}`, tag: { texte: 'Indisponible', classe: 'neutre' }, disponible: false },
    { cle: 'cookies', titre: 'Cookies et sessions ouvertes', hint: 'Chiffrés par le système : indisponibles en v1.', tag: { texte: 'Indisponible', classe: 'neutre' }, disponible: false }
  ]
  lignes.splice(lignes.findIndex((l) => l.element === 'reglages'), 0, ...fixes)
  return lignes
}

/** Éléments cochés au départ : tous ceux qui sont lisibles. */
export const elementsCochablesParDefaut = (lignes: readonly LigneElement[]): ElementImport[] => lignes.filter((l) => l.element && l.disponible).map((l) => l.element as ElementImport)

/** « 120 ajoutés · 4 déjà présents » (+ « · 2 ignorés »). */
export function resumeResultat(r: ElementResultat): string {
  const parts = [`${formaterNombre(r.ajoutes)} ${r.ajoutes >= 2 ? 'ajoutés' : 'ajouté'}`, `${formaterNombre(r.presents)} ${r.presents >= 2 ? 'déjà présents' : 'déjà présent'}`]
  if (r.ignores > 0) parts.push(`${formaterNombre(r.ignores)} ${r.ignores >= 2 ? 'ignorés' : 'ignoré'}`)
  return parts.join(' · ')
}

/** Étiquette de fin d'un élément ; un moteur « partiel » (Bing absent de Lyra) reste « Prêt », pas un avertissement. */
export function etiquetteResultat(element: ElementImport, r: ElementResultat): { texte: string; classe: ClasseTag } {
  switch (r.etat) {
    case 'ok':
      return { texte: 'Terminé', classe: 'ok' }
    case 'partiel':
      return element === 'moteurs' ? { texte: 'Prêt', classe: 'ok' } : { texte: 'Partiel', classe: 'warn' }
    case 'annule':
      return { texte: 'Annulé', classe: 'neutre' }
    default:
      return { texte: 'Indisponible', classe: 'neutre' }
  }
}

export const TITRE_ELEMENT = TITRES
