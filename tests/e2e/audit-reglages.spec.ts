import { test, expect } from '@playwright/test'
import { Audit } from './audit/harnais'

/**
 * Audit @audit de lyra://settings : chaque section du sommaire (découverte dans la page, aucune liste figée), chaque
 * contrôle de chaque section, plus le sommaire lui-même. Les sections sont réparties en tranches (un lancement de Lyra
 * par tranche) pour rester sous la limite de temps ; la dernière tranche prend toutes les sections restantes.
 */
const TRANCHES = 4
const PAR_TRANCHE = 6

test.describe.configure({ timeout: 300_000 })

async function sections(audit: Audit): Promise<Array<{ id: string; titre: string; href: string }>> {
  const p = await audit.ouvrir('lyra://settings#/general')
  return p.evaluate(() =>
    Array.from(document.querySelectorAll('nav a')).map((a) => ({
      id: (a.getAttribute('href') ?? '').replace(/^#\/?/, ''),
      titre: (a as HTMLElement).innerText.trim(),
      href: a.getAttribute('href') ?? ''
    }))
  )
}

for (let t = 0; t < TRANCHES; t++) {
  test(`@audit réglages — sections, tranche ${t + 1}/${TRANCHES}`, async () => {
    const audit = new Audit(`reglages-${t + 1}`)
    try {
      await audit.demarrer()
      const toutes = await sections(audit)
      expect(toutes.length).toBeGreaterThan(0)
      const debut = t * PAR_TRANCHE
      const fin = t === TRANCHES - 1 ? toutes.length : debut + PAR_TRANCHE
      for (const s of toutes.slice(debut, fin)) {
        // Lien vers une autre page (ex. lyra://extensions) : auditée par audit-pages.
        if (!s.href.startsWith('#')) continue
        const url = `lyra://settings#/${s.id}`
        await test.step(s.titre, async () => {
          const p = await audit.ouvrir(url)
          await expect(p.locator('h1')).toHaveText(s.titre)
          // Section vide : rien d'autre que l'en-tête.
          const contenu = await p.evaluate(() => {
            const m = document.querySelector('main')
            if (!m) return 0
            return Array.from(m.children).filter((e) => !e.classList.contains('entete') && (e as HTMLElement).innerText?.trim()).length
          })
          if (contenu === 0) audit.defautContenu(url, `Section « ${s.titre} » vide : aucun contenu sous le titre`)
          const ref = await audit.etatFenetre()
          await audit.auditerZone({
            page: url,
            zone: 'contenu',
            cible: async () => audit.trouver('lyra://settings') ?? (await audit.ouvrir(url)),
            racine: 'main',
            restaurer: () => audit.restaurerFenetre(ref, url)
          })
        })
      }
      if (t === 0) {
        await test.step('sommaire', async () => {
          const url = 'lyra://settings#/general'
          await audit.ouvrir(url)
          const ref = await audit.etatFenetre()
          await audit.auditerZone({
            page: 'lyra://settings',
            zone: 'sommaire',
            cible: async () => audit.trouver('lyra://settings') ?? (await audit.ouvrir(url)),
            racine: 'nav',
            restaurer: () => audit.restaurerFenetre(ref, url)
          })
        })
      }
    } finally {
      await audit.arreter()
      audit.ecrireRapport()
    }
    expect(audit.defauts(), audit.defauts().join('\n')).toEqual([])
  })
}
