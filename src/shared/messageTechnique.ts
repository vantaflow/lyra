/**
 * Messages d'erreur techniques (exceptions JavaScript, erreurs système, IPC d'Electron, réseau de Chromium) : ils ne
 * s'affichent jamais tels quels. Les messages écrits par Lyra (phrases françaises) passent ; les autres sont remplacés
 * par une phrase lisible et le détail part au journal.
 */
const TECHNIQUE: RegExp[] = [
  /^(Syntax|Type|Reference|Range|URI|Eval|Aggregate)Error\b/,
  /\bJSON\b(?!\s*(illisible|absent))/,
  /\bparse\b/i,
  /Unexpected (token|end|identifier|character)/i,
  /Cannot read propert|is not a function|is not defined|is not iterable|of undefined|of null/i,
  /\b(E[A-Z]{3,}|ERR_[A-Z_]+)\b/,
  /could not be cloned|No handler registered|Render frame was disposed|Object has been destroyed/i,
  /IPC refusé/,
  /\bat .+:\d+:\d+/
]

/** Retire « Error invoking remote method 'canal': » et les préfixes « Error: » successifs. */
export function sansEnrobage(m: string): string {
  return m.replace(/^Error invoking remote method '[^']*':\s*/, '').replace(/^(Error:\s*)+/, '').trim()
}

export const estMessageTechnique = (m: string): boolean => m === '' || TECHNIQUE.some((r) => r.test(m))

/** Phrase de repli générique. */
export const MESSAGE_ERREUR_GENERIQUE = 'Une erreur est survenue. Réessayez.'

/** Message affichable d'une erreur : celui de Lyra s'il est lisible, sinon `repli` (le détail va au journal). */
export function messageLisible(e: unknown, repli: string = MESSAGE_ERREUR_GENERIQUE, journal: (...a: unknown[]) => void = console.warn): string {
  const brut = e instanceof Error ? `${e.name !== 'Error' && !e.message.startsWith(e.name) ? `${e.name}: ` : ''}${e.message}` : String(e ?? '')
  const m = sansEnrobage(brut)
  if (estMessageTechnique(m)) {
    journal('[lyra] erreur :', e)
    return repli
  }
  return m
}
