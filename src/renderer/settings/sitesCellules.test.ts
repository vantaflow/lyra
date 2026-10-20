import type { ExtensionInstallee } from '../../shared/types'
import { describe, expect, it } from 'vitest'
import {
  PALETTE_PASTILLES,
  PALIERS_ZOOM,
  celluleBoucliers,
  celluleCookies,
  celluleDnd,
  celluleExtensions,
  celluleScripts,
  celluleStyle,
  celluleZoom,
  decoderRoute,
  encoderRoute,
  extensionsDuSite,
  recordExtensions,
  idZoom,
  optionsZoom,
  pastille,
  zoomDepuisId,
  heritage,
  boucliersHerites,
  effective,
  heritee,
  nomScriptLibre,
  regleInitiale,
  siteDeSaisie,
  urlDeCle,
  valeurAEcrire,
  vientDHeritage
} from './sitesCellules'

const ext = (id: string, nom: string): ExtensionInstallee => ({
  id, nom, version: '1.0.0', source: 'cws', magasin: 'chrome', dossier: `${id}/1.0.0`, active: true, installeeLe: '2026-10-01T00:00:00.000Z', miseAJourLe: '2026-10-01T00:00:00.000Z'
})
const UBO = ext('a'.repeat(32), 'uBlock Origin')
const DARK = ext('b'.repeat(32), 'Dark Reader')
const ID_C = 'c'.repeat(32)
const EXT_C = ext(ID_C, 'Troisième')

