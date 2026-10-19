/**
 * Lecture « au mieux » des fichiers de session de Chromium (`Sessions/Session_<horodatage>`) : onglets ouverts,
 * fenêtres, groupes d'onglets (nom, couleur).
 *
 * Format (SNSS), d'après les sources de Chromium :
 * - `components/sessions/core/command_storage_backend.cc` : en-tête de 8 octets = signature « SNSS » (0x53534E53,
 *   uint32) + version (int32). Version 3 = format actuel en clair (avec une commande « marqueur d'état initial »
 *   d'identifiant 255, ignorée ici) ; version 1 = format d'avant 2021, même découpage en commandes ; version 5 =
 *   chiffré par le système (dossier `Sessions_Encrypted`, illisible hors de Chromium) ;
 * - `components/sessions/core/session_command.cc` : une commande = [taille uint16][identifiant uint8][charge], la
 *   taille compte l'identifiant (donc charge = taille − 1 octets) ; entiers en petit-boutiste (x86 et ARM) ;
 * - `components/sessions/core/session_service_commands.cc` : identifiants et charges ci-dessous. Les structures
 *   « brutes » sont écrites telles quelles (alignement C++ compris : un `int32` suivi d'un `uint64` laisse 4 octets
 *   de bourrage), les autres sont des `base::Pickle` (en-tête uint32 de taille, puis champs alignés sur 4 octets :
 *   int = 4 octets, uint64 = 8, string = int de longueur + octets, string16 = int de longueur en caractères + UTF-16LE).
 *
 * Commandes lues (les autres, nombreuses — géométrie, user-agent, onglets restaurés…, sont ignorées) :
 *    0 SetTabWindow            {int32 fenêtre, int32 onglet}
 *    2 SetTabIndexInWindow     {int32 onglet, int32 position}
 *    5 TabNavigationPathPrunedFromBack   {int32 onglet, int32 index}
 *    6 UpdateTabNavigation     Pickle : int onglet, puis l'entrée de navigation (int index, string URL, string16 titre, …)
 *    7 SetSelectedNavigationIndex        {int32 onglet, int32 index}
 *    9 SetWindowType           {int32 fenêtre, int32 type}  (0 = fenêtre normale ; 1 fenêtre surgissante, 2 application…)
 *   11 TabNavigationPathPrunedFromFront  {int32 onglet, int32 nombre}
 *   12 SetPinnedState          {int32 onglet, bool épinglé}
 *   16 TabClosed, 17 WindowClosed        {int32 id, (bourrage), int64 date}
 *   24 TabNavigationPathPruned {int32 onglet, int32 index, int32 nombre}
 *   25 SetTabGroup             {int32 onglet, (bourrage 4), uint64 haut, uint64 bas, bool a_un_groupe}
 *   27 SetTabGroupMetadata2    Pickle : uint64 haut, uint64 bas, string16 titre, uint32 couleur, bool replié, …
 * Couleurs (`components/tab_groups/tab_group_color.h`) : 0 gris, 1 bleu, 2 rouge, 3 jaune, 4 vert, 5 rose,
 * 6 violet, 7 cyan, 8 orange.
 *
 * Les fichiers `Tabs_*` ne sont pas lus : c'est l'historique des onglets récemment fermés (TabRestoreService), avec
 * un autre jeu de commandes. Seuls les onglets ouverts (`Session_*`) deviennent des étoiles.
 *
 * Aucune exception ne sort d'ici : en-tête inconnu, fichier chiffré ou sans onglet exploitable → `Indisponible`.
 * Un fichier coupé net (copie pendant que le navigateur écrit) est lu jusqu'à sa dernière commande complète.
 */
import { indisponible } from './types'
import type { CouleurGroupe, FenetreImportee, GroupeImporte, Indisponible, OngletImporte, OngletsImportes } from './types'

const SIGNATURE = 0x53534e53 // « SNSS » lu en petit-boutiste

const CMD = {
  setTabWindow: 0,
  setTabIndexInWindow: 2,
  prunedFromBack: 5,
  updateTabNavigation: 6,
  setSelectedNavigationIndex: 7,
  setWindowType: 9,
  prunedFromFront: 11,
  setPinnedState: 12,
  tabClosed: 16,
  windowClosed: 17,
  pruned: 24,
  setTabGroup: 25,
  setTabGroupMetadata2: 27
} as const

const COULEURS: CouleurGroupe[] = ['gris', 'bleu', 'rouge', 'jaune', 'vert', 'rose', 'violet', 'cyan', 'orange']

class FormatInvalide extends Error {}

/** Lecteur de `base::Pickle` (en-tête de taille, champs alignés sur 4 octets). */
class LecteurPickle {
  private pos = 4
  private fin: number
  private vue: DataView

