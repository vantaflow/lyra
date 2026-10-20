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
  /** Nombre de setProxy à faire échouer. */
  echecs: number
}

function fausseSession(): FausseSession {
  const s: FausseSession = {
    proxys: [],
    fermetures: 0,
    echecs: 0,
    setProxy: async (c) => {
      if (s.echecs > 0) {
        s.echecs--
        throw new Error('setProxy')
      }
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

const RETEST = 10 * 60 * 1000
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
    maintenant: 1_000_000,
    systeme: { https: 'DIRECT', http: 'DIRECT' },
    resolutions: 0
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
    proxySysteme: async () => {
      env.resolutions++
      return env.systeme
    },
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
  expect(env.resolutions).toBe(0)
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
      expect(evaluer(s, 'http://a.fr/')).toBe('PROXY 127.0.0.1:9')
    }
    expect(p.etat()).toMatchObject({ pret: 3, dateListe: '2026-10-19T12:30:00.000Z' })
    expect(p.viaPasserelle('https://a.fr/x')).toBe(true)
    expect(p.viaPasserelle('https://b.fr/x')).toBe(false)
    expect(p.viaPasserelle('http://a.fr/x')).toBe(false)
  })

  it('session créée après coup (fenêtre privée) : même PAC que les autres, sans nouvelle détection', async () => {
    const { p, env } = monter({ sites: [site('a.fr')] })
    p.demarrer()
    await p.rechercher()
    await p.attendre()
    const appels = { ...env.appels }
    const privee = fausseSession()
    await p.attacherSession(privee)
    expect(privee.proxys).toHaveLength(1)
    expect(evaluer(privee, 'https://www.a.fr/')).toBe('SOCKS5 1.1.1.1:1080; PROXY 2.2.2.2:8080; SOCKS5 3.3.3.3:1080')
    expect(evaluer(privee, 'https://b.fr/')).toBe('DIRECT')
    expect(env.appels).toEqual(appels)
  })

  it('session créée sans site contourné : proxy système', async () => {
    const { p } = monter()
    const privee = fausseSession()
    await p.attacherSession(privee)
    expect(privee.proxys).toEqual([{ mode: 'system' }])
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
    const m = env.minuteurs.find((x) => !x.annule && x.ms === RETEST)!
    env.testOk = false
    m.fn()
    await p.attendre()
    // Les 3 retenues ont été re-testées, toutes en échec → nouvelle recherche.
    expect(env.appels.tester).toEqual([P1, P2, P3])
    expect(env.appels.trouver).toBe(2)
    // Le minuteur est réarmé après le re-test.
    const retests = env.minuteurs.filter((x) => x.ms === RETEST)
    expect(retests.length).toBe(2)
    expect(retests[1].annule).toBe(false)
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
    // Délai de grâce de 10 min après une recherche infructueuse : pas de nouvelle recherche avant.
    env.maintenant += RETEST
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

  it('état « recherche » signalé pendant la détection puis retombé (clé = navigation)', async () => {
    const { p, env } = monter()
    p.demarrer()
    let pendant: boolean | undefined
    const vus: boolean[] = []
    const dep = (p as unknown as { deps: DepsPasserelles }).deps
    const direct = dep.testerDirect
    dep.testerDirect = async () => {
      pendant = p.enRecherche(5)
      vus.push(p.enRecherche(6))
      return direct()
    }
    const avant = env.etats
    expect(await p.surEchec(5, 'https://www.bloque.fr/page', -101)).toEqual({ action: 'recharger' })
    expect(pendant).toBe(true)
    expect(vus).toEqual([false])
    expect(p.enRecherche(5)).toBe(false)
    // Au moins deux notifications : début et fin de la recherche (la pilule se met à jour).
    expect(env.etats - avant).toBeGreaterThanOrEqual(2)
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
    expect(evaluer(env.sessions[0], 'http://a.fr/')).toBe('PROXY 127.0.0.1:9')
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

describe('Passerelles — ajout depuis la page d’erreur', () => {
  it('ajoute un hôte https ; refuse le reste ; message lisible si la liste est pleine', () => {
    const { p, reseau, modifier } = monter()
    expect(p.ajouterDepuisErreur('https://www.bloque.fr/x')).toEqual({ ok: true })
    expect(reseau().sites.map((s) => s.hote)).toEqual(['bloque.fr'])
    expect(p.ajouterDepuisErreur('http://clair.fr/')).toEqual({ ok: false })
    expect(p.ajouterDepuisErreur('https://127.0.0.1/')).toEqual({ ok: false })
    modifier({ sites: Array.from({ length: 500 }, (_, i) => site(`s${i}.fr`)) })
    expect(p.ajouterDepuisErreur('https://nouveau.fr/')).toEqual({ ok: false, erreur: 'Liste pleine (500 sites)' })
    modifier({ passerelles: false })
    expect(p.ajouterDepuisErreur('https://autre.fr/')).toEqual({ ok: false })
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

describe('Passerelles — corrections de relecture', () => {
  it('proxy système préservé : son repli pour les sites non contournés, les passerelles pour les contournés', async () => {
    const { p, env } = monter({ sites: [site('a.fr')] })
    env.systeme = { https: 'PROXY corp:8080', http: 'PROXY corp:3128' }
    p.demarrer()
    await p.rechercher()
    await p.attendre()
    expect(env.resolutions).toBeGreaterThan(0)
    expect(evaluer(env.sessions[0], 'https://b.fr/')).toBe('PROXY corp:8080')
    expect(evaluer(env.sessions[0], 'http://b.fr/')).toBe('PROXY corp:3128')
    expect(evaluer(env.sessions[0], 'https://a.fr/')).toBe('SOCKS5 1.1.1.1:1080; PROXY 2.2.2.2:8080; SOCKS5 3.3.3.3:1080')
    expect(evaluer(env.sessions[0], 'https://192.168.0.1/')).toBe('DIRECT')
  })

  it('détection : un succès sur une autre adresse ou une réponse >= 400 n’enregistre rien', async () => {
    const { p, env, reseau } = monter()
    p.demarrer()
    expect(await p.surEchec(5, 'https://panne.fr/', -105)).toEqual({ action: 'recharger' })
    p.surSucces(5, 'https://ailleurs.fr/', 200)
    await p.attendre()
    expect(reseau().sites).toEqual([])
    expect(env.sessions[0].proxys.at(-1)).toEqual({ mode: 'system' })
    // Cache négatif de l'hôte (10 min) : on avance l'horloge pour un second essai.
    env.maintenant += RETEST
    expect(await p.surEchec(6, 'https://panne.fr/', -105)).toEqual({ action: 'recharger' })
    p.surSucces(6, 'https://panne.fr/', 503)
    await p.attendre()
    expect(reseau().sites).toEqual([])
    // Redirection vers un sous-domaine couvert : enregistré.
    expect(await p.surEchec(7, 'https://bloque.fr/', -105)).toEqual({ action: 'recharger' })
    p.surSucces(7, 'https://m.bloque.fr/accueil', 200)
    expect(reseau().sites.map((x) => x.hote)).toEqual(['bloque.fr'])
  })

  it('détection : une navigation vers une autre adresse met fin à l’essai', async () => {
    const { p, env, reseau } = monter()
    p.demarrer()
    expect(await p.surEchec(5, 'https://panne.fr/', -105)).toEqual({ action: 'recharger' })
    // Le rechargement de l'essai (même adresse) ne l'interrompt pas.
    expect(p.surDebut(5, 'https://panne.fr/')).toBeNull()
    expect(p.surDebut(5, 'https://autre.fr/')).toBeNull()
    await p.attendre()
    expect(env.sessions[0].proxys.at(-1)).toEqual({ mode: 'system' })
    p.surSucces(5, 'https://panne.fr/', 200)
    expect(reseau().sites).toEqual([])
  })

  it('http:// vers un site contourné sans personnelle prête : page « http » (contourne=1)', async () => {
    const { p } = monter({ sites: [site('a.fr')] })
    p.demarrer()
    await p.rechercher()
    const u = new URL(p.surDebut(1, 'http://www.a.fr/page')!)
    expect(u.searchParams.get('type')).toBe('http')
    expect(u.searchParams.get('contourne')).toBe('1')
    expect(u.searchParams.get('url')).toBe('http://www.a.fr/page')
    expect(p.refusHttp('ws://a.fr/x')).not.toBeNull()
    expect(p.surDebut(1, 'http://b.fr/')).toBeNull()
    expect(p.surDebut(1, 'https://a.fr/')).toBeNull()
  })

  it('http:// accepté quand la passerelle personnelle est prête', async () => {
    const { p } = monter({ sites: [site('a.fr')], personnelle: WARP })
    p.demarrer()
    await p.rechercher()
    expect(p.surDebut(1, 'http://a.fr/')).toBeNull()
  })

  it('fenêtre privée : pas de détection (rien n’est écrit), la rotation reste', async () => {
    const { p, env, reseau } = monter()
    p.demarrer()
    const privee = p.crochets({ privee: true })
    expect(await privee.surEchec(9, 'https://bloque.fr/', -105)).toMatchObject({ action: 'erreur' })
    privee.surSucces(9, 'https://bloque.fr/', 200)
    expect(env.appels.direct).toBe(0)
    expect(reseau().sites).toEqual([])
    const m = monter({ sites: [site('a.fr')] })
    m.p.demarrer()
    await m.p.rechercher()
    expect(await m.p.crochets({ privee: true }).surEchec(9, 'https://a.fr/', -130)).toEqual({ action: 'recharger' })
  })

  it('setProxy en échec : le PAC est réappliqué au changement suivant', async () => {
    const { p, env } = monter({ sites: [site('a.fr')] })
    // Échoue au PAC de repli puis à celui de la recherche.
    env.sessions[0].echecs = 2
    p.demarrer()
    await p.attendre()
    expect(env.sessions[0].proxys).toEqual([])
    // Même PAC voulu, rien n'a changé : il est quand même réappliqué.
    p.surReglages()
    await p.attendre()
    expect(evaluer(env.sessions[0], 'https://a.fr/')).toContain('SOCKS5 1.1.1.1:1080')
  })

  it('retirer normalise « www. » comme ajouter', async () => {
    const { p, reseau } = monter()
    p.ajouter('www.exemple.fr')
    p.retirer('WWW.exemple.fr')
    expect(reseau().sites).toEqual([])
    await p.attendre()
  })
})

describe('Passerelles — relecture finale', () => {
  it('1. fenêtre privée : ni « Passer par une passerelle », ni bascule, ni ajout depuis la page d’erreur', async () => {
    const { p, reseau } = monter()
    p.demarrer()
    const d = await p.crochets({ privee: true }).surEchec(9, 'https://bloque.fr/', -105)
    expect(new URL((d as { url: string }).url).searchParams.get('passerelle')).toBeNull()
    expect(new URL(p.urlErreurPour(-105, 'https://bloque.fr/', { privee: true })).searchParams.get('passerelle')).toBeNull()
    expect(new URL(p.urlErreurPour(-105, 'https://bloque.fr/')).searchParams.get('passerelle')).toBe('1')
    expect(p.basculable('https://www.bloque.fr/x', true)).toBe(false)
    expect(p.basculable('https://www.bloque.fr/x', false)).toBe(true)
    expect(p.basculable('http://bloque.fr/', false)).toBe(false)
    expect(p.ajouterDepuisErreur('https://bloque.fr/', { privee: true })).toEqual({ ok: false })
    expect(reseau().sites).toEqual([])
    await p.attendre()
  })

  it('2. proxy système relu toutes les 60 s tant qu’un PAC est appliqué, et après un échec proxy hors contournement', async () => {
    const { p, env, modifier } = monter({ sites: [site('a.fr')] })
    p.demarrer()
    await p.rechercher()
    await p.attendre()
    const veilles = (): typeof env.minuteurs => env.minuteurs.filter((m) => m.ms === 60_000)
    expect(veilles().length).toBe(1)
    env.systeme = { https: 'PROXY corp:8080', http: 'DIRECT' }
    veilles()[0].fn()
    await p.attendre()
    expect(evaluer(env.sessions[0], 'https://b.fr/')).toBe('PROXY corp:8080')
    // Réarmée après la relecture.
    expect(veilles().length).toBe(2)
    expect(veilles()[1].annule).toBe(false)
    // -130 sur un site non contourné : relecture immédiate.
    env.systeme = { https: 'PROXY autre:3128', http: 'DIRECT' }
    expect(await p.surEchec(4, 'https://b.fr/', -130)).toMatchObject({ action: 'erreur' })
    await p.attendre()
    expect(evaluer(env.sessions[0], 'https://b.fr/')).toBe('PROXY autre:3128')
    // Plus de site : la veille s'arrête.
    modifier({ sites: [] })
    await p.attendre()
    expect(veilles().filter((m) => !m.annule && m !== veilles()[0])).toEqual([])
  })

  it('2. pas de veille du proxy système sans PAC appliqué', async () => {
    const { p, env } = monter()
    p.demarrer()
    await p.surEchec(4, 'https://b.fr/', -130)
    await p.attendre()
    expect(env.minuteurs).toEqual([])
    expect(env.resolutions).toBe(0)
  })

  it('3. délai de grâce de 10 min après une recherche infructueuse, sauf « Tester maintenant »', async () => {
    const { p, env } = monter({ sites: [site('a.fr')] })
    env.trouves = []
    p.demarrer()
    await p.rechercher()
    await p.attendre()
    expect(env.appels.trouver).toBe(1)
    env.trouves = [P2]
    expect(await p.surEchec(7, 'https://a.fr/', -130)).toMatchObject({ action: 'erreur', url: expect.stringContaining('type=passerelles') })
    await p.rechercher()
    expect(env.appels.trouver).toBe(1)
    await p.tester()
    expect(env.appels.trouver).toBe(2)
    expect(p.etat().pret).toBe(1)
  })

  it('3. un ajout explicite lève le délai de grâce', async () => {
    const { p, env } = monter({ sites: [site('a.fr')] })
    env.trouves = []
    p.demarrer()
    await p.rechercher()
    await p.attendre()
    expect(env.appels.trouver).toBe(1)
    env.trouves = [P2]
    p.ajouter('b.fr')
    await p.attendre()
    // Le prochain échec sur un site contourné cherche aussitôt une passerelle.
    expect(await p.surEchec(7, 'https://a.fr/', -130)).toEqual({ action: 'recharger' })
    expect(env.appels.trouver).toBe(2)
    await p.attendre()
  })

  it('2. pacApplique : après un ajout, résolue seulement quand le PAC est en place sur toutes les sessions', async () => {
    const { p, env } = monter()
    p.demarrer()
    p.ajouter('a.fr')
    await p.pacApplique()
    for (const s of env.sessions) expect(evaluer(s, 'https://a.fr/')).not.toBe('DIRECT')
    await p.attendre()
  })

  it('2. la veille du proxy système est réarmée après un échec de setProxy', async () => {
    const { p, env } = monter({ sites: [site('a.fr')] })
    // Deux applications au démarrage (PAC initial, puis fin de la recherche) : les deux échouent.
    env.sessions[0].echecs = 2
    await p.demarrer()
    await p.attendre()
    const veilles = (): typeof env.minuteurs => env.minuteurs.filter((m) => m.ms === 60_000 && !m.annule)
    expect(env.sessions[0].proxys).toEqual([])
    expect(veilles().length).toBe(1)
    veilles()[0].fn()
    await p.attendre()
    expect(evaluer(env.sessions[0], 'https://a.fr/')).toMatch(/PROXY|SOCKS/)
    // Appliquée : la veille de relecture continue (une nouvelle minuterie).
    expect(veilles().length).toBe(2)
  })

  it('3. « Réessayer » lève le délai de grâce', async () => {
    const { p, env } = monter({ sites: [site('a.fr')] })
    env.trouves = []
    p.demarrer()
    await p.rechercher()
    env.trouves = [P2]
    p.reessayer('https://a.fr/', true)
    await p.attendre()
    expect(env.appels.trouver).toBe(2)
    expect(p.etat().pret).toBe(1)
  })

  it('3. cache négatif par hôte : pas de nouvel essai de détection pendant 10 min', async () => {
    const { p, env } = monter()
    p.demarrer()
    expect(await p.surEchec(5, 'https://panne.fr/', -105)).toEqual({ action: 'recharger' })
    expect(await p.surEchec(5, 'https://panne.fr/', -105)).toMatchObject({ action: 'erreur' })
    expect(await p.surEchec(6, 'https://www.panne.fr/', -105)).toMatchObject({ action: 'erreur' })
    env.maintenant += RETEST
    expect(await p.surEchec(7, 'https://panne.fr/', -105)).toEqual({ action: 'recharger' })
    await p.attendre()
  })

  it('3/8. testerDirect mémorisé 1 min et mutualisé entre détections concurrentes', async () => {
    const { p, env } = monter()
    p.demarrer()
    await Promise.all([p.surEchec(1, 'https://a1.fr/', -105), p.surEchec(2, 'https://a2.fr/', -105)])
    expect(env.appels.direct).toBe(1)
    await p.surEchec(3, 'https://a3.fr/', -105)
    expect(env.appels.direct).toBe(1)
    env.maintenant += 60_001
    await p.surEchec(4, 'https://a4.fr/', -105)
    expect(env.appels.direct).toBe(2)
    await p.attendre()
  })

  it('4. essai de détection abandonné par un échec sur une autre adresse : l’hôte d’essai quitte le PAC', async () => {
    const { p, env } = monter()
    p.demarrer()
    expect(await p.surEchec(5, 'https://panne.fr/', -105)).toEqual({ action: 'recharger' })
    await p.attendre()
    expect(evaluer(env.sessions[0], 'https://panne.fr/')).toContain('SOCKS5')
    await p.surEchec(5, 'https://autre.fr/', -324)
    await p.attendre()
    expect(env.sessions[0].proxys.at(-1)).toEqual({ mode: 'system' })
  })

  it('6. closeAllConnections seulement quand un hôte passe en contournement', async () => {
    const { p, env } = monter({ sites: [site('a.fr'), site('b.fr')] })
    p.demarrer()
    await p.rechercher()
    await p.attendre()
    const f = (): number => env.sessions[0].fermetures
    const n0 = f()
    expect(n0).toBeGreaterThan(0)
    expect(await p.surEchec(3, 'https://a.fr/', -130)).toEqual({ action: 'recharger' })
    await p.attendre()
    expect(f()).toBe(n0)
    p.retirer('b.fr')
    await p.attendre()
    expect(f()).toBe(n0)
    p.ajouter('c.fr')
    await p.attendre()
    expect(f()).toBe(n0 + 1)
    expect(await p.surEchec(9, 'https://d.fr/', -105)).toEqual({ action: 'recharger' })
    await p.attendre()
    expect(f()).toBe(n0 + 2)
  })

  it('7. détection automatique jamais pour les domaines à usage spécial (ajout explicite possible)', async () => {
    const { p, env, reseau } = monter()
    p.demarrer()
    let cle = 1
    for (const h of ['nas.local', 'box.lan', 'svc.internal', 'intra.corp', 'r.home.arpa', 'app.localhost', 'x.test', 'y.invalid'])
      expect(await p.surEchec(cle++, `https://${h}/`, -105)).toMatchObject({ action: 'erreur' })
    expect(env.appels.direct).toBe(0)
    expect(new URL(p.urlErreurPour(-105, 'https://y.invalid/')).searchParams.get('passerelle')).toBe('1')
    expect(p.ajouterDepuisErreur('https://y.invalid/')).toEqual({ ok: true })
    expect(reseau().sites.map((s) => s.hote)).toEqual(['y.invalid'])
    await p.attendre()
  })

  it('11. échec signalé : re-test immédiat des retenues, une fois par minute au plus', async () => {
    const P4: Candidat = { type: 'socks5', hote: '4.4.4.4', port: 1080 }
    const { p, env } = monter({ sites: [site('a.fr')] })
    env.trouves = [P1, P2, P3, P4]
    p.demarrer()
    await p.rechercher()
    await p.attendre()
    env.appels.tester = []
    expect(await p.surEchec(3, 'https://a.fr/', -130)).toEqual({ action: 'recharger' })
    await p.attendre()
    expect(env.appels.tester).toEqual([P2, P3, P4])
    p.surSucces(3, 'https://a.fr/')
    expect(await p.surEchec(3, 'https://a.fr/', -130)).toEqual({ action: 'recharger' })
    await p.attendre()
    expect(env.appels.tester).toEqual([P2, P3, P4])
    env.maintenant += 60_001
    p.surSucces(3, 'https://a.fr/')
    expect(await p.surEchec(3, 'https://a.fr/', -130)).toEqual({ action: 'recharger' })
    await p.attendre()
    expect(env.appels.tester).toEqual([P2, P3, P4, P4])
  })
})
