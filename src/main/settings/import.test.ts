import { describe, it, expect } from 'vitest'
import { patchImporte, patchPage } from './import'

describe('patchImporte', () => {
  const oui = (): boolean => true
  const non = (): boolean => false

  it('force actif: false sur les scripts personnalisés importés (globaux et par site), pas sur un patch de page', () => {
    const brut = {
      styles: { css: 'a{}', scripts: [{ nom: 'g', code: '1', actif: true }] },
      sites: { 'a.com': { scriptsPerso: [{ nom: 's', code: '2', actif: true }, { nom: 't', code: '3', actif: true }] } }
    }
    const p = patchImporte(brut, oui)
    expect(p.styles?.scripts?.map((x) => x.actif)).toEqual([false])
    expect(p.sites?.['a.com'].scriptsPerso?.map((x) => x.actif)).toEqual([false, false])
    expect(p.styles?.css).toBe('a{}')
    expect(patchPage(brut).styles?.scripts?.[0].actif).toBe(true)
  })
  it('garde un dossier absolu existant', () => {
    expect(patchImporte({ telechargements: { dossier: '/tmp', demander: true } }, oui).telechargements).toEqual({ dossier: '/tmp', demander: true })
  })
  it('ignore un dossier inexistant mais garde le reste', () => {
    expect(patchImporte({ telechargements: { dossier: '/nulle/part', demander: true } }, non).telechargements).toEqual({ demander: true })
  })
  it('ignore un chemin relatif même existant', () => {
    expect(patchImporte({ telechargements: { dossier: '../x' }, theme: 'sombre' }, oui)).toEqual({ theme: 'sombre' })
  })
  it('sans dossier, ne touche à rien', () => {
    expect(patchImporte({ theme: 'clair' }, non)).toEqual({ theme: 'clair' })
  })
  it('garde reseau.sites mais ignore reseau.personnelle', () => {
    const sites = [{ hote: 'reddit.com', origine: 'manuel', date: 1 }]
    const personnelle = { type: 'socks5', hote: '127.0.0.1', port: 40000 }
    expect(patchImporte({ reseau: { passerelles: false, sites, personnelle } }, non)).toEqual({ reseau: { passerelles: false, sites } })
    expect(patchImporte({ reseau: { personnelle } }, non)).toEqual({})
    expect(patchImporte({ reseau: { personnelle }, theme: 'clair' }, non)).toEqual({ theme: 'clair' })
  })
  it('ignore le registre des extensions et la date de vérification (écrits par le processus principal seul)', () => {
    const inst = { id: 'a'.repeat(32), nom: 'X', version: '1', source: 'cws', magasin: 'chrome', dossier: `${'a'.repeat(32)}/1`, active: true, installeeLe: '2026-10-19T10:00:00.000Z', miseAJourLe: '2026-10-19T10:00:00.000Z' }
    expect(patchImporte({ extensions: { installees: [inst], majAuto: false, derniereVerification: '2026-10-19T10:00:00.000Z' } }, non)).toEqual({ extensions: { majAuto: false } })
    expect(patchImporte({ extensions: { installees: [inst] }, theme: 'clair' }, non)).toEqual({ theme: 'clair' })
  })
})

describe('patchImporte : file d\'import', () => {
  const non = (): boolean => false
  it("ignore import : un fichier de réglages n'alimente jamais la file d'installation", () => {
    const attente = [{ id: 'a'.repeat(32), nom: 'X', magasin: 'chrome', actif: true, source: 'chrome', date: 1, imposee: false }]
    expect(patchImporte({ import: { extensionsEnAttente: attente, reglagesEnAttente: { pageAccueil: 'https://a.fr' } }, theme: 'clair' }, non)).toEqual({ theme: 'clair' })
  })
})

describe('patchPage (settings:set depuis une page)', () => {
  const inst = { id: 'a'.repeat(32), nom: 'X', version: '1', source: 'cws', magasin: 'chrome', dossier: `${'a'.repeat(32)}/1`, active: true, installeeLe: '2026-10-19T10:00:00.000Z', miseAJourLe: '2026-10-19T10:00:00.000Z' }
  it('retire installees et derniereVerification, garde majAuto et le reste', () => {
    expect(patchPage({ extensions: { installees: [inst], majAuto: true, derniereVerification: '2026-10-19T10:00:00.000Z' }, theme: 'sombre' })).toEqual({ extensions: { majAuto: true }, theme: 'sombre' })
    expect(patchPage({ extensions: { installees: [] } })).toEqual({})
  })
  it('garde reseau.personnelle (réglage fait par l’utilisateur dans l’interface)', () => {
    const personnelle = { type: 'socks5', hote: '127.0.0.1', port: 40000 }
    expect(patchPage({ reseau: { personnelle } })).toEqual({ reseau: { personnelle } })
  })
  it("ignore import (file d'import et réglages en attente) : seul le processus principal l'écrit", () => {
    const attente = [{ id: 'a'.repeat(32), nom: 'X', magasin: 'chrome', actif: true, source: 'chrome', date: 1, imposee: true }]
    expect(patchPage({ import: { extensionsEnAttente: attente, reglagesEnAttente: { pageAccueil: 'https://a.fr' } }, theme: 'sombre' })).toEqual({ theme: 'sombre' })
    expect(patchPage({ import: { extensionsEnAttente: [] } })).toEqual({})
  })
  it('en fenêtre privée, refuse les règles par site (comme le zoom et les permissions)', () => {
    const patch = { sites: { 'https://a.fr': { extensions: { ['a'.repeat(32)]: true } } }, theme: 'sombre' }
    expect(patchPage(patch, { privee: true })).toEqual({ theme: 'sombre' })
    expect(patchPage(patch)).toEqual(patch)
  })
})

