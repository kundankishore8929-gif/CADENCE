import { useEffect, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { Section, Row, TextField, Button } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { confirmSheet } from '../sheets.jsx'
import { fmtDate } from '../lib/format.js'
import {
  gt, gymError, addPackage, removePackage, countSession, undoSession, flagSession, keepSession, adminPt,
  currentPackage, packageLine, isoDaysAgo, localDay, onThisCalendar,
} from './api.js'
import { PhoneSheet } from './Phone.jsx'
import './gym.css'

// PT session packages (M3, api/gym/pt.js): what the trainer, the member and the front desk see.
// Counts only: a package is a number of sessions between two dates, never money.

const day = d => fmtDate(d, true)
const hm = ts => new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
/** When something happened: the time alone on the session's own day, else the day and time. */
const when = (ts, sameDay) => { const d = localDay(ts); return !d ? '–' : d === sameDay ? hm(ts) : fmtDate(d, true) + ', ' + hm(ts) }
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return isoDaysAgo(0, x) }
const SIZES = [8, 12, 24]
const VALIDITY = [[30, '30 days'], [60, '60 days'], [90, '90 days'], [0, 'Never']]

/** The used part of a package as a bar. */
function Bar({ p }) {
  const pct = Math.min(100, Math.round((p.used / p.total) * 100))
  return <div className="gym-bar" role="progressbar" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.used}
    aria-label={gt('{0} of {1} sessions used', p.used, p.total)}><span style={{ width: pct + '%' }} /></div>
}

/** How a flagged session stands. */
const flagText = s => (s.kept ? gt('Flagged, checked by the front desk') : gt('Flagged: “this wasn’t me”'))

/**
 * The sheet that adds a package: how many sessions, from when, until when, and a note
 * ("paid cash", "October offer"). The trainer's and the front desk's alike.
 */
export function AddPackage({ member, close, onDone }) {
  const toast = useUI(s => s.toast)
  const [total, setTotal] = useState('12')
  const [start, setStart] = useState(isoDaysAgo(0))
  const [valid, setValid] = useState(30)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const n = Number(total)
  const ok = Number.isInteger(n) && n >= 1 && n <= 200 && !!start
  const expires = valid ? addDays(start, valid) : null
  const save = () => {
    setBusy(true)
    addPackage(member.id, { total: n, start, expires, note: note.trim() })
      .then(r => { toast(gt('{0} sessions added for {1}', n, member.name)); onDone?.(r); close() })
      .catch(e => toast(gymError(e)))
      .finally(() => setBusy(false))
  }
  return <>
    <h3 style={{ marginTop: 0 }}>{gt('PT package for {0}', member.name)}</h3>
    <div className="small muted" style={{ marginBottom: 12 }}>{gt('Sessions only, no payments. Each “Session done” counts one.')}</div>

    <Section title={gt('Sessions')}>
      <div className="gym-days" role="group" aria-label={gt('Sessions')}>
        {SIZES.map(x => <button key={x} type="button" className={'gym-day' + (n === x ? ' on' : '')} aria-pressed={n === x} onClick={() => setTotal(String(x))}>{x}</button>)}
        <input type="number" inputMode="numeric" min={1} max={200} className={'gym-day gym-num' + (total && !SIZES.includes(n) ? ' on' : '')}
          value={SIZES.includes(n) ? '' : total} placeholder={gt('Other')} onChange={e => setTotal(e.target.value)} aria-label={gt('Other number of sessions')} />
      </div>
    </Section>

    <Section title={gt('Starts')}>
      <div className="lrow"><Icon name="calendar" style={{ color: 'var(--acc)', marginInlineEnd: 10 }} />
        <TextField type="date" value={start} onChange={e => setStart(e.target.value)} aria-label={gt('Start date')} style={{ flex: 1 }} /></div>
    </Section>

    <Section title={gt('Valid for')} footer={expires ? gt('Sessions after {0} no longer count.', fmtDate(expires, true, true)) : gt('The package never expires.')}>
      <div className="gym-days" role="group" aria-label={gt('Valid for')}>
        {VALIDITY.map(([v, l]) => <button key={v} type="button" className={'gym-day' + (valid === v ? ' on' : '')} aria-pressed={valid === v} onClick={() => setValid(v)}>{gt(l)}</button>)}
      </div>
    </Section>

    <Section title={gt('Note')}>
      <div className="lrow"><TextField value={note} onChange={e => setNote(e.target.value)} maxLength={120} placeholder={gt('Optional, e.g. paid at the desk')}
        aria-label={gt('Note')} style={{ flex: 1 }} /></div>
    </Section>

    <Button variant="primary" disabled={!ok || busy} onClick={save}>{busy ? gt('Adding…') : gt('Add {0} sessions', ok ? n : '')}</Button>
    <div style={{ height: 8 }} />
    <Button onClick={close}>{gt('Cancel')}</Button>
  </>
}

