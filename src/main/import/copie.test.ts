import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { lireProfilChromium } from './chromium'
import { avecCopieur, raisonErreurFichier } from './copie'
import { detecterProfils } from './detection'
import { MAINTENANT_FIXTURES } from './fixtures/generer'
import { ErreurImport } from './types'

const FIXTURES = fileURLToPath(new URL('./fixtures/chromium', import.meta.url))

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'lyra-copie-'))
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

/** Empreinte (contenu + date de modification) de tous les fichiers sous `dossier`. */
function empreinte(dossier: string): Record<string, string> {
  const r: Record<string, string> = {}
  const parcourir = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const chemin = join(d, e.name)
      if (e.isDirectory()) parcourir(chemin)
      else r[relative(dossier, chemin)] = `${createHash('sha256').update(readFileSync(chemin)).digest('hex')}@${statSync(chemin).mtimeMs}`
    }
  }
  parcourir(dossier)
  return r
}

describe('copie avant lecture', () => {
  it('la source n’est jamais modifiée (contenu et date inchangés) ni aucun fichier créé dans le profil', async () => {
    const avant = empreinte(FIXTURES)
    const profils = await detecterProfils({ racines: { chrome: join(FIXTURES, 'chrome'), edge: join(FIXTURES, 'edge'), brave: join(FIXTURES, 'brave') }, navigateurs: ['chrome', 'edge', 'brave'] })
    for (const p of profils) await lireProfilChromium(p, { maintenant: MAINTENANT_FIXTURES, depuisJours: null })
    expect(empreinte(FIXTURES)).toEqual(avant)
  })

  it('un dossier temporaire par appel, supprimé après succès', async () => {
    let vu = ''
    await avecCopieur(
      async (c) => {
        vu = c.dossier
        expect(readdirSync(tmp)).toHaveLength(1)
      },
      { dossierTemp: tmp }
    )
    expect(vu).toContain('lyra-import-')
    expect(readdirSync(tmp)).toEqual([])
  })

  it('dossier temporaire supprimé même quand le traitement échoue', async () => {
    const source = join(tmp, 'source')
    writeFileSync(source, 'contenu')
    await expect(
      avecCopieur(
        async (c) => {
          await c.copier(source)
          throw new Error('boum')
        },
        { dossierTemp: tmp }
      )
    ).rejects.toThrow('boum')
    expect(readdirSync(tmp)).toEqual(['source'])
  })

  it('copie le fichier et ses annexes -wal et -journal, sans toucher à l’original', async () => {
    const dossier = join(tmp, 'profil')
    mkdirSync(dossier)
    for (const [nom, contenu] of [['History', 'base'], ['History-wal', 'wal'], ['History-journal', 'journal']]) writeFileSync(join(dossier, nom), contenu)
    const avant = empreinte(dossier)
    await avecCopieur(
      async (c) => {
        const copies = await c.copier(join(dossier, 'History'))
        expect(copies.fichier).not.toBe(join(dossier, 'History'))
        expect(readFileSync(copies.fichier, 'utf8')).toBe('base')
        expect(readFileSync(copies.wal!, 'utf8')).toBe('wal')
        expect(readFileSync(copies.journal!, 'utf8')).toBe('journal')
        await c.liberer(copies)
        expect(() => statSync(copies.fichier)).toThrow()
      },
      { dossierTemp: tmp }
    )
    expect(empreinte(dossier)).toEqual(avant)
  })

  it('sans annexes : copies.wal et copies.journal absents', async () => {
    const source = join(tmp, 'Web Data')
    writeFileSync(source, 'x')
    await avecCopieur(async (c) => expect(await c.copier(source)).toEqual({ fichier: expect.any(String) }), { dossierTemp: tmp })
  })

  it('deux copies du même nom ne se marchent pas dessus', async () => {
    const a = join(tmp, 'a', 'Preferences')
    const b = join(tmp, 'b', 'Preferences')
    for (const [chemin, contenu] of [[a, 'A'], [b, 'B']]) {
      mkdirSync(join(chemin, '..'), { recursive: true })
      writeFileSync(chemin, contenu)
    }
    await avecCopieur(async (c) => {
      expect((await c.lire(a)).toString()).toBe('A')
      expect((await c.lire(b)).toString()).toBe('B')
    }, { dossierTemp: tmp })
  })

  it('fichier introuvable : ErreurImport lisible', async () => {
    await expect(avecCopieur((c) => c.lire(join(tmp, 'absent.json')), { dossierTemp: tmp })).rejects.toMatchObject({ name: 'ErreurImport', raison: 'Fichier introuvable : absent.json.' })
    expect(readdirSync(tmp)).toEqual([])
  })
})

