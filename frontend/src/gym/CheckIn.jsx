import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { Section, Row, Button } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import CameraScan from '../components/CameraScan.jsx'
import { scanCode } from '../lib/scan.js'
import { MOBILE } from '../lib/mobile.js'
import { fmtDate } from '../lib/format.js'
import { gt, gymError, gymMe, checkIn, codeFromScan, visitsThisMonth, gymAvailable, localDay } from './api.js'
import './gym.css'

const time = ts => new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th')

/**
 * Check in at the gym (M3): scan the QR code on the front-desk screen. The phone camera opens
 * this page with the code in the link (…#/gym/checkin?c=CODE) and it checks in at once; inside
 * the app, "Scan the code" does the same.
 */
export default function DeskCheckIn() {
  const nav = useNavigate()
  const loc = useLocation()
  const user = useStore(s => s.user)
  const toast = useUI(s => s.toast)
  const [visits, setVisits] = useState(null)
  const [result, setResult] = useState(null)   // { at, already } | { error }
  const [busy, setBusy] = useState(false)
  const tried = useRef(null)

  const send = code => {
    if (!code) { setResult({ error: gt('That is not the check-in code. Scan the QR code on the screen at the desk.') }); return }
    setBusy(true)
    checkIn(code)
      .then(r => { setResult({ at: r.at, already: r.already }); setVisits(r.visits) })
      .catch(e => setResult({ error: gymError(e), code: e?.data?.code }))
      .finally(() => setBusy(false))
  }

  // From the phone camera: the code is in the link. Once per code, not on every render.
  const linked = new URLSearchParams(loc.search).get('c')
  useEffect(() => {
    if (!gymAvailable(user)) return
    gymMe().then(m => setVisits(v => v || m.visits || [])).catch(() => {})
    // The code is spent once sent: off the address, so a refresh does not send it again.
    if (linked && tried.current !== linked) { tried.current = linked; send(codeFromScan(linked)); nav('/gym/checkin', { replace: true }) }
  }, [user?.id, linked])

  const scan = async () => {
    if (!MOBILE) {
      useUI.getState().openSheet(close => <CameraScan onCancel={close} onFound={code => { close(); send(codeFromScan(code.value)) }} />)
      return
    }
    try {
      const code = await scanCode()
      if (code) send(codeFromScan(code.value))
    } catch (e) { toast(e?.message === 'unsupported' ? gt('This phone cannot scan codes.') : gt('The camera is not available. Allow it in Settings and try again.')) }
  }

  const n = visitsThisMonth(visits || [])
  const recent = [...(visits || [])].reverse().slice(0, 8)
  const ok = result && !result.error

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/home" onClick={() => nav('/home')} aria-label={gt('Home')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{gt('Check in')}</h1><div className="sub">{gt('Scan the code on the screen at the front desk')}</div></div>
    </div>

    {!gymAvailable(user) ? <div className="card small muted">{gt('Sign in to your gym’s account first, then scan the code again.')}</div> : <>
      {ok && <div className="card gym-checked" role="status">
        <span className="gym-checked-i"><Icon name="check" /></span>
        <div>
          <div className="ttl">{result.already ? gt('Already checked in') : gt('You’re checked in')}</div>
          <div className="small muted">{result.already ? gt('At {0}. One visit counts every 3 hours.', time(result.at)) : gt('{0} · your {1} visit this month', time(result.at), ordinal(n))}</div>
        </div>
      </div>}
      {result?.error && <div className="card small" role="alert">{result.error}</div>}

      <Button variant={ok ? 'plain' : 'primary'} icon="qr" disabled={busy} onClick={scan}>{busy ? gt('Checking in…') : gt('Scan the code')}</Button>
      <div style={{ height: 18 }} />

      <Section title={gt('Your visits')} footer={gt('A visit is a check-in at the desk. Your trainer sees your visits too.')}>
        <Row icon="calendar" iconTint="var(--acc)" title={gt('This month')} value={visits ? String(n) : '…'} />
        {recent.map(t => <Row key={t} icon="checkCircle" iconTint="var(--grey)" title={fmtDate(localDay(t), true)} value={time(t)} />)}
      </Section>
    </>}
  </div>
}
