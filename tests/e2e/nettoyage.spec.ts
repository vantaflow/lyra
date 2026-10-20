import { test, expect } from '@playwright/test'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, isAbsolute } from 'node:path'
import { lancerLyra } from './helpers'

// Les profils de test ne doivent jamais s'accumuler dans le dossier temporaire du système (25 822 profils lyra-*
// oubliés, ~130 Go, avaient rempli le disque).

const dans = (parent: string, enfant: string): boolean => {
  const r = relative(parent, enfant)
  return !r.startsWith('..') && !isAbsolute(r)
}

test('le profil créé par lancerLyra est effacé à la fermeture de l’app', async () => {
  const { app } = await lancerLyra()
  const userData = await app.evaluate(({ app: a }) => a.getPath('userData'))
  expect(existsSync(userData)).toBe(true)
  await app.close()
  expect(existsSync(userData)).toBe(false)
})

test('un profil fourni par le test n’est pas effacé entre deux lancements', async () => {
  const userData = join(tmpdir(), `lyra-fourni-${process.pid}-${Date.now()}`)
  mkdirSync(userData)
  try {
    const { app } = await lancerLyra({ LYRA_USER_DATA: userData })
    await app.close()
    expect(existsSync(userData)).toBe(true)
  } finally {
    rmSync(userData, { recursive: true, force: true })
  }
})

test('les e2e écrivent leurs dossiers temporaires dans une racine de session, effacée en fin de suite', async () => {
  const racine = process.env.LYRA_E2E_RACINE
  expect(racine).toBeTruthy()
  expect(dans(racine!, tmpdir())).toBe(true)
  // L'app hérite de la même racine (dossiers temporaires de Node côté main, ex. copies de l'import).
  const { app } = await lancerLyra()
  try {
    const temp = await app.evaluate(() => (process.platform === 'win32' ? process.env.TEMP : process.env.TMPDIR) ?? '')
    expect(dans(racine!, temp)).toBe(true)
  } finally {
    await app.close()
  }
})