/** The trainer's "Session done" for a day other than today. */
function OtherDay({ client, close, count }) {
  const [d, setD] = useState(isoDaysAgo(1))
  return <>
    <h3 style={{ marginTop: 0 }}>{gt('Session with {0} on…', client.name)}</h3>
    <Section footer={gt('For a session you forgot to count. {0} is told and can flag it.', client.name)}>
      <div className="lrow"><Icon name="calendar" style={{ color: 'var(--acc)', marginInlineEnd: 10 }} />
        <TextField type="date" value={d} max={isoDaysAgo(0)} onChange={e => setD(e.target.value)} aria-label={gt('Session date')} style={{ flex: 1 }} /></div>
    </Section>
    <Button variant="primary" disabled={!d} onClick={() => { close(); count(d) }}>{gt('Count session')}</Button>
    <div style={{ height: 8 }} />
    <Button onClick={close}>{gt('Cancel')}</Button>
  </>
}

/** One package's sessions, newest first, with what this viewer can do to each. */
function Sessions({ p, act, limit = 6 }) {
  const [all, setAll] = useState(false)
  if (!p.sessions.length) return null
  const shown = all ? p.sessions : p.sessions.slice(0, limit)
  return <>
    {shown.map(s => {
      const a = act(s)
      return <Row key={s.id} icon={s.flagged ? 'flag' : 'checkCircle'} iconTint={s.flagged && !s.kept ? 'var(--red)' : 'var(--acc)'}
        title={day(s.d)} subtitle={(s.flagged ? flagText(s) : gt('Counted by {0}', s.by?.name || gt('a trainer'))) + ' · ' + when(s.at, s.d)}>
        {a && <button type="button" className={'gym-act' + (a.danger ? ' danger' : '')} onClick={a.run}>{a.label}</button>}
      </Row>
    })}
    {p.sessions.length > shown.length && <Row icon="list" title={gt('Show all {0} sessions', p.sessions.length)} onClick={() => setAll(true)} />}
  </>
}

const isLive = p => p.state === 'active' || p.state === 'upcoming'

/** Earlier packages, one line each. */
function History({ packages, current }) {
  const old = packages.filter(p => p !== current && !isLive(p)).reverse()
  if (!old.length) return null
  return <Section title={gt('Earlier packages')}>
    {old.map(p => <Row key={p.id} icon="history" iconTint="var(--grey)" title={gt('{0} sessions from {1}', p.total, day(p.start))} subtitle={packageLine(p, day)} />)}
  </Section>
}

/** The packages after the current one ("Next: 12 sessions from 5 Nov"). */
const nextOf = (packages, current) => packages.filter(p => p !== current && isLive(p))

/**
 * A client's PT on the trainer's client page: the package, "Session done" (today in one tap, or
 * another day), the sessions with Undo for 24 hours, and adding the next package.
 */
