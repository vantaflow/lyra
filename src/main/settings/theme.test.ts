import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reglagesParDefautD } from './defaults-d'
import { THEMES, deriver } from '../../shared/themes'
import { rapport } from '../../shared/contraste'
import { COULEURS_INDIGO_NUIT, type CouleursTheme, type ReglagesCouleurs } from '../../shared/types-reglages'
import type { ThemeDiffuse } from '../../shared/ipc'
import { heuresSoleilLocales } from '../../shared/fuseaux-soleil'
import { GestionnaireTheme, themeEffectif, variablesPrivees, type NativeThemeLike, type ReglagesTheme } from './theme'

type ThemeReglage = ReglagesTheme['theme']
const couleurs = (surcharge: Partial<ReglagesCouleurs> = {}): ReglagesCouleurs => ({ ...reglagesParDefautD().couleurs, ...surcharge })
const reglage = (theme: ThemeReglage, surcharge: Partial<ReglagesCouleurs> = {}): ReglagesTheme => ({ theme, couleurs: couleurs(surcharge) })
const PARIS = 'Europe/Paris'
const MIDI = new Date('2026-06-21T10:00:00Z') // 12 h à Paris
const NUIT = new Date('2026-06-21T21:30:00Z') // 23 h 30 à Paris
const ctx = (systemeSombre: boolean, maintenant = MIDI): Parameters<typeof themeEffectif>[1] => ({ systemeSombre, maintenant, fuseau: PARIS })

describe('themeEffectif : une seule source de vérité (theme + passage)', () => {
  it.each([
    ['systeme', 'systeme', false, 'clair'],
    ['systeme', 'systeme', true, 'sombre'],
    ['systeme', 'coucher', true, 'sombre'], // passage ignoré hors « programme »
    ['clair', 'systeme', true, 'clair'],
    ['clair', 'coucher', true, 'clair'],
    ['sombre', 'systeme', false, 'sombre'],
    ['sombre', 'jamais', false, 'sombre'],
    ['programme', 'systeme', true, 'sombre'],
    ['programme', 'systeme', false, 'clair'],
    ['programme', 'jamais', true, 'clair'],
    ['programme', 'heure', true, 'clair'], // midi, plage 21:00 → 07:00 : clair, le système est ignoré
    ['programme', 'heure', false, 'clair']
  ] as const)('theme=%s passage=%s système sombre=%s → %s', (theme, passage, systemeSombre, attendu) => {
    expect(themeEffectif(reglage(theme, { passage }), ctx(systemeSombre)).mode).toBe(attendu)
  })

  it('programme + coucher : clair en journée, sombre après le coucher (table du fuseau), sans regarder le système', () => {
    const r = reglage('programme', { passage: 'coucher' })
    expect(themeEffectif(r, ctx(true, MIDI)).mode).toBe('clair')
    expect(themeEffectif(r, ctx(false, NUIT)).mode).toBe('sombre')
  })

  it('le nom, les variables et le thème actif suivent couleurs.actif et le mode', () => {
    const e = themeEffectif(reglage('sombre', { actif: 'foret' }), ctx(false))
    expect(e.nom).toBe('foret')
    expect(e.variables).toEqual(deriver(THEMES.foret.couleurs, 'sombre'))
    expect(themeEffectif(reglage('clair', { actif: 'sable' }), ctx(true)).variables['--page']).toBe(THEMES.sable.couleurs['pages-fond'].clair)
  })

  it('Nuit complète donne un ciel sombre même en mode clair', () => {
    const v = themeEffectif(reglage('clair', { actif: 'nuit-complete' }), ctx(false)).variables
    expect(v['--ciel']).toBe(THEMES['nuit-complete'].couleurs['ciel-fond'].sombre)
  })

  it('« Mes couleurs » : les couleurs personnalisées sont appliquées ; sans elles, Indigo nuit', () => {
    const perso: CouleursTheme = structuredClone(COULEURS_INDIGO_NUIT)
    perso['ciel-fond'].clair = '#102030'
    perso.accent.sombre = '#FF8800'
    expect(themeEffectif(reglage('clair', { actif: 'mes-couleurs', personnalisees: perso }), ctx(false)).variables['--ciel']).toBe('#102030')
    expect(themeEffectif(reglage('sombre', { actif: 'mes-couleurs', personnalisees: perso }), ctx(false)).variables['--accent']).toBe('#FF8800')
    expect(themeEffectif(reglage('clair', { actif: 'mes-couleurs', personnalisees: null }), ctx(false)).variables['--ciel']).toBe('#15152E')
  })
})

