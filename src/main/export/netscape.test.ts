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
      ['https://x.fr/', 'Café A ét&', 'Barre'],
      ['https://y.fr/', 'Y', undefined]
    ])
  })

  it('décode les entités nommées latines courantes (accents, guillemets, tirets, euro)', () => {
    const html = '<DL><p><DT><A HREF="https://x.fr/">&Eacute;t&eacute; &agrave; &Ccedil;a&nbsp;va &laquo;&nbsp;oui&nbsp;&raquo; &hellip; &ndash; &mdash; &rsquo;&lsquo; &ldquo;&rdquo; 5&euro; &ouml;&uuml;&yuml;&icirc;&ocirc;&ucirc;&egrave;&ecirc;&euml;&acirc;&auml;&iuml;&ugrave; &inconnue;</A></DL><p>'
    expect(aplatir(html)[0].title).toBe('Été à Ça\u00a0va «\u00a0oui\u00a0» … – — ’‘ “” 5€ öüÿîôûèêëâäïù &inconnue;')
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

  it('analyse linéaire : balises jamais fermées ou « < » sans « > » en moins de 500 ms', () => {
    for (const hostile of ['<a'.repeat(200_000), '<A>'.repeat(200_000), '<DL><DT><A HREF="x">'.repeat(50_000), '<H3>'.repeat(200_000), '<a href="' + '<'.repeat(200_000)]) {
      const t = Date.now()
      lireFavorisHtml(hostile)
      expect(Date.now() - t).toBeLessThan(500)
    }
  })

  it('attributs : 200 balises <a suivies de 16 Ko de « a » sans « = », et un attribut de 16 Ko plein de « = », en moins de 500 ms au total', () => {
    const t = Date.now()
    lireFavorisHtml(('<a ' + 'a'.repeat(16 * 1024)).repeat(200))
    lireFavorisHtml('<a href="https://x.fr/" ' + '='.repeat(16 * 1024) + ' x=' + '='.repeat(16 * 1024) + '>t</a>')
    lireFavorisHtml(('<a ' + 'a='.repeat(8 * 1024) + '>').repeat(200))
    expect(Date.now() - t).toBeLessThan(500)
  })

  it('</abbr> ne ferme pas un lien ; </a  > avec espaces le ferme', () => {
    const lu = aplatir('<DL><DT><A HREF="https://a.fr/">Un <abbr title="x">sigle</abbr> dans un lien</A><DT><A HREF="https://b.fr/">B</a  ></DL>')
    expect(lu.map((x) => [x.url, x.title])).toEqual([['https://a.fr/', 'Un sigle dans un lien'], ['https://b.fr/', 'B']])
  })

  it('un « > » entre guillemets dans une valeur d’attribut ne termine pas la balise', () => {
    const lu = aplatir('<DL><DT><A HREF="https://a.fr/?x=1>2&y=<3" TITLE=\'a>b\'>Lien</A></DL>')
    expect(lu.map((x) => [x.url, x.title])).toEqual([['https://a.fr/?x=1>2&y=<3', 'Lien']])
  })

  it('export Chrome (fixture fabriquée) : barre, dossiers imbriqués, entités, icône en data:', () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1700000000" LAST_MODIFIED="1700000100" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>
    <DL><p>
        <DT><A HREF="https://exemple.fr/?a=1&amp;b=2" ADD_DATE="1700000200" ICON="data:image/png;base64,iVBORw0KGgo=">Caf&eacute; &amp; Cie &#8212; &quot;accueil&quot;</A>
        <DT><H3 ADD_DATE="1700000300" LAST_MODIFIED="1700000400">Travail</H3>
        <DL><p>
            <DT><A HREF="https://b.fr/x" ADD_DATE="1700000500">B &lt;b&gt;</A>
            <DT><H3 ADD_DATE="1700000600" LAST_MODIFIED="1700000700">Archives</H3>
            <DL><p>
                <DT><A HREF="https://c.fr/" ADD_DATE="1700000800">C</A>
            </DL><p>
        </DL><p>
    </DL><p>
    <DT><H3 ADD_DATE="1700000900" LAST_MODIFIED="1700001000">Other bookmarks</H3>
    <DL><p>
        <DT><A HREF="https://d.fr/" ADD_DATE="1700001100">D</A>
    </DL><p>
</DL><p>`
    expect(aplatir(html).map((x) => [x.url, x.title, x.dossier])).toEqual([
      ['https://exemple.fr/?a=1&b=2', 'Café & Cie — "accueil"', 'Bookmarks bar'],
      ['https://b.fr/x', 'B <b>', 'Bookmarks bar / Travail'],
      ['https://c.fr/', 'C', 'Bookmarks bar / Travail / Archives'],
      ['https://d.fr/', 'D', 'Other bookmarks']
    ])
  })

  it('export Firefox (fixture fabriquée) : menu, séparateurs <HR>, descriptions <DD>, ICON_URI', () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'none'; img-src data: *; object-src 'none'"></meta>
<TITLE>Bookmarks</TITLE>
<H1>Menu des marque-pages</H1>

<DL><p>
    <DT><H3 ADD_DATE="1700000000" LAST_MODIFIED="1700000050">Barre personnelle</H3>
    <DD>Ma barre
    <DL><p>
        <DT><A HREF="https://f.fr/?q=a&amp;r=b" ADD_DATE="1700000100" LAST_MODIFIED="1700000150" ICON_URI="fake-favicon-uri:https://f.fr/?q=a&amp;r=b" ICON="data:image/png;base64,AAAA">Fran&ccedil;ais &amp; co</A>
        <DD>description du favori
        <HR>
        <DT><H3 ADD_DATE="1700000200" LAST_MODIFIED="1700000250">Sous-dossier</H3>
        <DL><p>
            <DT><A HREF="https://g.fr/" ADD_DATE="1700000300" LAST_MODIFIED="1700000350" TAGS="a,b">G</A>
        </DL><p>
    </DL><p>
    <DT><A HREF="place:parent=1234&amp;type=6&amp;sort=14" ADD_DATE="1700000400">Requête</A>
</DL>`
    expect(aplatir(html).map((x) => [x.url, x.title, x.dossier])).toEqual([
      ['https://f.fr/?q=a&r=b', 'Français & co', 'Barre personnelle'],
      ['https://g.fr/', 'G', 'Barre personnelle / Sous-dossier'],
      ['place:parent=1234&type=6&sort=14', 'Requête', undefined]
    ])
  })
})
