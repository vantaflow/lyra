import type { Cookie } from 'electron'
import { describe, expect, it } from 'vitest'
import { PARTITION_COOKIES, versDetails, versSauvegarde } from './cookies'

const c = (o: Partial<Cookie>): Cookie => ({ name: 'sid', value: 'v', domain: '.exemple.fr', hostOnly: false, path: '/', secure: true, httpOnly: true, session: false, expirationDate: 2e9, sameSite: 'lax', ...o })

describe('cookies du paquet', () => {
  it('seule la partition persistante de Lyra est concernée', () => {
    expect(PARTITION_COOKIES).toBe('persist:lyra')
  })

  it('aller-retour Electron → paquet → détails de restauration', () => {
    const s = versSauvegarde(c({}))!
    expect(s).toEqual({ name: 'sid', value: 'v', domain: '.exemple.fr', path: '/', secure: true, httpOnly: true, hostOnly: false, sameSite: 'lax', expirationDate: 2e9 })
    expect(versDetails(s)).toEqual({ url: 'https://exemple.fr/', name: 'sid', value: 'v', domain: '.exemple.fr', path: '/', secure: true, httpOnly: true, sameSite: 'lax', expirationDate: 2e9 })
  })

  it('cookie de session sans date ; cookie d’hôte sans attribut domain ; http si non sécurisé', () => {
    const s = versSauvegarde(c({ session: true, hostOnly: true, domain: 'a.exemple.fr', secure: false, expirationDate: undefined }))!
    expect(s.expirationDate).toBeUndefined()
    const d = versDetails(s)
    expect(d.url).toBe('http://a.exemple.fr/')
    expect(d.domain).toBeUndefined()
    expect(d.expirationDate).toBeUndefined()
  })

  it('cookie sans nom ou sans domaine ignoré', () => {
    expect(versSauvegarde(c({ name: '' }))).toBeNull()
    expect(versSauvegarde(c({ domain: '' }))).toBeNull()
  })
})