describe('thème des fenêtres privées', () => {
  it('vient de couleurs.privee (Aurore par défaut), dans le mode effectif, indépendamment du thème du profil', () => {
    for (const mode of ['clair', 'sombre'] as const) {
      const v = variablesPrivees(couleurs({ actif: 'sable' }), mode)
      expect(v['--ciel']).toBe('#2A1540') // le ciel privé reste Aurore dans les deux modes
      expect(v['--page']).toBe(THEMES.aurore.couleurs['pages-fond'][mode]) // capsule et pages suivent le mode
      expect(v['--capsule-fond']).toBe(THEMES.aurore.couleurs['capsule-fond'][mode])
    }
  })
  it('suit le choix de couleurs.privee, y compris « Mes couleurs »', () => {
    expect(variablesPrivees(couleurs({ privee: 'foret' }), 'clair')['--ciel']).toBe(THEMES.foret.couleurs['ciel-fond'].clair)
    const perso: CouleursTheme = structuredClone(COULEURS_INDIGO_NUIT)
    perso['ciel-fond'].clair = '#223344'
    expect(variablesPrivees(couleurs({ privee: 'mes-couleurs', personnalisees: perso }), 'sombre')['--ciel']).toBe('#223344')
  })
  it('changer le thème du profil ne touche pas les variables privées', () => {
    const a = new GestionnaireTheme(depsGestionnaire(reglage('clair', { actif: 'indigo-nuit' }))).effectif()
    const b = new GestionnaireTheme(depsGestionnaire(reglage('clair', { actif: 'sable' }))).effectif()
    expect(a.privee).toEqual(b.privee)
    expect(a.variables).not.toEqual(b.variables)
  })
})

// ---- Gestionnaire (horloge et nativeTheme simulés) ----
interface NativeSimule extends NativeThemeLike {
  emettre(): void
  /** Change le thème du système (visible quand themeSource = « system »). */
  fixerSysteme(sombre: boolean): void
}
function nativeSimule(systemeSombre = false): NativeSimule {
  const ecouteurs = new Set<() => void>()
  const n: NativeSimule = {
    themeSource: 'system',
    get shouldUseDarkColors() {
      return n.themeSource === 'system' ? systemeSombre : n.themeSource === 'dark'
    },
    fixerSysteme: (sombre) => void (systemeSombre = sombre),
    on: (_e, cb) => void ecouteurs.add(cb),
    off: (_e, cb) => void ecouteurs.delete(cb),
    emettre: () => ecouteurs.forEach((cb) => cb())
  }
  return n
}
let courant: ReglagesTheme
let diffusions: ThemeDiffuse[]
function depsGestionnaire(r: ReglagesTheme, nt: NativeThemeLike = nativeSimule()) {
  courant = r
  diffusions = []
  return { reglages: () => courant, nativeTheme: nt, fuseau: () => PARIS, diffuser: (t: ThemeDiffuse) => void diffusions.push(t) }
}

