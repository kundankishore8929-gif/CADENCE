import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import Icon from '../components/Icon.jsx'
import { gt, gymMe, gymAvailable, visitsThisMonth } from './api.js'

/**
 * Home's check-in card. At a gym with a front-desk screen it is the desk check-in (M3), in the
 * place of openGym's own card (`children`: the membership-code wallet), which comes back
 * anywhere without one.
 */
export function CheckInCard({ children }) {
  const nav = useNavigate()
  const user = useStore(s => s.user)
  const [me, setMe] = useState(null)
  useEffect(() => {
    if (!gymAvailable(user)) return
    let live = true
    gymMe().then(m => { if (live) setMe(m) }).catch(() => {})
    return () => { live = false }
  }, [user?.id])
  if (!me?.desk) return children ?? null
  const n = visitsThisMonth(me.visits)
  const go = () => nav('/gym/checkin')
  return <div className="card tappable" style={{ cursor: 'pointer' }} role="button" tabIndex={0}
    onClick={go} onKeyDown={e => { if (e.key === 'Enter') go() }}>
    <div className="row between">
      <div className="row" style={{ gap: 9 }}>
        <span className="lrow-i" style={{ background: 'var(--acc)', color: 'var(--on-acc)' }}><Icon name="qr" /></span>
        <div>
          <div style={{ fontWeight: 600 }}>{gt('Check in at the desk')}</div>
          <div className="small muted">{n === 1 ? gt('1 visit this month') : gt('{0} visits this month', n)}</div>
        </div>
      </div>
      <Icon name="chevronRight" className="chev" />
    </div>
  </div>
}
