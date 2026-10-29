import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { Section, Row, Button } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { fmtNum } from '../lib/format.js'
import { gt, listClients, clientLine, sortClients, agoLabel, gymAvailable, ATTENTION_DAYS } from './api.js'
import { listConsistency } from './adherence.js'

const weightLabel = c => c.weight ? fmtNum(c.weight.w) + ' ' + c.unit : '–'
const lineSub = c => {
  const pct = listConsistency(c)
  const month = pct != null ? gt('{0} % of plan this month', pct) : gt('{0} in 30 days', c.last30)
  return c.lastWorkout ? gt('Last workout {0} · {1} this week · {2}', agoLabel(c.lastWorkout), c.last7, month)
    : pct != null ? gt('No workouts yet · {0}', month) : gt('No workouts yet')
}

// A trainer's clients: the members who share their training with them, the ones who slipped first.
export default function Clients() {
  const nav = useNavigate()
  const user = useStore(s => s.user)
  const toast = useUI(s => s.toast)
  const [d, setD] = useState(null)
  const [err, setErr] = useState(null)
  const load = () => listClients().then(r => { setD(r); setErr(null) }).catch(e => setErr(e))
  useEffect(() => { if (gymAvailable(user)) load() }, [user?.id])

  const lines = d ? sortClients(d.clients.map(c => clientLine(c))) : []
  const slipping = lines.filter(c => c.attention)
  const copy = () => { navigator.clipboard?.writeText(d.code).catch(() => {}); toast(gt('Code {0} copied', d.code)) }

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/home" onClick={() => nav('/home')} aria-label={gt('Home')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{gt('Your clients')}</h1>
        <div className="sub">{d ? gt('{0} clients · {1} need attention', lines.length, slipping.length) : ' '}</div></div>
      <button className="iconbtn" onClick={load} aria-label={gt('Refresh')}><Icon name="reset" /></button>
    </div>

    {err ? <div className="card small" role="alert">
        {err.status === 403 ? gt('You are not a trainer on this gym’s account. The gym owner can make you one.') : err.message}
        {err.status !== 403 && <> <Button size="sm" icon="reset" onClick={load}>{gt('Try again')}</Button></>}
      </div>
      : !d ? <div className="card small muted">{gt('Loading…')}</div>
      : <>
        <Section footer={gt('Members enter this code under Settings → My trainer to share their training with you.')}>
          <Row icon="key" iconTint="var(--acc)" title={gt('Your trainer code')} value={d.code} onClick={copy} />
        </Section>

        {!lines.length && <div className="card small muted">{gt('No clients yet. Give your members your code {0}.', d.code)}</div>}

        {slipping.length > 0 && <Section title={gt('Need attention')} footer={gt('No workout in the last {0} days.', ATTENTION_DAYS)}>
          {slipping.map(c => <Row key={c.id} icon="warning" iconTint="var(--orange)" title={c.name} subtitle={lineSub(c)} value={weightLabel(c)} accessory="chevron" onClick={() => nav('/gym/clients/' + encodeURIComponent(c.id))} />)}
        </Section>}

        {lines.length > slipping.length && <Section title={gt('On track')}>
          {lines.filter(c => !c.attention).map(c => <Row key={c.id} icon="person" iconTint="var(--acc)" title={c.name} subtitle={lineSub(c)} value={weightLabel(c)} accessory="chevron" onClick={() => nav('/gym/clients/' + encodeURIComponent(c.id))} />)}
        </Section>}
      </>}
  </div>
}