describe('cellules du tableau', () => {
  it('Boucliers : valeur → libellé et teinte', () => {
    expect(celluleBoucliers({ boucliers: 'strict' })).toEqual({ texte: 'Strict', teinte: 'vert' })
    expect(celluleBoucliers({ boucliers: 'standard' })).toEqual({ texte: 'Standard', teinte: 'vert' })
    expect(celluleBoucliers({ boucliers: true })).toEqual({ texte: 'Standard', teinte: 'vert' })
    expect(celluleBoucliers({ boucliers: 'desactives' })).toEqual({ texte: 'Désactivés', teinte: 'rouge' })
    expect(celluleBoucliers({ boucliers: false })).toEqual({ texte: 'Désactivés', teinte: 'rouge' })
    expect(celluleBoucliers({})).toEqual({ texte: 'Standard', teinte: 'vert' })
  })
  it('Cookies', () => {
    expect(celluleCookies({ cookies: 'premiere-partie' })).toEqual({ texte: '1re partie' })
    expect(celluleCookies({ cookies: 'tous' })).toEqual({ texte: 'Tous' })
    expect(celluleCookies({ cookies: 'bloques' })).toEqual({ texte: 'Bloqués' })
    expect(celluleCookies({ cookies: 'session' })).toEqual({ texte: 'Session seulement' })
    expect(celluleCookies({})).toEqual({ texte: 'Tous' })
  })
  it('Scripts : « Bloqués » est une étiquette rouge', () => {
    expect(celluleScripts({ scripts: 'autorises' })).toEqual({ texte: 'Autorisés' })
    expect(celluleScripts({})).toEqual({ texte: 'Autorisés' })
    expect(celluleScripts({ scripts: 'bloques' })).toEqual({ texte: 'Bloqués', teinte: 'rouge' })
  })
  it('Extensions : Toutes, Aucune, « <nom> seulement » (calculé sur les extensions actives installées)', () => {
    expect(celluleExtensions({}, [])).toEqual({ texte: 'Toutes' })
    expect(celluleExtensions({}, [UBO, DARK])).toEqual({ texte: 'Toutes' })
    expect(celluleExtensions({ extensions: { [UBO.id]: true } }, [UBO, DARK])).toEqual({ texte: 'Toutes' })
    // Une clé d'extension absente du registre ne compte pas.
    expect(celluleExtensions({ extensions: { [ID_C]: false } }, [UBO, DARK])).toEqual({ texte: 'Toutes' })
    expect(celluleExtensions({ extensions: { [UBO.id]: false, [DARK.id]: false } }, [UBO, DARK])).toEqual({ texte: 'Aucune' })
    expect(celluleExtensions({ extensions: { [DARK.id]: false } }, [UBO, DARK])).toEqual({ texte: 'uBlock Origin seulement' })
    expect(celluleExtensions({ extensions: { [ID_C]: false } }, [UBO, DARK, { ...EXT_C, active: true }])).toEqual({ texte: 'uBlock Origin, Dark Reader seulement' })
  })
  it('Extensions : une extension désactivée ne compte ni comme autorisée ni comme bloquée', () => {
    const off = { ...DARK, active: false }
    expect(celluleExtensions({}, [UBO, off])).toEqual({ texte: 'Toutes' })
    expect(celluleExtensions({ extensions: { [UBO.id]: false } }, [UBO, off])).toEqual({ texte: 'Aucune' })
    expect(celluleExtensions({ extensions: { [off.id]: false } }, [UBO, off])).toEqual({ texte: 'Toutes' })
  })
  it('Extensions : liste du détail ✓/✗ et écriture du Record', () => {
    const regle = { extensions: { [DARK.id]: false } }
    expect(extensionsDuSite(regle, [UBO, DARK])).toEqual([
      { id: UBO.id, nom: 'uBlock Origin', autorisee: true },
      { id: DARK.id, nom: 'Dark Reader', autorisee: false }
    ])
    // `false` seulement pour les bloquées ; aucune bloquée → null (retire le champ).
    expect(recordExtensions({ [UBO.id]: true, [DARK.id]: false }, {})).toEqual({ [DARK.id]: false })
    expect(recordExtensions({ [UBO.id]: true, [DARK.id]: true }, {})).toBeNull()
    // Une règle plus large bloque : l'autoriser ici s'écrit `true`.
    expect(recordExtensions({ [UBO.id]: true, [DARK.id]: false }, { [UBO.id]: false })).toEqual({ [UBO.id]: true, [DARK.id]: false })
    expect(recordExtensions({ [UBO.id]: true }, { [UBO.id]: false })).toEqual({ [UBO.id]: true })
    for (const cle of Object.keys(recordExtensions({ [UBO.id]: false, [DARK.id]: false }, {}) ?? {})) expect(cle).toMatch(/^[a-p]{32}$/)
  })
  it('Extensions : valeur héritée d\'un motif', () => {
    const sites = { '*.exemple.fr': { extensions: { [DARK.id]: false } }, 'www.exemple.fr': { boucliers: 'standard' as const } }
    expect(effective(sites, 'www.exemple.fr').extensions).toEqual({ [DARK.id]: false })
    expect(vientDHeritage(sites['www.exemple.fr'], effective(sites, 'www.exemple.fr'), 'extensions')).toBe(true)
  })
  it('Zoom', () => {
    expect(celluleZoom({ zoom: 1 }).texte).toBe('100 %')
    expect(celluleZoom({ zoom: 1.1 }).texte).toBe('110 %')
    expect(celluleZoom({ zoom: 0.67 }).texte).toBe('67 %')
    expect(celluleZoom({}).texte).toBe('—')
  })
  it('Ne pas déranger', () => {
    expect(celluleDnd({ exceptionDnd: true }).texte).toBe('Exception')
    expect(celluleDnd({ exceptionDnd: false }).texte).toBe('—')
    expect(celluleDnd({}).texte).toBe('—')
  })
  it('Style : CSS, CSS + script, —', () => {
    const script = [{ nom: 'x', code: '1', actif: true }]
    expect(celluleStyle({ style: 'a{}' })).toEqual({ texte: 'CSS', teinte: 'violet' })
    expect(celluleStyle({ style: 'a{}', scriptsPerso: script })).toEqual({ texte: 'CSS + script', teinte: 'violet' })
    expect(celluleStyle({ scriptsPerso: script })).toEqual({ texte: 'Script', teinte: 'violet' })
    expect(celluleStyle({ style: '', scriptsPerso: [] })).toEqual({ texte: '—' })
    expect(celluleStyle({})).toEqual({ texte: '—' })
  })
})

