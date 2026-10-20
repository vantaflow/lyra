import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DELAI_RAPPEL_MS, Dnd, PLAFOND_NOTIFICATIONS, PLAFOND_POPUPS, texteFenetres, texteNotifications, texteReste, type DureeDnd, type EtatDnd, type NotificationRetenue, type PopupRetenue } from './Dnd'

function creer(exceptions: string[] = [], horloge?: () => number, dureeParDefaut?: () => DureeDnd) {
  const livrees: Array<[number, NotificationRetenue[]]> = []
  const popups: Array<[number, PopupRetenue[]]> = []
  const etats: Array<[number, EtatDnd]> = []
  const dnd = new Dnd({
    exception: (o) => exceptions.includes(o),
    livrerNotifications: (f, n) => livrees.push([f, n]),
    ouvrirPopups: (f, p) => popups.push([f, p]),
    surChangement: (f, e) => etats.push([f, e]),
    maintenant: horloge,
    dureeParDefaut
  })
  return { dnd, livrees, popups, etats }
}

const notif = (titre: string, origine = 'https://a.fr', extra: object = {}) => ({ origine, titre, ...extra })

describe('Dnd : reprise après une mise en veille', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('fin échéante pendant la veille : le mode se termine à la reprise', () => {
    let t = 1_000_000
    const { dnd } = creer([], () => t)
    dnd.entrer(1, 30, t)
    // Veille de 2 h : la minuterie du processus n'a pas compté ce temps.
    t += 2 * 3_600_000
    expect(dnd.actif(1)).toBe(true)
    dnd.surReprise()
    expect(dnd.actif(1)).toBe(false)
  })

  it('fin non échue : la minuterie est réarmée sur le temps restant', () => {
    let t = 1_000_000
    const { dnd } = creer([], () => t)
    dnd.entrer(1, 30, t)
    t += 20 * 60_000
    dnd.surReprise()
    expect(dnd.actif(1)).toBe(true)
    vi.advanceTimersByTime(9 * 60_000)
    expect(dnd.actif(1)).toBe(true)
    vi.advanceTimersByTime(60_000)
    expect(dnd.actif(1)).toBe(false)
  })

  it('sans minuterie (« jusqu\'à l\'arrêt ») : rien ne change', () => {
    let t = 1_000_000
    const { dnd } = creer([], () => t)
    dnd.entrer(1, 'arret', t)
    t += 10 * 3_600_000
    dnd.surReprise()
    expect(dnd.actif(1)).toBe(true)
  })
})

