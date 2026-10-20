/**
 * Accélérateurs au format Electron (`CmdOrCtrl+Shift+D`) : analyse, normalisation, correspondance avec un évènement
 * clavier, refus (réservés, natifs, sans ⌘/Ctrl) et détection de conflit. Module pur : aucune dépendance à Electron.
 */

export type Plateforme = NodeJS.Platform | string

export interface Combinaison {
  /** `CmdOrCtrl` : ⌘ sur macOS, Ctrl ailleurs. */
  cmdOuCtrl: boolean
  /** `Cmd` : ⌘ (macOS seulement). */
  cmd: boolean
  /** `Ctrl` : la touche Ctrl, sur toutes les plateformes. */
  ctrl: boolean
  alt: boolean
  shift: boolean
  touche: string
}

const MODIFICATEURS: Record<string, 'cmdOuCtrl' | 'cmd' | 'ctrl' | 'alt' | 'shift'> = {
  cmdorctrl: 'cmdOuCtrl',
  commandorcontrol: 'cmdOuCtrl',
  cmd: 'cmd',
  command: 'cmd',
  ctrl: 'ctrl',
  control: 'ctrl',
  alt: 'alt',
  option: 'alt',
  shift: 'shift'
}

const NOMMEES: Record<string, string> = {
  plus: 'Plus',
  space: 'Space',
  tab: 'Tab',
  escape: 'Escape',
  esc: 'Escape',
  enter: 'Enter',
  return: 'Enter',
  backspace: 'Backspace',
  delete: 'Delete',
  del: 'Delete',
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown'
}
const PONCTUATION = new Set([',', '.', '/', '\\', ';', "'", '[', ']', '-', '=', '`'])

/** Touche d'un accélérateur sous sa forme canonique, ou null. */
function toucheCanonique(t: string): string | null {
  if (/^[a-z]$/i.test(t)) return t.toUpperCase()
  if (/^[0-9]$/.test(t)) return t
  if (PONCTUATION.has(t)) return t
  const f = /^f(\d{1,2})$/i.exec(t)
  if (f) return Number(f[1]) >= 1 && Number(f[1]) <= 24 ? `F${Number(f[1])}` : null
  return NOMMEES[t.toLowerCase()] ?? null
}

/** Découpe sur `+` sans perdre une touche `+` finale (`Ctrl++` n'est pas produit par Lyra : elle écrit `Plus`). */
export function analyser(accelerateur: string): Combinaison | null {
  if (typeof accelerateur !== 'string' || accelerateur.length === 0 || accelerateur.length > 64) return null
  const jetons = accelerateur.split('+')
  const touche = toucheCanonique(jetons[jetons.length - 1].trim())
  if (!touche) return null
  const c: Combinaison = { cmdOuCtrl: false, cmd: false, ctrl: false, alt: false, shift: false, touche }
  for (const j of jetons.slice(0, -1)) {
    const m = MODIFICATEURS[j.trim().toLowerCase()]
    if (!m) return null
    c[m] = true
  }
  return c
}

/** Forme canonique (ordre `CmdOrCtrl`, `Cmd`, `Ctrl`, `Alt`, `Shift`, touche) ; null si l'accélérateur est invalide. */
export function normaliser(accelerateur: string): string | null {
  const c = analyser(accelerateur)
  return c ? ecrire(c) : null
}

function ecrire(c: Combinaison): string {
  return [c.cmdOuCtrl && 'CmdOrCtrl', c.cmd && 'Cmd', c.ctrl && 'Ctrl', c.alt && 'Alt', c.shift && 'Shift', c.touche].filter(Boolean).join('+')
}

/** Forme comparable : `CmdOrCtrl` résolu selon la plateforme (`Cmd` sur macOS, `Ctrl` ailleurs) ; null si invalide. */
export function canonique(accelerateur: string, plateforme: Plateforme): string | null {
  const c = analyser(accelerateur)
  if (!c) return null
  const mac = plateforme === 'darwin'
  return ecrire({ ...c, cmdOuCtrl: false, cmd: c.cmd || (c.cmdOuCtrl && mac), ctrl: c.ctrl || (c.cmdOuCtrl && !mac) })
}

const CODES_PONCTUATION: Record<string, string> = {
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Minus: '-',
  Equal: '=',
  Backquote: '`'
}
const TOUCHES_SPECIALES: Record<string, string> = {
  Tab: 'Tab',
  ' ': 'Space',
  Spacebar: 'Space',
  Enter: 'Enter',
  Escape: 'Escape',
  Backspace: 'Backspace',
  Delete: 'Delete',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  '+': 'Plus'
}

