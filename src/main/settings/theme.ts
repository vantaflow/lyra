// Thème effectif : mode (clair / sombre) tiré d'une seule source de vérité, variables CSS à diffuser, thème des fenêtres privées.
// Module sans Electron : `nativeTheme` est injecté (voir `NativeThemeLike`), l'horloge aussi (tests).
import type { ThemeDiffuse } from '../../shared/ipc'
import { estDansPlage, prochaineEcheanceHeure } from '../../shared/heure-sombre'
import { estNuit, prochainChangement } from '../../shared/fuseaux-soleil'
import { corrigerPalette, type Mode } from '../../shared/contraste'
import { THEMES, deriver } from '../../shared/themes'
import { COULEURS_INDIGO_NUIT, type CleCouleur, type CouleursTheme, type NomTheme, type ReglagesCouleurs } from '../../shared/types-reglages'
import type { Settings } from '../../shared/types'

/** Ce que lit le thème : `Settings.theme` (Apparence « Thème » et Couleurs « Passer en sombre » écrivent les mêmes champs) et `couleurs`. */
export interface ReglagesTheme {
  theme: Settings['theme']
  couleurs: ReglagesCouleurs
}

export interface ContexteTheme {
  /** Le système est en mode sombre (lu sur `nativeTheme` quand `themeSource` est « system »). */
  systemeSombre: boolean
  maintenant: Date
  /** Fuseau IANA de l'utilisateur (`Intl.DateTimeFormat().resolvedOptions().timeZone`). */
  fuseau: string
}

export interface ThemeEffectif {
  mode: Mode
  nom: NomTheme
  variables: Record<string, string>
}

/** Couleurs d'un thème nommé ; « Mes couleurs » prend `personnalisees`, à défaut Indigo nuit. */
export function couleursDe(nom: NomTheme, personnalisees: CouleursTheme | null): CouleursTheme {
  return nom === 'mes-couleurs' ? (personnalisees ?? COULEURS_INDIGO_NUIT) : THEMES[nom].couleurs
}

/** Lyra suit le système (« Avec le système », ou « Programmé » + passage « système »). */
export function suitLeSysteme(r: ReglagesTheme): boolean {
  return r.theme === 'systeme' || (r.theme === 'programme' && r.couleurs.passage === 'systeme')
}

/** Passages « Au coucher du soleil » et « À une heure fixe » : le mode dépend de l'heure. */
export function estProgramme(r: ReglagesTheme): boolean {
  return r.theme === 'programme' && (r.couleurs.passage === 'coucher' || r.couleurs.passage === 'heure')
}

function modeDe(r: ReglagesTheme, ctx: ContexteTheme): Mode {
  switch (r.theme) {
    case 'sombre':
      return 'sombre'
    case 'systeme':
      return ctx.systemeSombre ? 'sombre' : 'clair'
    case 'programme':
      switch (r.couleurs.passage) {
        case 'systeme':
          return ctx.systemeSombre ? 'sombre' : 'clair'
        case 'coucher':
          return estNuit(ctx.maintenant, ctx.fuseau) ? 'sombre' : 'clair'
        // « À une heure fixe » : sombre de `heureSombre` à `heureClair` (à cheval sur minuit si besoin ; égales : toujours sombre).
        case 'heure':
          return estDansPlage(ctx.maintenant, r.couleurs.heureSombre, r.couleurs.heureClair, ctx.fuseau) ? 'sombre' : 'clair'
        default:
          return 'clair'
      }
    default:
      return 'clair'
  }
}

/** Palette diffusée : texte des six paires ramené à 4,5:1 quand `couleurs.corrigerContraste` est actif (la couleur enregistrée reste intacte). */
function palette(couleurs: CouleursTheme, mode: Mode, corriger: boolean): CouleursTheme {
  return corriger ? corrigerPalette(couleurs, mode).couleurs : couleurs
}

/** Mode, thème et variables CSS effectifs (pur). */
export function themeEffectif(r: ReglagesTheme, ctx: ContexteTheme): ThemeEffectif {
  const mode = modeDe(r, ctx)
  const { actif, personnalisees } = r.couleurs
  return { mode, nom: actif, variables: deriver(palette(couleursDe(actif, personnalisees), mode, r.couleurs.corrigerContraste), mode) }
}

/** Éléments du ciel : en fenêtre privée, le ciel garde ses couleurs « clair » dans les deux modes (il est déjà sombre par nature). */
const CLES_CIEL: readonly CleCouleur[] = ['ciel-fond', 'ciel-texte', 'etoile-active', 'etoile-active-fond', 'etoiles', 'etoiles-endormies', 'lignes', 'nouvel-onglet-ciel']

/**
 * Variables des vues portant la classe `privee` : thème `couleurs.privee` (Aurore par défaut), jamais lié au thème du profil.
 * Le ciel garde celui du thème privé dans les deux modes (Aurore : #2A1540) ; la capsule et les pages suivent le mode effectif.
 */
export function variablesPrivees(couleurs: ReglagesCouleurs, mode: Mode): Record<string, string> {
  const base = couleursDe(couleurs.privee, couleurs.personnalisees)
  const ciel = structuredClone(base) as CouleursTheme
  for (const k of CLES_CIEL) ciel[k].sombre = base[k].clair
  return deriver(palette(ciel, mode, couleurs.corrigerContraste), mode)
}

