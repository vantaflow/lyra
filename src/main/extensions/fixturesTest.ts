/**
 * Test uniquement (`LYRA_TEST=1` + `LYRA_EXTENSIONS_FIXTURES=<dossier>`) : installe dans le registre les extensions de
 * fixture du dossier (sous-dossiers avec un `manifest.json` à clé), copiées sous `userData/extensions/<id>/<version>`.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { Registre } from './registre'

/** Id Chrome d'une extension à clé : sha256 de la clé publique (DER), 32 premiers hexa → a-p. */
export function idDepuisCle(cleBase64: string): string {
  const hex = createHash('sha256').update(Buffer.from(cleBase64, 'base64')).digest('hex').slice(0, 32)
  return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('')
}

export function installerFixtures(dossierFixtures: string, base: string, registre: Registre, journal: (m: string) => void = console.warn): string[] {
  const ids: string[] = []
  if (!existsSync(dossierFixtures)) return ids
  for (const nom of readdirSync(dossierFixtures, { withFileTypes: true })) {
    if (!nom.isDirectory()) continue
    const source = join(dossierFixtures, nom.name)
    try {
      const m = JSON.parse(readFileSync(join(source, 'manifest.json'), 'utf8')) as { name?: unknown; version?: unknown; key?: unknown }
      if (typeof m.key !== 'string' || typeof m.name !== 'string' || typeof m.version !== 'string') continue
      const id = idDepuisCle(m.key)
      const cible = join(base, id, m.version)
      rmSync(cible, { recursive: true, force: true })
      mkdirSync(join(base, id), { recursive: true })
      cpSync(source, cible, { recursive: true })
      const maintenant = new Date().toISOString()
      registre.ajouter({ id, nom: m.name, version: m.version, source: 'dossier', magasin: 'inconnu', dossier: `${id}/${m.version}`, active: true, installeeLe: maintenant, miseAJourLe: maintenant })
      ids.push(id)
    } catch (e) {
      journal(`[extensions] fixture ${nom.name} ignorée : ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return ids
}
