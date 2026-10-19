import { describe, expect, it } from 'vitest'
import { estIndisponible } from './types'
import type { OngletsImportes } from './types'
import { GROUPE_A, GROUPE_B, commande, fichierSnss, sessionDeReference, snss } from './fixtures/generer'
import { lireSessionSnss } from './snss'

const lire = (octets: Uint8Array): OngletsImportes => {
  const r = lireSessionSnss(octets)
  if (estIndisponible(r)) throw new Error(`Indisponible : ${r.raison}`)
  return r
}

describe('SNSS : session de référence', () => {
  it('rend les onglets dans l’ordre des positions, avec groupes nommés et colorés', () => {
    expect(lire(sessionDeReference())).toEqual({
      fenetres: [
        {
          onglets: [
            { url: 'https://example.com/', titre: 'Exemple', groupe: GROUPE_A.id },
            { url: 'https://example.com/b', titre: 'Page B', groupe: GROUPE_A.id }, // 2e page de l'historique de l'onglet
            { url: 'https://fr.wikipedia.org/', titre: 'Wikipédia', epingle: true },
            { url: 'https://travail.example.net/', titre: 'Tableau de bord', groupe: GROUPE_B.id }
          ],
          groupes: [
            { id: GROUPE_A.id, nom: 'Lecture', couleur: 'bleu' },
            { id: GROUPE_B.id, nom: 'Travail', couleur: 'rouge' }
          ]
        },
        { onglets: [{ url: 'https://deuxieme.example.com/', titre: 'Deuxième fenêtre' }], groupes: [] }
      ]
    })
  })

  it('ignore les pages internes, l’onglet fermé, la fenêtre surgissante et la fenêtre fermée', () => {
    const urls = lire(sessionDeReference()).fenetres.flatMap((f) => f.onglets.map((o) => o.url))
    expect(urls.some((u) => /newtab|ferme|popup|fermee/.test(u))).toBe(false)
  })
})

describe('SNSS : en-tête', () => {
  it('fichier vide, trop court, sans signature : Indisponible, sans exception', () => {
    for (const octets of [new Uint8Array(), new Uint8Array([0x53, 0x4e, 0x53]), new Uint8Array(64), new TextEncoder().encode('ceci n’est pas une session')]) {
      const r = lireSessionSnss(octets)
      expect(estIndisponible(r)).toBe(true)
    }
  })

  it('session chiffrée (version 5) : raison explicite', () => {
    const r = lireSessionSnss(fichierSnss([commande(0)], 5))
    expect(estIndisponible(r) && r.raison).toMatch(/chiffrée/)
  })

  it('version inconnue : Indisponible avec la version', () => {
    const r = lireSessionSnss(fichierSnss([commande(0)], 42))
    expect(estIndisponible(r) && r.raison).toMatch(/42/)
  })

  it('l’ancienne version 1 (même découpage en commandes) est lue', () => {
    const f = fichierSnss([snss.typeFenetre(1, 0), snss.fenetreOnglet(1, 1), snss.navigation(1, 0, 'https://a.example/', 'A')], 1)
    expect(lire(f).fenetres[0].onglets).toEqual([{ url: 'https://a.example/', titre: 'A' }])
  })

  it('aucun onglet exploitable : Indisponible', () => {
    const r = lireSessionSnss(fichierSnss([snss.typeFenetre(1, 0), snss.marqueur()]))
    expect(estIndisponible(r) && r.raison).toMatch(/Aucun onglet/)
  })
})

describe('SNSS : fichiers tronqués ou corrompus', () => {
  const ref = sessionDeReference()

  it('coupé dans la première commande : Indisponible', () => {
    expect(estIndisponible(lireSessionSnss(ref.slice(0, 8 + 2)))).toBe(true)
    expect(estIndisponible(lireSessionSnss(ref.slice(0, 8 + 3 + 2)))).toBe(true)
  })

  it('coupé net en fin de fichier (copie pendant l’écriture) : lu jusqu’à la dernière commande complète', () => {
    const r = lire(ref.slice(0, ref.length - 5))
    expect(r.fenetres[0].onglets.map((o) => o.titre)).toContain('Exemple')
  })

  it('aucune coupure ni octet altéré ne fait lever d’exception', () => {
    for (let n = 0; n <= ref.length; n++) {
      const r = lireSessionSnss(ref.slice(0, n))
      expect(estIndisponible(r) || Array.isArray(r.fenetres)).toBe(true)
    }
    let graine = 12345
    const hasard = (): number => (graine = (graine * 1103515245 + 12345) & 0x7fffffff)
    for (let i = 0; i < 400; i++) {
      const copie = ref.slice()
      for (let k = 0; k < 1 + (hasard() % 8); k++) copie[hasard() % copie.length] = hasard() & 0xff
      const r = lireSessionSnss(copie)
      expect(estIndisponible(r) || Array.isArray(r.fenetres)).toBe(true)
    }
  })

  it('une commande de taille nulle arrête la lecture sans perdre ce qui précède', () => {
    const f = fichierSnss([snss.typeFenetre(1, 0), snss.fenetreOnglet(1, 1), snss.navigation(1, 0, 'https://a.example/', 'A')])
    const avecTrou = new Uint8Array([...f, 0, 0, 7, 7, 7, 7])
    expect(lire(avecTrou).fenetres[0].onglets).toHaveLength(1)
  })

  it('une charge illisible saute la commande, pas toute la session', () => {
    const f = fichierSnss([
      snss.typeFenetre(1, 0),
      snss.fenetreOnglet(1, 1),
      commande(6, new Uint8Array([1, 2, 3])), // UpdateTabNavigation tronquée
      snss.navigation(1, 0, 'https://a.example/', 'A')
    ])
    expect(lire(f).fenetres[0].onglets).toHaveLength(1)
  })
})