describe('GestionnaireTheme', () => {
  beforeEach(() => vi.useFakeTimers({ now: MIDI }))
  afterEach(() => vi.useRealTimers())

  it('demarrer diffuse le thème effectif et règle nativeTheme.themeSource', () => {
    const nt = nativeSimule()
    const g = new GestionnaireTheme(depsGestionnaire(reglage('sombre'), nt))
    g.demarrer()
    expect(diffusions).toHaveLength(1)
    expect(diffusions[0].mode).toBe('sombre')
    expect(diffusions[0].variables['--ciel']).toBe('#0E0E1E')
    expect(nt.themeSource).toBe('dark')
    g.arreter()
  })

  it.each([
    ['systeme', {}, 'system'],
    ['clair', {}, 'light'],
    ['sombre', {}, 'dark'],
    ['programme', { passage: 'coucher' as const }, 'light'] // midi : clair
  ] as const)('prefersColorScheme actif, theme=%s → themeSource %s', (theme, surcharge, source) => {
    const nt = nativeSimule()
    new GestionnaireTheme(depsGestionnaire(reglage(theme, surcharge), nt)).demarrer()
    expect(nt.themeSource).toBe(source)
  })

  it('prefersColorScheme désactivé : les sites voient toujours « clair », Lyra reste sombre', () => {
    const nt = nativeSimule()
    const g = new GestionnaireTheme(depsGestionnaire(reglage('sombre', { prefersColorScheme: false }), nt))
    g.demarrer()
    expect(nt.themeSource).toBe('light')
    expect(diffusions[0].mode).toBe('sombre')
  })

  it('« Avec le système » suit le changement du système (évènement updated) sans redémarrage', () => {
    const nt = nativeSimule(false)
    const g = new GestionnaireTheme(depsGestionnaire(reglage('systeme'), nt))
    g.demarrer()
    expect(diffusions.at(-1)!.mode).toBe('clair')
    nt.fixerSysteme(true)
    nt.emettre()
    expect(diffusions.at(-1)!.mode).toBe('sombre')
    g.arreter()
  })

  it('le système reste connu quand themeSource est forcé (prefersColorScheme désactivé)', () => {
    const nt = nativeSimule(true)
    const g = new GestionnaireTheme(depsGestionnaire(reglage('systeme', { prefersColorScheme: false }), nt))
    g.demarrer()
    expect(nt.themeSource).toBe('light')
    expect(diffusions.at(-1)!.mode).toBe('sombre')
    g.arreter()
  })

  it('« Au coucher du soleil » : bascule à l’heure dite, puis revient au lever, themeSource inclus', () => {
    const nt = nativeSimule()
    const g = new GestionnaireTheme(depsGestionnaire(reglage('programme', { passage: 'coucher' }), nt))
    g.demarrer()
    expect(diffusions.at(-1)!.mode).toBe('clair')
    const { coucher, lever } = heuresSoleilLocales(PARIS, MIDI, 5)
    // Un quart d'heure avant le coucher : toujours clair ; un quart d'heure après : sombre.
    vi.advanceTimersByTime((coucher - 12 - 0.25) * 3_600_000)
    expect(diffusions.at(-1)!.mode).toBe('clair')
    vi.advanceTimersByTime(0.5 * 3_600_000)
    expect(diffusions.at(-1)!.mode).toBe('sombre')
    expect(nt.themeSource).toBe('dark')
    // Jusqu'au lever du lendemain.
    vi.advanceTimersByTime((24 - coucher + lever) * 3_600_000)
    expect(diffusions.at(-1)!.mode).toBe('clair')
    expect(nt.themeSource).toBe('light')
    g.arreter()
  })

  it('« Jamais » reste clair, même la nuit, et ne programme aucune minuterie', () => {
    vi.setSystemTime(NUIT)
    const g = new GestionnaireTheme(depsGestionnaire(reglage('clair')))
    g.demarrer()
    expect(diffusions.at(-1)!.mode).toBe('clair')
    expect(vi.getTimerCount()).toBe(0)
    g.arreter()
  })

  it('recalculer ne rediffuse que si le résultat change ; une couleur modifiée est rediffusée', () => {
    const g = new GestionnaireTheme(depsGestionnaire(reglage('clair')))
    g.demarrer()
    g.recalculer()
    expect(diffusions).toHaveLength(1)
    courant = reglage('clair', { actif: 'encre' })
    g.recalculer()
    expect(diffusions).toHaveLength(2)
    expect(diffusions[1].nom).toBe('encre')
    g.arreter()
  })

  it('changer pour « Au coucher du soleil » arme la minuterie, en repartir la supprime', () => {
    const g = new GestionnaireTheme(depsGestionnaire(reglage('clair')))
    g.demarrer()
    expect(vi.getTimerCount()).toBe(0)
    courant = reglage('programme', { passage: 'coucher' })
    g.recalculer()
    expect(vi.getTimerCount()).toBe(1)
    courant = reglage('sombre')
    g.recalculer()
    expect(vi.getTimerCount()).toBe(0)
    g.arreter()
  })

  it('retour de veille (powerMonitor resume) : recalcule tout de suite, même si la minuterie n’a pas sonné', () => {
    const ecouteurs = new Set<() => void>()
    const energie = { on: (_e: 'resume', cb: () => void) => void ecouteurs.add(cb), off: (_e: 'resume', cb: () => void) => void ecouteurs.delete(cb) }
    const g = new GestionnaireTheme({ ...depsGestionnaire(reglage('programme', { passage: 'coucher' })), energie })
    g.demarrer()
    expect(diffusions.at(-1)!.mode).toBe('clair')
    // L'ordinateur dort de midi à 23 h 30 : l'horloge saute sans que les minuteries aient tourné.
    vi.setSystemTime(NUIT)
    expect(ecouteurs.size).toBe(1)
    ecouteurs.forEach((cb) => cb())
    expect(diffusions.at(-1)!.mode).toBe('sombre')
    g.arreter()
    expect(ecouteurs.size).toBe(0)
  })

  it('arreter retire la minuterie et l’écouteur nativeTheme', () => {
    const nt = nativeSimule()
    const g = new GestionnaireTheme(depsGestionnaire(reglage('programme', { passage: 'coucher' }), nt))
    g.demarrer()
    g.arreter()
    expect(vi.getTimerCount()).toBe(0)
    const n = diffusions.length
    nt.emettre()
    expect(diffusions).toHaveLength(n)
  })
})

