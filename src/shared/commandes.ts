/**
 * Commandes de Lyra dont le raccourci clavier se redéfinit (Réglages > Raccourcis clavier) : libellé, groupe, accélérateur
 * par défaut (spec §4 « Raccourcis ») et id de l'entrée du menu d'application (ids stables : les tests et le menu
 * s'y réfèrent). `Settings.raccourcis` ne garde que les écarts : commande → accélérateur, vide = défaut.
 */
import { canonique, detecterConflit, normaliser, valider, type Plateforme } from './accelerateur'

export type GroupeCommande = 'Étoiles' | 'Fenêtres' | 'Navigation' | 'Affichage' | 'Application'
export const GROUPES: readonly GroupeCommande[] = ['Étoiles', 'Fenêtres', 'Navigation', 'Affichage', 'Application']

/** Raccourcis que la page ne doit pas avaler : traités dans `before-input-event` (voir `tabs/raccourcis.ts`). */
export type RaccourciPage = 'palette' | 'nouvelle-etoile' | 'recherche' | 'ne-pas-deranger'

export interface DefCommande {
  id: string
  libelle: string
  groupe: GroupeCommande
  /** Id de l'entrée du menu d'application. */
  idMenu: string
  /** Accélérateur par défaut (toutes plateformes, sauf précision). */
  defaut: string
  defautDarwin?: string
  defautAutre?: string
  page?: RaccourciPage
  /** Rôle natif de cette plateforme (menu d'application) : affiché, non redéfinissable. */
  natifSur?: 'darwin'
}

function def(id: string, libelle: string, groupe: GroupeCommande, idMenu: string, defaut: string, plus: Partial<DefCommande> = {}): DefCommande {
  return { id, libelle, groupe, idMenu, defaut, ...plus }
}

const NUMEROS: DefCommande[] = Array.from({ length: 8 }, (_, i) => def(`etoile${i + 1}`, `Étoile ${i + 1}`, 'Étoiles', `etoile-${i + 1}`, `CmdOrCtrl+${i + 1}`))

export const COMMANDES: readonly DefCommande[] = [
  def('nouvelleEtoile', 'Nouvelle étoile', 'Étoiles', 'nouvelle-etoile', 'CmdOrCtrl+T', { page: 'nouvelle-etoile' }),
  def('fermerEtoile', "Fermer l'étoile", 'Étoiles', 'fermer-etoile', 'CmdOrCtrl+W'),
  def('rouvrirEtoile', 'Rouvrir la dernière étoile', 'Étoiles', 'rouvrir-etoile', 'CmdOrCtrl+Shift+T'),
  def('etoileSuivante', 'Étoile suivante', 'Étoiles', 'etoile-suivante', 'Ctrl+Tab'),
  def('etoilePrecedente', 'Étoile précédente', 'Étoiles', 'etoile-precedente', 'Ctrl+Shift+Tab'),
  ...NUMEROS,
  def('derniereEtoile', 'Dernière étoile', 'Étoiles', 'etoile-9', 'CmdOrCtrl+9'),

  def('nouvelleFenetre', 'Nouvelle fenêtre', 'Fenêtres', 'nouvelle-fenetre', 'CmdOrCtrl+N'),
  def('fenetrePrivee', 'Nouvelle fenêtre privée', 'Fenêtres', 'fenetre-privee', 'CmdOrCtrl+Shift+N'),
  def('pleinEcran', 'Plein écran', 'Fenêtres', 'plein-ecran', 'F11', { defautDarwin: 'Ctrl+Cmd+F' }),

  def('palette', 'Aller à…', 'Navigation', 'palette', 'CmdOrCtrl+L', { page: 'palette' }),
  def('recharger', 'Recharger', 'Navigation', 'recharger', 'CmdOrCtrl+R'),
  def('trouver', 'Rechercher dans la page', 'Navigation', 'trouver', 'CmdOrCtrl+F', { page: 'recherche' }),
  def('favori', 'Ajouter aux favoris', 'Navigation', 'favori', 'CmdOrCtrl+D'),
  def('favoris', 'Favoris', 'Navigation', 'favoris', 'CmdOrCtrl+Shift+B'),
  // Hors macOS, Ctrl+Y est « Rétablir » (comme dans Chrome et Edge, l'historique est sur Ctrl+H).
  def('historique', 'Historique', 'Navigation', 'historique', 'CmdOrCtrl+Y', { defautAutre: 'Ctrl+H' }),
  def('telechargements', 'Téléchargements', 'Navigation', 'telechargements', 'CmdOrCtrl+Shift+J'),

  def('zoomAvant', 'Zoom avant', 'Affichage', 'zoom-plus', 'CmdOrCtrl+Plus'),
  def('zoomArriere', 'Zoom arrière', 'Affichage', 'zoom-moins', 'CmdOrCtrl+-'),
  def('zoomZero', 'Taille réelle', 'Affichage', 'zoom-zero', 'CmdOrCtrl+0'),
  def('basculerCiel', 'Replier ou épingler le ciel', 'Affichage', 'basculer-ciel', 'CmdOrCtrl+\\'),
  def('dnd', 'Ne pas déranger', 'Affichage', 'ne-pas-deranger', 'CmdOrCtrl+Shift+D', { page: 'ne-pas-deranger' }),
  def('imprimer', 'Imprimer…', 'Affichage', 'imprimer', 'CmdOrCtrl+P'),
  def('outils', 'Outils de développement', 'Affichage', 'devtools', 'F12', { defautDarwin: 'Cmd+Alt+I' }),

  def('reglages', 'Réglages', 'Application', 'reglages', 'CmdOrCtrl+,'),
  def('quitter', 'Quitter', 'Application', 'quitter', 'CmdOrCtrl+Q', { natifSur: 'darwin' })
]

