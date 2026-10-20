import { describe, it, expect } from 'vitest'
import { validerPatch } from './validate'
import { reglagesParDefaut } from './defaults'
import { COULEURS_INDIGO_NUIT } from '../../shared/types-reglages'

const hex = (c: string) => ({ clair: c, sombre: c })
const CLES = ['ciel-fond', 'ciel-texte', 'etoile-active', 'etoile-active-fond', 'etoiles', 'etoiles-endormies', 'lignes', 'capsule-fond', 'capsule-texte', 'accent', 'boucliers', 'pages-fond', 'nouvel-onglet-ciel']
const couleurs13 = (c = '#112233') => Object.fromEntries(CLES.map((k) => [k, hex(c)]))

describe('défauts D', () => {
  it('version 2 et blocs présents', () => {
    const d = reglagesParDefaut('/dl')
    expect(d.version).toBe(2)
    expect(d.apparence.tailleTexte).toBe(13)
    expect(d.couleurs.couleurParConstellation).toBe(true)
    expect(d.couleurs.personnalisees).toBeNull()
    expect(d.dnd).toEqual({ duree: 60 })
    expect(d.raccourcis).toEqual({})
    expect(d.styles).toEqual({ css: '', scripts: [] })
  })
})

describe('theme', () => {
  it('accepte les 4 valeurs, refuse le reste', () => {
    for (const t of ['systeme', 'clair', 'sombre', 'programme']) expect(validerPatch({ theme: t })).toEqual({ theme: t })
    expect(validerPatch({ theme: 'rose' })).toEqual({})
    expect(validerPatch({ theme: { a: 1 } })).toEqual({})
  })
})

describe('apparence', () => {
  it('valeurs valides', () => {
    const a = { relierEnfants: false, iconesSites: true, archiverApresJours: 30, nouvelleEtoile: 'fin-constellation', regrouperParSite: true, police: 'Georgia', tailleTexte: 15, densite: 'compacte', coinsArrondis: false, capsuleAuto: true }
    expect(validerPatch({ apparence: a })).toEqual({ apparence: a })
    expect(validerPatch({ apparence: { archiverApresJours: null } })).toEqual({ apparence: { archiverApresJours: null } })
  })
  it('enums invalides et bornes dépassées', () => {
    expect(validerPatch({ apparence: { nouvelleEtoile: 'ailleurs' } })).toEqual({})
    expect(validerPatch({ apparence: { densite: 'large' } })).toEqual({})
    expect(validerPatch({ apparence: { tailleTexte: 10 } })).toEqual({})
    expect(validerPatch({ apparence: { tailleTexte: 18 } })).toEqual({})
    expect(validerPatch({ apparence: { tailleTexte: 11 } })).toEqual({ apparence: { tailleTexte: 11 } })
    expect(validerPatch({ apparence: { archiverApresJours: 0 } })).toEqual({})
    expect(validerPatch({ apparence: { relierEnfants: 'oui' } })).toEqual({})
    expect(validerPatch({ apparence: { police: 'x'.repeat(101) } })).toEqual({})
  })
})

describe('couleurs', () => {
  it('valeurs valides', () => {
    const c = { actif: 'foret', privee: 'aurore', passage: 'coucher', personnalisees: couleurs13(), cielTeinteParSite: true, couleurParConstellation: true, prefersColorScheme: false }
    expect(validerPatch({ couleurs: c })).toEqual({ couleurs: c })
    expect(validerPatch({ couleurs: { personnalisees: null } })).toEqual({ couleurs: { personnalisees: null } })
  })
  it('thème inconnu, passage invalide', () => {
    expect(validerPatch({ couleurs: { actif: 'arc-en-ciel' } })).toEqual({})
    expect(validerPatch({ couleurs: { passage: 'midi' } })).toEqual({})
  })
  it('personnalisées : clés ou modes manquants complétés par Indigo nuit, le reste rejeté', () => {
    const sans = couleurs13() as Record<string, unknown>
    delete sans.accent
    sans.etoiles = { clair: '#010203' }
    const r = validerPatch({ couleurs: { personnalisees: sans } }) as { couleurs: { personnalisees: Record<string, { clair: string; sombre: string }> } }
    const p = r.couleurs.personnalisees
    expect(Object.keys(p)).toHaveLength(13)
    expect(p.accent).toEqual(COULEURS_INDIGO_NUIT.accent)
    expect(p.etoiles).toEqual({ clair: '#010203', sombre: COULEURS_INDIGO_NUIT.etoiles.sombre })
    expect(p['ciel-fond']).toEqual(hex('#112233'))
    expect(validerPatch({ couleurs: { personnalisees: {} } })).toEqual({ couleurs: { personnalisees: COULEURS_INDIGO_NUIT } })
    expect(validerPatch({ couleurs: { personnalisees: { accent: { clair: 'rouge' } } } })).toEqual({})
    expect(validerPatch({ couleurs: { personnalisees: { accent: { clair: '#112233', ton: '#000000' } } } })).toEqual({})
  })
  it('personnalisées : hex #RRGGBB strict, clé inconnue rejetée', () => {
    expect(validerPatch({ couleurs: { personnalisees: couleurs13('#abc') } })).toEqual({})
    expect(validerPatch({ couleurs: { personnalisees: couleurs13('red') } })).toEqual({})
    expect(validerPatch({ couleurs: { personnalisees: couleurs13('#11223344') } })).toEqual({})
    expect(validerPatch({ couleurs: { personnalisees: { ...couleurs13(), inconnue: hex('#112233') } } })).toEqual({})
    expect(validerPatch({ couleurs: { personnalisees: 'x' } })).toEqual({})
  })
})