export function TrainerPt({ client, pt, onChange }) {
  const toast = useUI(s => s.toast)
  const openSheet = useUI(s => s.openSheet)
  const [busy, setBusy] = useState(false)
  const packages = onThisCalendar(pt?.packages)
  const p = currentPackage(packages)
  const live = p && isLive(p)

  const done = r => { onChange(r); const c = currentPackage(r.packages); toast(gt('Session counted · {0} left', c ? c.left : 0)) }
  const count = d => {
    setBusy(true)
    countSession(client.id, d)
      .then(done)
      .catch(e => {
        if (e?.data?.code !== 'same-day') return toast(gymError(e))
        confirmSheet({
          title: gt('Count a second session?'),
          message: gt('A session with {0} is already counted on {1}.', client.name, fmtDate(d, true, true)),
          confirmText: gt('Count another'),
          onConfirm: () => countSession(client.id, d, true).then(done).catch(e2 => toast(gymError(e2))),
        })
      })
      .finally(() => setBusy(false))
  }
  const add = () => openSheet(close => <AddPackage member={client} close={close} onDone={onChange} />)
  const undo = s => confirmSheet({
    title: gt('Undo the session on {0}?', day(s.d)),
    message: gt('It no longer counts against {0}’s package.', client.name),
    confirmText: gt('Undo session'), danger: true,
    onConfirm: () => undoSession(s.id).then(r => { onChange(r); toast(gt('Session taken back')) }).catch(e => toast(gymError(e))),
  })
  const remove = () => confirmSheet({
    title: gt('Remove this package?'),
    message: gt('For a package added by mistake. Nothing is counted on it yet.'),
    confirmText: gt('Remove package'), danger: true,
    onConfirm: () => removePackage(p.id).then(r => { onChange(r); toast(gt('Package removed')) }).catch(e => toast(gymError(e))),
  })

  if (!p) return <Section title={gt('PT sessions')} footer={gt('Add the sessions {0} bought. Each “Session done” counts one, and {0} sees every count.', client.name)}>
    <Row icon="plusCircle" iconTint="var(--acc)" title={gt('Add PT package')} accessory="chevron" onClick={add} />
  </Section>

  const next = nextOf(packages, p)
  const flagged = p.sessions.filter(s => s.flagged && !s.kept).length
  return <>
    <Section title={gt('PT sessions')}
      footer={live ? gt('{0} gets a notification for each session and can flag one within 48 hours. You can undo your own count for 24 hours.', client.name) : null}>
      <Row icon="stopwatch" iconTint={live ? 'var(--acc)' : 'var(--grey)'} title={packageLine(p, day)}
        subtitle={(p.note ? p.note + ' · ' : '') + gt('{0} sessions from {1}', p.total, day(p.start))} />
      <div style={{ padding: '0 16px 12px' }}><Bar p={p} /></div>
      {flagged > 0 && <Row icon="flag" iconTint="var(--red)" title={flagged === 1 ? gt('1 session flagged by {0}', client.name) : gt('{0} sessions flagged by {1}', flagged, client.name)}
        subtitle={gt('The front desk checks flagged sessions.')} />}
      {p.state === 'active' && <div style={{ padding: '4px 12px 12px', display: 'flex', gap: 8 }}>
        <Button variant="primary" disabled={busy} onClick={() => count(isoDaysAgo(0))} style={{ flex: 1 }}>{gt('Session done')}</Button>
        <Button disabled={busy} onClick={() => openSheet(close => <OtherDay client={client} close={close} count={count} />)} style={{ flex: 1 }}>{gt('Other day…')}</Button>
      </div>}
      <Sessions p={p} act={s => (s.canUndo ? { label: gt('Undo'), run: () => undo(s) } : null)} />
      {!p.sessions.length && <Row icon="xmark" iconTint="var(--red)" title={gt('Remove package')} danger onClick={remove} />}
    </Section>

    {next.map(n => <Section key={n.id} title={gt('Next package')}>
      <Row icon="stopwatch" iconTint="var(--grey)" title={packageLine(n, day)} subtitle={n.note || null} />
    </Section>)}

    <Section>
      <Row icon="plusCircle" iconTint="var(--acc)" title={live ? gt('Add next package') : gt('Add new package')} accessory="chevron" onClick={add} />
    </Section>
    <History packages={packages} current={p} />
  </>
}

/**
 * The member's PT in My trainer: sessions left, every session counted, and "Not me" on one
 * counted in the last 48 hours.
 */
export function MemberPt({ pt, onChange }) {
  const toast = useUI(s => s.toast)
  const packages = onThisCalendar(pt?.packages)
  const p = currentPackage(packages)
  if (!p) return null
  const flag = s => confirmSheet({
    title: gt('Flag the session on {0}?', day(s.d)),
    message: gt('{0} and the front desk see that you say this session wasn’t yours. It stays counted until the front desk checks it.', s.by?.name || gt('Your trainer')),
    confirmText: gt('This wasn’t me'), danger: true,
    onConfirm: () => flagSession(s.id).then(r => { onChange(r); toast(gt('Session flagged')) }).catch(e => toast(gymError(e))),
  })
  const next = nextOf(packages, p)
  return <>
    <Section title={gt('PT sessions')} footer={gt('Your trainer counts each session. If one is not yours, tap “Not me” within 48 hours.')}>
      <Row icon="stopwatch" iconTint={isLive(p) ? 'var(--acc)' : 'var(--grey)'} title={packageLine(p, day)}
        subtitle={gt('{0} sessions from {1}', p.total, day(p.start)) + (p.trainer?.name ? ' · ' + gt('with {0}', p.trainer.name) : '')} />
      <div style={{ padding: '0 16px 12px' }}><Bar p={p} /></div>
      <Sessions p={p} act={s => (s.canFlag ? { label: gt('Not me'), danger: true, run: () => flag(s) } : null)} />
      {!p.sessions.length && <Row title={gt('No sessions counted yet')} />}
    </Section>
    {next.map(n => <Section key={n.id} title={gt('Next package')}><Row icon="stopwatch" iconTint="var(--grey)" title={packageLine(n, day)} /></Section>)}
    <History packages={packages} current={p} />
  </>
}