  constructor(private octets: Uint8Array) {
    this.vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength)
    if (octets.length < 4) throw new FormatInvalide('pickle trop court')
    const taille = this.vue.getUint32(0, true)
    if (4 + taille > octets.length) throw new FormatInvalide('pickle tronqué')
    this.fin = 4 + taille
  }

  private reserver(n: number): number {
    if (n < 0 || this.pos + n > this.fin) throw new FormatInvalide('lecture hors du pickle')
    const debut = this.pos
    this.pos += n
    return debut
  }

  int(): number {
    return this.vue.getInt32(this.reserver(4), true)
  }

  uint32(): number {
    return this.vue.getUint32(this.reserver(4), true)
  }

  uint64(): bigint {
    return this.vue.getBigUint64(this.reserver(8), true)
  }

  private octetsAlignes(n: number): Uint8Array {
    const debut = this.pos
    this.reserver(n)
    const donnees = this.octets.subarray(debut, debut + n)
    this.pos = Math.min(this.fin, debut + ((n + 3) & ~3)) // bourrage jusqu'au multiple de 4
    return donnees
  }

  chaine(): string {
    return new TextDecoder('utf-8').decode(this.octetsAlignes(this.int()))
  }

  chaine16(): string {
    const n = this.int()
    if (n > 0x3fffffff) throw new FormatInvalide('chaîne trop longue')
    return new TextDecoder('utf-16le').decode(this.octetsAlignes(n * 2))
  }
}

interface Navigation {
  index: number
  url: string
  titre: string
}

interface Onglet {
  id: number
  fenetre: number
  position: number
  navigations: Navigation[]
  courante: number
  epingle: boolean
  groupe?: string
}

/** Position de la première navigation d'index >= `index` (comme `FindClosestNavigationWithIndex`). */
function plusProche(navs: Navigation[], index: number): number {
  const i = navs.findIndex((n) => n.index >= index)
  return i === -1 ? navs.length : i
}

function elaguer(tab: Onglet, index: number, nombre: number): void {
  if (tab.courante >= index && tab.courante < index + nombre) tab.courante = index - 1
  else if (tab.courante >= index + nombre) tab.courante -= nombre
  const debut = plusProche(tab.navigations, index)
  tab.navigations.splice(debut, plusProche(tab.navigations, index + nombre) - debut)
  for (const n of tab.navigations) if (n.index >= index) n.index -= nombre
}

const hex64 = (v: bigint): string => v.toString(16).padStart(16, '0')

function* commandes(octets: Uint8Array): Generator<{ id: number; charge: Uint8Array }> {
  const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength)
  let pos = 8
  while (pos + 2 <= octets.length) {
    const taille = vue.getUint16(pos, true)
    // Taille nulle : corrompu ; commande dépassant le fichier : écriture interrompue → on s'arrête là.
    if (taille < 1 || pos + 2 + taille > octets.length) return
    yield { id: octets[pos + 2], charge: octets.subarray(pos + 3, pos + 2 + taille) }
    pos += 2 + taille
  }
}

const HTTP = /^https?:\/\//i

