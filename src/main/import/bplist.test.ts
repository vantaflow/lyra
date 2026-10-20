import { describe, expect, it } from 'vitest'
import { PROFONDEUR_MAX_PLIST, UidPlist, lireBplist, lirePlist, lirePlistXml } from './bplist'
import type { ValeurPlist } from './bplist'
import { FAVORIS_ORION_XML, Reel, ecrireBplist } from './fixtures/generer-apple'
import type { ValeurEcrite } from './fixtures/generer-apple'
import { ErreurImport } from './types'

const lire = (v: ValeurEcrite): ValeurPlist => lireBplist(ecrireBplist(v))
const xml = (s: string): ValeurPlist => lirePlist(new TextEncoder().encode(s))

/** Queue de 32 octets d'un plist binaire. */
function queue(nb: number, racine: number, debutTable: number, tailleOffset = 1, tailleRef = 1): number[] {
  const q = new DataView(new ArrayBuffer(32))
  q.setUint8(6, tailleOffset)
  q.setUint8(7, tailleRef)
  q.setBigUint64(8, BigInt(nb))
  q.setBigUint64(16, BigInt(racine))
  q.setBigUint64(24, BigInt(debutTable))
  return [...new Uint8Array(q.buffer)]
}
const ENTETE = [0x62, 0x70, 0x6c, 0x69, 0x73, 0x74, 0x30, 0x30]

describe('bplist binaire', () => {
  it('dict, array, string, bool, réels', () => {
    const v = lire({ a: 'bonjour', b: [1, 2, [true, false]], c: { d: 1.5, e: new Reel(2) }, vide: [], videDict: {} })
    expect(v).toEqual({ a: 'bonjour', b: [1, 2, [true, false]], c: { d: 1.5, e: 2 }, vide: [], videDict: {} })
  })

  it('entiers de toutes tailles, négatifs compris', () => {
    const nombres = [0, 1, 255, 256, 65535, 65536, 2 ** 32 - 1, 2 ** 32, 2 ** 40 + 7, -1, -123456789]
    expect(lire(nombres)).toEqual(nombres)
  })

  it("chaînes ASCII longues (taille hors de l'octet de marqueur)", () => {
    const long = 'x'.repeat(5000)
    expect(lire([long, 'quatorze-car-14', 'quinze-caract-15'])).toEqual([long, 'quatorze-car-14', 'quinze-caract-15'])
  })

  it('chaînes UTF-16 : accents, tiret cadratin, caractères hors plan de base', () => {
    const textes = ['Éléphant — café', 'Wikipédia', '日本語のタイトル', 'Emoji 😀 et 𝄞', 'é'.repeat(3000)]
    expect(lire(textes)).toEqual(textes)
    expect(lire({ 'clé-é': 'valeur-é' })).toEqual({ 'clé-é': 'valeur-é' })
  })

  it('dates : secondes depuis 2001, à la milliseconde', () => {
    const dates = [new Date('2026-10-19T12:00:00Z'), new Date('2001-01-01T00:00:00Z'), new Date('1999-12-31T23:59:59.500Z')]
    const lues = lire(dates) as Date[]
    expect(lues.every((d) => d instanceof Date)).toBe(true)
    expect(lues.map((d) => d.toISOString())).toEqual(dates.map((d) => d.toISOString()))
  })

  it('data et uid (plist fabriqué à la main)', () => {
    // objet 0 : tableau [1, 2] ; objet 1 : data DE AD ; objet 2 : uid 5
    const octets = Uint8Array.from([...ENTETE, 0xa2, 1, 2, 0x42, 0xde, 0xad, 0x80, 5, 8, 11, 14, ...queue(3, 0, 16)])
    const v = lireBplist(octets) as ValeurPlist[]
    expect(v[0]).toEqual(new Uint8Array([0xde, 0xad]))
    expect(v[0]).toBeInstanceOf(Uint8Array)
    expect(v[1]).toBeInstanceOf(UidPlist)
    expect((v[1] as UidPlist).valeur).toBe(5)
  })

  it('plus de 255 objets : références sur 2 octets', () => {
    const liste = Array.from({ length: 400 }, (_, i) => `élément ${i}`)
    expect(lire(liste)).toEqual(liste)
  })

  it("le dict est sans prototype : « __proto__ » n'est qu'une clé", () => {
    const v = lire({ ['__proto__']: 'x' }) as Record<string, string>
    expect(Object.keys(v)).toEqual(['__proto__'])
    expect(({} as { x?: string }).x).toBeUndefined()
  })

  it('imbrication : 150 niveaux passent, 300 sont refusés proprement', () => {
    const imbriquer = (n: number): ValeurEcrite => (n === 0 ? 'fond' : [imbriquer(n - 1)])
    let v: ValeurPlist = lire(imbriquer(150))
    for (let i = 0; i < 150; i++) v = (v as ValeurPlist[])[0]
    expect(v).toBe('fond')
    expect(PROFONDEUR_MAX_PLIST).toBe(200)
    expect(() => lire(imbriquer(300))).toThrow(ErreurImport)
  })
})