describe('« À une heure fixe » (couleurs.passage = heure)', () => {
  beforeEach(() => vi.useFakeTimers({ now: MIDI }))
  afterEach(() => vi.useRealTimers())
  const heure = (hhmm: string): Date => new Date(`2026-06-21T${hhmm}:00+02:00`)
  const r = (sombre = '21:00', clair = '07:00'): ReglagesTheme => reglage('programme', { passage: 'heure', heureSombre: sombre, heureClair: clair })

  it.each([
    ['avant la plage', '20:59', 'clair'],
    ['au début', '21:00', 'sombre'],
    ['pendant, avant minuit', '23:30', 'sombre'],
    ['pendant, après minuit', '03:00', 'sombre'],
    ['à la fin', '07:00', 'clair'],
    ['après la plage', '12:00', 'clair']
  ] as const)('plage à cheval sur minuit, %s (%s) → %s', (_n, h, attendu) => {
    expect(themeEffectif(r(), ctx(true, heure(h))).mode).toBe(attendu)
  })
  it('plage dans la journée', () => {
    expect(themeEffectif(r('13:00', '15:00'), ctx(false, heure('14:00'))).mode).toBe('sombre')
    expect(themeEffectif(r('13:00', '15:00'), ctx(true, heure('16:00'))).mode).toBe('clair')
  })
  it('début = fin : toujours sombre', () => {
    expect(themeEffectif(r('08:00', '08:00'), ctx(false, heure('12:00'))).mode).toBe('sombre')
  })
  it('par défaut : 21:00 → 07:00', () => {
    expect(reglagesParDefautD().couleurs).toMatchObject({ heureSombre: '21:00', heureClair: '07:00' })
  })
  it('bascule à l’heure dite avec l’horloge simulée, themeSource inclus, puis revient à l’heure de fin', () => {
    vi.setSystemTime(heure('20:50'))
    const nt = nativeSimule()
    const g = new GestionnaireTheme(depsGestionnaire(r(), nt))
    g.demarrer()
    expect(diffusions.at(-1)!.mode).toBe('clair')
    vi.advanceTimersByTime(9 * 60_000)
    expect(diffusions.at(-1)!.mode).toBe('clair') // 20:59
    vi.advanceTimersByTime(2 * 60_000)
    expect(diffusions.at(-1)!.mode).toBe('sombre') // 21:01
    expect(nt.themeSource).toBe('dark')
    vi.advanceTimersByTime(10 * 3_600_000) // 07:01
    expect(diffusions.at(-1)!.mode).toBe('clair')
    expect(nt.themeSource).toBe('light')
    g.arreter()
  })
  it('changer d’heure de début réarme la minuterie et recalcule', () => {
    vi.setSystemTime(heure('12:00'))
    courant = r()
    const g = new GestionnaireTheme(depsGestionnaire(courant))
    g.demarrer()
    expect(vi.getTimerCount()).toBe(1)
    courant = r('11:00', '13:00')
    g.recalculer()
    expect(diffusions.at(-1)!.mode).toBe('sombre')
    g.arreter()
  })
})

