import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useUI } from '../store/useUI.js'
import { Section, Row } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { confirmSheet } from '../sheets.jsx'
import { fmtDate, fmtNum } from '../lib/format.js'
import { EXIDX } from '../lib/exercises.js'
import { gt, getClient, removeClient, removeProgramme, clientLine, agoLabel, isoDaysAgo, localDay, visitsThisMonth, missedInRow } from './api.js'
import { compareWorkout, monthStats } from './adherence.js'
import AssignProgramme, { WEEK } from './AssignProgramme.jsx'
import { TrainerPt } from './PtPackages.jsx'
import { TrainerDiet, TrainerNotes } from './Coaching.jsx'
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

/** What was asked of one exercise: "3 × 8 @ 60 kg", "3 × 6–8", "2 × 45 s". */
export function targetText(t, unit) {
  if (!t) return gt('no target')
  const n = Number(t.sets) || 0
  if (t.mode === 'time' || (Number(t.sec) > 0 && !(Number(t.reps) > 0))) return gt('{0} × {1} s', n, Number(t.sec) || 0)
  const reps = t.repsMin != null && t.repsMax != null && Number(t.repsMin) !== Number(t.repsMax) ? t.repsMin + '–' + t.repsMax : (t.reps ?? t.repsMin ?? 0)
  return Number(t.weight) > 0 ? gt('{0} × {1} @ {2} {3}', n, reps, fmtNum(Number(t.weight)), unit) : gt('{0} × {1}', n, reps)
}

/** What was done: "8, 8, 6 @ 60 kg", or each set's own load when they differ. */
export function doneText(entry, unit) {
  const sets = (Array.isArray(entry?.sets) ? entry.sets : []).filter(s => s && s.done !== false && !s.warmup)
  if (!sets.length) return gt('nothing logged')
  if (sets.every(s => Number(s.sec) > 0 && !(Number(s.r) > 0))) return sets.map(s => s.sec + ' s').join(', ')
  const ws = [...new Set(sets.map(s => Number(s.w) || 0))]
  if (ws.length === 1) return sets.map(s => Number(s.r) || 0).join(', ') + (ws[0] > 0 ? ' @ ' + fmtNum(ws[0]) + ' ' + unit : '')
  return sets.map(s => (Number(s.w) > 0 ? fmtNum(Number(s.w)) + '×' : '') + (Number(s.r) || 0)).join(', ') + ' ' + unit
}

const STATUS = { done: 'on target', partly: 'partly', missed: 'missed', swapped: 'swapped in' }
const dayNames = (week, id) => WEEK.filter(([d]) => [].concat(week?.[d] || []).includes(id)).map(([, l]) => gt(l)).join(', ')

