import { describe, expect, it } from 'vitest'
import type { PasserellePerso, Settings } from '../../shared/types'
import type { Candidat } from './liste'
import { Passerelles, type DepsPasserelles, type SessionProxy } from './Passerelles'

type Reseau = Settings['reseau']

const P1: Candidat = { type: 'socks5', hote: '1.1.1.1', port: 1080 }
const P2: Candidat = { type: 'http', hote: '2.2.2.2', port: 8080 }
const P3: Candidat = { type: 'socks5', hote: '3.3.3.3', port: 1080 }
const WARP: PasserellePerso = { type: 'socks5', hote: '127.0.0.1', port: 40000 }

interface FausseSession extends SessionProxy {
  proxys: { mode?: string; pacScript?: string }[]
  fermetures: number
}

function fausseSession(): FausseSession {
  const s: FausseSession = {
    proxys: [],
    fermetures: 0,
    setProxy: async (c) => {
      s.proxys.push(c)
    },
    closeAllConnections: async () => {
      s.fermetures++
    }
  }
  return s
}

/** Évalue le dernier PAC appliqué à la session (null : aucun PAC). */
function evaluer(s: FausseSession, url: string): string | null {
  const dernier = s.proxys.at(-1)
  if (!dernier || dernier.mode !== 'pac_script' || !dernier.pacScript) return null
  const corps = Buffer.from(dernier.pacScript.split(',')[1], 'base64').toString('utf8')
  const f = new Function(`${corps}; return FindProxyForURL`)() as (u: string, h: string) => string
  return f(url, new URL(url).hostname)
}

const site = (hote: string): Reseau['sites'][number] => ({ hote, origine: 'manuel', date: 1 })

function monter(initial: Partial<Reseau> = {}) {
  let reseau: Reseau = { passerelles: true, auto: true, sites: [], ...initial }
  const env = {
    trouves: [P1, P2, P3] as Candidat[],
    testOk: true,
    directOk: true,
    appels: { charger: 0, trouver: 0, tester: [] as Candidat[], direct: 0 },
    minuteurs: [] as { fn: () => void; ms: number; annule: boolean }[],
    sessions: [fausseSession(), fausseSession()],
    etats: 0,
    maintenant: 1_000_000
  }
  // eslint-disable-next-line prefer-const
  let p: Passerelles
  const deps: DepsPasserelles = {
    reseau: () => reseau,
    ecrireSites: (sites) => {
      reseau = { ...reseau, sites }
      p.surReglages()
    },
    ecrirePersonnelle: (pp) => {
      const { personnelle: _ancienne, ...reste } = reseau
      reseau = pp ? { ...reste, personnelle: pp } : reste
      p.surReglages()
    },
    sessions: () => env.sessions,
    charger: async () => {
      env.appels.charger++
      return { candidats: [P1, P2, P3], date: '2026-10-19T12:30:00.000Z', source: 'reseau' }
    },
    trouver: async (c) => {
      env.appels.trouver++
      expect(c.length).toBe(3)
      return [...env.trouves]
    },
    tester: async (c) => {
      env.appels.tester.push(c)
      return { ok: env.testOk, ms: 12 }
    },
    testerDirect: async () => {
      env.appels.direct++
      return env.directOk
    },
    maintenant: () => env.maintenant,
    planifier: (fn, ms) => {
      const m = { fn, ms, annule: false }
      env.minuteurs.push(m)
      return () => {
        m.annule = true
      }
    },
    aleatoire: () => 0,
    surChangement: () => {
      env.etats++
    }
  }
  p = new Passerelles(deps)
  return {
    p,
    env,
    reseau: () => reseau,
    modifier: (r: Partial<Reseau>) => {
      reseau = { ...reseau, ...r }
      p.surReglages()
    }
  }
}

const aucuneRequete = (env: ReturnType<typeof monter>['env']): void => {
  expect(env.appels).toEqual({ charger: 0, trouver: 0, tester: [], direct: 0 })
  for (const s of env.sessions) expect(s.proxys).toEqual([])
}

