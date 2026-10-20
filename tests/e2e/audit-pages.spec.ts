import { test, expect } from '@playwright/test'
import { resolve } from 'node:path'
import { Audit } from './audit/harnais'

/**
 * Audit @audit des pages internes autres que les réglages : extensions, historique, favoris, téléchargements, Boucliers,
 * nouvel onglet, pages d'erreur. Chaque contrôle visible est découvert puis actionné (voir audit/harnais.ts).
 */
test.describe.configure({ timeout: 300_000 })

const FIXTURES_EXT = resolve(__dirname, '../../src/main/extensions/fixtures')

async function auditerPage(audit: Audit, url: string, nom = url): Promise<void> {
  await test.step(nom, async () => {
    await audit.ouvrir(url)
    const ref = await audit.etatFenetre()
    const base = url.split(/[?#]/)[0]
    await audit.auditerZone({
      page: nom,
      zone: 'page',
      cible: async () => audit.trouver(base) ?? (await audit.ouvrir(url)),
      restaurer: () => audit.restaurerFenetre(ref, url)
    })
  })
}

async function verdict(audit: Audit): Promise<void> {
  await audit.arreter()
  audit.ecrireRapport()
}

test('@audit pages — lyra://extensions', async () => {
  const audit = new Audit('pages-extensions')
  try {
    // Extensions de fixture déjà installées (cartes, interrupteurs, désinstallation) ; installateurs de la file simulés.
    await audit.demarrer({ LYRA_EXTENSIONS_FIXTURES: FIXTURES_EXT })
    await auditerPage(audit, 'lyra://extensions')
  } finally {
    await verdict(audit)
  }
  expect(audit.defauts(), audit.defauts().join('\n')).toEqual([])
})

test('@audit pages — historique, favoris, téléchargements, Boucliers', async () => {
  const audit = new Audit('pages-listes')
  try {
    await audit.demarrer()
    for (const url of ['lyra://history', 'lyra://bookmarks', 'lyra://downloads', 'lyra://shields']) await auditerPage(audit, url)
  } finally {
    await verdict(audit)
  }
  expect(audit.defauts(), audit.defauts().join('\n')).toEqual([])
})

test('@audit pages — nouvel onglet et pages d’erreur', async () => {
  const audit = new Audit('pages-newtab-erreurs')
  try {
    await audit.demarrer()
    await auditerPage(audit, 'lyra://newtab')
    // Une page d'erreur par type ; l'adresse visée est fictive (le réseau est intercepté de toute façon).
    for (const type of ['reseau', 'introuvable', 'certificat', 'passerelles', 'http']) {
      // Un hôte par type : « Passer par une passerelle » d'une page ne doit pas changer le sort de la suivante.
      const cible = `${type === 'http' ? 'http' : 'https'}://${type}.exemple.test/`
      const extra = type === 'reseau' || type === 'introuvable' ? '&passerelle=1' : ''
      await auditerPage(audit, `lyra://erreur?type=${type}&url=${encodeURIComponent(cible)}${extra}`, `lyra://erreur?type=${type}`)
    }
  } finally {
    await verdict(audit)
  }
  expect(audit.defauts(), audit.defauts().join('\n')).toEqual([])
})
