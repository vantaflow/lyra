import { computed, signal } from '@preact/signals'
import type { EtatBoucliers, EtatDnd, EtatEtoile } from '../../shared/ipc'
import type { Settings, SkyState, Star } from '../../shared/types'
import { appliquerApparence } from './apparenceVivante'

const CIEL_VIDE: SkyState = { stars: [], constellations: [], activeId: null, pinned: [] }

/** lyra://newtab, avec ou sans « / » final (Chromium normalise l'URL). */
export const estNouvelleEtoile = (url: string): boolean => /^lyra:\/\/newtab\/?$/.test(url)

/** Fenêtre privée (la vue chrome est chargée avec #privee) : pas de favoris, thème Aurore. */
export const fenetrePrivee = location.hash === '#privee'
export const sky = signal<SkyState>(CIEL_VIDE)
export const etats = signal<Record<string, EtatEtoile>>({})
export const actif = computed<Star | undefined>(() => sky.value.stars.find((s) => s.id === sky.value.activeId))
export const etatActif = computed<EtatEtoile | undefined>(() => (sky.value.activeId ? etats.value[sky.value.activeId] : undefined))

/** Boucliers de l'étoile active (compteur du pied du ciel). */
export const boucliers = signal<EtatBoucliers>({ actif: false, bloques: 0, origine: '', dernieres: [] })

const rafraichirBoucliers = (): void => {
  void window.lyra.invoke('shields:get').then((b) => (boucliers.value = b))
}

/** Vrai quand un téléchargement est en cours (point d'activité du pied du ciel). */
export const telechargementActif = signal(false)

const rafraichirTelechargements = (): void => {
  void window.lyra.invoke('downloads:list').then((l) => (telechargementActif.value = l.some((d) => d.etat === 'en-cours')))
}

/** L'adresse de l'étoile active est-elle en favori ? (étoile de la capsule) */
export const favori = signal(false)

/** Relit `bookmarks:exists` pour l'adresse donnée ; une réponse tardive d'une autre adresse est ignorée. */
let adresseFavori = ''
export function rafraichirFavori(url: string): void {
  adresseFavori = url
  if (!url || url.startsWith('lyra://')) {
    favori.value = false
    return
  }
  void window.lyra.invoke('bookmarks:exists', { url }).then((v) => {
    if (adresseFavori === url) favori.value = v
  })
}

/** Délai (minutes) avant qu'une étoile inactive ne devienne terne ; relu avec les réglages. */
export const ternirApresMin = signal(30)
/** Horloge grossière : fait revenir l'UI évaluer les étoiles ternes sans changement du ciel. */
export const maintenant = signal(Date.now())
setInterval(() => (maintenant.value = Date.now()), 30_000)

/** Étoile inactive depuis plus de `ternirApresMin` (et pas encore endormie). */
export function estTerne(star: Star, etat?: EtatEtoile): boolean {
  if (star.dormant || ternirApresMin.value <= 0 || !etat?.inactifDepuis) return false
  return maintenant.value - etat.inactifDepuis > ternirApresMin.value * 60_000
}

/** Ciel masqué (rail de 14 px) ; relu avec les réglages. */
export const cielMasque = signal(false)
/** Le ciel masqué se révèle au survol du rail (sinon : poignée, bouton de la capsule ou ⌘ \ seulement). */
export const revelerAuSurvol = signal(true)
/** Le ciel masqué est glissé par-dessus la page : la vue chrome passe au-dessus de la page. */
export const cielRevele = signal(false)
/** La révélation vient du clavier (Entrée sur la poignée) : le ciel prend le focus. */
export const revelationClavier = signal(false)
/** Largeur du ciel (réglage) : celle du ciel révélé, rail de 14 px en plus. */
export const cielLargeur = signal(272)
/** Largeur en cours de réglage à la poignée (aperçu en direct, avant d'être enregistrée) ; null sinon. */
export const cielLargeurApercu = signal<number | null>(null)
/** Largeur affichée : l'aperçu pendant le glisser de la poignée, sinon le réglage. */
export const cielLargeurAffichee = computed(() => cielLargeurApercu.value ?? cielLargeur.value)
export type PositionCiel = Settings['ciel']['position']
/** Position du ciel (réglage) : colonne à gauche ou à droite, bande en haut ou en bas. */
export const cielPosition = signal<PositionCiel>('gauche')
/** « Le ciel prend la teinte du site actif » et « Chaque constellation a sa couleur » (réglages `couleurs`). */
export const cielTeinteParSite = signal(false)
export const couleurParConstellation = signal(true)
/** « Relier un onglet à celui qui l'a ouvert » : lignes de constellation. */
export const relierEnfants = signal(true)
/** « Afficher les icônes des sites à la place des points ». */
export const iconesSites = signal(false)
/** « Masquer la capsule quand la souris ne bouge plus ». */
export const capsuleAuto = signal(false)
/** Glisser l'en-tête du ciel vers un bord pour le déplacer (réglage). */
export const cielDeplacer = signal(true)
/** Appui sur l'en-tête du ciel en cours (avant même le seuil du glisser) : les zones de déplacement de la fenêtre sont levées. */
export const cielAppui = signal(false)
/** Bord visé pendant le glisser de l'en-tête du ciel (null : pas de glisser en cours, ou geste resté sur le ciel). */
export const cielCible = signal<PositionCiel | null>(null)