describe('SNSS : navigations et groupes', () => {
  const base = [snss.typeFenetre(1, 0), snss.fenetreOnglet(1, 1), snss.position(1, 0)]
  const nav = (i: number, nom: string): Uint8Array => snss.navigation(1, i, `https://${nom}.example/`, nom)

  it('retire les entrées élaguées devant : la sélection suit', () => {
    const f = fichierSnss([...base, nav(0, 'a'), nav(1, 'b'), nav(2, 'c'), snss.selectionnee(1, 2), snss.elagueDevant(1, 1)])
    expect(lire(f).fenetres[0].onglets[0].url).toBe('https://c.example/')
  })

  it('retire les entrées élaguées derrière : l’entrée affichée reste la plus proche', () => {
    const f = fichierSnss([...base, nav(0, 'a'), nav(1, 'b'), nav(2, 'c'), snss.selectionnee(1, 1), snss.elagueDerriere(1, 2)])
    expect(lire(f).fenetres[0].onglets[0].url).toBe('https://b.example/')
  })

  it('une navigation rejouée sur le même index remplace la précédente (titre arrivé après coup)', () => {
    const f = fichierSnss([...base, snss.navigation(1, 0, 'https://a.example/', ''), snss.navigation(1, 0, 'https://a.example/', 'Titre final'), snss.selectionnee(1, 0)])
    expect(lire(f).fenetres[0].onglets[0].titre).toBe('Titre final')
  })

  it('un titre vide devient l’adresse', () => {
    const f = fichierSnss([...base, snss.navigation(1, 0, 'https://a.example/', '')])
    expect(lire(f).fenetres[0].onglets[0].titre).toBe('https://a.example/')
  })

  it('groupe sans métadonnées : nom vide, gris ; couleur inconnue : gris', () => {
    const f = fichierSnss([...base, nav(0, 'a'), snss.groupe(1, 1n, 2n), snss.metadonneesGroupe(3n, 4n, 'Autre', 99), snss.fenetreOnglet(1, 2), snss.groupe(2, 3n, 4n), snss.navigation(2, 0, 'https://b.example/', 'b'), snss.position(2, 1)])
    const fenetre = lire(f).fenetres[0]
    expect(fenetre.groupes).toEqual([
      { id: '00000000000000010000000000000002', nom: '', couleur: 'gris' },
      { id: '00000000000000030000000000000004', nom: 'Autre', couleur: 'gris' }
    ])
  })

  it('un onglet sorti de son groupe (a_un_groupe = faux) n’y figure plus', () => {
    const f = fichierSnss([...base, nav(0, 'a'), snss.groupe(1, 1n, 2n), snss.groupe(1, 1n, 2n, false)])
    const fenetre = lire(f).fenetres[0]
    expect(fenetre.onglets[0].groupe).toBeUndefined()
    expect(fenetre.groupes).toEqual([])
  })

  it('toutes les couleurs de groupe de Chromium', () => {
    const noms = ['gris', 'bleu', 'rouge', 'jaune', 'vert', 'rose', 'violet', 'cyan', 'orange']
    const cmds = [...base, nav(0, 'a'), snss.groupe(1, 9n, 9n), ...noms.map((_, i) => snss.metadonneesGroupe(BigInt(i), 0n, `c${i}`, i))]
    // un groupe par couleur, chacun référencé par un onglet
    noms.forEach((_, i) => cmds.push(snss.fenetreOnglet(1, 10 + i), snss.position(10 + i, 1 + i), snss.navigation(10 + i, 0, `https://g${i}.example/`, `g${i}`), snss.groupe(10 + i, BigInt(i), 0n)))
    const groupes = lire(fichierSnss(cmds)).fenetres[0].groupes.filter((g) => g.nom.startsWith('c'))
    expect(groupes.map((g) => g.couleur)).toEqual(noms)
  })
})
