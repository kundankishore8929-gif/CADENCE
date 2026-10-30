import { useEffect, useRef, useState } from 'react'
import { renderQrToCanvas } from '../lib/qr.js'
import { hideBoot } from '../lib/boot.js'
import { BRAND } from './brand.js'
import { useGymBrand, gymName } from './brand-live.js'
import { gt, deskCode, checkinUrl } from './api.js'
import './gym.css'

/** The key in a desk link (…#/desk?k=KEY), or null. */
export const deskKeyFrom = hash => new URLSearchParams(String(hash || '').split('?')[1] || '').get('k')
const midnight = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() }
const clock = t => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

/**
 * The front-desk screen (M3): a tablet or laptop at reception, signed in to nobody. The desk
 * link's key fetches the check-in code, which changes every 30 seconds (api/gym/desk.js), and
 * today's count. main.jsx shows this instead of the app for a #/desk link, so no account,
 * sync or tab bar ever runs on the reception screen.
 */
export default function Desk({ hash = location.hash }) {
  const key = deskKeyFrom(hash)
  const canvas = useRef(null)
  const [d, setD] = useState(null)                      // { code, msLeft, windowMs, today, got }
  const [state, setState] = useState(key ? 'loading' : 'no-key')   // ok | off | offline
  const [now, setNow] = useState(Date.now())
  const gym = useGymBrand()

  useEffect(() => { hideBoot(); document.documentElement.dataset.theme = 'dark' }, [])

  // Keep the screen on, and again after the tablet wakes the page.
  useEffect(() => {
    let lock = null
    const get = () => navigator.wakeLock?.request('screen').then(l => { lock = l }).catch(() => {})
    const onShow = () => { if (document.visibilityState === 'visible') get() }
    get()
    document.addEventListener('visibilitychange', onShow)
    return () => { document.removeEventListener('visibilitychange', onShow); lock?.release?.().catch(() => {}) }
  }, [])

  // The next code as the current one runs out, and the count every few seconds in between.
  useEffect(() => {
    if (!key) return
    let timer = null, gone = false
    const tick = () => deskCode(key, midnight())
      .then(r => {
        if (gone) return
        setD({ ...r, got: Date.now() }); setState('ok')
        timer = setTimeout(tick, Math.min(r.msLeft + 150, 5000))
      })
      .catch(e => {
        if (gone) return
        const off = e?.data?.code === 'desk-off'
        setState(off ? 'off' : 'offline')
        timer = setTimeout(tick, off ? 30000 : 3000)
      })
    tick()
    return () => { gone = true; clearTimeout(timer) }
  }, [key])

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t) }, [])

  useEffect(() => {
    if (d?.code && canvas.current) renderQrToCanvas(canvas.current, checkinUrl(d.code)).catch(() => {})
  }, [d?.code])

  const left = d ? Math.max(0, d.msLeft - (now - d.got)) : 0
  const pct = d ? Math.round((left / d.windowMs) * 100) : 0
  const message = state === 'no-key' ? gt('This link has no desk key. Open the desk link from the admin page again.')
    : state === 'off' ? gt('This desk link is off. Ask the gym owner for the new one (admin page → Front desk).')
    : state === 'offline' ? gt('No connection. Reconnecting…') : null

  return <div className="gym-desk" style={gym?.accent ? { '--desk-acc': gym.accent } : null}>
    <div className="gym-desk-top">
      <span className="gym-desk-brand">{gym?.logo && <img src={gym.logo} alt="" />}{gymName(gym)}</span>
      <span className="gym-desk-clock">{clock(now)}</span>
    </div>
    <div className="gym-desk-main">
      <h1>{gt('Scan to check in')}</h1>
      <div className={'gym-desk-qr' + (state === 'ok' ? '' : ' dim')}><canvas ref={canvas} className="qr-canvas" aria-label={gt('Check-in QR code')} /></div>
      <div className="gym-desk-timer" aria-hidden="true"><span style={{ width: pct + '%' }} /></div>
      {message ? <p className="gym-desk-msg" role="alert">{message}</p>
        : <p>{gt('Open your phone camera, or {0} → Check in. The code changes every 30 seconds.', BRAND.name)}</p>}
    </div>
    <div className="gym-desk-count"><b>{d ? d.today : '–'}</b><span>{gt('checked in today')}</span></div>
  </div>
}
