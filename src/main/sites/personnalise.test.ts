import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { RegleSite, Settings } from '../../shared/types'
import { MONDE_SCRIPTS_PERSO, scriptsPersoApplicables, stylePerso } from './personnalise'

type Sites = Record<string, RegleSite>
const PAGE = 'https://exemple.test/page'
const AUCUN: Settings['styles'] = { css: '', scripts: [] }

describe('style personnalisé : global puis site', () => {
  it('concatène le style global et celui du site (le site après, il l’emporte à spécificité égale)', () => {
    const sites: Sites = { 'exemple.test': { style: 'body{color:red}' } }
    expect(stylePerso({ css: 'a{margin:0}', scripts: [] }, sites, PAGE)).toBe('a{margin:0}\nbody{color:red}')
  })
  it('global seul, site seul, ou rien', () => {
    expect(stylePerso({ css: 'a{margin:0}', scripts: [] }, {}, PAGE)).toBe('a{margin:0}')
    expect(stylePerso(AUCUN, { 'exemple.test': { style: 'b{x:y}' } }, PAGE)).toBe('b{x:y}')
    expect(stylePerso(AUCUN, {}, PAGE)).toBe('')
  })
  it('la règle la plus précise gagne (origine exacte > hôte > motif)', () => {
    const sites: Sites = { '*.exemple.test': { style: 'motif' }, 'www.exemple.test': { style: 'hote' }, 'https://www.exemple.test': { style: 'origine' } }
    expect(stylePerso(AUCUN, sites, 'https://www.exemple.test/x')).toBe('origine')
    expect(stylePerso(AUCUN, sites, 'https://autre.exemple.test/x')).toBe('motif')
  })
  it('le style d’un site ne s’applique pas à un autre', () => {
    expect(stylePerso(AUCUN, { 'exemple.test': { style: 'b{x:y}' } }, 'https://ailleurs.test/')).toBe('')
  })
  it('jamais sur une page interne ou une adresse non web, même avec un style global', () => {
    const globaux = { css: 'a{margin:0}', scripts: [] }
    for (const url of ['lyra://settings', 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/p.html', 'about:blank', 'data:text/html,x', '', 'file:///etc/x.html'])
      expect(stylePerso(globaux, { 'exemple.test': { style: 'x' } }, url)).toBe('')
  })
})

describe('scripts personnalisés applicables', () => {
  const s = (nom: string, actif = true) => ({ nom, code: `/* ${nom} */`, actif })
  it('seulement les scripts actifs, globaux d’abord puis ceux du site', () => {
    const sites: Sites = { 'exemple.test': { scriptsPerso: [s('site-1'), s('site-eteint', false), s('site-2')] } }
    const globaux = { css: '', scripts: [s('g1'), s('g-eteint', false)] }
    expect(scriptsPersoApplicables(globaux, sites, PAGE).map((x) => x.nom)).toEqual(['g1', 'site-1', 'site-2'])
  })
  it('résolution du site : la règle la plus précise fournit la liste', () => {
    const sites: Sites = { '*.exemple.test': { scriptsPerso: [s('motif')] }, 'www.exemple.test': { scriptsPerso: [s('hote')] } }
    expect(scriptsPersoApplicables(AUCUN, sites, 'https://www.exemple.test/').map((x) => x.nom)).toEqual(['hote'])
    expect(scriptsPersoApplicables(AUCUN, sites, 'https://m.exemple.test/').map((x) => x.nom)).toEqual(['motif'])
  })
  it('un site sans script ne reçoit que les scripts globaux', () => {
    expect(scriptsPersoApplicables({ css: '', scripts: [s('g')] }, {}, PAGE).map((x) => x.nom)).toEqual(['g'])
    expect(scriptsPersoApplicables(AUCUN, { 'exemple.test': { style: 'x' } }, PAGE)).toEqual([])
  })
  it('aucun script sur les pages internes, les extensions, les erreurs ni about:blank', () => {
    const globaux = { css: '', scripts: [s('g')] }
    for (const url of ['lyra://newtab', 'lyra://erreur?type=dns', 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/p.html', 'about:blank', 'file:///x.html', ''])
      expect(scriptsPersoApplicables(globaux, {}, url)).toEqual([])
  })
  it('ne renvoie que le nom et le code', () => {
    const [x] = scriptsPersoApplicables({ css: '', scripts: [s('g')] }, {}, PAGE)
    expect(Object.keys(x).sort()).toEqual(['code', 'nom'])
  })
})

describe('monde isolé', () => {
  it('un identifiant propre (jamais 0, le monde principal, ni les mondes d’Electron)', () => {
    expect(MONDE_SCRIPTS_PERSO).toBeGreaterThan(999)
  })
  it('le preload sandboxé répète la même valeur (il ne peut pas importer ce module)', () => {
    const source = readFileSync(join(__dirname, '../../preload/page.ts'), 'utf8')
    expect(source).toContain(`const MONDE_SCRIPTS_PERSO = ${MONDE_SCRIPTS_PERSO}\n`)
  })
})
