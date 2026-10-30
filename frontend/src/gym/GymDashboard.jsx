import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUI } from '../store/useUI.js'
import { Section, Row, Segmented, TextField } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { confirmSheet } from '../sheets.jsx'
import { fmtDate, fmtNum } from '../lib/format.js'
import { gt, gymDashboard, gymError, keepSession, undoSession, isoDaysAgo, localDay, clientLine, agoLabel } from './api.js'
import { STATUSES, statusOf, lastActive, isMember, trainerStats, visitsByDay, busyHours, levels, waLink, waText, DAYS, HOURS } from './dashboard.js'
import { PhoneSheet } from './Phone.jsx'
import { gymBrand } from './brand-live.js'
import './gym.css'

const TABS = [['today', 'Today'], ['members', 'Members'], ['trainers', 'Trainers'], ['checkins', 'Check-ins']]
const time = ts => new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
const hourLabel = h => new Date(2026, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' })
const hourMinute = h => new Date(2026, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
const slot = h => hourMinute(h) + '–' + hourMinute(h + 1)
const STATUS_LABEL = Object.fromEntries(STATUSES.map(s => [s.key, s.label]))
const keepTab = v => { try { sessionStorage.setItem('gym-dash-tab', v) } catch { /* private mode */ } }
const savedTab = () => { try { return sessionStorage.getItem('gym-dash-tab') || 'today' } catch { return 'today' } }

/** Everything the tabs show, counted once per answer on this device's calendar. */
function view(d, today) {
  const byId = Object.fromEntries(d.members.map(m => [m.id, m]))
  const members = d.members.filter(isMember).map(m => ({ ...m, status: statusOf(m, today), last: lastActive(m) }))
  const todayIso = isoDaysAgo(0, today)
  return {
    byId, members,
    live: d.members.filter(m => m.live),
    here: [...d.today].sort((a, b) => b.at - a.at),
    ptToday: d.sessions.filter(s => s.d === todayIso).length,
    trainers: d.trainers.map(t => ({ ...t, stats: trainerStats(t, byId, d.sessions, today) })),
  }
}

function Tile({ label, value, sub, tone }) {
  return <div className="tile"><div className="l">{label}</div><div className="v" style={tone ? { color: tone } : null}>{value}</div>{sub && <div className="small muted">{sub}</div>}</div>
}

/* ---------- Today ---------- */

function Today({ d, v, reload, go }) {
  const toast = useUI(s => s.toast)
  const keep = s => keepSession(s.id).then(() => { toast(gt('Session kept')); reload() }).catch(e => toast(gymError(e)))
  const remove = s => confirmSheet({
    title: gt('Remove the session on {0}?', fmtDate(s.d, true)),
    message: gt('{0} gets the session back on their package. The trainer sees it is gone.', s.memberName),
    confirmText: gt('Remove session'), danger: true,
    onConfirm: () => undoSession(s.id).then(() => { toast(gt('Session removed')); reload() }).catch(e => toast(gymError(e))),
  })
  const count = k => v.members.filter(m => m.status === k).length
  const unique = new Set(v.here.map(x => x.m)).size
  return <>
    <div className="tiles" style={{ marginBottom: 12 }}>
      <Tile label={gt('Checked in today')} value={unique} />
      <Tile label={gt('Training now')} value={v.live.length} tone={v.live.length ? 'var(--acc)' : null} />
      <Tile label={gt('PT sessions today')} value={v.ptToday} />
      <Tile label={gt('Flagged sessions')} value={d.flagged.length} tone={d.flagged.length ? 'var(--red)' : null} />
    </div>

    {d.flagged.length > 0 && <Section title={gt('Flagged PT sessions')} footer={gt('The member says the session wasn’t theirs. Keep it if it happened, or remove it to give the session back.')}>
      {d.flagged.map(s => <Row key={s.id} icon="flag" iconTint="var(--red)" title={s.memberName}
        subtitle={gt('{0} · counted by {1}', fmtDate(s.d, true), s.by?.name || gt('a trainer'))}>
        <span className="gym-acts">
          <button type="button" className="gym-act" onClick={() => keep(s)}>{gt('Keep')}</button>
          <button type="button" className="gym-act danger" onClick={() => remove(s)}>{gt('Remove')}</button>
        </span>
      </Row>)}
    </Section>}

    <Section title={gt('Training now')}>
      {!v.live.length && <Row title={gt('Nobody is in a workout right now')} />}
      {v.live.map(m => <Row key={m.id} icon="dumbbell" iconTint="var(--acc)" title={m.name}
        subtitle={(m.live.name || gt('Workout')) + (m.live.startedAt ? ' · ' + gt('since {0}', time(m.live.startedAt)) : '')} />)}
    </Section>

    <Section title={gt('Checked in today')} footer={v.here.length > 12 ? gt('The latest 12 of {0}.', v.here.length) : null}>
      {!v.here.length && <Row title={gt('No check-ins yet today')} />}
      {v.here.slice(0, 12).map(x => <Row key={x.m + x.at} icon="qr" iconTint="var(--grey)" title={v.byId[x.m]?.name || gt('A member')} value={time(x.at)} />)}
    </Section>

    <Section title={gt('Worth a message')} footer={gt('Members who stopped coming. The Members tab has a WhatsApp button for each.')}>
      <Row icon="warning" iconTint="var(--orange)" title={gt('Slipping')} subtitle={gt('8 to 14 days since their last visit or workout')} value={String(count('slipping'))} accessory="chevron" onClick={() => go('members', 'slipping')} />
      <Row icon="warning" iconTint="var(--red)" title={gt('At risk')} subtitle={gt('15 to 30 days')} value={String(count('at-risk'))} accessory="chevron" onClick={() => go('members', 'at-risk')} />
    </Section>
  </>
}

/* ---------- Members ---------- */

function memberLine(m, today) {
  const parts = [m.last ? gt('Last here {0}', agoLabel(m.last, today)) : gt('Never came')]
  parts.push(m.trainer ? m.trainer.name : gt('no trainer'))
  if (m.pt?.live) parts.push(gt('PT {0} left', m.pt.left))
  return parts.join(' · ')
}

function Members({ v, filter, setFilter, today, onPhone }) {
  const [q, setQ] = useState('')
  const [all, setAll] = useState(false)
  const counts = Object.fromEntries(STATUSES.map(s => [s.key, v.members.filter(m => m.status === s.key).length]))
  const needle = q.trim().toLowerCase()
  const list = v.members
    .filter(m => (filter === 'all' || m.status === filter) && (!needle || String(m.name).toLowerCase().includes(needle)))
    .sort((a, b) => String(a.last || '').localeCompare(String(b.last || '')) * (filter === 'active' ? -1 : 1) || String(a.name).localeCompare(String(b.name)))
  const shown = all ? list : list.slice(0, 60)
  return <>
    <div className="gym-days gym-filter" role="group" aria-label={gt('Show members')}>
      {[...STATUSES.map(s => [s.key, gt(s.label), counts[s.key]]), ['all', gt('All'), v.members.length]].map(([k, l, n]) =>
        <button key={k} type="button" className={'gym-day' + (filter === k ? ' on' : '')} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l} <b>{n}</b></button>)}
    </div>
    <div className="lrow gym-search"><Icon name="magnifier" style={{ color: 'var(--label-3)', marginInlineEnd: 10 }} />
      <TextField value={q} onChange={e => setQ(e.target.value)} placeholder={gt('Search members')} aria-label={gt('Search members')} style={{ flex: 1 }} /></div>

    <Section footer={gt('Active = a visit or workout in the last 7 days · Slipping 8–14 days · At risk 15–30 · Lost over 30. The owner, admins and trainers are not counted.')}>
      {!list.length && <Row title={needle ? gt('Nobody by that name here') : gt('Nobody in this group')} />}
      {shown.map(m => {
        const b = gymBrand()
        const wa = waLink(m.phone, waText(m, today, b?.name), b?.cc)
        return <Row key={m.id} icon="person" iconTint={m.status === 'active' ? 'var(--acc)' : m.status === 'slipping' ? 'var(--orange)' : m.status === 'at-risk' ? 'var(--red)' : 'var(--grey)'}
          title={<>{m.name} {filter === 'all' && <span className={'gym-st ' + m.status}>{gt(STATUS_LABEL[m.status])}</span>}</>} subtitle={memberLine(m, today)}>
          {wa ? <a className="gym-act wa" href={wa} target="_blank" rel="noopener noreferrer">{gt('WhatsApp')}</a>
            : <button type="button" className="gym-act" onClick={() => onPhone(m)}>{gt('Add phone')}</button>}
        </Row>
      })}
      {list.length > shown.length && <Row icon="list" title={gt('Show all {0}', list.length)} onClick={() => setAll(true)} />}
    </Section>
  </>
}

/* ---------- Trainers ---------- */

function Trainers({ v, today }) {
  const [open, setOpen] = useState(null)
  const month = today.toLocaleDateString(undefined, { month: 'long' })
  if (!v.trainers.length) return <div className="card small muted">{gt('No trainers yet. Make one on the admin page: open a user and tap “Make trainer”.')}</div>
  return <Section footer={gt('Consistency = the average of their clients’ sessions done ÷ planned this month (clients with a programme). Retention = last month’s clients who are still theirs and Active or Slipping.')}>
    {v.trainers.map(t => {
      const s = t.stats, isOpen = open === t.id
      return <div key={t.id}>
        <Row icon="person" iconTint="var(--acc)" title={<>{t.name} <span className="gym-code">{t.code}</span></>}
          subtitle={[s.clients === 1 ? gt('1 client') : gt('{0} clients', s.clients), s.ptMonth === 1 ? gt('1 PT session in {0}', month) : gt('{0} PT sessions in {1}', s.ptMonth, month),
            s.attention ? gt('{0} need attention', s.attention) : null].filter(Boolean).join(' · ')}
          value={s.retention ? gt('{0} % kept', s.retention.pct) : null} accessory="chevron" onClick={() => setOpen(isOpen ? null : t.id)} />
        {isOpen && <>
          <div className="tiles" style={{ padding: '6px 12px 4px' }}>
            <Tile label={gt('Clients')} value={s.clients} />
            <Tile label={gt('PT in {0}', month)} value={s.ptMonth} />
            <Tile label={gt('Consistency')} value={s.consistency == null ? '–' : s.consistency + ' %'} />
            <Tile label={gt('Retention')} value={s.retention ? s.retention.pct + ' %' : '–'} sub={s.retention ? gt('{0} of {1} kept', s.retention.kept, s.retention.of) : gt('no clients last month')} />
          </div>
          {s.lines.map(c => {
            const st = statusOf(c, today), last = lastActive(c)
            return <Row key={c.id} className="gym-sub" title={c.name}
              subtitle={[last ? gt('Last here {0}', agoLabel(last, today)) : gt('Never came'), ...c.alerts.map(a => a.text)].join(' · ')}>
              <span className={'gym-st ' + st}>{gt(STATUS_LABEL[st])}</span>
            </Row>
          })}
        </>}
      </div>
    })}
  </Section>
}

/* ---------- Check-ins ---------- */

function CheckIns({ d, today }) {
  const days = visitsByDay(d.checkins, today)
  const busy = busyHours(d.checkins, today)
  const [pick, setPick] = useState(null)
  const max = Math.max(1, ...days.map(x => x.n))
  const week = days.slice(-7).reduce((a, x) => a + x.n, 0)
  const monthFrom = isoDaysAgo(0, new Date(today.getFullYear(), today.getMonth(), 1))
  const month = d.checkins.filter(t => localDay(t) >= monthFrom).length
  const avg = Math.round((days.slice(0, -1).reduce((a, x) => a + x.n, 0) / 29) * 10) / 10
  const top = days.reduce((a, x) => (x.n > a.n ? x : a), days[0])
  const level = levels(busy.grid.flat())
  const shown = pick ?? { kind: 'day', ...days[days.length - 1] }
  return <>
    <div className="tiles" style={{ marginBottom: 12 }}>
      <Tile label={gt('Today')} value={days[days.length - 1].n} />
      <Tile label={gt('Last 7 days')} value={week} />
      <Tile label={gt('This month')} value={month} />
      <Tile label={gt('Average a day')} value={fmtNum(avg)} sub={gt('last 30 days')} />
    </div>

    <Section title={gt('Visits per day')} footer={gt('Check-ins at the desk, the last 30 days. One visit per member every 3 hours. Tap a bar.')}>
      <div className="gym-chart" role="img" aria-label={gt('Visits per day, last 30 days: most {0} on {1}', top.n, fmtDate(top.d, true))}>
        <div className="gym-bars">
          {days.map(x => <button key={x.d} type="button" className={'gym-bar-col' + (shown.kind === 'day' && shown.d === x.d ? ' on' : '')}
            aria-label={gt('{0}: {1} visits', fmtDate(x.d, true), x.n)} onClick={() => setPick({ kind: 'day', ...x })}>
            {x === top && x.n > 0 && <span className="gym-bar-top">{x.n}</span>}
            <span className="gym-bar-fill" style={{ height: Math.max(x.n ? 4 : 0, Math.round((x.n / max) * 100)) + '%' }} />
          </button>)}
        </div>
        <div className="gym-axis"><span>{fmtDate(days[0].d)}</span><span>{fmtDate(days[15].d)}</span><span>{gt('today')}</span></div>
      </div>
      {shown.kind === 'day' && <Row title={fmtDate(shown.d, true)} value={shown.n === 1 ? gt('1 visit') : gt('{0} visits', shown.n)} />}
    </Section>

    <Section title={gt('Busy hours')}
      footer={busy.busiest ? gt('Average visits per hour over the last 4 weeks. Busiest: {0} {1}, {2} visits on average. Tap a square.', gt(DAYS[busy.busiest.day]), slot(busy.busiest.hour), fmtNum(busy.busiest.avg))
        : gt('Average visits per hour over the last 4 weeks. Nothing yet.')}>
      <div className="gym-hm" role="img" aria-label={gt('Busy hours by weekday')}>
        <div className="gym-hm-row gym-hm-head"><span />{HOURS.map(h => <span key={h}>{h % 3 === 0 ? hourLabel(h) : ''}</span>)}</div>
        {busy.grid.map((row, r) => <div key={r} className="gym-hm-row">
          <span>{gt(DAYS[r])}</span>
          {row.map((x, c) => <button key={c} type="button" className={'hm-c l' + level(x) + (pick?.kind === 'hour' && pick.r === r && pick.c === c ? ' today' : '')}
            aria-label={gt('{0} {1}: {2} visits on average', gt(DAYS[r]), slot(HOURS[c]), fmtNum(x))} onClick={() => setPick({ kind: 'hour', r, c, x })} />)}
        </div>)}
        <div className="hm-legend">{gt('fewer')}{[0, 1, 2, 3, 4].map(l => <span key={l} className={'hm-c l' + l} />)}{gt('more')}</div>
      </div>
      {pick?.kind === 'hour' && <Row title={gt('{0}, {1}', gt(DAYS[pick.r]), slot(HOURS[pick.c]))} value={gt('{0} on average', fmtNum(pick.x))} />}
    </Section>
  </>
}

/**
 * The owner's Gym screen (M4), for the owner and the front desk (admins): today at the gym, every
 * member's status with a WhatsApp message, the trainers' month, and the check-ins.
 */
export default function GymDashboard() {
  const nav = useNavigate()
  const openSheet = useUI(s => s.openSheet)
  const [tab, setTab] = useState(savedTab)
  const [filter, setFilter] = useState('slipping')
  const [d, setD] = useState(null)
  const [err, setErr] = useState(null)
  const load = (fresh = false) => gymDashboard(fresh).then(r => { setD(r); setErr(null) }).catch(setErr)
  useEffect(() => { load() }, [])
  const today = new Date()
  const v = useMemo(() => (d ? view(d, today) : null), [d])
  const pickTab = t => { setTab(t); keepTab(t) }
  const go = (t, f) => { if (f) setFilter(f); pickTab(t) }
  const onPhone = m => openSheet(close => <PhoneSheet member={m} phone={m.phone} close={close}
    onDone={phone => setD(x => ({ ...x, members: x.members.map(y => (y.id === m.id ? { ...y, phone } : y)) }))} />)

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/home" onClick={() => nav('/home')} aria-label={gt('Home')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{gt('Gym')}</h1>
        <div className="sub">{v ? gt('{0} · {1} members', fmtDate(isoDaysAgo(0, today), true), v.members.length) : ' '}</div></div>
      <button className="iconbtn" onClick={() => load(true)} aria-label={gt('Refresh')}><Icon name="reset" /></button>
      <button className="iconbtn" style={{ marginInlineStart: 8 }} onClick={() => nav('/gym/settings')} aria-label={gt('Gym settings')}><Icon name="gear" /></button>
    </div>
    <Segmented className="gym-tabs" options={TABS.map(([value, label]) => ({ value, label: gt(label) }))} value={tab} onChange={pickTab} />
    <div style={{ height: 14 }} />

    {err ? <div className="card small" role="alert">{err.status === 403 ? gt('The Gym screen is for the owner and admins.') : err.message}</div>
      : !v ? <div className="card small muted">{gt('Loading…')}</div>
      : tab === 'members' ? <Members v={v} filter={filter} setFilter={setFilter} today={today} onPhone={onPhone} />
      : tab === 'trainers' ? <Trainers v={v} today={today} />
      : tab === 'checkins' ? <CheckIns d={d} today={today} />
      : <Today d={d} v={v} reload={() => load(true)} go={go} />}
  </div>
}
