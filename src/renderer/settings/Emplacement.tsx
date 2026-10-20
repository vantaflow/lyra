import type { ComponentChildren } from 'preact'

/** Section pas encore réalisée : titre, mention « bientôt » et, au besoin, un lien ou un détail. */
export function Emplacement({ description, lien, children }: { description?: string; lien?: { href: string; libelle: string }; children?: ComponentChildren }) {
  return (
    <div class="card emplacement">
      <div class="row">
        <div class="lbl">
          <span>Bientôt</span>
          {description && <span class="hint">{description}</span>}
        </div>
        {lien && (
          <a class="btn" href={lien.href}>
            {lien.libelle}
          </a>
        )}
      </div>
      {children}
    </div>
  )
}