// One client, read-only: what they did, their body weight and measurements.
export default function ClientDetail() {
  const nav = useNavigate()
  const { id } = useParams()
  const toast = useUI(s => s.toast)
  const [d, setD] = useState(null)
  const [err, setErr] = useState(null)
  const [open, setOpen] = useState(null)
  const openSheet = useUI(s => s.openSheet)
  const load = () => getClient(id).then(setD).catch(setErr)
  useEffect(() => { load() }, [id])

  const back = () => nav('/gym/clients')
  const remove = () => confirmSheet({
    title: gt('Remove {0}?', d.client.name),
    message: gt('You stop seeing {0}’s training. Their data stays with them, and they can share with you again by entering your code.', d.client.name),
    confirmText: gt('Remove client'), danger: true,
    onConfirm: () => removeClient(id).then(() => { toast(gt('{0} removed', d.client.name)); back() }).catch(e => toast(e.message)),
  })

  const assign = () => openSheet(close => <AssignProgramme client={d.client} current={d.programme} close={close} onDone={load} />)
  const dropProgramme = () => confirmSheet({
    title: gt('Remove {0}’s programme?', d.client.name),
    message: gt('Its routines and their days leave {0}’s plan. Their workouts stay.', d.client.name),
    confirmText: gt('Remove programme'), danger: true,
    onConfirm: () => removeProgramme(id).then(() => { toast(gt('Programme removed')); load() }).catch(e => toast(e.message)),
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
  const exName = id => cap(names[id] || EXIDX[id]?.n || gt('Exercise'))
  const missed = d.programme ? missedInRow({ programme: { start: d.programme.start, days: Object.keys(d.programme.week || {}) }, recent: d.workouts.map(w => w.d) }) : null
  const lifts = d.lifts || { prs: [], stalls: [] }
  const anyAlert = missed || lifts.prs.length || lifts.stalls.length
  const prog = d.programme
  const month = prog ? monthStats(d.workouts, prog) : null
  const monthName = new Date().toLocaleDateString(undefined, { month: 'long' })
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
      <div className="tile"><div className="l">{gt('Visits this month')}</div><div className="v">{visitsThisMonth(d.visits)}</div></div>
      <div className="tile"><div className="l">{gt('Body weight')}</div><div className="v" style={{ fontSize: '1rem' }}>{lastW ? fmtNum(lastW.w) + ' ' + d.unit : '–'}</div></div>
    </div>

    {anyAlert ? <Section title={gt('Alerts')} footer={gt('A stalled lift: 3 sessions without beating its best (weight × reps, as an estimated one-rep max).')}>
      {missed && <Row icon="warning" iconTint="var(--orange)" title={gt('Missed 2 planned sessions')} subtitle={missed.map(x => fmtDate(x, true)).join(', ') + ' · ' + gt('nothing since')} />}
      {lifts.stalls.map(s => <Row key={'s' + s.id} icon="chartLineSlash" iconTint="var(--orange)" title={gt('{0} stalled', exName(s.id))}
        subtitle={gt('No progress since {0} · best {1} {2} × {3}', fmtDate(s.since, true), fmtNum(s.best.w), d.unit, s.best.r)} />)}
      {lifts.prs.map(p => <Row key={'p' + p.id} icon="trophy" iconTint="var(--green)" title={gt('New PR: {0}', exName(p.id))}
        subtitle={gt('{0} {1} × {2} on {3}', fmtNum(p.w), d.unit, p.r, fmtDate(p.d, true))} />)}
    </Section> : null}

    <TrainerPt client={d.client} pt={d.pt} onChange={r => setD(x => ({ ...x, pt: { packages: r.packages } }))} />

    {prog ? <>
      <Section title={gt('Programme')} footer={gt('Counts from {0}.', fmtDate(prog.start, true, true))}>
        {prog.routines.map(r => <Row key={r.id} icon="calendar" iconTint="var(--acc)" title={(r.emoji ? r.emoji + ' ' : '') + r.name}
          subtitle={dayNames(prog.week, r.id) || gt('no day')} value={gt('{0} exercises', (r.ex || []).length)} />)}
        <Row icon="pencil" title={gt('Change programme')} accessory="chevron" onClick={assign} />
        <Row icon="xmark" iconTint="var(--red)" title={gt('Remove programme')} danger onClick={dropProgramme} />
      </Section>

      <Section title={gt('{0} so far', monthName)}
        footer={gt('Consistency = sessions done ÷ sessions planned. Sets done = prescribed sets done ÷ prescribed. On target = sets at or above the target reps and weight ÷ prescribed.')}>
        <div className="tiles" style={{ padding: '10px 12px 4px' }}>
          <div className="tile"><div className="l">{gt('Consistency')}</div><div className="v">{month.consistency == null ? '–' : month.consistency + ' %'}</div>
            <div className="small muted">{gt('{0} of {1} sessions', month.done, month.planned)}{month.extra ? ' · ' + gt('+{0} extra', month.extra) : ''}</div></div>
          <div className="tile"><div className="l">{gt('Sets done')}</div><div className="v">{month.setCompletion == null ? '–' : month.setCompletion + ' %'}</div>
            <div className="small muted">{gt('{0} of {1}', month.setsDone, month.prescribed)}</div></div>
          <div className="tile"><div className="l">{gt('On target')}</div><div className="v">{month.targetHit == null ? '–' : month.targetHit + ' %'}</div>
            <div className="small muted">{gt('{0} of {1}', month.hit, month.prescribed)}</div></div>
        </div>
        {month.missed.length > 0 && <Row icon="warning" iconTint="var(--orange)" title={gt('Missed {0}', month.missed.length === 1 ? gt('1 planned day') : gt('{0} planned days', month.missed.length))}
          subtitle={month.missed.map(x => fmtDate(x, true)).join(', ')} />}
      </Section>
    </> : <Section footer={gt('Pick routines from your own Plan and the days for each. They land in {0}’s plan, and you see assigned vs done here.', d.client.name)}>
      <Row icon="plusCircle" iconTint="var(--acc)" title={gt('Assign programme')} accessory="chevron" onClick={assign} />
    </Section>}

    <TrainerDiet client={d.client} diet={d.diet} onChange={diet => setD(x => ({ ...x, diet }))} />
    <TrainerNotes client={d.client} notes={d.notes} onChange={notes => setD(x => ({ ...x, notes }))} />

    <Section title={gt('Workouts')} footer={d.workouts.length > 30 ? gt('The latest 30 of {0}.', d.workouts.length) : null}>
      {!d.workouts.length && <Row title={gt('No workouts logged yet')} />}
      {d.workouts.slice(0, 30).map(w => {
        const entries = (Array.isArray(w.entries) ? w.entries : []).filter(e => e && Array.isArray(e.sets))
        const isOpen = open === w.id
        const c = prog ? compareWorkout(w, prog) : null
        return <div key={w.id || w.d}>
          <Row icon="dumbbell" iconTint={c ? 'var(--acc)' : 'var(--grey)'} title={w.name || gt('Workout')}
            subtitle={fmtDate(w.d, true) + ' · ' + (c ? gt('{0} of {1} sets on target', c.hit, c.prescribed) : gt('{0} exercises', entries.length))}
            accessory="chevron" onClick={() => setOpen(isOpen ? null : w.id)} />
          {isOpen && (c
            ? c.rows.map((r, i) => {
              const entry = entries.find(e => String(e.id) === String(r.id))
              const name = exerciseLine(entry || { id: r.id, sets: [] }, names, d.unit).name
              return <Row key={i} title={name} className="gym-sub"
                subtitle={(r.status === 'swapped' ? '' : gt('Target {0}', targetText(r.target, d.unit)) + ' · ') + (r.status === 'missed' ? gt('not done') : gt('Done {0}', doneText(entry, d.unit)))}>
                <span className={'gym-st ' + r.status}>{gt(STATUS[r.status])}</span>
              </Row>
            })
            : entries.map((e, i) => {
              const l = exerciseLine(e, names, d.unit)
              return <Row key={i} title={l.name} subtitle={l.detail} className="gym-sub" />
            }))}
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