/**
 * The front desk's PT controls in a member's admin sheet (English only, like the rest of that
 * page): the package, flagged sessions to keep or remove, and adding a package.
 */
export function AdminPt({ user }) {
  const toast = useUI(s => s.toast)
  const openSheet = useUI(s => s.openSheet)
  const [data, setData] = useState(null)
  useEffect(() => { adminPt(user.id).then(setData).catch(() => setData(null)) }, [user.id])
  const onChange = r => setData(d => ({ ...d, packages: r.packages }))
  if (!data || user.disabled) return null
  const phone = () => openSheet(close => <PhoneSheet member={user} phone={data.phone} close={close} onDone={p => setData(d => ({ ...d, phone: p }))} />)
  const packages = onThisCalendar(data.packages)
  const p = currentPackage(packages)
  const flagged = packages.flatMap(x => x.sessions).filter(s => s.flagged && !s.kept)
  const add = () => openSheet(close => <AddPackage member={user} close={close} onDone={onChange} />)
  const keep = s => keepSession(s.id).then(r => { onChange(r); toast('Session kept') }).catch(e => toast(gymError(e)))
  const remove = s => confirmSheet({
    title: 'Remove the session on ' + day(s.d) + '?',
    message: user.name + ' gets the session back on their package. The trainer sees it is gone.',
    confirmText: 'Remove session', danger: true,
    onConfirm: () => undoSession(s.id).then(r => { onChange(r); toast('Session removed') }).catch(e => toast(gymError(e))),
  })
  return <>
    <div className="row" style={{ gap: 6, flexWrap: 'wrap', margin: '12px 0 8px' }}>
      {p ? <span className={'adm-pill ' + (isLive(p) ? 'acc' : '')}>PT {packageLine(p, day)}</span> : <span className="adm-pill">no PT package</span>}
      {data.trainer && <span className="adm-pill">trainer {data.trainer.name}</span>}
      {flagged.length > 0 && <span className="adm-pill bad">{flagged.length} flagged</span>}
    </div>
    {flagged.map(s => <div key={s.id} className="row between" style={{ padding: '8px 2px', borderBottom: 'var(--hair) solid var(--sep)', gap: 8 }}>
      <div><div className="small" style={{ fontWeight: 600 }}>{day(s.d)} · counted by {s.by?.name || 'a trainer'}</div>
        <div className="dim" style={{ fontSize: '.72rem' }}>{user.name} says this wasn’t them · {when(s.flaggedAt)}</div></div>
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="gym-act" onClick={() => keep(s)}>Keep</button>
        <button type="button" className="gym-act danger" onClick={() => remove(s)}>Remove</button>
      </div>
    </div>)}
    <div className="row between" style={{ padding: '8px 2px', borderBottom: 'var(--hair) solid var(--sep)', gap: 8 }}>
      <div><div className="small" style={{ fontWeight: 600 }}>Phone (WhatsApp)</div>
        <div className="dim" style={{ fontSize: '.72rem' }}>{data.phone || 'none yet'} · seen by admins only, never by trainers</div></div>
      <button type="button" className="gym-act" onClick={phone}>{data.phone ? 'Change' : 'Add'}</button>
    </div>
    <button className="btn" style={{ margin: '12px 0 4px' }} onClick={add}>{p && isLive(p) ? 'Add next PT package' : 'Add PT package'}</button>
    <div className="adm-hint">Sessions only, no payments. The member’s trainer counts each session; the member can flag one within 48 hours, and flags show here.</div>
  </>
}
