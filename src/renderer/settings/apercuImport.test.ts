import { describe, expect, it } from 'vitest'
import type { ElementResultat, ExtensionImportee, ProfilDetecte } from '../../main/import/types'
import { accesRefuse, elementsCochablesParDefaut, etatCarte, etiquetteResultat, formaterNombre, lignesElements, resumeExtensions, resumeResultat } from './apercuImport'

const P = (o: Partial<ProfilDetecte> = {}): ProfilDetecte => ({ navigateur: 'chrome', nom: 'Khalil', chemin: '/x/Default', racine: '/x', parDefaut: true, ...o })
const ext = (nom: string, magasin: ExtensionImportee['magasin'] = 'chrome'): ExtensionImportee => ({ id: nom, nom, magasin, actif: true })
const R = (o: Partial<ElementResultat>): ElementResultat => ({ etat: 'ok', ajoutes: 0, presents: 0, ignores: 0, notes: [], ...o })

describe('formaterNombre', () => {
  it('sépare les milliers par une espace fine insécable', () => {
    expect(formaterNombre(1284)).toBe('1 284')
    expect(formaterNombre(18420)).toBe('18 420')
    expect(formaterNombre(1_000_000)).toBe('1 000 000')
    expect(formaterNombre(0)).toBe('0')
    expect(formaterNombre(999)).toBe('999')
  })
})

describe('etatCarte', () => {
  it('compte les profils, signale un navigateur ouvert, non installé, accès refusé', () => {
    expect(etatCarte([P(), P({ nom: 'B', chemin: '/x/P1', ouvert: true })])).toBe('2 profils détectés · ouvert')
    expect(etatCarte([P()])).toBe('1 profil détecté')
    expect(etatCarte([])).toBe('Non installé')
    expect(etatCarte([P({ navigateur: 'safari' })], true)).toBe('Accès au disque à autoriser')
  })
  it("lit l'accès refusé dans les indisponibles de l'aperçu", () => {
    expect(accesRefuse({ favoris: { indisponible: true, raison: 'x', code: 'acces' } })).toBe(true)
    expect(accesRefuse({ favoris: { indisponible: true, raison: 'x', code: 'absent' } })).toBe(false)
    expect(accesRefuse({})).toBe(false)
  })
})

