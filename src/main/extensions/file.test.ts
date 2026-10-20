import { describe, expect, it, vi } from 'vitest'
import { installerFile, installerParId } from './file'
import type { ResultatInstallation } from '../../shared/types'

const id = (c: string): string => c.repeat(32)
const ok = (c: string): ResultatInstallation => ({ etat: 'installee', id: id(c), nom: c, version: '1.0' })

describe('installerParId', () => {
  it('chrome → Web Store', async () => {
    const chrome = vi.fn(async (i: string) => ok(i[0]))
    expect(await installerParId({ id: id('a'), nom: 'A', magasin: 'chrome' }, { chrome })).toEqual(ok('a'))
    expect(chrome).toHaveBeenCalledWith(id('a'))
  })
  it('edge et inconnu → à installer à la main, avec explication', async () => {
    const chrome = vi.fn()
    const e = await installerParId({ id: id('a'), nom: 'A', magasin: 'edge' }, { chrome })
    const i = await installerParId({ id: id('a'), nom: 'A', magasin: 'inconnu' }, { chrome })
    expect(e).toMatchObject({ etat: 'manuel' })
    expect((e as { raison: string }).raison).toMatch(/Edge/)
    expect(i).toMatchObject({ etat: 'manuel' })
    expect(chrome).not.toHaveBeenCalled()
  })
  it('firefox → installateur Firefox si présent, sinon indisponible', async () => {
    const firefox = vi.fn(async () => ok('f'))
    expect(await installerParId({ id: 'ublock-origin', nom: 'uBO', magasin: 'firefox' }, { chrome: vi.fn(), firefox })).toEqual(ok('f'))
    expect(await installerParId({ id: 'x', nom: 'X', magasin: 'firefox' }, { chrome: vi.fn() })).toMatchObject({ etat: 'manuel' })
  })
  it('identifiant Chrome invalide : erreur, sans appel réseau', async () => {
    const chrome = vi.fn()
    expect(await installerParId({ id: '../x', nom: 'X', magasin: 'chrome' }, { chrome })).toMatchObject({ etat: 'erreur' })
    expect(chrome).not.toHaveBeenCalled()
  })
  it('une exception de l\'installateur devient une erreur', async () => {
    const chrome = vi.fn(async () => { throw new Error('boum') })
    expect(await installerParId({ id: id('a'), nom: 'A', magasin: 'chrome' }, { chrome })).toEqual({ etat: 'erreur', raison: 'boum' })
  })
})

describe('installerFile', () => {
  it('installe 5 extensions en série ; une erreur n\'arrête pas les suivantes', async () => {
    const liste = ['a', 'b', 'c', 'd', 'e'].map((c) => ({ id: id(c), nom: c.toUpperCase(), magasin: 'chrome' as const }))
    let actives = 0
    let maxActives = 0
    const ordre: string[] = []
    const installer = async (e: { id: string }): Promise<ResultatInstallation> => {
      actives++
      maxActives = Math.max(maxActives, actives)
      await new Promise((r) => setTimeout(r, 2))
      actives--
      ordre.push(e.id[0])
      if (e.id[0] === 'c') throw new Error('réseau')
      if (e.id[0] === 'd') return { etat: 'erreur', raison: 'introuvable' }
      return ok(e.id[0])
    }
    const progression: Array<[number, number, string]> = []
    const journal: string[] = []
    const r = await installerFile(liste, (p) => progression.push([p.index, p.total, p.resultat?.etat ?? 'en cours']), installer, (m) => journal.push(m))
    expect(ordre).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(maxActives).toBe(1)
    expect(r.map((x) => x.resultat.etat)).toEqual(['installee', 'installee', 'erreur', 'erreur', 'installee'])
    expect(r[2].resultat).toEqual({ etat: 'erreur', raison: 'réseau' })
    expect(progression.filter((p) => p[2] === 'en cours')).toHaveLength(5)
    expect(progression.at(-1)).toEqual([4, 5, 'installee'])
    expect(journal).toHaveLength(5)
  })
  it('liste vide : rien à faire', async () => {
    expect(await installerFile([], () => {}, vi.fn())).toEqual([])
  })
})
