/** Attend `p` au plus `ms` ms ; ne rejette jamais (une erreur ou le délai rend la main). Résout `true` si `p` s'est terminée à temps. */
export async function borner(p: Promise<unknown>, ms: number): Promise<boolean> {
  let minuteur: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      p.then(() => true, () => true),
      new Promise<boolean>((res) => {
        minuteur = setTimeout(() => res(false), ms)
        minuteur.unref?.()
      })
    ])
  } finally {
    if (minuteur) clearTimeout(minuteur)
  }
}

/** Exécute `fn` sur chaque élément, `n` à la fois. Les erreurs de `fn` sont de son ressort (elle ne doit pas rejeter). */
export async function parLots<T>(elements: readonly T[], n: number, fn: (e: T) => Promise<void>): Promise<void> {
  const file = [...elements]
  const un = async (): Promise<void> => {
    for (let e = file.shift(); e !== undefined; e = file.shift()) await fn(e)
  }
  await Promise.all(Array.from({ length: Math.min(n, file.length) }, un))
}
