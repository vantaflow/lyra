/** Message d'une erreur IPC sans l'enrobage « Error invoking remote method … ». */
export function messageErreur(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  return m.replace(/^Error invoking remote method '[^']*':\s*/, '').replace(/^Error:\s*/, '')
}