describe('Passerelles — sobriété', () => {
  it('aucune requête ni proxy tant qu’aucun site n’est contourné', async () => {
    const { p, env } = monter()
    p.demarrer()
    await p.attendre()
    expect(p.etat()).toMatchObject({ actif: true, auto: true, sites: [], pret: 0, dateListe: null })
    // Échecs qui ne déclenchent pas de détection : http, file, code non bloquant, sous-cadre géré par l’appelant.
    expect(await p.surEchec(1, 'http://a.fr/', -105)).toEqual({ action: 'erreur', url: expect.stringContaining('type=introuvable') })
    expect(await p.surEchec(1, 'file:///x.html', -6)).toMatchObject({ action: 'erreur' })
    expect(await p.surEchec(1, 'https://a.fr/', -2)).toMatchObject({ action: 'erreur' })
    await p.attendre()
    aucuneRequete(env)
    expect(env.minuteurs.filter((m) => !m.annule)).toEqual([])
  })

  it('détection désactivée : un blocage https n’envoie rien', async () => {
    const { p, env } = monter({ auto: false })
    p.demarrer()
    expect(await p.surEchec(1, 'https://bloque.fr/', -105)).toMatchObject({ action: 'erreur' })
    await p.attendre()
    aucuneRequete(env)
  })

  it('passerelles désactivées : ni requête ni PAC même avec des sites', async () => {
    const { p, env } = monter({ passerelles: false, sites: [site('a.fr')] })
    p.demarrer()
    await p.attendre()
    aucuneRequete(env)
    expect(p.contourne('https://a.fr/')).toBe(false)
  })
})

describe('Passerelles — routage', () => {
  it('un site contourné : recherche, PAC sur chaque session puis closeAllConnections', async () => {
    const { p, env } = monter({ sites: [site('a.fr')] })
    p.demarrer()
    await p.rechercher()
    await p.attendre()
    expect(env.appels.charger).toBe(1)
    for (const s of env.sessions) {
      expect(s.proxys.at(-1)?.mode).toBe('pac_script')
      expect(s.fermetures).toBeGreaterThan(0)
      expect(evaluer(s, 'https://www.a.fr/')).toBe('SOCKS5 1.1.1.1:1080; PROXY 2.2.2.2:8080; SOCKS5 3.3.3.3:1080')
      expect(evaluer(s, 'https://b.fr/')).toBe('DIRECT')
      // Passerelles publiques : jamais de http.
      expect(evaluer(s, 'http://a.fr/')).toBe('DIRECT')
    }
    expect(p.etat()).toMatchObject({ pret: 3, dateListe: '2026-10-19T12:30:00.000Z' })
    expect(p.viaPasserelle('https://a.fr/x')).toBe(true)
    expect(p.viaPasserelle('https://b.fr/x')).toBe(false)
    expect(p.viaPasserelle('http://a.fr/x')).toBe(false)
  })

  it('dernier site retiré : retour au proxy système, re-test arrêté', async () => {
    const { p, env, modifier } = monter({ sites: [site('a.fr')] })
    p.demarrer()
    await p.rechercher()
    await p.attendre()
    const minuteur = env.minuteurs.find((m) => !m.annule)
    expect(minuteur?.ms).toBe(10 * 60 * 1000)
    modifier({ sites: [] })
    await p.attendre()
    for (const s of env.sessions) expect(s.proxys.at(-1)).toEqual({ mode: 'system' })
    expect(minuteur?.annule).toBe(true)
  })

  it('re-test des retenues toutes les 10 min', async () => {
    const { p, env } = monter({ sites: [site('a.fr')] })
    p.demarrer()
    await p.rechercher()
    const m = env.minuteurs.find((x) => !x.annule)!
    env.testOk = false
    m.fn()
    await p.attendre()
    // Les 3 retenues ont été re-testées, toutes en échec → nouvelle recherche.
    expect(env.appels.tester).toEqual([P1, P2, P3])
    expect(env.appels.trouver).toBe(2)
    // Le minuteur est réarmé après le re-test.
    expect(env.minuteurs.length).toBe(2)
    expect(env.minuteurs[1].ms).toBe(10 * 60 * 1000)
  })

  it('ajout manuel : hôte normalisé, http:// refusé sans passerelle personnelle', async () => {
    const { p, reseau } = monter()
    p.ajouter('https://WWW.Exemple.fr/chemin')
    expect(reseau().sites.map((s) => s.hote)).toEqual(['exemple.fr'])
    expect(reseau().sites[0].origine).toBe('manuel')
    expect(() => p.ajouter('http://autre.fr')).toThrow(/https/)
    expect(() => p.ajouter('pas un hôte')).toThrow()
    p.basculerSite('old.exemple.fr')
    expect(reseau().sites).toEqual([])
    p.basculerSite('exemple.fr')
    p.retirer('exemple.fr')
    expect(reseau().sites).toEqual([])
    await p.attendre()
  })
})