describe('Dnd : entrée et sortie', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('entre et sort, état par fenêtre', () => {
    const { dnd, etats } = creer()
    expect(dnd.actif(1)).toBe(false)
    dnd.entrer(1)
    expect(dnd.actif(1)).toBe(true)
    expect(dnd.actif(2)).toBe(false)
    expect(dnd.etat(1)).toMatchObject({ actif: true, duree: 60, notifications: 0, popups: 0, rappel: true })
    dnd.sortir(1)
    expect(dnd.actif(1)).toBe(false)
    expect(etats.at(-1)).toEqual([1, { actif: false, duree: null, fin: null, notifications: 0, popups: 0, rappel: false }])
  })

  it('basculer : entre puis sort', () => {
    const { dnd } = creer()
    dnd.basculer(1)
    expect(dnd.actif(1)).toBe(true)
    dnd.basculer(1)
    expect(dnd.actif(1)).toBe(false)
  })

  it('la minuterie de 30 min termine le mode, 29 min non', () => {
    const { dnd } = creer()
    dnd.entrer(1, 30)
    vi.advanceTimersByTime(29 * 60_000)
    expect(dnd.actif(1)).toBe(true)
    vi.advanceTimersByTime(60_000)
    expect(dnd.actif(1)).toBe(false)
  })

  it('1 h : fin calculée sur l\'horloge', () => {
    const { dnd } = creer()
    vi.setSystemTime(1_000_000)
    dnd.entrer(1, 60)
    expect(dnd.etat(1).fin).toBe(1_000_000 + 3_600_000)
    vi.advanceTimersByTime(3_599_000)
    expect(dnd.actif(1)).toBe(true)
    vi.advanceTimersByTime(1_000)
    expect(dnd.actif(1)).toBe(false)
  })

  it('jusqu\'à l\'arrêt : pas de minuterie', () => {
    const { dnd } = creer()
    dnd.entrer(1, 'arret')
    expect(dnd.etat(1).fin).toBeNull()
    vi.advanceTimersByTime(48 * 3_600_000)
    expect(dnd.actif(1)).toBe(true)
  })

  it('relancer avec une autre durée remplace la minuterie et garde ce qui est retenu', () => {
    const { dnd } = creer()
    dnd.entrer(1, 30)
    dnd.retenirNotification(1, notif('a'))
    vi.advanceTimersByTime(20 * 60_000)
    dnd.entrer(1, 60)
    vi.advanceTimersByTime(40 * 60_000)
    expect(dnd.actif(1)).toBe(true)
    expect(dnd.etat(1).notifications).toBe(1)
    vi.advanceTimersByTime(20 * 60_000)
    expect(dnd.actif(1)).toBe(false)
  })

  it('le rappel complet s\'efface après le délai et revient au survol du croissant', () => {
    const { dnd } = creer()
    dnd.entrer(1, 'arret')
    expect(dnd.etat(1).rappel).toBe(true)
    vi.advanceTimersByTime(DELAI_RAPPEL_MS - 1)
    expect(dnd.etat(1).rappel).toBe(true)
    vi.advanceTimersByTime(1)
    expect(dnd.etat(1).rappel).toBe(false)
    dnd.montrerRappel(1)
    expect(dnd.etat(1).rappel).toBe(true)
    vi.advanceTimersByTime(DELAI_RAPPEL_MS)
    expect(dnd.etat(1).rappel).toBe(false)
  })

  it('la sortie arrête les minuteries (rien ne se déclenche ensuite)', () => {
    const { dnd, etats } = creer()
    dnd.entrer(1, 30)
    dnd.sortir(1)
    const n = etats.length
    vi.advanceTimersByTime(3_600_000)
    expect(etats.length).toBe(n)
  })

  it('attendreSortie résout à la sortie, tout de suite hors mode, et à la fermeture de la fenêtre', async () => {
    const { dnd } = creer()
    await dnd.attendreSortie(1)
    dnd.entrer(1, 'arret')
    dnd.entrer(2, 'arret')
    let fini = false
    void dnd.attendreSortie(1).then(() => (fini = true))
    await Promise.resolve()
    expect(fini).toBe(false)
    dnd.sortir(1)
    await Promise.resolve()
    expect(fini).toBe(true)
    let ferme = false
    void dnd.attendreSortie(2).then(() => (ferme = true))
    dnd.fermer(2)
    await Promise.resolve()
    expect(ferme).toBe(true)
    expect(dnd.actifQuelquePart()).toBe(false)
  })
})