describe('correction automatique du contraste (couleurs.corrigerContraste)', () => {
  const pale = (): CouleursTheme => {
    const p: CouleursTheme = structuredClone(COULEURS_INDIGO_NUIT)
    p['ciel-texte'].clair = '#3A3A60' // sur #15152E : sous 4,5:1
    p.accent.clair = '#DDDDFF' // sur la page blanche : très pâle
    return p
  }
  const avec = (corrigerContraste: boolean): ReglagesTheme => reglage('clair', { actif: 'mes-couleurs', personnalisees: pale(), corrigerContraste })

  it('actif : la variable diffusée atteint 4,5:1 et la couleur enregistrée reste intacte', () => {
    const r = avec(true)
    const avant = JSON.stringify(r.couleurs.personnalisees)
    const v = themeEffectif(r, ctx(false)).variables
    expect(rapport(v['--ciel-texte'], v['--ciel'])).toBeGreaterThanOrEqual(4.5)
    expect(rapport(v['--accent'], v['--page'])).toBeGreaterThanOrEqual(4.5)
    expect(v['--ciel-texte']).not.toBe('#3A3A60')
    expect(JSON.stringify(r.couleurs.personnalisees)).toBe(avant)
  })
  it('désactivé : la valeur choisie est diffusée telle quelle', () => {
    const v = themeEffectif(avec(false), ctx(false)).variables
    expect(v['--ciel-texte']).toBe('#3A3A60')
    expect(v['--accent']).toBe('#DDDDFF')
  })
  it('actif, thème par défaut en clair : variables identiques à deriver (aucune paire fautive)', () => {
    const e = themeEffectif(reglage('clair'), ctx(false))
    expect(e.variables).toEqual(deriver(COULEURS_INDIGO_NUIT, 'clair'))
  })
  it('les fenêtres privées sont corrigées de la même façon', () => {
    const p = pale()
    p['ciel-texte'].clair = '#2A2A50'
    const v = variablesPrivees(couleurs({ privee: 'mes-couleurs', personnalisees: p, corrigerContraste: true }), 'clair')
    expect(rapport(v['--ciel-texte'], v['--ciel'])).toBeGreaterThanOrEqual(4.5)
    const brut = variablesPrivees(couleurs({ privee: 'mes-couleurs', personnalisees: p, corrigerContraste: false }), 'clair')
    expect(brut['--ciel-texte']).toBe('#2A2A50')
  })
})