describe('Passerelles — pool vide', () => {
  it('navigation vers un site contourné sans passerelle prête : page « Aucune passerelle »', async () => {
    const { p, env } = monter({ sites: [site('a.fr')] })
    env.trouves = []
    p.demarrer()
    await p.rechercher()
    await p.attendre()
    // Le PAC garde son repli fermé (jamais DIRECT pour le site).
    expect(evaluer(env.sessions[0], 'https://a.fr/')).toBe('PROXY 127.0.0.1:9')
    expect(p.viaPasserelle('https://a.fr/')).toBe(false)
    const d = await p.surEchec(7, 'https://a.fr/', -130)
    expect(d).toEqual({ action: 'erreur', url: expect.stringContaining('lyra://erreur?type=passerelles') })
    expect(p.etat().erreur).toBe('aucune')
  })

  it('pool vide à l’échec : nouvelle recherche, recharge si elle trouve', async () => {
    const { p, env } = monter({ sites: [site('a.fr')] })
    env.trouves = []
    p.demarrer()
    await p.rechercher()
    env.trouves = [P2]
    expect(await p.surEchec(7, 'https://a.fr/', -130)).toEqual({ action: 'recharger' })
    await p.attendre()
    expect(evaluer(env.sessions[1], 'https://a.fr/')).toBe('PROXY 2.2.2.2:8080')
  })
})

describe('Passerelles — rotation', () => {
  it('écarte la tête, recharge, 2 essais au plus puis page d’erreur', async () => {
    const { p, env } = monter({ sites: [site('a.fr')] })
    p.demarrer()
    await p.rechercher()
    expect(await p.surEchec(3, 'https://a.fr/', -130)).toEqual({ action: 'recharger' })
    await p.attendre()
    expect(evaluer(env.sessions[0], 'https://a.fr/')).toBe('PROXY 2.2.2.2:8080; SOCKS5 3.3.3.3:1080')
    expect(await p.surEchec(3, 'https://a.fr/', -111)).toEqual({ action: 'recharger' })
    await p.attendre()
    expect(evaluer(env.sessions[0], 'https://a.fr/')).toBe('SOCKS5 3.3.3.3:1080')
    const d = await p.surEchec(3, 'https://a.fr/', -120)
    expect(d).toMatchObject({ action: 'erreur', url: expect.stringContaining('type=passerelles') })
    // Pas de boucle : la page d'erreur remet le compteur à zéro pour une prochaine navigation.
    expect(await p.surEchec(3, 'https://a.fr/', -130)).toEqual({ action: 'recharger' })
  })

  it('un succès remet le compteur à zéro', async () => {
    const { p } = monter({ sites: [site('a.fr')] })
    p.demarrer()
    await p.rechercher()
    await p.surEchec(3, 'https://a.fr/', -130)
    p.surSucces(3, 'https://a.fr/')
    await p.surEchec(3, 'https://a.fr/', -130)
    expect(await p.surEchec(3, 'https://a.fr/', -130)).toEqual({ action: 'recharger' })
  })

  it('erreur non liée à la passerelle sur un site contourné : page normale', async () => {
    const { p } = monter({ sites: [site('a.fr')] })
    p.demarrer()
    await p.rechercher()
    expect(await p.surEchec(3, 'https://a.fr/', -324)).toMatchObject({ action: 'erreur', url: expect.stringContaining('type=reseau') })
  })
})

describe('Passerelles — détection automatique', () => {
  it('blocage https + réseau fonctionnel : essai via passerelle, ajout seulement après succès', async () => {
    const { p, env, reseau } = monter()
    p.demarrer()
    expect(await p.surEchec(5, 'https://www.bloque.fr/page', -101)).toEqual({ action: 'recharger' })
    await p.attendre()
    expect(env.appels.direct).toBe(1)
    // Essai : l'hôte passe par la passerelle, mais n'est pas encore enregistré.
    expect(reseau().sites).toEqual([])
    expect(evaluer(env.sessions[0], 'https://www.bloque.fr/')).toContain('SOCKS5 1.1.1.1:1080')
    p.surSucces(5, 'https://www.bloque.fr/page')
    await p.attendre()
    expect(reseau().sites).toEqual([{ hote: 'bloque.fr', origine: 'auto', date: env.maintenant }])
    expect(evaluer(env.sessions[0], 'https://bloque.fr/')).toContain('SOCKS5 1.1.1.1:1080')
  })

  it('l’essai échoue : rien n’est ajouté, page normale, une seule tentative', async () => {
    const { p, env, reseau } = monter()
    p.demarrer()
    expect(await p.surEchec(5, 'https://panne.fr/', -105)).toEqual({ action: 'recharger' })
    const d = await p.surEchec(5, 'https://panne.fr/', -105)
    expect(d).toMatchObject({ action: 'erreur', url: expect.stringContaining('type=introuvable') })
    await p.attendre()
    expect(reseau().sites).toEqual([])
    // L'hôte d'essai est retiré du PAC (plus aucun site : proxy système).
    expect(env.sessions[0].proxys.at(-1)).toEqual({ mode: 'system' })
    expect(env.appels.direct).toBe(1)
  })

  it('réseau hors service : pas d’essai ni de recherche', async () => {
    const { p, env } = monter()
    env.directOk = false
    p.demarrer()
    expect(await p.surEchec(5, 'https://bloque.fr/', -105)).toMatchObject({ action: 'erreur' })
    expect(env.appels.charger).toBe(0)
    expect(env.appels.trouver).toBe(0)
  })

  it('aucune passerelle trouvée : page normale, rien d’ajouté', async () => {
    const { p, env, reseau } = monter()
    env.trouves = []
    p.demarrer()
    expect(await p.surEchec(5, 'https://bloque.fr/', -105)).toMatchObject({ action: 'erreur', url: expect.stringContaining('type=introuvable') })
    expect(reseau().sites).toEqual([])
  })

  it('pas de détection sur une adresse IP ni sur un code de certificat', async () => {
    const { p, env } = monter()
    p.demarrer()
    expect(await p.surEchec(5, 'https://8.8.8.8/', -105)).toMatchObject({ action: 'erreur' })
    expect(await p.surEchec(5, 'https://a.fr/', -202)).toMatchObject({ action: 'erreur', url: expect.stringContaining('type=certificat') })
    expect(env.appels.direct).toBe(0)
  })
})

