import { test, expect, type Page } from '@playwright/test'
import { Audit, fixture } from './audit/harnais'

/**
 * Audit @audit de la vue chrome (ciel, capsule) et de chaque panneau de l'overlay (palette, Boucliers, téléchargements,
 * menu ⋯, extensions), puis du mode Ne pas déranger (rappel). Contrôles découverts dans le DOM (voir audit/harnais.ts).
 */
test.describe.configure({ timeout: 300_000 })

type Reglages = { ciel: Record<string, unknown> }

/** Une page web active avec un historique (Précédent actif) : la capsule a tous ses boutons. */
async function preparer(audit: Audit): Promise<string> {
  const url = fixture('liens.html') + '?normal'
  await audit.ouvrir(fixture('liens.html'))
  await audit.ouvrir(url)
  return url
}

async function verdict(audit: Audit): Promise<void> {
  await audit.arreter()
  audit.ecrireRapport()
}

test('@audit chrome — ciel et capsule', async () => {
  const audit = new Audit('chrome-ciel-capsule')
  try {
    await audit.demarrer()
    const url = await preparer(audit)
    const ref = await audit.etatFenetre()
    const { ciel } = await audit.invoquer<Reglages>('settings:get')
    await audit.auditerZone({
      page: 'vue chrome',
      zone: 'ciel et capsule',
      cible: async () => audit.fenetre,
      pagesSurveillees: async () => [audit.fenetre],
      // Le ciel est remis à sa place (un bouton peut le replier ou le déplacer) avant le contrôle suivant.
      restaurer: () => audit.restaurerFenetre(ref, url, { reglages: { ciel } })
    })
  } finally {
    await verdict(audit)
  }
  expect(audit.defauts(), audit.defauts().join('\n')).toEqual([])
})

/** Panneaux de l'overlay et leur ouverture (canaux appelés par les boutons du chrome). */
const PANNEAUX: Array<{ nom: string; ouvrir: (a: Audit) => Promise<void> }> = [
  { nom: 'palette', ouvrir: (a) => a.invoquer('palette:open') },
  { nom: 'Boucliers', ouvrir: (a) => a.invoquer('shields:open') },
  { nom: 'téléchargements', ouvrir: (a) => a.invoquer('downloads:panel') },
  { nom: 'extensions', ouvrir: (a) => a.invoquer('extensions:panel') },
  {
    nom: 'menu ⋯',
    ouvrir: async (a) => {
      // Comme la capsule : ancré sous le bouton « Menu de la page ».
      const r = await a.fenetre.getByRole('button', { name: 'Menu de la page' }).boundingBox()
      await a.invoquer('menu:open', { droite: (r?.x ?? 0) + (r?.width ?? 0), bas: (r?.y ?? 0) + (r?.height ?? 0) })
    }
  }
]

for (const panneau of PANNEAUX) {
  test(`@audit overlay — ${panneau.nom}`, async () => {
    const audit = new Audit(`overlay-${panneau.nom}`)
    try {
      await audit.demarrer()
      const url = await preparer(audit)
      const ref = await audit.etatFenetre()
      const { ciel } = await audit.invoquer<Reglages>('settings:get')
      const ouvrir = async (): Promise<Page> => {
        await panneau.ouvrir(audit)
        await expect.poll(() => audit.overlayVisible()).toBe(true)
        const o = audit.overlay()!
        // Le panneau est rendu (au moins un contrôle visible).
        await expect.poll(() => audit.decouvrir(o).then((l) => l.length)).toBeGreaterThan(0)
        return o
      }
      await ouvrir()
      await audit.auditerZone({
        page: `overlay : ${panneau.nom}`,
        zone: panneau.nom,
        cible: async () => audit.overlay()!,
        pagesSurveillees: async () => [audit.overlay()!, audit.fenetre],
        restaurer: async () => {
          await audit.restaurerFenetre(ref, url, { reglages: { ciel } })
          await ouvrir()
        }
      })
    } finally {
      await verdict(audit)
    }
    expect(audit.defauts(), audit.defauts().join('\n')).toEqual([])
  })
}

test('@audit chrome — Ne pas déranger (rappel)', async () => {
  const audit = new Audit('chrome-ne-pas-deranger')
  try {
    await audit.demarrer()
    const url = await preparer(audit)
    const ref = await audit.etatFenetre()
    const entrer = async (): Promise<void> => {
      if (!(await audit.invoquer<{ actif: boolean }>('dnd:get')).actif) await audit.invoquer('dnd:basculer')
      await expect.poll(() => audit.invoquer<{ actif: boolean }>('dnd:get').then((d) => d.actif)).toBe(true)
      await expect.poll(() => audit.decouvrir(audit.fenetre).then((l) => l.length)).toBeGreaterThan(0)
    }
    await entrer()
    await audit.auditerZone({
      page: 'vue chrome : Ne pas déranger',
      zone: 'rappel',
      cible: async () => audit.fenetre,
      pagesSurveillees: async () => [audit.fenetre],
      restaurer: async () => {
        await audit.restaurerFenetre(ref, url)
        await entrer()
      }
    })
  } finally {
    await verdict(audit)
  }
  expect(audit.defauts(), audit.defauts().join('\n')).toEqual([])
})
