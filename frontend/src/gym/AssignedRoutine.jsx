import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { Section, Row } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { EXIDX } from '../lib/exercises.js'
import { glyphOf } from '../lib/glyphs.js'
import { gt } from './api.js'
import { WEEK } from './AssignProgramme.jsx'
import './gym.css'

const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

/** "3 × 8 @ 60 kg" as the member reads it; the weight the app gives on the day may move with progression. */
function prescription(e, unit) {
  const n = Number(e.sets) || 0
  if (e.mode === 'time' || (Number(e.sec) > 0 && !(Number(e.reps) > 0))) return gt('{0} × {1} s', n, Number(e.sec) || 0)
  const reps = e.repsMin != null && e.repsMax != null && Number(e.repsMin) !== Number(e.repsMax) ? e.repsMin + '–' + e.repsMax : (e.reps ?? e.repsMin ?? '')
  return Number(e.weight) > 0 ? gt('{0} × {1} @ {2} {3}', n, reps, e.weight, unit) : gt('{0} × {1}', n, reps)
}

/** A routine a trainer assigned, as the member sees it: read-only (SPEC M2, decision 2). */
export default function AssignedRoutine({ routine }) {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const days = WEEK.filter(([d]) => [].concat(S.week?.[d] || []).includes(routine.id)).map(([, l]) => gt(l))
  const trainer = routine.assignedByName || gt('your trainer')
  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/plan" onClick={() => nav('/plan')} aria-label={gt('Plan')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{routine.name}</h1>
        <div className="sub"><span className="gym-from">{gt('From {0}', trainer)}</span>{days.length ? ' · ' + days.join(', ') : ''}</div></div>
      <span className="lrow-i" aria-hidden="true"><Icon name={glyphOf(routine.emoji)} /></span>
    </div>

    <Section title={gt('Exercises')} footer={gt('The weights can go up as you progress: the workout screen shows the one for today.')}>
      {(routine.ex || []).map((e, i) => <Row key={i} icon="dumbbell" iconTint="var(--acc)" title={cap(EXIDX[e.id]?.n || gt('Exercise'))} subtitle={prescription(e, S.unit || 'kg')} />)}
    </Section>

    <Section footer={gt('{0} set this routine, so it can’t be edited here. Ask {0} to change it. During a workout you can still swap an exercise when a machine is taken.', trainer)}>
      <Row icon="lock" iconTint="var(--grey)" title={gt('Set by {0}', trainer)} />
    </Section>
  </div>
}