describe('bplist corrompu : ErreurImport, jamais de RangeError', () => {
  const valide = ecrireBplist({ Children: [{ Title: 'Éléphant', URL: 'https://example.com/' }, 3, new Date(0)], n: 1.5 })

  it('contenus qui ne sont pas des plist', () => {
    for (const octets of [new Uint8Array(), new TextEncoder().encode('bplist00'), new TextEncoder().encode('bonjour'), new Uint8Array(100)]) {
      expect(() => lirePlist(octets)).toThrow(ErreurImport)
    }
    expect(() => lireBplist(new Uint8Array([...ENTETE, ...new Array<number>(50).fill(0)]))).toThrow(ErreurImport)
  })

  it('le message est en français', () => {
    try {
      lirePlist(new TextEncoder().encode('bonjour'))
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(ErreurImport)
      expect((e as ErreurImport).raison).toMatch(/plist/)
    }
  })

  it('tronqué à toutes les longueurs', () => {
    for (let n = 0; n < valide.length; n++) expect(() => lireBplist(valide.subarray(0, n))).toThrow(ErreurImport)
  })

  it('table des offsets ou racine hors du fichier', () => {
    const copie = (modif: (v: DataView) => void): Uint8Array => {
      const c = valide.slice()
      modif(new DataView(c.buffer))
      return c
    }
    const fin = valide.length - 32
    expect(() => lireBplist(copie((v) => v.setBigUint64(fin + 24, 99999n)))).toThrow(ErreurImport) // table hors fichier
    expect(() => lireBplist(copie((v) => v.setBigUint64(fin + 16, 1000n)))).toThrow(ErreurImport) // racine inexistante
    expect(() => lireBplist(copie((v) => v.setBigUint64(fin + 8, 2n ** 60n)))).toThrow(ErreurImport) // nombre d'objets absurde
    expect(() => lireBplist(copie((v) => v.setUint8(fin + 6, 0)))).toThrow(ErreurImport) // taille d'offset nulle
    expect(() => lireBplist(copie((v) => v.setUint8(fin + 7, 9)))).toThrow(ErreurImport) // taille de référence trop grande
  })

  it('objet dont la taille déborde du fichier', () => {
    // tableau déclarant 0xFFFFFFFF éléments
    const octets = Uint8Array.from([...ENTETE, 0xaf, 0x12, 0xff, 0xff, 0xff, 0xff, 8, ...queue(1, 0, 14)])
    expect(() => lireBplist(octets)).toThrow(ErreurImport)
    // chaîne UTF-16 de 2^63 caractères
    const enorme = Uint8Array.from([...ENTETE, 0x6f, 0x13, 0x7f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 8, ...queue(1, 0, 18)])
    expect(() => lireBplist(enorme)).toThrow(ErreurImport)
  })

  it('référence cyclique : un tableau qui se contient', () => {
    const octets = Uint8Array.from([...ENTETE, 0xa1, 0, 8, ...queue(1, 0, 10)])
    expect(() => lireBplist(octets)).toThrow(ErreurImport)
    expect(() => lireBplist(octets)).toThrow(/cyclique/) // refusé tout de suite, sans descendre 200 niveaux
  })

  it('cycle entre deux conteneurs : A contient B qui contient A', () => {
    // objet 0 : tableau [1] ; objet 1 : tableau [0]
    const octets = Uint8Array.from([...ENTETE, 0xa1, 1, 0xa1, 0, 8, 10, ...queue(2, 0, 12)])
    expect(() => lireBplist(octets)).toThrow(/cyclique/)
  })

  it('références partagées : 32 000 références vers une chaîne de 32 Ko, décodée une seule fois', () => {
    const N = 32_000
    const S = 32 * 1024
    const be2 = (n: number): number[] => [n >> 8, n & 255]
    const be4 = (n: number): number[] => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
    const refs = new Uint8Array(N * 2)
    for (let i = 0; i < N; i++) refs[2 * i + 1] = 1 // chaque élément référence l'objet 1
    const tete0 = [0xaf, 0x11, ...be2(N)] // tableau de N éléments
    const tete1 = [0x5f, 0x11, ...be2(S)] // chaîne ASCII de S octets
    const off0 = 8
    const off1 = off0 + tete0.length + refs.length
    const debutTable = off1 + tete1.length + S
    const octets = Uint8Array.from([
      ...ENTETE, ...tete0, ...refs, ...tete1, ...new Uint8Array(S).fill(0x61), ...be4(off0), ...be4(off1), ...queue(2, 0, debutTable, 4, 2)
    ])
    const debut = performance.now()
    // budget de 300 000 octets : la chaîne n'y compte qu'une fois (32 768 + 256 000) ; décodée 32 000 fois, elle pèserait 1 Go
    const v = lireBplist(octets, 300_000) as string[]
    expect(performance.now() - debut).toBeLessThan(2000)
    expect(v).toHaveLength(N)
    expect(v[0]).toHaveLength(S)
    expect(v[N - 1]).toBe(v[0])
    expect(lireBplist(octets)).toHaveLength(N) // budget par défaut
  })

  /** Plist binaire à références sur 2 octets et offsets sur 4 : `objets` = octets de chaque objet (références déjà encodées). */
  const assembler = (objets: number[][]): Uint8Array => {
    const be4 = (n: number): number[] => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
    const offsets: number[] = []
    let pos = ENTETE.length
    for (const o of objets) {
      offsets.push(pos)
      pos += o.length
    }
    return Uint8Array.from([...ENTETE, ...objets.flat(), ...offsets.flatMap(be4), ...queue(objets.length, 0, pos, 4, 2)])
  }

  it('références partagées imbriquées : tableau → dictionnaire → tableau de chaînes, chaque objet décodé une seule fois', () => {
    const K = 1000
    const M = 500
    const r = (n: number): number[] => [n >> 8, n & 255]
    const octets = assembler([
      [0xaf, 0x11, ...r(K), ...Array.from({ length: K }, () => r(1)).flat()], // 0 : K fois le dictionnaire 1
      [0xd3, ...r(2), ...r(3), ...r(4), ...r(5), ...r(5), ...r(5)], //          1 : trois clés → le même tableau 5
      [0x51, 0x61], [0x51, 0x62], [0x51, 0x63], //                              2-4 : « a », « b », « c »
      [0xaf, 0x11, ...r(M), ...Array.from({ length: M }, () => r(6)).flat()], // 5 : M fois la chaîne 6
      [0x51, 0x73] //                                                           6 : « s »
    ])
    const v = lireBplist(octets) as Array<Record<string, string[]>>
    expect(v).toHaveLength(K)
    const d = v[0]
    expect(Object.keys(d)).toEqual(['a', 'b', 'c'])
    expect(d.a).toHaveLength(M)
    expect(d.a.every((x) => x === 's')).toBe(true)
    expect(v.every((x) => x === d)).toBe(true) // même dictionnaire, décodé une fois
    expect(d.a).toBe(d.b)
    expect(d.b).toBe(d.c) // même tableau, décodé une fois
  })

  it("trop d'objets (au-delà de NOEUDS_MAX) : ErreurImport", () => {
    const N = 5_000_000 // + la racine : un objet de plus que le plafond
    const octets = new Uint8Array(ENTETE.length + 6 + 4 * N + N + 4 * (N + 1) + 32)
    const dv = new DataView(octets.buffer)
    octets.set(ENTETE, 0)
    octets.set([0xaf, 0x12], ENTETE.length)
    dv.setUint32(ENTETE.length + 2, N) // tableau de N éléments (taille sur 4 octets)
    const debutRefs = ENTETE.length + 6
    for (let i = 0; i < N; i++) dv.setUint32(debutRefs + 4 * i, i + 1)
    const debutBools = debutRefs + 4 * N
    octets.fill(0x08, debutBools, debutBools + N) // N booléens distincts
    const debutTable = debutBools + N
    dv.setUint32(debutTable, ENTETE.length)
    for (let i = 0; i < N; i++) dv.setUint32(debutTable + 4 * (i + 1), debutBools + i)
    octets.set(queue(N + 1, 0, debutTable, 4, 4), debutTable + 4 * (N + 1))
    expect(() => lireBplist(octets)).toThrow(ErreurImport)
    expect(() => lireBplist(octets)).toThrow(/trop d'objets/)
  })

  it("budget d'octets : message lisible quand le contenu décodé dépasse la limite", () => {
    const octets = ecrireBplist(['a'.repeat(800), 'b'.repeat(800)])
    expect(() => lireBplist(octets, 1000)).toThrow(ErreurImport)
    expect(() => lireBplist(octets, 1000)).toThrow(/trop volumineux/)
    expect(lireBplist(octets)).toEqual(['a'.repeat(800), 'b'.repeat(800)])
  })

  it('octets altérés au hasard : toujours une valeur ou une ErreurImport', () => {
    let graine = 12345
    const alea = (): number => (graine = (graine * 1103515245 + 12345) & 0x7fffffff)
    for (let essai = 0; essai < 600; essai++) {
      const c = valide.slice()
      for (let k = 0; k < 1 + (essai % 4); k++) c[alea() % c.length] = alea() % 256
      try {
        lireBplist(c)
      } catch (e) {
        expect(e).toBeInstanceOf(ErreurImport)
      }
    }
  })
})

describe('plist XML', () => {
  it('types simples, entités et commentaires', () => {
    const v = xml(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- commentaire -->
<plist version="1.0"><dict>
  <key>texte</key><string>a &amp; b &lt;c&gt; &#233; &#x1F600;</string>
  <key>vide</key><string/>
  <key>n</key><integer>-42</integer>
  <key>r</key><real>1.25</real>
  <key>oui</key><true/>
  <key>non</key><false/>
  <key>date</key><date>2026-10-19T12:00:00Z</date>
  <key>data</key><data>3q0=</data>
  <key>liste</key><array><string>x</string><integer>1</integer><array/><dict/></array>
</dict></plist>`) as Record<string, ValeurPlist>
    expect(v.texte).toBe('a & b <c> é 😀')
    expect(v.vide).toBe('')
    expect(v.n).toBe(-42)
    expect(v.r).toBe(1.25)
    expect(v.oui).toBe(true)
    expect(v.non).toBe(false)
    expect((v.date as Date).toISOString()).toBe('2026-10-19T12:00:00.000Z')
    expect(v.data).toEqual(new Uint8Array([0xde, 0xad]))
    expect(v.liste).toEqual(['x', 1, [], {}])
  })

  it("la fixture XML d'Orion", () => {
    const v = lirePlistXml(FAVORIS_ORION_XML) as { Children: Array<{ Children: Array<{ URLString: string; URIDictionary: { title: string } }> }> }
    expect(v.Children[0].Children[0].URLString).toBe('https://work.example.com/?a=1&b=2')
    expect(v.Children[0].Children[0].URIDictionary.title).toBe('Intranet & co')
  })

  it('XML invalide ou trop imbriqué : ErreurImport', () => {
    for (const mauvais of ['<plist><dict><key>a</key></dict></plist>', '<plist><dict>', '<plist><truc/></plist>', '<?xml version="1.0"?><plist><integer>abc</integer></plist>', '<plist></plist>', '<plist><string>x</plist>']) {
      expect(() => xml(mauvais)).toThrow(ErreurImport)
    }
    expect(() => xml(`<plist>${'<array>'.repeat(300)}${'</array>'.repeat(300)}</plist>`)).toThrow(ErreurImport)
  })
})
