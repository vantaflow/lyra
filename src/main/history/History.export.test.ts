import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { History } from './History'

describe('History.pages / visites (export)', () => {
  it('une entrée par page avec dernière date et nombre ; chaque visite une par une', () => {
    const h = new History(join(mkdtempSync(join(tmpdir(), 'lyra-histo-exp-')), 'h.jsonl'))
    h.ajouter({ url: 'https://a.fr/', title: 'A', date: 100 })
    h.ajouter({ url: 'https://a.fr/', title: 'A', date: 300 })
    h.ajouter({ url: 'https://b.fr/', title: 'B', date: 200 })
    expect([...h.pages()]).toEqual([
      { url: 'https://a.fr/', titre: 'A', date: 300, visites: 2 },
      { url: 'https://b.fr/', titre: 'B', date: 200, visites: 1 }
    ])
    expect([...h.visites()].map((v) => [v.url, v.date])).toEqual([['https://a.fr/', 100], ['https://a.fr/', 300], ['https://b.fr/', 200]])
  })
})