describe('Dnd : file des notifications', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('hors mode, rien n\'est retenu', () => {
    const { dnd } = creer()
    expect(dnd.retenirNotification(1, notif('a'))).toBeNull()
  })

  it('retient, compte, et livre à la sortie dans l\'ordre d\'arrivée', () => {
    const { dnd, livrees } = creer()
    dnd.entrer(1, 'arret')
    for (const t of ['a', 'b', 'c']) expect(dnd.retenirNotification(1, notif(t))).not.toBeNull()
    expect(dnd.etat(1).notifications).toBe(3)
    expect(livrees).toEqual([])
    dnd.sortir(1)
    expect(livrees).toHaveLength(1)
    expect(livrees[0][0]).toBe(1)
    expect(livrees[0][1].map((n) => n.titre)).toEqual(['a', 'b', 'c'])
    expect(dnd.etat(1).notifications).toBe(0)
  })

  it('la fin de minuterie livre aussi', () => {
    const { dnd, livrees } = creer()
    dnd.entrer(1, 30)
    dnd.retenirNotification(1, notif('a'))
    vi.advanceTimersByTime(30 * 60_000)
    expect(livrees[0][1].map((n) => n.titre)).toEqual(['a'])
  })

  it('plafond : les plus anciennes sont jetées', () => {
    const { dnd, livrees } = creer()
    dnd.entrer(1, 'arret')
    for (let i = 0; i < PLAFOND_NOTIFICATIONS + 7; i++) dnd.retenirNotification(1, notif(`n${i}`))
    expect(dnd.etat(1).notifications).toBe(PLAFOND_NOTIFICATIONS)
    dnd.sortir(1)
    const titres = livrees[0][1].map((n) => n.titre)
    expect(titres).toHaveLength(PLAFOND_NOTIFICATIONS)
    expect(titres[0]).toBe('n7')
    expect(titres.at(-1)).toBe(`n${PLAFOND_NOTIFICATIONS + 6}`)
  })

  it('exception par site : la notification passe, rien n\'est retenu', () => {
    const { dnd } = creer(['https://ok.fr'])
    dnd.entrer(1, 'arret')
    expect(dnd.retenirNotification(1, notif('a', 'https://ok.fr'))).toBeNull()
    expect(dnd.retenirNotification(1, notif('b', 'https://autre.fr'))).not.toBeNull()
    expect(dnd.etat(1).notifications).toBe(1)
    expect(dnd.retient(1, 'https://ok.fr')).toBe(false)
    expect(dnd.retient(1, 'https://autre.fr')).toBe(true)
    expect(dnd.retient(2, 'https://autre.fr')).toBe(false)
  })

  it('même tag et même origine : la nouvelle remplace l\'ancienne', () => {
    const { dnd, livrees } = creer()
    dnd.entrer(1, 'arret')
    dnd.retenirNotification(1, notif('a', 'https://a.fr', { tag: 't' }))
    dnd.retenirNotification(1, notif('b', 'https://a.fr', { tag: 'u' }))
    dnd.retenirNotification(1, notif('c', 'https://a.fr', { tag: 't' }))
    dnd.retenirNotification(1, notif('d', 'https://b.fr', { tag: 't' }))
    dnd.sortir(1)
    expect(livrees[0][1].map((n) => n.titre)).toEqual(['b', 'c', 'd'])
  })

  it('close() de la page retire la notification', () => {
    const { dnd, livrees } = creer()
    dnd.entrer(1, 'arret')
    const a = dnd.retenirNotification(1, notif('a'))!
    dnd.retenirNotification(1, notif('b'))
    dnd.retirerNotification(1, a, 'https://a.fr')
    expect(dnd.etat(1).notifications).toBe(1)
    dnd.sortir(1)
    expect(livrees[0][1].map((n) => n.titre)).toEqual(['b'])
  })

  it("close() ne retire que les notifications de l'origine de la page", () => {
    const { dnd, livrees } = creer()
    dnd.entrer(1, 'arret')
    const a = dnd.retenirNotification(1, notif('a', 'https://a.fr'))!
    dnd.retenirNotification(1, notif('b', 'https://b.fr'))
    // Une page d'une autre origine vise l'identifiant de a : rien ne bouge.
    expect(dnd.retirerNotification(1, a, 'https://b.fr')).toBe(false)
    expect(dnd.etat(1).notifications).toBe(2)
    expect(dnd.retirerNotification(1, a, 'https://a.fr')).toBe(true)
    dnd.sortir(1)
    expect(livrees[0][1].map((n) => n.titre)).toEqual(['b'])
  })

  it('files séparées par fenêtre', () => {
    const { dnd, livrees } = creer()
    dnd.entrer(1, 'arret')
    dnd.entrer(2, 'arret')
    dnd.retenirNotification(1, notif('a'))
    dnd.retenirNotification(2, notif('b'))
    dnd.sortir(2)
    expect(livrees).toHaveLength(1)
    expect(livrees[0]).toEqual([2, [expect.objectContaining({ titre: 'b' })]])
    expect(dnd.etat(1).notifications).toBe(1)
  })

  it('fenêtre fermée : rien n\'est livré', () => {
    const { dnd, livrees } = creer()
    dnd.entrer(1, 'arret')
    dnd.retenirNotification(1, notif('a'))
    dnd.fermer(1)
    expect(livrees).toEqual([])
    expect(dnd.actif(1)).toBe(false)
  })

  it('l\'état est diffusé à chaque retenue', () => {
    const { dnd, etats } = creer()
    dnd.entrer(1, 'arret')
    dnd.retenirNotification(1, notif('a'))
    expect(etats.at(-1)![1].notifications).toBe(1)
  })
})

