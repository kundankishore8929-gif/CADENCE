import { useEffect, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { confirmSheet } from '../sheets.jsx'
import { getDesk, setDesk, deskUrl } from './api.js'

// The admin dashboard's front-desk card (M3). English only, like the rest of that page
// (views/Admin.jsx): it is the operator's screen, not part of the translated app.

/** Set up the reception screen: a desk link that shows the check-in QR code and nothing else. */
export function DeskCard() {
  const toast = useUI(s => s.toast)
  const [desk, setD] = useState(undefined)
  useEffect(() => { getDesk().then(r => setD(r.desk)).catch(() => setD(null)) }, [])
  if (desk === undefined) return null
  const url = desk && deskUrl(desk.key)
  const make = () => setDesk(true).then(r => { setD(r.desk); toast('New desk link made') }).catch(e => toast(e.message))
  const renew = () => confirmSheet({
    title: 'Make a new desk link?',
    message: 'The screen that has the old link stops showing the code at once. Open the new link on it.',
    confirmText: 'New link', onConfirm: make,
  })
  const off = () => confirmSheet({
    title: 'Turn desk check-in off?',
    message: 'The desk screen stops, members can no longer check in, and the Check in card leaves their Home. Visits so far stay.',
    confirmText: 'Turn off', danger: true,
    onConfirm: () => setDesk(false).then(() => { setD(null); toast('Desk check-in is off') }).catch(e => toast(e.message)),
  })
  const copy = () => { navigator.clipboard?.writeText(url).catch(() => {}); toast('Desk link copied') }
  return <div className="card">
    <h2 style={{ margin: 0 }}>Front desk check-in</h2>
    <div className="adm-lead">A screen at reception shows a QR code that changes every 30 seconds. Members scan it with their phone to check in, once per visit; a photo of it stops working within a minute. The desk link signs in to nobody: it can show the code and today’s count, nothing else.</div>
    {desk ? <>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', margin: '0 0 8px' }}>
        <span className="adm-pill ok">on</span>
        <span className="adm-pill">made {desk.createdAt ? new Date(desk.createdAt).toLocaleDateString() : '–'}{desk.by ? ' by ' + desk.by : ''}</span>
      </div>
      <div className="adm-hint">Open this link on the reception tablet or laptop, full screen: <code style={{ wordBreak: 'break-all' }}>{url}</code></div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', margin: '10px 0 4px' }}>
        <button className="btn primary" style={{ flex: 1 }} onClick={() => window.open(url, '_blank', 'noopener')}>Open screen</button>
        <button className="btn" style={{ flex: 1 }} onClick={copy}>Copy link</button>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', margin: '8px 0 4px' }}>
        <button className="btn" style={{ flex: 1 }} onClick={renew}>New link</button>
        <button className="btn danger" style={{ flex: 1 }} onClick={off}>Turn off</button>
      </div>
      <div className="adm-hint">Lost the tablet, or the link went somewhere it should not? “New link” ends the old one.</div>
    </> : <>
      <button className="btn primary" style={{ margin: '4px 0 4px' }} onClick={make}>Set up desk screen</button>
      <div className="adm-hint">Members get a “Check in at the desk” card on Home once this is on.</div>
    </>}
  </div>
}