describe('lignesElements', () => {
  const apercu = {
    compteurs: {
      favoris: { favoris: 1284, dossiers: 37 },
      historique: { pages: 5, visites: 18420 },
      onglets: { fenetres: 1, onglets: 23, groupes: 3 },
      extensions: { total: 6, chrome: 5, edge: 0, firefox: 0, inconnues: 1 },
      moteurs: { moteurs: 4, motsCles: 7 },
      reglages: { total: 3 }
    },
    indisponibles: {},
    extensions: [ext('uBlock Origin'), ext('Dark Reader'), ext('Bitwarden'), ext('Vimium'), ext('SponsorBlock'), ext('Inconnue', 'inconnu')]
  }
  const lignes = lignesElements({ navigateur: 'chrome', profil: P(), apercu, jours: 92 })
  const de = (cle: string) => lignes.find((l) => l.cle === cle)!

  it('substitue les vrais compteurs, formatés', () => {
    expect(de('favoris').hint).toBe('1 284 favoris, 37 dossiers → barre et dossiers conservés')
    expect(de('historique').hint).toBe('92 jours, 18 420 visites → suggestions de la palette dès le premier jour')
    expect(de('onglets').hint).toBe('23 onglets, 3 groupes → 3 constellations, mêmes noms et couleurs')
    expect(de('favoris').tag).toEqual({ texte: 'Prêt', classe: 'ok' })
  })
  it('extensions : « 5 sur 6 », mises en file pour réinstallation', () => {
    expect(de('extensions').tag).toEqual({ texte: '5 sur 6', classe: 'warn' })
    expect(de('extensions').hint).toBe('6 trouvées : uBlock Origin, Dark Reader, Bitwarden, Vimium, SponsorBlock, 1 inconnue → mises en file pour réinstallation')
    expect(de('extensions').hint).not.toMatch(/Chrome Web Store/)
  })
  it('réglages sans Boucliers ni Ne pas déranger ; mots de passe et cookies indisponibles avec leur raison', () => {
    expect(de('reglages').hint).not.toMatch(/Boucliers|Ne pas déranger|Focus/)
    expect(de('mots-de-passe')).toMatchObject({ disponible: false, tag: { texte: 'Indisponible' } })
    expect(de('mots-de-passe').hint).toContain('Lyra ne stocke pas de mots de passe')
    expect(de('mots-de-passe').hint).toContain('chiffrés par le système')
    expect(de('cookies')).toMatchObject({ disponible: false })
    expect(de('cookies').hint).toBe('Chiffrés par le système : indisponibles en v1.')
    expect(lignes.map((l) => l.cle)).toEqual(['favoris', 'historique', 'onglets', 'extensions', 'moteurs', 'mots-de-passe', 'cookies', 'reglages'])
  })
  it('onglets d’un Chromium ouvert : « fermez Chrome puis réessayez », favoris et historique restent importables', () => {
    const l = lignesElements({ navigateur: 'chrome', profil: P({ ouvert: true }), jours: 92, apercu: { ...apercu, compteurs: { ...apercu.compteurs, onglets: undefined }, indisponibles: { onglets: { indisponible: true, raison: 'verrou', code: 'verrouille' } } } })
    expect(l.find((x) => x.cle === 'onglets')).toMatchObject({ disponible: false })
    expect(l.find((x) => x.cle === 'onglets')!.hint).toContain('fermez Chrome puis réessayez')
    expect(l.find((x) => x.cle === 'favoris')!.disponible).toBe(true)
    expect(elementsCochablesParDefaut(l)).toEqual(['favoris', 'historique', 'extensions', 'moteurs', 'reglages'])
  })
  it('autre raison d’indisponibilité : la raison est affichée telle quelle', () => {
    const l = lignesElements({ navigateur: 'orion', jours: 92, apercu: { compteurs: {}, indisponibles: { onglets: { indisponible: true, raison: 'Orion : non importés' } } } })
    expect(l.find((x) => x.cle === 'onglets')).toMatchObject({ hint: 'Orion : non importés', disponible: false })
  })
  it('avant la réponse de l’aperçu : « Lecture… »', () => {
    expect(lignesElements({ navigateur: 'chrome', jours: 92 })[0].tag.texte).toBe('Lecture…')
  })
  it('extensions : tout installable → « Prêt » ; liste longue et inconnues', () => {
    expect(resumeExtensions([ext('A'), ext('B'), ext('C'), ext('D'), ext('E'), ext('F'), ext('Z', 'inconnu'), ext('Y', 'inconnu')])).toBe('A, B, C, D, E, 1 autres, 2 inconnues')
  })
})

describe('résultat', () => {
  it('« ajoutés / déjà présents »', () => {
    expect(resumeResultat(R({ ajoutes: 1284, presents: 1 }))).toBe('1 284 ajoutés · 1 déjà présent')
    expect(resumeResultat(R({ ajoutes: 0, presents: 4, ignores: 2 }))).toBe('0 ajouté · 4 déjà présents · 2 ignorés')
  })
  it('un moteur partiel s’affiche « Prêt », un autre élément partiel est signalé', () => {
    expect(etiquetteResultat('moteurs', R({ etat: 'partiel' }))).toEqual({ texte: 'Prêt', classe: 'ok' })
    expect(etiquetteResultat('favoris', R({ etat: 'partiel' }))).toEqual({ texte: 'Partiel', classe: 'warn' })
    expect(etiquetteResultat('favoris', R({ etat: 'annule' })).texte).toBe('Annulé')
  })
})
