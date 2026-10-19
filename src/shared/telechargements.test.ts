import { describe, expect, it } from 'vitest'
import type { DownloadInfo } from './types'
import { extension, formaterTaille, texteEtat } from './telechargements'

const base: DownloadInfo = { id: '1', nom: 'a.pdf', chemin: '/x/Téléchargements/a.pdf', url: 'https://e.fr/a.pdf', total: 0, recu: 0, etat: 'en-cours', date: 0 }

describe('formaterTaille', () => {
  it('utilise o, Ko, Mo, Go', () => {
    expect(formaterTaille(512)).toBe('512 o')
    expect(formaterTaille(2048)).toBe('2 Ko')
    expect(formaterTaille(38 * 1024 * 1024)).toBe('38 Mo')
    expect(formaterTaille(1.5 * 1024 ** 3)).toBe('1,5 Go')
  })
})

describe('extension', () => {
  it('renvoie les lettres en majuscules, 4 au plus', () => {
    expect(extension('lyrides-photos.zip')).toBe('ZIP')
    expect(extension('archive.tar.gz')).toBe('GZ')
    expect(extension('LISEZMOI')).toBe('FIC')
    expect(extension('a.jpeg2000x')).toBe('JPEG')
  })
})

describe('texteEtat', () => {
  const Mo = 1024 * 1024
  it('en cours avec total et vitesse', () => {
    expect(texteEtat({ ...base, recu: 38 * Mo, total: 61 * Mo, vitesse: 2 * Mo })).toBe('38 Mo sur 61 — 12 s restantes')
  })
  it('en cours sans total', () => {
    expect(texteEtat({ ...base, recu: 3 * Mo })).toBe('3 Mo')
  })
  it('en pause', () => {
    expect(texteEtat({ ...base, etat: 'pause', recu: 3 * Mo, total: 6 * Mo })).toBe('En pause — 3 Mo sur 6')
  })
  it('terminé', () => {
    expect(texteEtat({ ...base, etat: 'termine', recu: 214 * Mo, total: 214 * Mo })).toBe('Terminé · 214 Mo · Téléchargements')
  })
  it('annulé et erreur', () => {
    expect(texteEtat({ ...base, etat: 'annule' })).toBe('Annulé')
    expect(texteEtat({ ...base, etat: 'erreur' })).toBe('Échec du téléchargement')
  })
})
