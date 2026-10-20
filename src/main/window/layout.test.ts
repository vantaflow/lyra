import { describe, it, expect } from 'vitest'
import { BANDE, BOUTONS_FENETRE, CAPSULE, DND_CROISSANT, DND_HAUTEUR, DND_PASTILLE, DND_RAPPEL_REPLI, largeurRappel, FENETRE_MIN, LARGEUR_MAX, RAIL, computeLayout, positionFeux } from './layout'

const taille = { width: 1280, height: 800 }
const fenetre = { x: 0, y: 0, width: 1280, height: 800 }
const ciel = (position: 'gauche' | 'droite' | 'haut' | 'bas', masque = false, largeur = 272) => ({
  position,
  largeur,
  masque
})

describe('computeLayout', () => {
  it('gauche', () => {
    const l = computeLayout(taille, ciel('gauche'), false)
    expect(l.chrome).toEqual(fenetre)
    expect(l.page).toEqual({ x: 272, y: 46, width: 1008, height: 754 })
    expect(l.overlay).toEqual(fenetre)
  })
  it('droite : miroir, la capsule au-dessus de la page', () => {
    const l = computeLayout(taille, ciel('droite'), false)
    expect(l.chrome).toEqual(fenetre)
    expect(l.page).toEqual({ x: 0, y: 46, width: 1008, height: 754 })
    expect(l.overlay).toEqual(fenetre)
  })
  it('haut : bande de 56 px, la capsule sous la bande', () => {
    const l = computeLayout(taille, ciel('haut'), false)
    expect(l.chrome).toEqual(fenetre)
    expect(l.page).toEqual({ x: 0, y: 102, width: 1280, height: 698 })
  })
  it('bas : capsule en haut, bande de 56 px en bas', () => {
    const l = computeLayout(taille, ciel('bas'), false)
    expect(l.chrome).toEqual(fenetre)
    expect(l.page).toEqual({ x: 0, y: 46, width: 1280, height: 698 })
  })
  it('masqué : rail de 14 px sur le bord, capsule conservée, pour chaque position', () => {
    expect(computeLayout(taille, ciel('gauche', true), false).page).toEqual({ x: 14, y: 46, width: 1266, height: 754 })
    expect(computeLayout(taille, ciel('droite', true), false).page).toEqual({ x: 0, y: 46, width: 1266, height: 754 })
    expect(computeLayout(taille, ciel('haut', true), false).page).toEqual({ x: 0, y: 60, width: 1280, height: 740 })
    expect(computeLayout(taille, ciel('bas', true), false).page).toEqual({ x: 0, y: 46, width: 1280, height: 740 })
    for (const p of ['gauche', 'droite', 'haut', 'bas'] as const) {
      expect(computeLayout(taille, ciel(p, true), false).chrome).toEqual(fenetre)
    }
  })
  it('masqué et révélé : aucun bounds ne change (seul l’ordre des vues change), pour chaque position', () => {
    for (const p of ['gauche', 'droite', 'haut', 'bas'] as const) {
      expect(computeLayout(taille, ciel(p, true), false, true)).toEqual(computeLayout(taille, ciel(p, true), false))
    }
    expect(computeLayout(taille, ciel('droite', true), false, true).page).toEqual({ x: 0, y: 46, width: 1266, height: 754 })
  })
  it('révélé sans être masqué, ou en plein écran : sans effet', () => {
    for (const p of ['gauche', 'droite', 'haut', 'bas'] as const) {
      expect(computeLayout(taille, ciel(p), false, true)).toEqual(computeLayout(taille, ciel(p), false))
    }
    expect(computeLayout(taille, ciel('gauche', true), true, true)).toEqual(computeLayout(taille, ciel('gauche', true), true))
  })
  it('largeur personnalisée, bornée à 200-420 (gauche et droite) ; sans effet en haut et en bas', () => {
    expect(computeLayout(taille, ciel('gauche', false, 300), false).page.x).toBe(300)
    expect(computeLayout(taille, ciel('droite', false, 300), false).page.width).toBe(980)
    expect(computeLayout(taille, ciel('gauche', false, 100), false).page.x).toBe(200)
    expect(computeLayout(taille, ciel('droite', false, 900), false).page.width).toBe(860)
    expect(computeLayout(taille, ciel('haut', false, 300), false).page.y).toBe(102)
  })
  it('plein écran', () => {
    const l = computeLayout(taille, ciel('gauche'), true)
    expect(l.chrome).toEqual({ x: 0, y: 0, width: 0, height: 0 })
    expect(l.page).toEqual(fenetre)
    expect(l.overlay).toEqual(fenetre)
  })
  it('petite fenêtre : jamais de taille négative', () => {
    const l = computeLayout({ width: 100, height: 50 }, ciel('gauche'), false)
    expect(l.page.width).toBe(0)
    expect(l.chrome.width).toBe(100)
    expect(l.page.height).toBe(4)
  })
})

