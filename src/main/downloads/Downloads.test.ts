import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ shell: { openPath: vi.fn(), showItemInFolder: vi.fn() } }))
import { Downloads } from './Downloads'

class FauxItem extends EventEmitter {
  annule = false
  constructor(private nom: string, private url: string) {
    super()
  }
  getFilename = () => this.nom
  getURL = () => this.url
  getTotalBytes = () => 10
  getReceivedBytes = () => 10
  setSavePath = vi.fn()
  getSavePath = () => ''
  isPaused = () => false
  canResume = () => true
  pause = vi.fn()
  resume = vi.fn()
  cancel = () => {
    this.annule = true
    this.emit('done', {}, 'cancelled')
  }
}
class FausseSession extends EventEmitter {}

let dossier: string
let dl: Downloads
beforeEach(() => {
  dossier = mkdtempSync(join(tmpdir(), 'lyra-dl-'))
  dl = new Downloads({ fichier: join(dossier, 'telechargements.json'), reglages: () => ({ dossier: join(dossier, 'dl'), demander: false }), surChangement: () => undefined })
})
afterEach(() => rmSync(dossier, { recursive: true, force: true }))

function telecharger(ses: FausseSession, nom: string, fini = true): FauxItem {
  const item = new FauxItem(nom, `http://h/${nom}`)
  ses.emit('will-download', {}, item)
  if (fini) item.emit('done', {}, 'completed')
  return item
}

describe('téléchargements privés', () => {
  it('listés pour leur fenêtre seulement, jamais dans la liste normale ni le fichier', () => {
    const normale = new FausseSession()
    const privee = new FausseSession()
    dl.attacher(normale as never)
    dl.attacher(privee as never, { fenetre: 7 })
    telecharger(normale, 'normal.txt')
    telecharger(privee, 'prive.txt')
    expect(dl.liste().map((i) => i.nom)).toEqual(['normal.txt'])
    expect(dl.liste(7).map((i) => i.nom)).toEqual(['prive.txt'])
    expect(dl.liste(8)).toEqual([])
    const f = join(dossier, 'telechargements.json')
    expect(existsSync(f)).toBe(true)
    expect(readFileSync(f, 'utf8')).not.toContain('prive')
  })

  it('un téléchargement privé en cours apparaît dans la liste de sa fenêtre', () => {
    const privee = new FausseSession()
    dl.attacher(privee as never, { fenetre: 7 })
    telecharger(privee, 'cours.txt', false)
    expect(dl.liste(7).map((i) => i.etat)).toEqual(['en-cours'])
    expect(dl.liste()).toEqual([])
  })

  it('une fenêtre ne pilote pas les téléchargements d\'une autre portée', () => {
    const privee = new FausseSession()
    dl.attacher(privee as never, { fenetre: 7 })
    const item = telecharger(privee, 'cours.txt', false)
    dl.annuler(dl.liste(7)[0]!.id)
    expect(item.annule).toBe(false)
    dl.annuler(dl.liste(7)[0]!.id, 8)
    expect(item.annule).toBe(false)
    dl.annuler(dl.liste(7)[0]!.id, 7)
    expect(item.annule).toBe(true)
  })

  it('effacer la liste privée ne touche ni la normale ni les autres fenêtres', () => {
    const normale = new FausseSession()
    const p7 = new FausseSession()
    const p8 = new FausseSession()
    dl.attacher(normale as never)
    dl.attacher(p7 as never, { fenetre: 7 })
    dl.attacher(p8 as never, { fenetre: 8 })
    telecharger(normale, 'n.txt')
    telecharger(p7, 'a.txt')
    telecharger(p8, 'b.txt')
    dl.effacerListe(7)
    expect(dl.liste(7)).toEqual([])
    expect(dl.liste(8)).toHaveLength(1)
    expect(dl.liste()).toHaveLength(1)
  })

  it('oublierFenetre vide la liste et annule les en-cours ; une fin tardive ne réapparaît pas', () => {
    const privee = new FausseSession()
    dl.attacher(privee as never, { fenetre: 7 })
    telecharger(privee, 'fini.txt')
    const item = telecharger(privee, 'cours.txt', false)
    dl.oublierFenetre(7)
    expect(item.annule).toBe(true)
    expect(dl.liste(7)).toEqual([])
    telecharger(privee, 'tard.txt')
    expect(dl.liste(7)).toEqual([])
  })
})
