import { describe, it, expect } from 'vitest'
import { MOTEURS, moteursDisponibles, moteurParId, moteurParMotCle, urlDeRecherche } from './engines'
import { analyserMotCle, interpreterSaisie } from './suggest'
import { reglagesParDefaut } from '../settings/defaults'

const perso = { id: 'perso-1', nom: 'Mon wiki', motCle: 'mw', url: 'https://wiki.exemple.fr/?q=%s' }

describe('moteursDisponibles', () => {
  it('intégrés seuls par défaut, perso ajoutés ensuite', () => {
    const s = reglagesParDefaut('/dl')
    expect(moteursDisponibles(s)).toEqual(MOTEURS)
    const l = moteursDisponibles({ ...s, moteursPerso: [perso] })
    expect(l).toHaveLength(MOTEURS.length + 1)
    expect(l.at(-1)).toMatchObject({ id: 'perso-1', nom: 'Mon wiki', motCle: 'mw', lettre: 'M' })
  })

  it('moteurParId / moteurParMotCle prennent la liste', () => {
    const l = moteursDisponibles({ ...reglagesParDefaut('/dl'), moteursPerso: [perso] })
    expect(moteurParId('perso-1', l).nom).toBe('Mon wiki')
    expect(moteurParId('perso-1').id).toBe('duckduckgo')
    expect(moteurParMotCle('mw', l)?.id).toBe('perso-1')
    expect(moteurParMotCle('mw')).toBeUndefined()
  })

  it('un perso n\'écrase pas un intégré de même mot-clé', () => {
    const l = moteursDisponibles({ ...reglagesParDefaut('/dl'), moteursPerso: [{ ...perso, motCle: 'w' }] })
    expect(moteurParMotCle('w', l)?.id).toBe('wikipedia')
  })

  it('analyserMotCle et interpreterSaisie avec un moteur perso', () => {
    const l = moteursDisponibles({ ...reglagesParDefaut('/dl'), moteursPerso: [perso] })
    expect(analyserMotCle('mw lyre', l)?.moteur.id).toBe('perso-1')
    expect(analyserMotCle('mw lyre')).toBeNull()
    expect(interpreterSaisie('mw lyre', 'duckduckgo', l)).toEqual({ type: 'recherche', moteur: 'perso-1', requete: 'lyre' })
  })
})

describe('urlDeRecherche', () => {
  const l = moteursDisponibles({ ...reglagesParDefaut('/dl'), moteursPerso: [perso] })
  const wiki = l.at(-1)!

  it('encode la requête : elle ne sort jamais du paramètre ni de l\'hôte', () => {
    for (const requete of ['a&q=2#x', 'x/../@evil.fr', '$& $1 $$', 'évé 100%s %s', 'https://evil.fr/', 'a\\@evil.fr']) {
      const u = new URL(urlDeRecherche(wiki, requete))
      expect(u.origin, requete).toBe('https://wiki.exemple.fr')
      expect(u.username).toBe('')
      expect(u.hash).toBe('')
      expect(u.searchParams.get('q'), requete).toBe(requete)
      expect([...u.searchParams.keys()]).toEqual(['q'])
    }
  })
})
