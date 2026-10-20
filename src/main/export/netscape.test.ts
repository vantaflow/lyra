import { describe, expect, it } from 'vitest'
import type { Favori } from '../bookmarks/Bookmarks'
import { exporterFavorisHtml, favorisDepuisArbre, lireFavorisHtml } from './netscape'

const f = (url: string, title: string, dossier?: string, date = 1_700_000_000_000): Favori => ({ url, title, ...(dossier ? { dossier } : {}), date })

/** Aplatit l'arbre lu comme Lyra le range : « A / B » par dossier. */
const aplatir = (html: string): Favori[] => favorisDepuisArbre(lireFavorisHtml(html))

describe('favoris HTML Netscape', () => {
  it('produit l’en-tête Netscape et un lien par favori', () => {
    const html = exporterFavorisHtml([f('https://a.fr/', 'A')])
    expect(html.startsWith('<!DOCTYPE NETSCAPE-Bookmark-file-1>')).toBe(true)
    expect(html).toContain('<A HREF="https://a.fr/" ADD_DATE="1700000000">A</A>')
  })

  it('aller-retour avec dossiers imbriqués', () => {
    const src = [f('https://a.fr/', 'A'), f('https://b.fr/', 'B', 'Travail'), f('https://c.fr/', 'C', 'Travail / Projets'), f('https://d.fr/', 'D', 'Travail / Projets / 2026'), f('https://e.fr/', 'E', 'Loisirs')]
    const lu = aplatir(exporterFavorisHtml(src))
    expect(lu.map((x) => [x.url, x.title, x.dossier])).toEqual([
      ['https://a.fr/', 'A', undefined],
      ['https://b.fr/', 'B', 'Travail'],
      ['https://c.fr/', 'C', 'Travail / Projets'],
      ['https://d.fr/', 'D', 'Travail / Projets / 2026'],
      ['https://e.fr/', 'E', 'Loisirs']
    ])
    expect(lu[0].date).toBe(1_700_000_000_000)
  })

  it('échappe titres, dossiers et adresses (balises, guillemets, esperluettes) et les restitue', () => {
    const src = [f('https://a.fr/?x=1&y="2"&z=<b>', 'Tom & Jerry <script>alert(1)</script> "q" \'s\'', 'R&D <1> "x"')]
    const html = exporterFavorisHtml(src)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&amp;')
    expect(html).toContain('&quot;')
    const [lu] = aplatir(html)
    expect(lu).toMatchObject({ url: src[0].url, title: src[0].title, dossier: src[0].dossier })
  })

  it('lit un fichier de navigateur : majuscules ou minuscules, dossier barre, entités numériques, retours à la ligne dans la balise', () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE><H1>Bookmarks</H1>
<DL><p>
  <DT><H3 ADD_DATE="1" PERSONAL_TOOLBAR_FOLDER="true">Barre</H3>
  <DL><p>
    <dt><a href="https://x.fr/"
       add_date="1600000000">Caf&#233; &#x41; &eacute;t&amp;&nbsp;</a>
  </DL><p>
  <DT><A HREF="https://y.fr/">Y</A>
  <DD>description ignorée
</DL><p>`
    const lu = aplatir(html)
    expect(lu.map((x) => [x.url, x.title, x.dossier])).toEqual([
      ['https://x.fr/', 'Café A &eacute;t&', 'Barre'],
      ['https://y.fr/', 'Y', undefined]
    ])
  })

  it('tolère le désordre : balises fermantes en trop, lien sans adresse, texte vide', () => {
    const lu = aplatir('<DL></DL></DL></DL><DT><A>sans href</A><DT><A HREF="">vide</A><DT><A HREF="https://ok.fr/">ok</A><DT><H3>Dossier vide</H3><DL></DL>')
    expect(lu.map((x) => x.url)).toEqual(['https://ok.fr/'])
  })

  it('ne dépasse pas une profondeur raisonnable et ne plante pas sur 5000 niveaux', () => {
    const html = '<DL>'.repeat(5000) + '<DT><A HREF="https://p.fr/">P</A>' + '</DL>'.repeat(5000)
    expect(() => lireFavorisHtml(html)).not.toThrow()
  })

  it('un dossier au nom contenant « / » est écrit avec « ∕ » (le séparateur de Lyra reste libre)', () => {
    const [lu] = aplatir(exporterFavorisHtml([f('https://a.fr/', 'A', 'a∕b / c')]))
    expect(lu.dossier).toBe('a∕b / c')
  })
})