describe('constantes et feux tricolores', () => {
  it('épaisseurs exportées', () => {
    expect([BANDE, RAIL, CAPSULE]).toEqual([56, 14, 46])
  })
  it('fenêtre minimale : la plus large colonne laisse 480 px à la page', () => {
    expect(FENETRE_MIN).toEqual({ width: LARGEUR_MAX + 480, height: 400 })
    const l = computeLayout({ width: FENETRE_MIN.width, height: FENETRE_MIN.height }, ciel('droite', false, 420), false)
    expect(l.page.width).toBe(480)
  })
  it('feux macOS : centrés sur la bande en haut, à leur place sinon', () => {
    expect(positionFeux({ position: 'haut', masque: false })).toEqual({ x: 14, y: 22 })
    expect(positionFeux({ position: 'haut', masque: true })).toEqual({ x: 14, y: 14 })
    for (const p of ['gauche', 'droite', 'bas'] as const) expect(positionFeux({ position: p, masque: false })).toEqual({ x: 14, y: 14 })
  })
})

describe('computeLayout : Ne pas déranger', () => {
  const positions = ['gauche', 'droite', 'haut', 'bas'] as const
  for (const position of positions) {
    for (const masque of [false, true]) {
      it(`page plein cadre, chrome réduit au rappel (${position}${masque ? ', masqué' : ''})`, () => {
        const l = computeLayout(taille, ciel(position, masque), false, false, { rappel: true })
        expect(l.page).toEqual(fenetre)
        expect(l.overlay).toEqual(fenetre)
        expect(l.chrome).toEqual({ x: 1280 - DND_RAPPEL_REPLI, y: 0, width: DND_RAPPEL_REPLI, height: DND_HAUTEUR })
      })
    }
  }
  it('rappel mesuré : la zone suit la pastille, ombre du design comprise (16 px à droite, 30 px d\'ombre à gauche)', () => {
    const l = computeLayout(taille, ciel('gauche'), false, false, { rappel: true, largeur: 470.4 })
    expect(largeurRappel(470.4)).toBe(471 + 16 + 30)
    expect(l.chrome).toEqual({ x: 1280 - 517, y: 0, width: 517, height: DND_HAUTEUR })
  })
  it('rappel effacé : seul le croissant occupe le coin haut droit', () => {
    const l = computeLayout(taille, ciel('gauche'), false, false, { rappel: false })
    expect(l.page).toEqual(fenetre)
    expect(l.chrome).toEqual({ x: 1280 - DND_CROISSANT.width, y: 0, width: DND_CROISSANT.width, height: DND_CROISSANT.height })
  })
  it('le ciel révélé est ignoré', () => {
    const l = computeLayout(taille, ciel('gauche', true), false, true, { rappel: false })
    expect(l.page).toEqual(fenetre)
  })
  it('petite fenêtre : la zone reste dans la fenêtre', () => {
    const l = computeLayout({ width: 300, height: 60 }, ciel('gauche'), false, false, { rappel: true })
    expect(l.chrome).toEqual({ x: 0, y: 0, width: 300, height: 60 })
  })
  it('Windows : le rappel et le croissant se posent à gauche des boutons de fenêtre, avec la réserve de la capsule (150 px)', () => {
    expect(BOUTONS_FENETRE).toEqual({ largeur: 150, hauteur: 32 })
    for (const dnd of [{ rappel: true, largeur: 470.4 }, { rappel: true }, { rappel: false }]) {
      const l = computeLayout(taille, ciel('gauche'), false, false, dnd, BOUTONS_FENETRE.largeur)
      const z = dnd.rappel ? largeurRappel(dnd.largeur) : DND_CROISSANT.width
      expect(l.page).toEqual(fenetre)
      expect(l.chrome).toEqual({ x: 1280 - 150 - z, y: 0, width: z, height: DND_HAUTEUR })
      // La pastille (à 16 px du bord droit de la vue) laisse au moins 28 px aux boutons natifs (3 × 46 px).
      const droitePastille = l.chrome.x + l.chrome.width - DND_PASTILLE.droite
      expect(1280 - 138 - droitePastille).toBeGreaterThanOrEqual(28)
    }
  })
  it('Windows, petite fenêtre : la zone reste à gauche des boutons et dans la fenêtre', () => {
    const l = computeLayout({ width: 500, height: 60 }, ciel('gauche'), false, false, { rappel: true }, 150)
    expect(l.chrome).toEqual({ x: 0, y: 0, width: 350, height: 60 })
  })
  describe('aux limites : zone toujours dans la fenêtre, x ≥ 0, largeur > 0, sans dépendre d\'une remesure', () => {
    const tailles = [
      { width: 1280, height: 800 },
      { width: 1024, height: 720 },
      { width: FENETRE_MIN.width, height: FENETRE_MIN.height },
      { width: 400, height: 300 },
      { width: 160, height: 60 },
      { width: 150, height: 40 },
      { width: 90, height: 40 },
      { width: 20, height: 20 }
    ]
    const mesures = [undefined, 0, -12, Number.NaN, Number.POSITIVE_INFINITY, 1, 469.4, 5000, 1e9]
    for (const boutons of [0, BOUTONS_FENETRE.largeur]) {
      for (const t of tailles) {
        it(`${t.width}×${t.height}, boutons ${boutons}`, () => {
          for (const largeur of mesures) {
            for (const rappel of [true, false]) {
              const c = computeLayout(t, ciel('gauche'), false, false, { rappel, largeur }, boutons).chrome
              const msg = JSON.stringify({ t, boutons, largeur, rappel, c })
              for (const v of Object.values(c)) expect(Number.isFinite(v), msg).toBe(true)
              expect(c.x, msg).toBeGreaterThanOrEqual(0)
              expect(c.y, msg).toBe(0)
              expect(c.width, msg).toBeGreaterThan(0)
              expect(c.height, msg).toBeGreaterThan(0)
              expect(c.x + c.width, msg).toBeLessThanOrEqual(t.width)
              expect(c.height, msg).toBeLessThanOrEqual(t.height)
              // Les boutons de fenêtre restent libres dès que la fenêtre laisse la place au croissant à leur gauche.
              if (t.width - boutons >= DND_CROISSANT.width) expect(c.x + c.width, msg).toBeLessThanOrEqual(t.width - boutons)
            }
          }
        })
      }
    }
    it('largeur mesurée absente, nulle ou invalide : repli (720 px), jamais une vue vide ou NaN', () => {
      for (const largeur of [undefined, 0, -3, Number.NaN, Number.POSITIVE_INFINITY]) expect(largeurRappel(largeur)).toBe(DND_RAPPEL_REPLI)
    })
    it('la zone ne dépend que de la mesure : la même mesure redonne la même zone (aucune oscillation possible)', () => {
      const a = computeLayout({ width: 1024, height: 720 }, ciel('gauche'), false, false, { rappel: true, largeur: 492.6 }, 150).chrome
      const b = computeLayout({ width: 1024, height: 720 }, ciel('gauche'), false, false, { rappel: true, largeur: 492.6 }, 150).chrome
      expect(a).toEqual(b)
      expect(a).toEqual({ x: 1024 - 150 - 539, y: 0, width: 539, height: DND_HAUTEUR })
    })
  })
  it('macOS (sans boutons à réserver) : le design est inchangé', () => {
    const l = computeLayout(taille, ciel('gauche'), false, false, { rappel: false }, 0)
    expect(l.chrome).toEqual({ x: 1280 - DND_CROISSANT.width, y: 0, width: DND_CROISSANT.width, height: DND_CROISSANT.height })
  })
  it("plein écran HTML l'emporte : le chrome disparaît", () => {
    const l = computeLayout(taille, ciel('gauche'), true, false, { rappel: true })
    expect(l.chrome).toEqual({ x: 0, y: 0, width: 0, height: 0 })
    expect(l.page).toEqual(fenetre)
  })
})
