// Contrôle de la tokenisation du CSS (jalon D, tâche 7) : les couleurs en dur restantes hors `:root` ne peuvent que diminuer,
// et chaque variable utilisée est définie en clair et en sombre.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const racine = resolve(__dirname, '..')
const FEUILLES = [
  'src/renderer/ui/theme.css',
  'src/renderer/settings/settings.css',
  'src/renderer/settings/reseau.css',
  'src/renderer/settings/importer.css',
  'src/renderer/newtab/newtab.css',
  'src/renderer/erreur/erreur.css'
]

/**
 * Plafonds de hex en dur hors `:root` (à ne jamais relever).
 * Tolérance documentée : le ciel (étoiles, survols, palette, fenêtre « Ne pas déranger ») et le nouvel onglet sont sombres par nature
 * dans les deux modes, leurs surfaces de profondeur (#222247, #1a1a3c…) et leurs textes clairs n'ont pas de variable dans la table du thème ;
 * le texte blanc sur une pastille de marque (`.src .logo`) reste blanc. Les ombres et halos (rgba) et les anneaux de focus restent en rgba.
 */
const PLAFOND_HEX: Record<string, number> = {
  'src/renderer/ui/theme.css': 46,
  'src/renderer/newtab/newtab.css': 39,
  'src/renderer/settings/importer.css': 1,
  'src/renderer/settings/settings.css': 0,
  'src/renderer/settings/reseau.css': 0,
  'src/renderer/erreur/erreur.css': 0
}

const lire = (f: string): string => readFileSync(resolve(racine, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
/** Retire les blocs dont le sélecteur commence par `:root`. */
const sansRacine = (css: string): string => css.replace(/(^|\n):root[^{]*\{[^}]*\}/g, '')
const HEX = /#[0-9a-fA-F]{3,8}\b/g

describe('tokenisation du CSS', () => {
  it.each(FEUILLES)('%s : hex en dur hors :root dans le plafond', (f) => {
    const restants = sansRacine(lire(f)).match(HEX) ?? []
    expect(restants.length, restants.join(' ')).toBeLessThanOrEqual(PLAFOND_HEX[f])
  })

  it('les pages Lyra (réglages, erreurs) n’ont plus de couleur en dur hors la pastille de marque', () => {
    for (const f of ['src/renderer/settings/settings.css', 'src/renderer/settings/reseau.css', 'src/renderer/erreur/erreur.css']) {
      expect(sansRacine(lire(f)).match(HEX) ?? [], f).toEqual([])
    }
  })

  it('chaque var(--x) utilisée est définie dans :root et redéfinie ou héritée en sombre', () => {
    const theme = lire('src/renderer/ui/theme.css')
    const bloc = (sel: string): string => theme.slice(theme.indexOf(`${sel} {`), theme.indexOf('}', theme.indexOf(`${sel} {`)))
    const nomsClair = new Set([...bloc(':root').matchAll(/(--[a-z-]+):/g)].map((m) => m[1]))
    const nomsSombre = new Set([...bloc(":root[data-mode='sombre']").matchAll(/(--[a-z-]+):/g)].map((m) => m[1]))
    expect([...nomsClair].filter((n) => !nomsSombre.has(n))).toEqual([])
    // Variables locales posées ailleurs (animations, largeur du ciel, etc.).
    const LOCALES = new Set(['--glisse', '--largeur', '--ciel-largeur', '--w', '--x', '--y',
      // Apparence (réglages) : posées par `variablesApparence`, ce ne sont pas des couleurs de thème.
      '--police', '--taille-texte', '--densite', '--coins', '--coins-droite', '--coins-haut', '--coins-bas'])
    for (const f of FEUILLES) {
      for (const [, nom] of lire(f).matchAll(/var\((--[a-z-]+)/g)) {
        if (LOCALES.has(nom)) continue
        expect(nomsClair.has(nom), `${f} : ${nom}`).toBe(true)
      }
    }
  })
})