describe('palette, confidentialité, gestes, démarrage', () => {
  it('booléens et enums', () => {
    expect(validerPatch({ palette: { suggestionsHistorique: false, suggestionsFavoris: true, suggestionsEnPrivee: true } })).toEqual({ palette: { suggestionsHistorique: false, suggestionsFavoris: true, suggestionsEnPrivee: true } })
    expect(validerPatch({ palette: { suggestionsFavoris: 1 } })).toEqual({})
    expect(validerPatch({ confidentialite: { effacerHistorique: true, effacerCookies: true, effacerCache: false } })).toEqual({ confidentialite: { effacerHistorique: true, effacerCookies: true, effacerCache: false } })
    expect(validerPatch({ confidentialite: { effacerCache: 'x' } })).toEqual({})
    expect(validerPatch({ gestes: { defilementHorizontal: true, clicMolette: false, molettePlusCmdZoom: true } })).toEqual({ gestes: { defilementHorizontal: true, clicMolette: false, molettePlusCmdZoom: true } })
    expect(validerPatch({ gestes: { clicMolette: 'x' } })).toEqual({})
    expect(validerPatch({ demarrage: { restaurer: false, pageAccueil: 'https://a.fr', nouvelleFenetre: 'vide' } })).toEqual({ demarrage: { restaurer: false, pageAccueil: 'https://a.fr', nouvelleFenetre: 'vide' } })
    expect(validerPatch({ demarrage: { pageAccueil: '' } })).toEqual({ demarrage: { pageAccueil: '' } })
    expect(validerPatch({ demarrage: { nouvelleFenetre: 'ailleurs' } })).toEqual({})
    expect(validerPatch({ demarrage: { pageAccueil: 'x'.repeat(2049) } })).toEqual({})
  })
})

describe('dnd', () => {
  it('durée 30, 60 ou arret', () => {
    for (const d of [30, 60, 'arret']) expect(validerPatch({ dnd: { duree: d } })).toEqual({ dnd: { duree: d } })
    expect(validerPatch({ dnd: { duree: 45 } })).toEqual({})
    expect(validerPatch({ dnd: { duree: 'x' } })).toEqual({})
    expect(validerPatch({ dnd: { exceptions: ['a'] } })).toEqual({})
  })
})

describe('raccourcis et labo', () => {
  it('raccourcis : accélérateurs texte, vide accepté, 200 entrées au plus', () => {
    expect(validerPatch({ raccourcis: { 'onglet.nouveau': 'CmdOrCtrl+T', 'x.y': '' } })).toEqual({ raccourcis: { 'onglet.nouveau': 'CmdOrCtrl+T', 'x.y': '' } })
    expect(validerPatch({ raccourcis: { a: 1, b: 'Alt+B' } })).toEqual({ raccourcis: { b: 'Alt+B' } })
    expect(validerPatch({ raccourcis: { a: 'x'.repeat(65) } })).toEqual({})
    const beaucoup = Object.fromEntries(Array.from({ length: 250 }, (_, i) => [`c${i}`, 'Alt+X']))
    expect(Object.keys((validerPatch({ raccourcis: beaucoup }) as { raccourcis: object }).raccourcis)).toHaveLength(200)
    expect(validerPatch({ raccourcis: [1] })).toEqual({})
  })
  it('labo : booléens uniquement', () => {
    expect(validerPatch({ labo: { 'a-b': true, c: 'x' } })).toEqual({ labo: { 'a-b': true } })
  })
})

