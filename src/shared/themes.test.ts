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
    for (const nom of ['--texte-secondaire', '--trait', '--pilule', '--attention', '--libelles-ciel', '--bouclier-ciel', '--ligne-selection'])
      expect(v[nom], nom).toBeTruthy()
    expect(v['--ligne-selection']).toBe('rgba(244,197,106,0.7)')
  })
  it('suit le mode', () => {
    const v = deriver(THEMES['indigo-nuit'].couleurs, 'sombre')
    expect(v['--ciel']).toBe('#0E0E1E')
    expect(v['--texte']).toBe('#E8E8F4')
    expect(v['--page']).toBe('#121214')
  })
  it('Indigo nuit en clair : exactement les valeurs de theme.css et du design', () => {
    const v = deriver(THEMES['indigo-nuit'].couleurs, 'clair')
    const attendu: Record<string, string> = {
      '--ciel': '#15152e', '--etoile-active': '#f4c56a', '--etoiles': '#a8a8d8', '--etoiles-endormies': '#4e4e7a', '--lignes': '#3b3b70',
      '--accent': '#5452c8', '--bouclier': '#1e7f6c', '--page': '#f7f7fb', '--texte': '#1c1c2e', '--texte-secondaire': '#6b6b80',
      '--trait': '#e6e6ee', '--pilule': '#f3f3f9', '--attention': '#8a5a10', '--libelles-ciel': '#8e8ebe', '--libelles-groupe': '#7f7fb0',
      '--bouclier-ciel': '#5fd3b3', '--ligne-selection': 'rgba(244,197,106,0.7)'
    }
    for (const [nom, val] of Object.entries(attendu)) expect(v[nom].toLowerCase(), nom).toBe(val)
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