export const commandeParId = (id: string): DefCommande | undefined => COMMANDES.find((c) => c.id === id)

/** Accélérateur par défaut de la commande sur cette plateforme. */
export function defautDe(c: DefCommande, plateforme: Plateforme): string {
  return (plateforme === 'darwin' ? c.defautDarwin : c.defautAutre) ?? c.defaut
}

/** Peut-on lui attribuer une autre combinaison ? (Quitter est un rôle natif du menu d'application sous macOS.) */
export function redefinissable(c: DefCommande, plateforme: Plateforme): boolean {
  return c.natifSur !== plateforme
}

/** Rôles natifs du menu Édition : affichés dans les réglages, jamais redéfinissables. */
export function natives(plateforme: Plateforme): { libelle: string; accelerateur: string }[] {
  return [
    { libelle: 'Annuler', accelerateur: 'CmdOrCtrl+Z' },
    // Rôle `redo` d'Electron : Ctrl+Y sous Windows, Maj+Ctrl/⌘+Z ailleurs.
    { libelle: 'Rétablir', accelerateur: plateforme === 'win32' ? 'CmdOrCtrl+Y' : 'CmdOrCtrl+Shift+Z' },
    { libelle: 'Couper', accelerateur: 'CmdOrCtrl+X' },
    { libelle: 'Copier', accelerateur: 'CmdOrCtrl+C' },
    { libelle: 'Coller', accelerateur: 'CmdOrCtrl+V' },
    { libelle: 'Tout sélectionner', accelerateur: 'CmdOrCtrl+A' }
  ]
}

/**
 * Accélérateur effectif de chaque commande redéfinissable : l'écart enregistré s'il est valide (normalisé), sinon le
 * défaut. Un écart qui entre en conflit avec une autre commande est ignoré (un fichier édité à la main ou importé ne
 * peut pas donner deux commandes sur la même combinaison) ; on répète jusqu'à stabilité.
 */
export function tableEffective(table: Record<string, string>, plateforme: Plateforme): Record<string, string> {
  const commandes = COMMANDES.filter((c) => redefinissable(c, plateforme))
  const propose: Record<string, string> = {}
  const perso = new Set<string>()
  for (const c of commandes) {
    const brut = Object.hasOwn(table, c.id) ? table[c.id] : ''
    const v = brut ? valider(brut, plateforme) : null
    if (v && v.ok) {
      propose[c.id] = v.accelerateur
      perso.add(c.id)
    } else propose[c.id] = defautDe(c, plateforme)
  }
  for (let changement = true; changement; ) {
    // Tous les écarts en conflit reviennent ensemble au défaut (l'ordre des commandes n'a alors aucune importance).
    const fautifs = [...perso].filter((id) => detecterConflit(propose, id, propose[id], plateforme) !== null)
    changement = fautifs.length > 0
    for (const id of fautifs) {
      propose[id] = defautDe(commandeParId(id)!, plateforme)
      perso.delete(id)
    }
  }
  return propose
}

/** La commande porte-t-elle son accélérateur par défaut (écart absent ou équivalent) ? */
export function estParDefaut(id: string, table: Record<string, string>, plateforme: Plateforme): boolean {
  const c = commandeParId(id)
  if (!c) return true
  const brut = Object.hasOwn(table, id) ? normaliser(table[id]) : null
  return brut === null || canonique(brut, plateforme) === canonique(defautDe(c, plateforme), plateforme)
}

export type ResultatAttribution = { ok: true; valeur: string } | { ok: false; raison: 'invalide' | 'modificateur' | 'reserve' | 'natif' | 'saisie' } | { ok: false; raison: 'conflit'; avec: string }

/**
 * Attribue la combinaison saisie à une commande : la valeur à enregistrer (vide si c'est le défaut), ou la raison du
 * refus (sans ⌘/Ctrl hors touches F, réservée au système, rôle natif, déjà prise par une autre commande).
 */
export function tenterAttribution(table: Record<string, string>, id: string, saisie: string, plateforme: Plateforme): ResultatAttribution {
  const c = commandeParId(id)
  if (!c) return { ok: false, raison: 'invalide' }
  if (!redefinissable(c, plateforme)) return { ok: false, raison: 'natif' }
  const v = valider(saisie, plateforme)
  if (!v.ok) return v
  const autre = detecterConflit(tableEffective(table, plateforme), id, v.accelerateur, plateforme)
  if (autre) return { ok: false, raison: 'conflit', avec: commandeParId(autre)?.libelle ?? autre }
  const parDefaut = canonique(v.accelerateur, plateforme) === canonique(defautDe(c, plateforme), plateforme)
  return { ok: true, valeur: parDefaut ? '' : v.accelerateur }
}

export function messageRefus(r: Extract<ResultatAttribution, { ok: false }>): string {
  if (r.raison === 'conflit') return `Déjà utilisée par « ${r.avec} ».`
  if (r.raison === 'modificateur') return 'Ajoutez ⌘ ou Ctrl : une touche seule gênerait la saisie dans les pages.'
  if (r.raison === 'reserve') return 'Cette combinaison est réservée par le système.'
  if (r.raison === 'saisie') return 'Cette combinaison sert à écrire du texte et gênerait la saisie : choisissez-en une autre.'
  if (r.raison === 'natif') return 'Cette combinaison sert à copier, coller… et ne peut pas être réaffectée.'
  return "Cette combinaison n'est pas reconnue."
}

/** Patch de `Settings.raccourcis` qui rétablit tous les défauts (un patch fusionne : on vide chaque écart). */
export function patchToutParDefaut(table: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(table).filter(([, v]) => v !== '').map(([k]) => [k, '']))
}