describe('styles', () => {
  const sc = { nom: 'Mon script', code: 'console.log(1)', actif: true }
  it('valeurs valides', () => {
    expect(validerPatch({ styles: { css: 'body{color:red}', scripts: [sc] } })).toEqual({ styles: { css: 'body{color:red}', scripts: [sc] } })
    expect(validerPatch({ styles: { css: '' } })).toEqual({ styles: { css: '' } })
  })
  it('tailles : 100 Ko pour le CSS et chaque script, 50 scripts', () => {
    expect(validerPatch({ styles: { css: 'a'.repeat(102_400) } })).toEqual({ styles: { css: 'a'.repeat(102_400) } })
    expect(validerPatch({ styles: { css: 'a'.repeat(102_401) } })).toEqual({})
    expect(validerPatch({ styles: { scripts: [{ ...sc, code: 'a'.repeat(102_401) }] } })).toEqual({})
    const scripts = Array.from({ length: 60 }, (_, i) => ({ ...sc, nom: `s${i}` }))
    expect((validerPatch({ styles: { scripts } }) as { styles: { scripts: unknown[] } }).styles.scripts).toHaveLength(50)
    expect(validerPatch({ styles: { scripts: [{ nom: '', code: 'x', actif: true }] } })).toEqual({})
    expect(validerPatch({ styles: { scripts: [] } })).toEqual({ styles: { scripts: [] } })
  })
})

describe('RegleSite étendue', () => {
  const o = 'https://youtube.com'
  it('valeurs valides', () => {
    const regle = { boucliers: 'strict', scriptletsYoutube: true, cookies: 'premiere-partie', scripts: 'bloques', lectureAuto: 'sans-son', ua: 'ipad', style: 'a{b:c}', scriptsPerso: [{ nom: 'n', code: 'c', actif: false }], zoom: 1 }
    expect(validerPatch({ sites: { [o]: regle } })).toEqual({ sites: { [o]: regle } })
  })
  it('boucliers : booléen, tri-état, le reste ignoré', () => {
    for (const b of [true, false, 'desactives', 'standard', 'strict']) expect(validerPatch({ sites: { [o]: { boucliers: b } } })).toEqual({ sites: { [o]: { boucliers: b } } })
    expect(validerPatch({ sites: { [o]: { boucliers: 'max' } } })).toEqual({})
  })
  it('enums invalides ignorées champ par champ', () => {
    expect(validerPatch({ sites: { [o]: { cookies: 'x', scripts: 'y', lectureAuto: 'z', zoom: 2 } } })).toEqual({ sites: { [o]: { zoom: 2 } } })
    expect(validerPatch({ sites: { [o]: { scriptletsYoutube: 'oui' } } })).toEqual({})
  })
  it('style ≤ 100 Ko, scriptsPerso ≤ 50 de ≤ 100 Ko, ua = clé de profil', () => {
    expect(validerPatch({ sites: { [o]: { style: 'a'.repeat(102_401) } } })).toEqual({})
    expect(validerPatch({ sites: { [o]: { style: 'a'.repeat(102_400) } } })).toEqual({ sites: { [o]: { style: 'a'.repeat(102_400) } } })
    expect(validerPatch({ sites: { [o]: { scriptsPerso: [{ nom: 'n', code: 'a'.repeat(102_401), actif: true }] } } })).toEqual({})
    expect(validerPatch({ sites: { [o]: { ua: 'x'.repeat(65) } } })).toEqual({})
    expect(validerPatch({ sites: { [o]: { ua: '' } } })).toEqual({})
  })
})

describe('couleurs : heures du passage « À une heure fixe »', () => {
  it.each(['00:00', '07:00', '21:30', '23:59'])('accepte %s', (h) => {
    expect(validerPatch({ couleurs: { heureSombre: h, heureClair: h } })).toEqual({ couleurs: { heureSombre: h, heureClair: h } })
  })
  it.each(['24:00', '7:00', '21:60', '21h00', 21, null, ''])('refuse %j', (h) => {
    expect(validerPatch({ couleurs: { heureSombre: h } })).toEqual({})
    expect(validerPatch({ couleurs: { heureClair: h } })).toEqual({})
  })
})
