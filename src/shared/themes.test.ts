import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COULEURS_INDIGO_NUIT, CLES_COULEUR, NOMS_THEMES, type CouleursTheme } from './types-reglages'
import { rapport, verifier, luminance } from './contraste'
import { CLES_COULEURS, THEMES, deriver, etiquetteTeinteSite, exporterTheme, validerTheme } from './themes'

const DESIGN: Record<string, [string, string]> = {
  'ciel-fond': ['#15152E', '#0E0E1E'], 'ciel-texte': ['#C9C9EA', '#C9C9EA'], 'etoile-active': ['#F4C56A', '#F4C56A'],
  'etoile-active-fond': ['#262650', '#1E1E3C'], etoiles: ['#A8A8D8', '#A8A8D8'], 'etoiles-endormies': ['#4E4E7A', '#44446A'],
  lignes: ['#3B3B70', '#33335E'], 'capsule-fond': ['#FFFFFF', '#17172A'], 'capsule-texte': ['#1C1C2E', '#E8E8F4'],
  accent: ['#5452C8', '#8B8AF0'], boucliers: ['#1E7F6C', '#5FD3B3'], 'pages-fond': ['#F7F7FB', '#121214'],
  'nouvel-onglet-ciel': ['#0F0F26', '#090916']
}
const NOMS_PRETS = NOMS_THEMES.filter((n) => n !== 'mes-couleurs')

describe('table des clés', () => {
  it('13 éléments dans l’ordre du design, avec nom CSS', () => {
    expect(CLES_COULEURS.map((c) => c.cle)).toEqual(CLES_COULEUR)
    expect(Object.fromEntries(CLES_COULEURS.map((c) => [c.cle, c.variable]))).toEqual({
      'ciel-fond': '--ciel', 'ciel-texte': '--ciel-texte', 'etoile-active': '--etoile-active', 'etoile-active-fond': '--etoile-active-fond',
      etoiles: '--etoiles', 'etoiles-endormies': '--etoiles-endormies', lignes: '--lignes', 'capsule-fond': '--capsule-fond',
      'capsule-texte': '--capsule-texte', accent: '--accent', boucliers: '--bouclier', 'pages-fond': '--page', 'nouvel-onglet-ciel': '--nouvel-onglet-ciel'
    })
  })
})

describe('Indigo nuit', () => {
  it('reprend les 13 × 2 valeurs du design', () => {
    for (const [cle, [clair, sombre]] of Object.entries(DESIGN)) {
      expect(THEMES['indigo-nuit'].couleurs[cle as keyof CouleursTheme], cle).toEqual({ clair, sombre })
    }
  })
  it('réutilise COULEURS_INDIGO_NUIT', () => {
    expect(THEMES['indigo-nuit'].couleurs).toBe(COULEURS_INDIGO_NUIT)
  })
})