/**
 * Touche d'un évènement clavier (`KeyboardEvent` ou `Input` d'Electron), ou null (modificateur seul, touche morte…).
 * Une lettre vient de `key` (la touche produite : l'AZERTY donne `a` pour `KeyQ`) ; un chiffre ou un signe vient de
 * `code` quand `key` n'est pas le caractère lui-même (AZERTY : `&` pour `Digit1`) ; une lettre composée (⌥ I donne
 * `ˆ` sous macOS) se replie sur `code`.
 */
export function toucheDeEvenement(e: { key: string; code?: string }): string | null {
  const { key } = e
  const code = e.code ?? ''
  if (/^[a-z]$/i.test(key)) return key.toUpperCase()
  if (/^[0-9]$/.test(key)) return key
  if (TOUCHES_SPECIALES[key]) return TOUCHES_SPECIALES[key]
  if (/^F([1-9]|1\d|2[0-4])$/.test(key)) return key
  if (PONCTUATION.has(key)) return key
  const lettre = /^Key([A-Z])$/.exec(code)
  if (lettre) return lettre[1]
  const chiffre = /^Digit([0-9])$/.exec(code)
  if (chiffre) return chiffre[1]
  if (CODES_PONCTUATION[code]) return CODES_PONCTUATION[code]
  return null
}

export interface EvenementClavier {
  key: string
  code?: string
  control: boolean
  meta: boolean
  alt: boolean
  shift: boolean
}

/** L'évènement clavier est-il exactement cette combinaison (modificateurs compris) ? */
export function correspond(accelerateur: string, e: EvenementClavier, plateforme: Plateforme): boolean {
  const c = analyser(accelerateur)
  if (!c) return false
  const mac = plateforme === 'darwin'
  const ctrl = c.ctrl || (c.cmdOuCtrl && !mac)
  const meta = c.cmd || (c.cmdOuCtrl && mac)
  if (e.control !== ctrl || e.meta !== meta || e.alt !== c.alt || e.shift !== c.shift) return false
  return toucheDeEvenement(e) === c.touche
}

/** Combinaison d'un évènement clavier, au format `CmdOrCtrl+Shift+K` ; null si aucune touche « pleine » n'est pressée. */
export function accelerateurDeEvenement(e: EvenementClavier, plateforme: Plateforme): string | null {
  const touche = toucheDeEvenement(e)
  if (!touche) return null
  const mac = plateforme === 'darwin'
  return ecrire({
    // macOS : ⌘ → CmdOrCtrl, Ctrl reste Ctrl ; ailleurs : Ctrl → CmdOrCtrl (la touche Windows n'est pas prise en charge).
    cmdOuCtrl: mac ? e.meta : e.control,
    cmd: false,
    ctrl: mac ? e.control : false,
    alt: e.alt,
    shift: e.shift,
    touche
  })
}

export type RaisonRefus = 'invalide' | 'modificateur' | 'reserve' | 'natif' | 'saisie'
export type Validation = { ok: true; accelerateur: string } | { ok: false; raison: RaisonRefus }

/** Réservés par le système, par plateforme (forme canonique). */
const RESERVES: Record<'darwin' | 'autre', string[]> = {
  darwin: ['Cmd+Q', 'Cmd+H', 'Cmd+Alt+H', 'Cmd+M', 'Cmd+Tab', 'Cmd+Shift+Tab', 'Cmd+Space', 'Cmd+Alt+Escape', 'Cmd+Shift+3', 'Cmd+Shift+4', 'Cmd+Shift+5', 'Ctrl+Cmd+Q', 'Ctrl+Cmd+Space'],
  autre: ['Alt+F4', 'Alt+Tab', 'Ctrl+Alt+Delete', 'Ctrl+Shift+Escape', 'Ctrl+Escape', 'Alt+Escape']
}
/** Rôles natifs du menu Édition : non redéfinissables, donc non attribuables à une autre commande. */
const NATIFS: Record<'darwin' | 'autre', string[]> = {
  darwin: ['Cmd+C', 'Cmd+V', 'Cmd+X', 'Cmd+Z', 'Cmd+Shift+Z', 'Cmd+A'],
  // Rétablir : Ctrl+Y (Windows), Ctrl+Maj+Z (Linux, et accepté par les champs de texte de Chromium partout).
  autre: ['Ctrl+C', 'Ctrl+V', 'Ctrl+X', 'Ctrl+Z', 'Ctrl+Y', 'Ctrl+Shift+Z', 'Ctrl+A']
}