describe('pastille', () => {
  it('lettre majuscule de l’hôte et couleur de la palette', () => {
    const p = pastille('youtube.com')
    expect(p.lettre).toBe('Y')
    expect(PALETTE_PASTILLES).toContain(p.couleur)
  })
  it('déterministe : même hôte, même couleur, quelle que soit la forme de la clé', () => {
    expect(pastille('youtube.com')).toEqual(pastille('youtube.com'))
    expect(pastille('https://youtube.com').couleur).toBe(pastille('youtube.com').couleur)
    expect(pastille('https://www.youtube.com').couleur).toBe(pastille('youtube.com').couleur)
    expect(pastille('https://x.fr:8443').lettre).toBe('X')
  })
  it('stable : valeurs figées (une palette ou un hachage modifiés se verraient ici)', () => {
    expect(['youtube.com', 'github.com', 'mail.exemple.fr', 'atlasduciel.fr'].map((h) => pastille(h).couleur)).toEqual(['#1E7F6C', '#1E7F6C', '#3A3A62', '#B5452F'])
  })
  it('motif : « * » grise', () => {
    expect(pastille('*.tracking-exemple.net')).toEqual({ lettre: '*', couleur: '#6B6B80' })
  })
})

describe('route profonde', () => {
  it('encode l’origine avec port et la décode à l’identique', () => {
    const h = encoderRoute('https://x.fr:8443')
    expect(h).toBe('#/sites/https%3A%2F%2Fx.fr%3A8443')
    expect(h.split('/')).toHaveLength(3)
    expect(decoderRoute(h)).toEqual({ cle: 'https://x.fr:8443', style: false })
  })
  it('suffixe /style', () => {
    expect(decoderRoute(`${encoderRoute('https://x.fr:8443')}/style`)).toEqual({ cle: 'https://x.fr:8443', style: true })
  })
  it('hôte et motif', () => {
    expect(decoderRoute(encoderRoute('youtube.com'))).toEqual({ cle: 'youtube.com', style: false })
    expect(decoderRoute(encoderRoute('*.exemple.net'))).toEqual({ cle: '*.exemple.net', style: false })
  })
  it('canonise la clé ; refuse les routes sans site, malformées ou invalides', () => {
    expect(decoderRoute('#/sites/HTTPS%3A%2F%2FX.FR%3A443')?.cle).toBe('https://x.fr')
    expect(decoderRoute('#/sites')).toBeNull()
    expect(decoderRoute('#/sites/')).toBeNull()
    expect(decoderRoute('#/sites/%E0%A4%A')).toBeNull()
    expect(decoderRoute('#/sites/pas%20un%20site')).toBeNull()
    expect(decoderRoute('#/general')).toBeNull()
  })
})

describe('Zoom du détail (14b) : cellule ↔ valeur', () => {
  it('les paliers sont ceux de la décision A', () => {
    expect(PALIERS_ZOOM).toEqual([0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2])
  })
  it('chaque palier fait l’aller-retour valeur → option → valeur', () => {
    for (const z of PALIERS_ZOOM) expect(zoomDepuisId(idZoom(z))).toBe(z)
  })
  it('« Par défaut » : absent ↔ null (retire zoom)', () => {
    expect(idZoom(undefined)).toBe('defaut')
    expect(zoomDepuisId('defaut')).toBeNull()
  })
  it('les options : Par défaut puis les 11 paliers, libellés en %', () => {
    expect(optionsZoom(undefined).map((x) => x.libelle)).toEqual([
      'Par défaut', '50 %', '67 %', '75 %', '80 %', '90 %', '100 %', '110 %', '125 %', '150 %', '175 %', '200 %'
    ])
  })
  it('un zoom hors palier (zoom au clavier) s’ajoute à sa place, sans être perdu', () => {
    const o = optionsZoom(1.2)
    expect(o.findIndex((x) => x.libelle === '120 %')).toBe(o.findIndex((x) => x.libelle === '110 %') + 1)
    expect(optionsZoom(1)).toHaveLength(12)
  })
  it('identifiant inconnu : rien à écrire', () => {
    expect(zoomDepuisId('abc')).toBeUndefined()
  })
})