describe('thèmes prêts', () => {
  it('les huit thèmes existent, avec un nom', () => {
    expect(Object.keys(THEMES).sort()).toEqual([...NOMS_THEMES].sort())
    for (const n of NOMS_THEMES) expect(THEMES[n].nom.length).toBeGreaterThan(0)
  })
  it('partent des valeurs du design (ciel, page, texte)', () => {
    const c = (n: keyof typeof THEMES, k: keyof CouleursTheme): string => THEMES[n].couleurs[k].clair
    expect([c('encre', 'ciel-fond'), c('encre', 'pages-fond')]).toEqual(['#0B0B12', '#FFFFFF'])
    expect(c('foret', 'ciel-fond')).toBe('#12261F')
    expect([c('sable', 'ciel-fond'), c('sable', 'pages-fond'), c('sable', 'capsule-texte')]).toEqual(['#E9DEC8', '#FBF7F0', '#3A2E1E'])
    expect(c('aurore', 'ciel-fond')).toBe('#2A1540')
    expect(c('clair-total', 'ciel-fond')).toBe('#ECECF3')
    expect([c('nuit-complete', 'ciel-fond'), c('nuit-complete', 'pages-fond'), c('nuit-complete', 'capsule-texte')]).toEqual(['#0E0E1E', '#121214', '#E6E6EA'])
  })
  it('toutes les couleurs sont des #RRGGBB', () => {
    for (const n of NOMS_THEMES) for (const k of CLES_COULEUR) {
      expect(THEMES[n].couleurs[k].clair).toMatch(/^#[0-9A-F]{6}$/)
      expect(THEMES[n].couleurs[k].sombre).toMatch(/^#[0-9A-F]{6}$/)
    }
  })
  for (const nom of NOMS_PRETS.filter((n) => n !== 'indigo-nuit')) {
    for (const mode of ['clair', 'sombre'] as const) {
      it(`${nom} (${mode}) : les six paires ≥ 4,5:1`, () => {
        for (const v of verifier(THEMES[nom].couleurs, mode)) expect(v.ok, `${v.paire.texte}/${v.paire.fond} = ${v.rapport.toFixed(2)}`).toBe(true)
      })
    }
  }
  it('Indigo nuit : valeurs du design intactes, aucune paire sous 4,5:1', () => {
    const faibles = [...verifier(THEMES['indigo-nuit'].couleurs, 'clair'), ...verifier(THEMES['indigo-nuit'].couleurs, 'sombre')].filter((v) => !v.ok)
    expect(faibles).toEqual([])
  })
  it('Sable et Clair total : ciel clair, texte du ciel foncé', () => {
    for (const n of ['sable', 'clair-total'] as const) {
      expect(THEMES[n].cielClair).toBe(true)
      const c = THEMES[n].couleurs
      expect(luminance(c['ciel-texte'].clair)).toBeLessThan(luminance(c['ciel-fond'].clair))
      expect(luminance(c.etoiles.clair)).toBeLessThan(luminance(c['ciel-fond'].clair))
      expect(luminance(c.lignes.clair)).toBeLessThan(luminance(c['ciel-fond'].clair))
    }
    for (const n of ['indigo-nuit', 'encre', 'foret', 'aurore', 'nuit-complete'] as const) expect(THEMES[n].cielClair).toBeFalsy()
  })
  it('Mes couleurs part d’Indigo nuit', () => {
    expect(THEMES['mes-couleurs'].couleurs).toEqual(COULEURS_INDIGO_NUIT)
  })
})

describe('deriver', () => {
  it('produit les 13 variables et les variables dérivées', () => {
    const v = deriver(THEMES['indigo-nuit'].couleurs, 'clair')
    expect(v['--ciel']).toBe('#15152E')
    expect(v['--page']).toBe('#F7F7FB')
    expect(v['--bouclier']).toBe('#1E7F6C')
    expect(v['--texte']).toBe('#1C1C2E')
    for (const nom of ['--texte-secondaire', '--trait', '--pilule', '--attention', '--libelles-ciel', '--bouclier-ciel', '--halo-etoile'])
      expect(v[nom], nom).toBeTruthy()
    expect(v['--halo-etoile']).toBe('rgba(244,197,106,0.7)')
    expect(v['--halo-anneau']).toBe('rgba(244,197,106,0.22)')
  })
  it('suit le mode', () => {
    const v = deriver(THEMES['indigo-nuit'].couleurs, 'sombre')
    expect(v['--ciel']).toBe('#0E0E1E')
    expect(v['--texte']).toBe('#E8E8F4')
    expect(v['--page']).toBe('#121214')
  })
  /** Déclarations `--nom: valeur` du premier bloc dont le sélecteur est exactement `selecteur` dans theme.css. */
  const lireBloc = (selecteur: string): Record<string, string> => {
    const css = readFileSync(resolve(__dirname, '../renderer/ui/theme.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const debut = css.indexOf(`${selecteur} {`)
    expect(debut, selecteur).toBeGreaterThanOrEqual(0)
    const bloc = css.slice(debut, css.indexOf('}', debut))
    return Object.fromEntries([...bloc.matchAll(/(--[a-z-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].replace(/\s+/g, '').toLowerCase()]))
  }
  it.each([
    ['clair', ':root'],
    ['sombre', ":root[data-mode='sombre']"]
  ] as const)('Indigo nuit en %s : deriver retombe exactement sur les valeurs de theme.css (lues dans le fichier)', (mode, selecteur) => {
    const css = lireBloc(selecteur)
    const v = deriver(THEMES['indigo-nuit'].couleurs, mode)
    expect(Object.keys(v).length).toBeGreaterThanOrEqual(22)
    for (const [nom, val] of Object.entries(v)) expect(css[nom], nom).toBe(val.replace(/\s+/g, '').toLowerCase())
  })
  it('--bouclier-ciel part de Boucliers sombre et n’est corrigé que si nécessaire', () => {
    for (const mode of ['clair', 'sombre'] as const) {
      const v = deriver(THEMES['indigo-nuit'].couleurs, mode)
      expect(v['--bouclier-ciel']).toBe('#5FD3B3')
      expect(rapport(v['--bouclier-ciel'], v['--ciel'])).toBeGreaterThanOrEqual(4.5)
    }
  })
  for (const nom of NOMS_THEMES) {
    for (const mode of ['clair', 'sombre'] as const) {
      it(`${nom} (${mode}) : texte secondaire ≥ 4,5:1 sur la page, libellés ≥ 3:1 sur le ciel`, () => {
        const v = deriver(THEMES[nom].couleurs, mode)
        expect(rapport(v['--texte-secondaire'], v['--page'])).toBeGreaterThanOrEqual(4.5)
        expect(rapport(v['--libelles-ciel'], v['--ciel'])).toBeGreaterThanOrEqual(3)
        expect(rapport(v['--libelles-groupe'], v['--ciel'])).toBeGreaterThanOrEqual(3)
        expect(rapport(v['--bouclier-ciel'], v['--ciel'])).toBeGreaterThanOrEqual(4.5)
      })
    }
  }
})

describe('deriver : variables résiduelles et mode sombre (jalon D, tâche 8a)', () => {
  const tous = NOMS_THEMES.flatMap((nom) => (['clair', 'sombre'] as const).map((mode) => [nom, mode] as const))
  it('« danger » reste distinct d’« attention » en sombre, rouge, lisible (≥ 4,5:1) sur la capsule et sur son fond', () => {
    for (const nom of NOMS_THEMES) {
      const v = deriver(THEMES[nom].couleurs, 'sombre')
      expect(v['--danger'], nom).not.toBe(v['--attention'])
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(v['--danger'].slice(i, i + 2), 16))
      expect(r, `${nom} rouge dominant`).toBeGreaterThan(g)
      expect(r, `${nom} rouge dominant`).toBeGreaterThan(b)
      expect(rapport(v['--danger'], v['--capsule-fond']), nom).toBeGreaterThanOrEqual(4.5)
      expect(rapport(v['--danger'], v['--danger-fond']), nom).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('le danger clair d’Indigo nuit est #8E2E22 (valeur d’origine), non éclairci', () => {
    expect(deriver(THEMES['indigo-nuit'].couleurs, 'clair')['--danger']).toBe('#8E2E22')
  })
  it('bordures de champ et de bouton ≥ 3:1 sur la capsule en sombre (contraste d’un composant)', () => {
    for (const nom of NOMS_THEMES) {
      const v = deriver(THEMES[nom].couleurs, 'sombre')
      expect(rapport(v['--bordure-champ'], v['--capsule-fond']), nom).toBeGreaterThanOrEqual(3)
    }
  })
  it('textes sur teinte (accent, attention, succès, danger, lien) ≥ 4,5:1 dans tous les thèmes et les deux modes', () => {
    for (const [nom, mode] of tous) {
      const v = deriver(THEMES[nom].couleurs, mode)
      const paires: Array<[string, string]> = [
        ['--teinte-accent-texte', '--teinte-accent'], ['--attention-texte', '--attention-fond'], ['--succes-texte', '--succes-fond'],
        ['--danger', '--danger-fond'], ['--lien', '--capsule-fond'], ['--texte-doux', '--capsule-fond']
      ]
      for (const [t, f] of paires) expect(rapport(v[t], v[f]), `${nom} ${mode} ${t}/${f}`).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('les teintes résiduelles suivent le thème actif, y compris en clair', () => {
    const indigo = deriver(THEMES['indigo-nuit'].couleurs, 'clair')
    const perso: CouleursTheme = structuredClone(COULEURS_INDIGO_NUIT)
    perso.accent.clair = '#C0392B'
    perso.boucliers.clair = '#2E7D32'
    perso['pages-fond'].clair = '#F0EAD8'
    const cas: Array<[string, CouleursTheme, string[]]> = [
      ['sable', THEMES.sable.couleurs, ['--champ-fond', '--survol', '--teinte-accent', '--succes-fond', '--fenetre-fond', '--separateur', '--texte-discret']],
      ['personnalisé', perso, ['--teinte-accent', '--teinte-accent-texte', '--succes-fond', '--succes-texte', '--lien', '--fenetre-fond', '--separateur']]
    ]
    for (const [nom, couleurs, noms] of cas) {
      const v = deriver(couleurs, 'clair')
      for (const t of noms) expect(v[t], `${nom} ${t}`).not.toBe(indigo[t])
    }
  })
  it('les teintes résiduelles ne sont plus des alias de variables : toutes dérivées et en #RRGGBB', () => {
    for (const [nom, mode] of tous) {
      const v = deriver(THEMES[nom].couleurs, mode)
      for (const t of ['--bordure-champ', '--separateur', '--teinte-accent', '--teinte-accent-texte', '--texte-doux', '--survol', '--survol-menu', '--champ-fond',
        '--texte-discret', '--texte-url', '--texte-icone', '--texte-inactif', '--piste', '--danger', '--danger-fond', '--attention-fond', '--attention-texte',
        '--succes-fond', '--succes-texte', '--favori', '--lien', '--fenetre-fond', '--pilule-discrete', '--bouclier-inactif'])
        expect(v[t], `${nom} ${mode} ${t}`).toMatch(/^#[0-9A-F]{6}$/)
    }
  })
  it('variables propres au lieu du réemploi des variables du ciel : pilule discrète, bouclier inactif, halos', () => {
    for (const mode of ['clair', 'sombre'] as const) {
      const v = deriver(THEMES.aurore.couleurs, mode)
      expect(v['--halo-etoile']).toMatch(/^rgba\(/)
      expect(v['--halo-anneau']).toMatch(/^rgba\(/)
    }
    // En clair la valeur d'origine (#8E8EBE, discrète par design) est conservée ; en sombre elle atteint 3:1 sur la pilule.
    for (const nom of NOMS_THEMES) {
      const v = deriver(THEMES[nom].couleurs, 'sombre')
      expect(rapport(v['--pilule-discrete'], v['--pilule']), nom).toBeGreaterThanOrEqual(3)
    }
    expect(deriver(THEMES['indigo-nuit'].couleurs, 'clair')['--pilule-discrete']).toBe('#8E8EBE')
    expect(deriver(THEMES['indigo-nuit'].couleurs, 'clair')['--bouclier-inactif']).toBe('#9A9AB0')
  })
})

describe('objets partagés', () => {
  it('COULEURS_INDIGO_NUIT est gelé en profondeur et Mes couleurs en est une copie', () => {
    expect(Object.isFrozen(COULEURS_INDIGO_NUIT)).toBe(true)
    expect(Object.isFrozen(COULEURS_INDIGO_NUIT.accent)).toBe(true)
    expect(THEMES['mes-couleurs'].couleurs).toEqual(COULEURS_INDIGO_NUIT)
    expect(THEMES['mes-couleurs'].couleurs).not.toBe(COULEURS_INDIGO_NUIT)
    expect(Object.isFrozen(THEMES['mes-couleurs'].couleurs)).toBe(false)
  })
})

describe('README des palettes', () => {
  const chemin = resolve(__dirname, '../../docs/design/README.md')
  const genere = (): string => {
    const lignes = ['encre', 'foret', 'sable', 'aurore', 'clair-total', 'nuit-complete'].map((n) => {
      const c = THEMES[n as keyof typeof THEMES].couleurs
      return `| ${THEMES[n as keyof typeof THEMES].nom} | ` + CLES_COULEUR.map((k) => (c[k].clair === c[k].sombre ? c[k].clair : `${c[k].clair}/${c[k].sombre}`)).join(' | ') + ' |'
    })
    return ['| Thème | ' + CLES_COULEURS.map((k) => k.libelle).join(' | ') + ' |', '|' + '---|'.repeat(CLES_COULEURS.length + 1), ...lignes].join('\n')
  }
  it('le tableau de docs/design/README.md vient de THEMES (UPDATE_README=1 le régénère)', () => {
    const lu = readFileSync(chemin, 'utf8')
    const re = /(<!-- palettes:début -->\n)[\s\S]*?(\n<!-- palettes:fin -->)/
    expect(re.test(lu)).toBe(true)
    if (process.env.UPDATE_README) writeFileSync(chemin, lu.replace(re, (_m, d: string, f: string) => d + genere() + f))
    else expect(lu.match(re)![0]).toBe(`<!-- palettes:début -->\n${genere()}\n<!-- palettes:fin -->`)
  })
})

describe('validerTheme', () => {
  const bon = { nom: 'Ma palette', couleurs: JSON.parse(JSON.stringify(COULEURS_INDIGO_NUIT)) }
  it('accepte un thème complet', () => {
    expect(validerTheme(bon)).toEqual({ nom: 'Ma palette', couleurs: COULEURS_INDIGO_NUIT })
  })
  it('refuse une clé manquante, en la nommant', () => {
    const c = JSON.parse(JSON.stringify(bon)); delete c.couleurs.accent
    expect(validerTheme(c)).toEqual({ erreur: expect.stringContaining('accent') })
  })
  it('refuse un mode manquant', () => {
    const c = JSON.parse(JSON.stringify(bon)); delete c.couleurs.lignes.sombre
    expect(validerTheme(c)).toEqual({ erreur: expect.stringContaining('lignes') })
  })
  it('refuse un hex invalide (court, sans #, nom CSS)', () => {
    for (const mauvais of ['#FFF', 'FFFFFF', 'red', '#GGGGGG', '#FFFFFFFF', 5]) {
      const c = JSON.parse(JSON.stringify(bon)); c.couleurs.accent.clair = mauvais
      expect(validerTheme(c), String(mauvais)).toHaveProperty('erreur')
    }
  })
  it('refuse une clé inconnue, en la nommant', () => {
    const c = JSON.parse(JSON.stringify(bon)); c.couleurs['fond-pirate'] = { clair: '#000000', sombre: '#000000' }
    expect(validerTheme(c)).toEqual({ erreur: expect.stringContaining('fond-pirate') })
  })
  it('refuse un fichier de 20 Ko ou plus', () => {
    const c = JSON.parse(JSON.stringify(bon)); c.nom = 'x'.repeat(25_000)
    expect(validerTheme(c)).toHaveProperty('erreur')
    expect(validerTheme(JSON.stringify(c))).toHaveProperty('erreur')
  })
  it('refuse le non-objet et un nom vide', () => {
    for (const x of [null, 3, [], 'pas du json']) expect(validerTheme(x)).toHaveProperty('erreur')
    expect(validerTheme({ ...bon, nom: '  ' })).toHaveProperty('erreur')
  })
  it('met les hex en majuscules', () => {
    const c = JSON.parse(JSON.stringify(bon)); c.couleurs.accent.clair = '#5452c8'
    const r = validerTheme(c)
    expect('erreur' in r ? null : r.couleurs.accent.clair).toBe('#5452C8')
  })
  it('round-trip export → import de « Mes couleurs »', () => {
    const perso = JSON.parse(JSON.stringify(THEMES.sable.couleurs)) as CouleursTheme
    perso.accent.sombre = '#A1B2C3'
    const r = validerTheme(exporterTheme('Mes couleurs', perso))
    expect(r).toEqual({ nom: 'Mes couleurs', couleurs: perso })
  })
})

describe('etiquetteTeinteSite', () => {
  it('fond du ciel fondu à 18 % avec la couleur du site', () => {
    expect(etiquetteTeinteSite('#000000', '#FF0000')).toBe('#2E0000')
    expect(etiquetteTeinteSite('#15152E', '#FFFFFF', 50)).toBe('#8A8A97')
  })
  it('sans site (ou couleur invalide) : le ciel inchangé', () => {
    expect(etiquetteTeinteSite('#15152E', null)).toBe('#15152E')
    expect(etiquetteTeinteSite('#15152E', 'rouge')).toBe('#15152E')
  })
})