describe('Dnd : popups', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('retenues, comptées, ouvertes à la sortie', () => {
    const { dnd, popups } = creer()
    expect(dnd.retenirPopup(1, { url: 'https://p.fr/', origine: 'https://a.fr' })).toBe(false)
    dnd.entrer(1, 'arret')
    expect(dnd.retenirPopup(1, { url: 'https://p.fr/1', origine: 'https://a.fr', etoileId: 'e1' })).toBe(true)
    expect(dnd.retenirPopup(1, { url: 'https://p.fr/2', origine: 'https://a.fr' })).toBe(true)
    expect(dnd.etat(1).popups).toBe(2)
    dnd.sortir(1)
    expect(popups).toEqual([[1, [{ url: 'https://p.fr/1', origine: 'https://a.fr', etoileId: 'e1' }, { url: 'https://p.fr/2', origine: 'https://a.fr' }]]])
  })

  it('même adresse du même site : une seule fois, mais toujours retenue', () => {
    const { dnd } = creer()
    dnd.entrer(1, 'arret')
    expect(dnd.retenirPopup(1, { url: 'https://p.fr/', origine: 'https://a.fr' })).toBe(true)
    expect(dnd.retenirPopup(1, { url: 'https://p.fr/', origine: 'https://a.fr' })).toBe(true)
    expect(dnd.etat(1).popups).toBe(1)
  })

  it('plafond', () => {
    const { dnd, popups } = creer()
    dnd.entrer(1, 'arret')
    for (let i = 0; i < PLAFOND_POPUPS + 3; i++) dnd.retenirPopup(1, { url: `https://p.fr/${i}`, origine: 'https://a.fr' })
    dnd.sortir(1)
    expect(popups[0][1]).toHaveLength(PLAFOND_POPUPS)
    expect(popups[0][1][0].url).toBe('https://p.fr/3')
  })

  it('exception par site : la popup s\'ouvre normalement', () => {
    const { dnd } = creer(['https://ok.fr'])
    dnd.entrer(1, 'arret')
    expect(dnd.retenirPopup(1, { url: 'https://p.fr/', origine: 'https://ok.fr' })).toBe(false)
    expect(dnd.etat(1).popups).toBe(0)
  })
})

describe('textes du rappel', () => {
  it('notifications (design : « 3 notifications retenues »)', () => {
    expect(texteNotifications(0)).toBe('aucune notification retenue')
    expect(texteNotifications(1)).toBe('1 notification retenue')
    expect(texteNotifications(3)).toBe('3 notifications retenues')
  })
  it('fenêtres', () => {
    expect(texteFenetres(0)).toBe('')
    expect(texteFenetres(1)).toBe('1 fenêtre retenue')
    expect(texteFenetres(2)).toBe('2 fenêtres retenues')
  })
  it('temps restant (design : « encore 42 min »)', () => {
    const t = 1_000_000
    expect(texteReste(t + 42 * 60_000, t)).toBe('encore 42 min')
    expect(texteReste(t + 41 * 60_000 + 1, t)).toBe('encore 42 min')
    expect(texteReste(t + 5_000, t)).toBe('encore 1 min')
    expect(texteReste(t + 60 * 60_000, t)).toBe('encore 1 h')
    expect(texteReste(t + 65 * 60_000, t)).toBe('encore 1 h 05')
    expect(texteReste(null, t)).toBe("jusqu'à l'arrêt")
  })
})

describe('Dnd : durée par défaut lue des réglages', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('sans durée explicite, entrer() prend la durée des réglages (30 min)', () => {
    const { dnd } = creer([], undefined, () => 30)
    dnd.entrer(1)
    expect(dnd.etat(1).duree).toBe(30)
    vi.advanceTimersByTime(30 * 60_000)
    expect(dnd.actif(1)).toBe(false)
  })

  it('« jusqu\'à l\'arrêt » : aucune minuterie', () => {
    const { dnd } = creer([], undefined, () => 'arret')
    dnd.entrer(1)
    expect(dnd.etat(1)).toMatchObject({ duree: 'arret', fin: null })
    vi.advanceTimersByTime(24 * 3_600_000)
    expect(dnd.actif(1)).toBe(true)
  })

  it('basculer() entre avec la durée des réglages, lue à chaque appel', () => {
    let d: DureeDnd = 30
    const { dnd } = creer([], undefined, () => d)
    dnd.basculer(1)
    expect(dnd.etat(1).duree).toBe(30)
    dnd.basculer(1)
    d = 60
    dnd.basculer(1)
    expect(dnd.etat(1).duree).toBe(60)
  })

  it('une durée explicite prime sur les réglages', () => {
    const { dnd } = creer([], undefined, () => 30)
    dnd.entrer(1, 'arret')
    expect(dnd.etat(1).duree).toBe('arret')
  })

  it('sans lecteur de réglages : 1 h', () => {
    const { dnd } = creer()
    dnd.entrer(1)
    expect(dnd.etat(1).duree).toBe(60)
  })
})
