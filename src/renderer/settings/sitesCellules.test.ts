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
  idZoom,
  optionsZoom,
  pastille,
  zoomDepuisId
} from './sitesCellules'

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
  it('Extensions : « Toutes », inerte jusqu’à la Tâche 20', () => {
    expect(celluleExtensions({})).toEqual({ texte: 'Toutes' })
    expect(celluleExtensions({ extensions: { a: false } })).toEqual({ texte: 'Toutes' })
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
