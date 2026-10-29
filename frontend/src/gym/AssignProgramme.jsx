import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { Section, Row, TextField, Button } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { glyphOf } from '../lib/glyphs.js'
import { gt, assignProgramme, isoDaysAgo } from './api.js'

// Monday first, the way a gym week is talked about. S.week keys: 0 = Sunday.
export const WEEK = [['1', 'Mon'], ['2', 'Tue'], ['3', 'Wed'], ['4', 'Thu'], ['5', 'Fri'], ['6', 'Sat'], ['0', 'Sun']]

const PROGRAMME_ERRORS = {
  'no-routines': 'Pick at least one routine.',
  'no-days': 'Put each routine on at least one day.',
  'unknown-routine': 'A routine is not on the server yet. Wait a moment and try again.',
  'too-many': 'At most 14 routines.',
}

/**
 * The trainer's sheet: pick routines from their own Plan, a day or days for each, and a start
 * date. The server copies them into the client's plan (api/gym/programme.js).
 */
export default function AssignProgramme({ client, current, close, onDone }) {
  const routines = useStore(s => s.S.routines).filter(r => !r.assignedBy)
  const toast = useUI(s => s.toast)
  // Start from what is assigned now, when the trainer is changing it: same routine names, same days.
  const [days, setDays] = useState(() => {
    const out = {}
    if (current) {
      for (const snap of current.routines || []) {
        const mine = routines.find(r => r.name === snap.name)
        if (!mine) continue
        out[mine.id] = WEEK.map(([d]) => d).filter(d => [].concat(current.week?.[d] || []).includes(snap.id))
      }
    }
    return out
  })
  const [start, setStart] = useState(isoDaysAgo(0))
  const [busy, setBusy] = useState(false)
  const picked = routines.filter(r => days[r.id])
  const toggleRoutine = id => setDays(d => { const n = { ...d }; if (n[id]) delete n[id]; else n[id] = []; return n })
  const toggleDay = (id, day) => setDays(d => ({ ...d, [id]: d[id].includes(day) ? d[id].filter(x => x !== day) : [...d[id], day] }))
  const ready = picked.length > 0 && picked.every(r => days[r.id].length > 0)

  const assign = async () => {
    setBusy(true)
    try {
      // The server copies from the trainer's plan as it has it: send this device's edits first.
      await useStore.getState().syncNow?.()
      const week = {}
      for (const r of picked) for (const d of days[r.id]) week[d] = [...(week[d] || []), r.id]
      const r = await assignProgramme(client.id, picked.map(x => x.id), week, start)
      toast(gt('Programme assigned to {0}', client.name))
      onDone?.(r.programme)
      close()
    } catch (e) {
      toast(gt(PROGRAMME_ERRORS[e?.data?.code] || e.message || 'That did not work. Try again.'))
    } finally { setBusy(false) }
  }

  return <>
    <h3 style={{ marginTop: 0 }}>{current ? gt('Change {0}’s programme', client.name) : gt('Programme for {0}', client.name)}</h3>
    <div className="small muted" style={{ marginBottom: 12 }}>
      {gt('Pick routines from your own Plan and the days for each. They go into {0}’s plan as “From you”, and these days become their week.', client.name)}
    </div>

    {!routines.length && <div className="card small muted">{gt('You have no routines yet. Build them in Plan first, then come back.')}</div>}

    <Section title={gt('Routines')}>
      {routines.map(r => {
        const on = !!days[r.id]
        return <div key={r.id}>
          <Row icon={glyphOf(r.emoji)} iconTint={on ? 'var(--acc)' : 'var(--grey)'} title={r.name}
            subtitle={gt('{0} exercises', (r.ex || []).length)} accessory={on ? 'check' : 'none'} onClick={() => toggleRoutine(r.id)} />
          {on && <div className="gym-days" role="group" aria-label={gt('Days for {0}', r.name)}>
            {WEEK.map(([d, label]) => <button key={d} type="button" className={'gym-day' + (days[r.id].includes(d) ? ' on' : '')}
              aria-pressed={days[r.id].includes(d)} onClick={() => toggleDay(r.id, d)}>{gt(label)}</button>)}
          </div>}
        </div>
      })}
    </Section>

    <Section title={gt('Starts')} footer={gt('Consistency counts from this day.')}>
      <div className="lrow"><Icon name="calendar" style={{ color: 'var(--acc)', marginInlineEnd: 10 }} />
        <TextField type="date" value={start} onChange={e => setStart(e.target.value)} aria-label={gt('Start date')} style={{ flex: 1 }} /></div>
    </Section>

    <Button variant="primary" disabled={!ready || busy} onClick={assign}>{busy ? gt('Assigning…') : current ? gt('Update programme') : gt('Assign programme')}</Button>
    <div style={{ height: 8 }} />
    <Button onClick={close}>{gt('Cancel')}</Button>
  </>
}