/** Touches de déplacement, de suppression et de validation : avec ⌘/Ctrl elles pilotent les champs de texte (mots, début/fin). */
const TOUCHES_EDITION = new Set(['Backspace', 'Delete', 'Left', 'Right', 'Up', 'Down', 'Home', 'End', 'PageUp', 'PageDown', 'Space', 'Enter'])

/**
 * La combinaison gênerait-elle la saisie de texte ? Un accélérateur de menu intercepte la touche avant le champ :
 * - ⌘/Ctrl + touche d'édition (Ctrl+Retour arrière efface un mot, ⌘ ← va en début de ligne, Ctrl+Espace change de clavier) ;
 * - Windows/Linux : Ctrl+Alt + caractère, c'est AltGr (« @ », « € », « ~ » sur un clavier AZERTY) ;
 * - macOS : Ctrl + lettre seule (Ctrl A/E/K/F/B/N/P/D/H/T/O/Y sont les raccourcis d'édition de tout champ de texte).
 */
function gene(c: Combinaison, plateforme: Plateforme): boolean {
  if (TOUCHES_EDITION.has(c.touche)) return true
  if (estFonction(c.touche) || c.touche === 'Tab') return false
  if (plateforme === 'darwin') return c.ctrl && !c.cmd && !c.cmdOuCtrl && !c.alt && !c.shift && /^[A-Z]$/.test(c.touche)
  return (c.cmdOuCtrl || c.ctrl) && c.alt
}

const estFonction = (touche: string): boolean => /^F\d+$/.test(touche)

/** Une combinaison attribuable : valide, avec ⌘/Ctrl (sauf touches F), ni réservée au système, ni un rôle natif, ni une gêne pour la saisie. */
export function valider(accelerateur: string, plateforme: Plateforme): Validation {
  const c = analyser(accelerateur)
  if (!c) return { ok: false, raison: 'invalide' }
  if (!(c.cmdOuCtrl || c.cmd || c.ctrl) && !estFonction(c.touche)) return { ok: false, raison: 'modificateur' }
  const cle = plateforme === 'darwin' ? 'darwin' : 'autre'
  const cano = canonique(accelerateur, plateforme)!
  if (RESERVES[cle].includes(cano)) return { ok: false, raison: 'reserve' }
  if (NATIFS[cle].includes(cano)) return { ok: false, raison: 'natif' }
  if (gene(c, plateforme)) return { ok: false, raison: 'saisie' }
  return { ok: true, accelerateur: ecrire(c) }
}

/** L'identifiant de la commande qui porte déjà cette combinaison (hors `pour`), ou null. */
export function detecterConflit(table: Record<string, string>, pour: string, accelerateur: string, plateforme: Plateforme): string | null {
  const cible = canonique(accelerateur, plateforme)
  if (!cible) return null
  for (const [id, a] of Object.entries(table)) if (id !== pour && canonique(a, plateforme) === cible) return id
  return null
}

const SYMBOLES: Record<string, string> = { CmdOrCtrl: '⌘', Cmd: '⌘', Ctrl: '⌃', Alt: '⌥', Shift: '⇧' }
const TOUCHES_SYMBOLES: Record<string, string> = { Plus: '+', Tab: '⇥', Enter: '↩', Escape: '⎋', Backspace: '⌫', Delete: '⌦', Up: '↑', Down: '↓', Left: '←', Right: '→' }

/** Combinaison au format du design (« ⌘ ⇧ D ») ; `raccourci()` (UI) l'adapte à la plateforme. */
export function versSymboles(accelerateur: string): string {
  const c = analyser(accelerateur)
  if (!c) return accelerateur
  // Ordre du design (« ⌥ ⌘ I », « ⌘ ⇧ N ») : ⌃ ⌥ ⌘ ⇧.
  const mods = [c.ctrl && SYMBOLES.Ctrl, c.alt && SYMBOLES.Alt, (c.cmdOuCtrl || c.cmd) && SYMBOLES.Cmd, c.shift && SYMBOLES.Shift].filter(Boolean) as string[]
  return [...mods, TOUCHES_SYMBOLES[c.touche] ?? c.touche].join(' ')
}
