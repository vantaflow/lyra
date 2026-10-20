import { describe, it, expect } from 'vitest'
import { creerRelaisSouris } from './capsuleSouris'
import { CAPSULE } from '../window/layout'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function monter(actif = true) {
  const etat = { actif, t: 1000, detruite: false, envoyes: [] as number[] }
  const relais = creerRelaisSouris({
    actif: () => etat.actif,
    maintenant: () => etat.t,
    detruite: () => etat.detruite,
    hauteurCapsule: CAPSULE,
    envoyer: (y) => etat.envoyes.push(y)
  })
  return { etat, relais }
}

describe('relais de la souris vers la capsule', () => {
  it('option coupée : aucun signal, même si l\'écouteur reçoit des mouvements', () => {
    const { etat, relais } = monter(false)
    relais({ type: 'mouseMove', y: 10 })
    expect(etat.envoyes).toEqual([])
  })
  it('option activée : y compté depuis le haut de la capsule, 10 signaux par seconde au plus', () => {
    const { etat, relais } = monter()
    relais({ type: 'mouseMove', y: 10 })
    etat.t += 50
    relais({ type: 'mouseMove', y: 20 })
    etat.t += 60
    relais({ type: 'mouseMove', y: 30 })
    expect(etat.envoyes).toEqual([CAPSULE + 10, CAPSULE + 30])
  })
  it('reprend dès que l\'option est réactivée ; ignore les autres évènements et une fenêtre détruite', () => {
    const { etat, relais } = monter(false)
    relais({ type: 'mouseMove', y: 1 })
    etat.actif = true
    relais({ type: 'mouseDown', y: 2 })
    etat.detruite = true
    relais({ type: 'mouseMove', y: 3 })
    expect(etat.envoyes).toEqual([])
    etat.detruite = false
    relais({ type: 'mouseMove', y: 4 })
    expect(etat.envoyes).toEqual([CAPSULE + 4])
  })
})

describe('hauteur de la capsule', () => {
  it('Capsule.tsx utilise CAPSULE de layout.ts : aucune seconde constante de 46 px', () => {
    const source = readFileSync(join(__dirname, '../../renderer/ui/Capsule.tsx'), 'utf8')
    expect(source).toMatch(/import \{ CAPSULE \} from '..\/..\/main\/window\/layout'/)
    expect(source).not.toMatch(/CAPSULE_PX|=\s*46\b/)
  })
})