describe('taille maximale', () => {
  it('fichier ordinaire au-delà de la limite : refusé avant la copie, message lisible, code « volumineux »', async () => {
    const source = join(tmp, 'Bookmarks')
    writeFileSync(source, Buffer.alloc(3 * 1024 * 1024))
    await expect(avecCopieur((c) => c.lire(source), { dossierTemp: tmp, tailleMaxFichier: 2 * 1024 * 1024, navigateur: 'Chrome' })).rejects.toMatchObject({
      code: 'volumineux',
      raison: 'Le fichier Bookmarks est trop volumineux (3 Mo, maximum 2 Mo) : réduisez-le dans Chrome puis réessayez.'
    })
    expect(readdirSync(tmp)).toEqual(['Bookmarks']) // le dossier temporaire a disparu, aucune copie n'a été faite
  })

  it('base : limite propre aux bases, sujet personnalisé ; le -wal est contrôlé aussi', async () => {
    const source = join(tmp, 'History')
    writeFileSync(source, Buffer.alloc(1024))
    writeFileSync(source + '-wal', Buffer.alloc(3 * 1024 * 1024))
    await expect(avecCopieur((c) => c.copier(source, { base: true, sujet: "L'historique" }), { dossierTemp: tmp, tailleMaxBase: 1024 * 1024, navigateur: 'Edge' })).rejects.toMatchObject({
      code: 'volumineux',
      raison: expect.stringMatching(/^Le journal History-wal est trop volumineux \(3 Mo, maximum 1 Mo\) : réduisez-le dans Edge/)
    })
    writeFileSync(source, Buffer.alloc(3 * 1024 * 1024))
    await expect(avecCopieur((c) => c.copier(source, { base: true, sujet: "L'historique" }), { dossierTemp: tmp, tailleMaxBase: 1024 * 1024 })).rejects.toMatchObject({
      raison: expect.stringMatching(/^L'historique est trop volumineux \(3 Mo, maximum 1 Mo\)/)
    })
  })

  it('la limite des bases n’empêche pas un fichier ordinaire plus petit que sa propre limite', async () => {
    const source = join(tmp, 'Preferences')
    writeFileSync(source, '{}')
    await avecCopieur(async (c) => expect((await c.lire(source)).toString()).toBe('{}'), { dossierTemp: tmp, tailleMaxBase: 1 })
  })
})

describe('raisonErreurFichier', () => {
  const err = (code: string): NodeJS.ErrnoException => Object.assign(new Error(code), { code })

  it('Windows : verrouillé → « Fermez Chrome puis réessayez »', () => {
    for (const code of ['EBUSY', 'EPERM', 'EACCES']) {
      expect(raisonErreurFichier(err(code), 'History', 'Chrome', 'win32')).toBe('History est verrouillé : fermez Chrome puis réessayez.')
    }
  })

  it('macOS / Linux : accès refusé, avec le nom du navigateur', () => {
    expect(raisonErreurFichier(err('EPERM'), 'History.db', 'Safari', 'darwin')).toMatch(/Accès refusé.*Safari/)
  })

  it('introuvable et autres erreurs', () => {
    expect(raisonErreurFichier(err('ENOENT'), 'History')).toBe('Fichier introuvable : History.')
    expect(raisonErreurFichier(err('EIO'), 'History')).toBe('Lecture impossible (History) : EIO.')
    expect(raisonErreurFichier(new Error('bizarre'), 'History')).toBe('Lecture impossible (History) : bizarre.')
  })

  it('ErreurImport porte la raison', () => {
    const e = new ErreurImport('raison lisible')
    expect(e.raison).toBe('raison lisible')
    expect(e.message).toBe('raison lisible')
  })
})