/** Onglets et groupes d'un fichier `Session_*`, ou `Indisponible` avec la raison. Ne lève jamais. */
export function lireSessionSnss(octets: Uint8Array): OngletsImportes | Indisponible {
  try {
    if (octets.length < 8) return indisponible('Fichier de session vide ou tronqué.')
    const entete = new DataView(octets.buffer, octets.byteOffset, octets.byteLength)
    if (entete.getUint32(0, true) !== SIGNATURE) return indisponible('Fichier de session non reconnu.')
    const version = entete.getInt32(4, true)
    if (version === 4 || version === 5 || version === 2) return indisponible('Session chiffrée par le système : onglets illisibles hors du navigateur.', 'chiffre')
    if (version !== 1 && version !== 3) return indisponible(`Version de session inconnue (${version}).`)

    const tabs = new Map<number, Onglet>()
    const fenetres = new Map<number, { type?: number }>()
    const fermees = new Set<number>()
    const groupes = new Map<string, { nom: string; couleur: CouleurGroupe }>()
    const tab = (id: number): Onglet => {
      let t = tabs.get(id)
      if (!t) tabs.set(id, (t = { id, fenetre: 0, position: 0, navigations: [], courante: -1, epingle: false }))
      return t
    }

    for (const { id, charge } of commandes(octets)) {
      try {
        const vue = new DataView(charge.buffer, charge.byteOffset, charge.byteLength)
        const i32 = (decalage: number): number => {
          if (decalage + 4 > charge.length) throw new FormatInvalide('charge trop courte')
          return vue.getInt32(decalage, true)
        }
        switch (id) {
          case CMD.setTabWindow:
            tab(i32(4)).fenetre = i32(0)
            break
          case CMD.setTabIndexInWindow:
            tab(i32(0)).position = i32(4)
            break
          case CMD.setSelectedNavigationIndex:
            tab(i32(0)).courante = i32(4)
            break
          case CMD.setWindowType: {
            const fenetre = fenetres.get(i32(0)) ?? {}
            fenetre.type = i32(4)
            fenetres.set(i32(0), fenetre)
            break
          }
          case CMD.setPinnedState:
            tab(i32(0)).epingle = charge.length > 4 && charge[4] !== 0
            break
          case CMD.tabClosed:
            tabs.delete(i32(0))
            break
          case CMD.windowClosed:
            fermees.add(i32(0))
            fenetres.delete(i32(0))
            break
          case CMD.prunedFromBack: {
            const t = tab(i32(0))
            t.navigations.splice(plusProche(t.navigations, i32(4)))
            break
          }
          case CMD.prunedFromFront: {
            if (i32(4) > 0) elaguer(tab(i32(0)), 0, i32(4))
            break
          }
          case CMD.pruned: {
            if (i32(4) >= 0 && i32(8) > 0) elaguer(tab(i32(0)), i32(4), i32(8))
            break
          }
          case CMD.updateTabNavigation: {
            const p = new LecteurPickle(charge)
            const t = tab(p.int())
            const nav: Navigation = { index: p.int(), url: p.chaine(), titre: p.chaine16() }
            const i = plusProche(t.navigations, nav.index)
            if (t.navigations[i]?.index === nav.index) t.navigations[i] = nav
            else t.navigations.splice(i, 0, nav)
            break
          }
          case CMD.setTabGroup: {
            // {int32 onglet, bourrage 4, uint64 haut, uint64 bas, bool a_un_groupe} : 25 octets utiles
            if (charge.length < 25) throw new FormatInvalide('charge trop courte')
            const t = tab(i32(0))
            const jeton = hex64(vue.getBigUint64(8, true)) + hex64(vue.getBigUint64(16, true))
            if (charge[24] !== 0) t.groupe = jeton
            else delete t.groupe
            break
          }
          case CMD.setTabGroupMetadata2: {
            const p = new LecteurPickle(charge)
            const jeton = hex64(p.uint64()) + hex64(p.uint64())
            const nom = p.chaine16()
            const couleur = COULEURS[p.uint32()] ?? 'gris' // valeur inconnue : gris, comme Chromium
            groupes.set(jeton, { nom, couleur })
            break
          }
          default:
            break // commande sans intérêt pour l'import (ou plus récente que ce lecteur)
        }
      } catch (e) {
        if (!(e instanceof FormatInvalide)) throw e // charge d'une commande illisible : on la saute, les autres restent bonnes
      }
    }

    // Onglets → fenêtres (comme AddTabsToWindows) : sans fenêtre ni navigation, un onglet n'existe pas.
    const parFenetre = new Map<number, Onglet[]>()
    for (const t of tabs.values()) {
      if (!t.fenetre || t.navigations.length === 0 || fermees.has(t.fenetre)) continue
      parFenetre.set(t.fenetre, [...(parFenetre.get(t.fenetre) ?? []), t])
    }

    const resultat: FenetreImportee[] = []
    for (const idFenetre of [...parFenetre.keys()].sort((a, b) => a - b)) {
      const type = fenetres.get(idFenetre)?.type
      if (type !== undefined && type !== 0) continue // surgissantes, applications, outils de développement
      const onglets: OngletImporte[] = []
      const utilises = new Map<string, GroupeImporte>()
      for (const t of parFenetre.get(idFenetre)!.sort((a, b) => a.position - b.position || a.id - b.id)) {
        const i = plusProche(t.navigations, t.courante)
        const nav = t.navigations[i] ?? t.navigations[t.navigations.length - 1]
        if (!HTTP.test(nav.url)) continue // chrome://newtab, about:blank…
        const o: OngletImporte = { url: nav.url, titre: nav.titre || nav.url }
        if (t.epingle) o.epingle = true
        if (t.groupe) {
          o.groupe = t.groupe
          if (!utilises.has(t.groupe)) {
            const meta = groupes.get(t.groupe)
            utilises.set(t.groupe, { id: t.groupe, nom: meta?.nom ?? '', couleur: meta?.couleur ?? 'gris' })
          }
        }
        onglets.push(o)
      }
      if (onglets.length) resultat.push({ onglets, groupes: [...utilises.values()] })
    }
    if (resultat.length === 0) return indisponible('Aucun onglet ouvert trouvé dans la session.', 'vide')
    return { fenetres: resultat }
  } catch {
    return indisponible('Fichier de session illisible.')
  }
}
