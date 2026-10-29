import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useUI } from '../store/useUI.js'
import { Section, Row } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { confirmSheet } from '../sheets.jsx'
import { fmtDate, fmtNum } from '../lib/format.js'
import { EXIDX } from '../lib/exercises.js'
import { gt, getClient, removeClient, clientLine, agoLabel, isoDaysAgo, localDay } from './api.js'
import './gym.css'

const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

/** One exercise of a logged workout as a line: "Bench press · 3 sets · best 80 kg × 8". */
export function exerciseLine(entry, names, unit) {
  const name = cap(names[entry.id] || EXIDX[entry.id]?.n || gt('Exercise'))
  const sets = (Array.isArray(entry.sets) ? entry.sets : []).filter(s => s && s.done !== false && !s.warmup)
  if (!sets.length) return { name, detail: gt('no sets done') }
  const weighted = sets.filter(s => Number(s.w) > 0)
  let best
  if (weighted.length) {
    const top = weighted.reduce((a, b) => (Number(b.w) > Number(a.w) || (Number(b.w) === Number(a.w) && Number(b.r) > Number(a.r)) ? b : a))
    best = gt('best {0} {1} × {2}', fmtNum(Number(top.w)), unit, Number(top.r) || 0)
  } else if (sets.some(s => Number(s.sec) > 0)) {
    best = gt('longest {0} s', Math.max(...sets.map(s => Number(s.sec) || 0)))
  } else {
    best = gt('best {0} reps', Math.max(...sets.map(s => Number(s.r) || 0)))
  }
  return { name, detail: gt('{0} sets · {1}', sets.length, best) }
}

// One client, read-only: what they did, their body weight and measurements.
export default function ClientDetail() {
  const nav = useNavigate()
  const { id } = useParams()
  const toast = useUI(s => s.toast)
  const [d, setD] = useState(null)
  const [err, setErr] = useState(null)
  const [open, setOpen] = useState(null)
  useEffect(() => { getClient(id).then(setD).catch(setErr) }, [id])

  const back = () => nav('/gym/clients')
  const remove = () => confirmSheet({
    title: gt('Remove {0}?', d.client.name),
    message: gt('You stop seeing {0}’s training. Their data stays with them, and they can share with you again by entering your code.', d.client.name),
    confirmText: gt('Remove client'), danger: true,
    onConfirm: () => removeClient(id).then(() => { toast(gt('{0} removed', d.client.name)); back() }).catch(e => toast(e.message)),
  })

  if (err) return <div className="narrow">
    <div className="hdr"><button className="iconbtn" data-back="/gym/clients" onClick={back} aria-label={gt('Your clients')}><Icon name="chevronLeft" /></button></div>
    <div className="card small" role="alert">{err.status === 404 ? gt('This member no longer shares their training with you.') : err.message}</div>
  </div>
  if (!d) return <div className="narrow"><div className="card small muted" style={{ marginTop: 60 }}>{gt('Loading…')}</div></div>

  const names = Object.fromEntries((d.customEx || []).map(c => [c.id, c.n]))
  const line = clientLine({ lastWorkout: d.workouts[0]?.d || null, recent: d.workouts.map(w => w.d).filter(x => x >= isoDaysAgo(40)) })
  const weights = d.bodyweight
  const lastW = weights[weights.length - 1]
  const monthAgo = isoDaysAgo(30)
  const firstInMonth = weights.find(b => b.d >= monthAgo)
  const change = lastW && firstInMonth && lastW !== firstInMonth ? lastW.w - firstInMonth.w : null
  const lastM = d.measurements[d.measurements.length - 1]
  const MEASURE = { waist: 'Waist', chest: 'Chest', hips: 'Hips', shoulders: 'Shoulders', bodyFat: 'Body fat', neck: 'Neck', upperArmLeft: 'Left arm', upperArmRight: 'Right arm', thighLeft: 'Left thigh', thighRight: 'Right thigh' }

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/gym/clients" onClick={back} aria-label={gt('Your clients')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1 className="capitalize">{d.client.name}</h1>
        <div className="sub">{gt('Sharing with you since {0}', localDay(d.client.since) ? fmtDate(localDay(d.client.since), true, true) : '–')}</div></div>
    </div>

    <div className="tiles" style={{ marginBottom: 12 }}>
      <div className="tile"><div className="l">{gt('Last workout')}</div><div className="v" style={{ fontSize: '1rem', color: line.attention ? 'var(--orange)' : undefined }}>{agoLabel(line.lastWorkout)}</div></div>
      <div className="tile"><div className="l">{gt('This week')}</div><div className="v">{line.last7}</div></div>
      <div className="tile"><div className="l">{gt('30 days')}</div><div className="v">{line.last30}</div></div>
      <div className="tile"><div className="l">{gt('Body weight')}</div><div className="v" style={{ fontSize: '1rem' }}>{lastW ? fmtNum(lastW.w) + ' ' + d.unit : '–'}</div></div>
    </div>

    <Section title={gt('Workouts')} footer={d.workouts.length > 30 ? gt('The latest 30 of {0}.', d.workouts.length) : null}>
      {!d.workouts.length && <Row title={gt('No workouts logged yet')} />}
      {d.workouts.slice(0, 30).map(w => {
        const entries = (Array.isArray(w.entries) ? w.entries : []).filter(e => e && Array.isArray(e.sets))
        const isOpen = open === w.id
        return <div key={w.id || w.d}>
          <Row icon="dumbbell" iconTint="var(--acc)" title={w.name || gt('Workout')}
            subtitle={fmtDate(w.d, true) + ' · ' + gt('{0} exercises', entries.length)}
            accessory="chevron" onClick={() => setOpen(isOpen ? null : w.id)} />
          {isOpen && entries.map((e, i) => {
            const l = exerciseLine(e, names, d.unit)
            return <Row key={i} title={l.name} subtitle={l.detail} className="gym-sub" />
          })}
        </div>
      })}
    </Section>

    <Section title={gt('Body weight')} footer={change != null ? gt('{0} {1} in the last 30 days.', (change > 0 ? '+' : '') + fmtNum(Math.round(change * 10) / 10), d.unit) : null}>
      {!weights.length && <Row title={gt('No weigh-ins yet')} />}
      {weights.slice(-8).reverse().map(b => <Row key={b.d} title={fmtDate(b.d, true)} value={fmtNum(b.w) + ' ' + d.unit} />)}
    </Section>

    {lastM && <Section title={gt('Measurements')} footer={gt('Taken {0}.', fmtDate(lastM.d, true, true))}>
      {Object.entries(MEASURE).filter(([k]) => Number.isFinite(lastM[k])).map(([k, label]) =>
        <Row key={k} title={gt(label)} value={k === 'bodyFat' ? fmtNum(lastM[k]) + ' %' : fmtNum(lastM[k]) + ' cm'} />)}
    </Section>}

    {d.routines.length > 0 && <Section title={gt('Their routines')}>
      {d.routines.map(r => <Row key={r.id} title={(r.emoji ? r.emoji + ' ' : '') + r.name} value={gt('{0} exercises', r.count)} />)}
    </Section>}

    <Section footer={gt('Photos, videos and notes are never shared with trainers.')}>
      <Row icon="xmark" iconTint="var(--red)" title={gt('Remove client')} danger onClick={remove} />
    </Section>
  </div>
}