describe('héritage et création (correction 14a/14b)', () => {
  const sites = { '*.x.test': { boucliers: 'strict', cookies: 'bloques' } } as const
  it('création : un site couvert par un motif Strict reste Strict', () => {
    expect(regleInitiale(sites, 'a.x.test')).toEqual({ boucliers: 'strict' })
    expect(regleInitiale(sites, 'https://a.x.test')).toEqual({ boucliers: 'strict' })
    expect(regleInitiale(sites, 'autre.test')).toEqual({ boucliers: 'standard' })
    expect(regleInitiale({}, '*.neuf.test')).toEqual({ boucliers: 'standard' })
    expect(regleInitiale({ '*.test': { boucliers: 'desactives' } }, '*.neuf.test')).toEqual({ boucliers: 'desactives' })
  })
  it('urlDeCle : origine, hôte, motif, file', () => {
    expect(urlDeCle('https://x.fr:8443')).toBe('https://x.fr:8443')
    expect(urlDeCle('x.fr')).toBe('https://x.fr')
    expect(urlDeCle('*.x.fr')).toBe('https://sous.x.fr')
    expect(urlDeCle('file://')).toBe('file:///')
    expect(urlDeCle('n’importe quoi')).toBe('')
  })
  it('héritage : valeur du motif, sans la règle propre', () => {
    const avec = { ...sites, 'a.x.test': { cookies: 'tous' as const } }
    expect(heritage(avec, 'a.x.test').cookies).toBe('bloques')
    expect(effective(avec, 'a.x.test').cookies).toBe('tous')
    expect(heritage(avec, 'a.x.test').boucliers).toBe('strict')
    expect(heritage({}, 'a.x.test').cookies).toBeUndefined()
  })
  it('vientDHeritage : champ absent de la règle mais fourni ailleurs', () => {
    const eff = effective(sites, 'a.x.test')
    expect(vientDHeritage(undefined, eff, 'cookies')).toBe(true)
    expect(vientDHeritage({ cookies: 'tous' }, eff, 'cookies')).toBe(false)
    expect(vientDHeritage(undefined, eff, 'scripts')).toBe(false)
  })
  it('valeurAEcrire : la valeur héritée ou par défaut retire le champ', () => {
    expect(valeurAEcrire('autorises', 'autorises')).toBeNull()
    expect(valeurAEcrire('bloques', 'autorises')).toBe('bloques')
    expect(valeurAEcrire('autorises', 'bloques')).toBe('autorises')
  })
  it('cellule héritée', () => {
    expect(heritee({ texte: 'Tous' }, true)).toEqual({ texte: 'Tous', herite: true })
    expect(heritee({ texte: 'Tous' }, false)).toEqual({ texte: 'Tous' })
  })
  it('une URL complète est ramenée à son origine', () => {
    expect(siteDeSaisie(' https://exemple.fr/page?q=1#h ')).toBe('https://exemple.fr')
    expect(siteDeSaisie('http://exemple.fr:8080/a')).toBe('http://exemple.fr:8080')
    expect(siteDeSaisie('exemple.fr')).toBe('exemple.fr')
    expect(siteDeSaisie('*.exemple.fr')).toBe('*.exemple.fr')
  })
  it('premier nom de script libre', () => {
    expect(nomScriptLibre([])).toBe('Script 1')
    expect(nomScriptLibre(['Script 1', 'Script 2'])).toBe('Script 3')
    expect(nomScriptLibre(['Script 2'])).toBe('Script 1')
    expect(nomScriptLibre(['Script 1', 'Script 3'])).toBe('Script 2')
  })
})

describe('Boucliers hérités', () => {
  it('motif ou hôte plus large qui fixe les Boucliers', () => {
    const sites = { '*.x.test': { boucliers: 'strict' }, 'b.x.test': { boucliers: 'standard' }, 'c.x.test': { cookies: 'tous' } } as const
    expect(boucliersHerites(sites, 'a.x.test')).toBe(true)
    expect(boucliersHerites(sites, 'https://b.x.test')).toBe(true)
    expect(boucliersHerites(sites, 'x.test')).toBe(false)
    expect(boucliersHerites(sites, '*.y.test')).toBe(false)
    expect(boucliersHerites({}, 'a.x.test')).toBe(false)
  })
})
