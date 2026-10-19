import { describe, it, expect } from 'vitest'
import { patchImporte } from './import'

describe('patchImporte', () => {
  const oui = (): boolean => true
  const non = (): boolean => false

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
})