/** Demande au main de révéler ou retirer le ciel masqué (la vue chrome change de taille et d'ordre). */
export function reveler(actif: boolean): void {
  void window.lyra.invoke('ciel:reveler', { actif })
}

/** Mode Ne pas déranger de cette fenêtre : la vue chrome ne dessine alors que le rappel / croissant. */
export const dnd = signal<EtatDnd>({ actif: false, duree: null, fin: null, notifications: 0, popups: 0, rappel: false })

/** Étoile en cours de glisser-déposer. */
export const glisse = signal<string | null>(null)

export async function initialiserEtat(): Promise<void> {
  window.lyra.on('sky:changed', (c) => {
    sky.value = c.sky
    etats.value = c.etats
    // Étoile activée ou page changée : le compteur suit l'étoile active.
    rafraichirBoucliers()
  })
  window.lyra.on('shields:changed', (b) => (boucliers.value = b))
  window.lyra.on('downloads:changed', rafraichirTelechargements)
  window.lyra.on('bookmarks:changed', () => rafraichirFavori(adresseFavori))
  const appliquer = (r: Settings): void => {
    ternirApresMin.value = r.ciel.ternirApresMin
    cielMasque.value = r.ciel.masque
    cielLargeur.value = r.ciel.largeur
    cielPosition.value = r.ciel.position
    cielDeplacer.value = r.ciel.deplacerParGlisser
    revelerAuSurvol.value = r.ciel.revelerAuSurvol
    cielTeinteParSite.value = r.couleurs.cielTeinteParSite
    couleurParConstellation.value = r.couleurs.couleurParConstellation
    relierEnfants.value = r.apparence.relierEnfants
    iconesSites.value = r.apparence.iconesSites
    capsuleAuto.value = r.apparence.capsuleAuto
    appliquerApparence(r.apparence)
  }
  window.lyra.on('settings:changed', appliquer)
  window.lyra.on('ciel:revele', (b) => (cielRevele.value = b))
  window.lyra.on('dnd:changed', (e) => (dnd.value = e))
  void window.lyra.invoke('dnd:get').then((e) => (dnd.value = e))
  void window.lyra.invoke('settings:get').then(appliquer)
  void window.lyra.invoke('layout:get').then((l) => (cielRevele.value = l.revele))
  const c = await window.lyra.invoke('sky:get')
  sky.value = c.sky
  etats.value = c.etats
  rafraichirBoucliers()
  rafraichirTelechargements()
}

export function titreEtoile(star: Star, etat?: EtatEtoile): string {
  const url = etat?.url || star.url
  if (estNouvelleEtoile(url)) return 'Nouvelle étoile'
  const titre = etat?.titre || star.title
  if (titre) return titre
  try {
    const u = new URL(url)
    return u.hostname || decodeURIComponent(u.pathname.split('/').filter(Boolean).at(-1) ?? '') || url
  } catch {
    return url
  }
}

/** Descendants d'une étoile dans la liste plate (ordre profondeur d'abord). */
function bloc(stars: Star[], id: string): Star[] {
  const ids = new Set([id])
  const res: Star[] = []
  for (const s of stars) {
    if (s.id === id || (s.parentId && ids.has(s.parentId))) {
      ids.add(s.id)
      res.push(s)
    }
  }
  return res
}

/** Dépose l'étoile glissée avant ou après la cible (même parent que la cible). */
export function deposer(cibleId: string, apres: boolean): void {
  const id = glisse.value
  glisse.value = null
  if (!id || id === cibleId) return
  const stars = sky.value.stars
  const deplace = new Set(bloc(stars, id).map((s) => s.id))
  if (deplace.has(cibleId)) return
  const restantes = stars.filter((s) => !deplace.has(s.id))
  const cible = stars.find((s) => s.id === cibleId)
  if (!cible) return
  let index: number
  if (apres) {
    const fin = bloc(restantes, cibleId).at(-1)!
    index = restantes.indexOf(fin) + 1
  } else {
    index = restantes.indexOf(cible)
  }
  void window.lyra.invoke('tabs:move', { id, parentId: cible.parentId, index })
}