describe('Passerelles — passerelle personnelle', () => {
  it('prioritaire : testée seule, sans liste publique ; http autorisé', async () => {
    const { p, env } = monter({ sites: [site('a.fr')], personnelle: WARP })
    p.demarrer()
    await p.rechercher()
    await p.attendre()
    expect(env.appels.charger).toBe(0)
    expect(env.appels.tester).toEqual([WARP])
    expect(evaluer(env.sessions[0], 'https://a.fr/')).toBe('SOCKS5 127.0.0.1:40000')
    expect(evaluer(env.sessions[0], 'http://a.fr/')).toBe('SOCKS5 127.0.0.1:40000')
    expect(p.etat()).toMatchObject({ pret: 1, personnelle: WARP })
    expect(p.viaPasserelle('http://a.fr/')).toBe(true)
  })

  it('injoignable : état « injoignable », page « Aucune passerelle »', async () => {
    const { p, env } = monter({ sites: [site('a.fr')], personnelle: WARP })
    env.testOk = false
    p.demarrer()
    await p.rechercher()
    expect(p.etat()).toMatchObject({ pret: 0, erreur: 'injoignable' })
    expect(await p.surEchec(1, 'https://a.fr/', -130)).toMatchObject({ url: expect.stringContaining('type=passerelles') })
    expect(env.appels.charger).toBe(0)
  })

  it('suppression : la clé disparaît et les publiques reprennent', async () => {
    const { p, env, reseau } = monter({ sites: [site('a.fr')], personnelle: WARP })
    p.demarrer()
    await p.rechercher()
    const e = await p.definirPersonnelle(null)
    expect('personnelle' in reseau()).toBe(false)
    expect(e.personnelle).toBeUndefined()
    await p.attendre()
    expect(env.appels.charger).toBe(1)
    expect(evaluer(env.sessions[0], 'https://a.fr/')).toBe('SOCKS5 1.1.1.1:1080; PROXY 2.2.2.2:8080; SOCKS5 3.3.3.3:1080')
    expect(evaluer(env.sessions[0], 'http://a.fr/')).toBe('DIRECT')
  })

  it('WARP : remplit 127.0.0.1:40000 en SOCKS5 puis teste', async () => {
    const { p, env, reseau } = monter()
    const e = await p.warp()
    expect(reseau().personnelle).toEqual(WARP)
    expect(env.appels.tester).toEqual([WARP])
    expect(e).toMatchObject({ pret: 1, personnelle: WARP })
  })

  it('configuration invalide refusée', async () => {
    const { p } = monter()
    await expect(p.definirPersonnelle({ type: 'socks5', hote: 'x', port: 0 })).rejects.toThrow()
  })
})

describe('Passerelles — certificats', () => {
  it('site contourné : page de certificat sans « Continuer », jamais d’exception', async () => {
    const { p } = monter({ sites: [site('a.fr')] })
    p.demarrer()
    await p.rechercher()
    expect(p.contourne('https://sous.a.fr/')).toBe(true)
    const d = await p.surEchec(2, 'https://sous.a.fr/', -202)
    expect(d).toMatchObject({ action: 'erreur' })
    const url = new URL((d as { url: string }).url)
    expect(url.searchParams.get('type')).toBe('certificat')
    expect(url.searchParams.get('contourne')).toBe('1')
    expect(url.searchParams.get('passerelle')).toBeNull()
  })

  it('site non contourné en https : la page propose « Passer par une passerelle »', async () => {
    const { p } = monter({ sites: [site('a.fr')] })
    p.demarrer()
    const url = new URL(p.urlErreurPour(-202, 'https://b.fr/'))
    expect(url.searchParams.get('passerelle')).toBe('1')
    expect(url.searchParams.get('contourne')).toBeNull()
    expect(new URL(p.urlErreurPour(-102, 'http://b.fr/')).searchParams.get('passerelle')).toBeNull()
  })
})