/** Sous-ensemble de `nativeTheme` utilisé (injecté : le module reste testable sans Electron). */
export interface NativeThemeLike {
  themeSource: 'system' | 'light' | 'dark'
  readonly shouldUseDarkColors: boolean
  readonly shouldUseDarkColorsForSystemIntegratedUI?: boolean
  on(evenement: 'updated', cb: () => void): unknown
  off(evenement: 'updated', cb: () => void): unknown
}

export interface DepsGestionnaireTheme {
  reglages(): ReglagesTheme
  nativeTheme: NativeThemeLike
  /** Horloge injectable (défaut : l'heure du système). */
  horloge?: () => Date
  /** Fuseau IANA (défaut : celui du système). */
  fuseau?: () => string
  /** `powerMonitor` : le thème est recalculé au retour de veille (l'horloge a pu sauter). */
  energie?: { on(evenement: 'resume', cb: () => void): unknown; off(evenement: 'resume', cb: () => void): unknown }
  /** Envoie le thème à toutes les vues Lyra. */
  diffuser(theme: ThemeDiffuse): void
}

/** Attente maximale entre deux vérifications : couvre les changements d'heure, la veille et les horloges modifiées. */
const ATTENTE_MAX_MS = 60 * 60_000
/** Marge après l'échéance, pour tomber du bon côté du coucher ou du lever. */
const MARGE_MS = 1000

/**
 * Calcule le thème effectif, règle `nativeTheme.themeSource` (donc `prefers-color-scheme` des sites) et diffuse les variables
 * quand elles changent. Se recalcule à chaque changement de réglage (`recalculer`), du système, et à l'heure du coucher/lever.
 */
export class GestionnaireTheme {
  private derniere = ''
  private minuteur: ReturnType<typeof setTimeout> | undefined
  private demarre = false
  private systemeSombre = false
  private readonly surMiseAJour = (): void => this.recalculer()

  constructor(private readonly deps: DepsGestionnaireTheme) {}

  demarrer(): void {
    if (this.demarre) return
    this.demarre = true
    this.deps.nativeTheme.on('updated', this.surMiseAJour)
    this.deps.energie?.on('resume', this.surMiseAJour)
    this.recalculer()
  }

  arreter(): void {
    this.demarre = false
    this.deps.nativeTheme.off('updated', this.surMiseAJour)
    this.deps.energie?.off('resume', this.surMiseAJour)
    this.desarmer()
  }

  /** Thème effectif courant (sans effet de bord sur `nativeTheme`), au format diffusé. */
  effectif(): ThemeDiffuse {
    const r = this.deps.reglages()
    const e = themeEffectif(r, this.contexte())
    return { mode: e.mode, nom: e.nom, variables: e.variables, privee: variablesPrivees(r.couleurs, e.mode) }
  }

  /** À appeler quand les réglages `theme` ou `couleurs` changent : rediffuse si le résultat diffère. */
  recalculer(): void {
    const r = this.deps.reglages()
    const nt = this.deps.nativeTheme
    this.lireSysteme()
    const effectif = this.effectif()
    // Les sites suivent Lyra (« Demander aux sites leur version sombre quand Lyra est sombre ») ou restent en clair.
    const source = !r.couleurs.prefersColorScheme ? 'light' : suitLeSysteme(r) ? 'system' : effectif.mode === 'sombre' ? 'dark' : 'light'
    if (nt.themeSource !== source) nt.themeSource = source
    const serie = JSON.stringify(effectif)
    if (serie !== this.derniere) {
      this.derniere = serie
      this.deps.diffuser(effectif)
    }
    this.armer(r)
  }

  private horloge(): Date {
    return this.deps.horloge?.() ?? new Date()
  }

  private fuseau(): string {
    return this.deps.fuseau?.() ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  }

  private contexte(): ContexteTheme {
    return { systemeSombre: this.systemeSombre, maintenant: this.horloge(), fuseau: this.fuseau() }
  }

  /** Mode du système : lu quand `themeSource` le suit, sinon dernière valeur connue (Windows : lecture directe). */
  private lireSysteme(): void {
    const nt = this.deps.nativeTheme
    if (nt.themeSource === 'system') this.systemeSombre = nt.shouldUseDarkColors
    else if (process.platform === 'win32' && typeof nt.shouldUseDarkColorsForSystemIntegratedUI === 'boolean') {
      this.systemeSombre = nt.shouldUseDarkColorsForSystemIntegratedUI
    }
  }

  private desarmer(): void {
    if (this.minuteur !== undefined) clearTimeout(this.minuteur)
    this.minuteur = undefined
  }

  /** Minuterie jusqu'au prochain coucher/lever (« Au coucher du soleil ») ou début/fin de plage (« À une heure fixe »). */
  private armer(r: ReglagesTheme): void {
    this.desarmer()
    if (!this.demarre || !estProgramme(r)) return
    const maintenant = this.horloge()
    const { passage, heureSombre, heureClair } = r.couleurs
    const echeance = passage === 'heure' ? prochaineEcheanceHeure(maintenant, heureSombre, heureClair, this.fuseau()) : prochainChangement(maintenant, this.fuseau())
    const attente = echeance.getTime() - maintenant.getTime() + MARGE_MS
    this.minuteur = setTimeout(() => this.recalculer(), Math.max(MARGE_MS, Math.min(attente, ATTENTE_MAX_MS)))
    this.minuteur.unref?.()
  }
}
