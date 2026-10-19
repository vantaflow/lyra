import type { Star as StarT } from '../../shared/types'
import { Star } from './Star'

interface Props {
  star: StarT
  /** Étoiles du groupe affiché, dans l'ordre du ciel. */
  groupe: StarT[]
}

/** Une étoile et, dessous, ses enfants dans une `.branch` (ligne de constellation). */
export function Branche({ star, groupe }: Props) {
  const enfants = groupe.filter((s) => s.parentId === star.id)
  return (
    <>
      <Star star={star} />
      {enfants.length > 0 && (
        <div class="branch">
          {enfants.map((e) => (
            <Branche key={e.id} star={e} groupe={groupe} />
          ))}
        </div>
      )}
    </>
  )
}
