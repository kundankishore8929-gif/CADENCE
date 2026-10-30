import { useMemo } from 'react'
import { useStore } from '../store/useStore.js'
import BodyMap from '../components/BodyMap.jsx'
import Icon from '../components/Icon.jsx'
import { figureOf } from '../lib/exercises.js'
import { loadOfRoutine } from '../lib/muscles.js'
import { exerciseNameFor } from '../lib/i18n.js'
import './gym.css'

// Where openGym shows an exercise's licensed picture (components/Media.jsx), CADENCE shows the
// muscles it works, drawn from openGym's MIT-licensed outlines (NOTICE.md, "Body diagram
// geometry"). Settings → workout media "off" and "mini" still apply in a workout.
export function ExerciseMap({ ex, id, compact, minimizable }) {
  const gifSize = useStore(s => s.S.gifSize)
  const body = useStore(s => figureOf(s.S))
  const load = useMemo(() => loadOfRoutine({ ex: [{ id: ex.id, sets: 3 }] }), [ex.id])
  if (minimizable && gifSize === 'off') return null
  if (!Object.values(load).some(v => v > 0)) return null
  const mini = minimizable && gifSize === 'mini'
  return <div className={'exmedia gym-exmap' + (compact ? ' compact' : '') + (mini ? ' mini' : '')} id={id}
    role="img" aria-label={exerciseNameFor(ex)}>
    <BodyMap load={load} body={body} />
  </div>
}

/** In lists: the neutral tile openGym uses for an exercise without a picture. */
export function ExerciseMapThumb() {
  return <div className="thumb thumb-x"><Icon name="dumbbell" /></div>
}
