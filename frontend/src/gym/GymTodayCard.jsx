import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import Icon from '../components/Icon.jsx'
import { gt, gymDashboard, gymAvailable } from './api.js'
import { statusOf, isMember } from './dashboard.js'

// On Home, for the owner and admins only (M4): today at the gym at a glance, into the Gym screen.
export function GymTodayCard() {
  const nav = useNavigate()
  const user = useStore(s => s.user)
  const [d, setD] = useState(null)
  useEffect(() => {
    if (!gymAvailable(user) || !user?.admin) return
    let live = true
    gymDashboard().then(r => { if (live) setD(r) }).catch(() => {})
    return () => { live = false }
  }, [user?.id, user?.admin])
  if (!d) return null
  const here = new Set(d.today.map(x => x.m)).size
  const training = d.members.filter(m => m.live).length
  const atRisk = d.members.filter(m => isMember(m) && statusOf(m) === 'at-risk').length
  const go = () => nav('/gym/dashboard')
  const extra = [
    gt('{0} training now', training),
    d.flagged.length ? gt('{0} flagged', d.flagged.length) : null,
    atRisk ? gt('{0} at risk', atRisk) : null,
  ].filter(Boolean).join(' · ')
  return <div className="card tappable" style={{ cursor: 'pointer' }} role="button" tabIndex={0}
    onClick={go} onKeyDown={e => { if (e.key === 'Enter') go() }}>
    <div className="row between">
      <div>
        <div className="small muted" style={{ fontWeight: 600 }}>{gt('GYM TODAY')}</div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{here === 1 ? gt('1 checked in') : gt('{0} checked in', here)}</div>
        <div className="small" style={{ color: d.flagged.length || atRisk ? 'var(--orange)' : 'var(--label-2)' }}>{extra}</div>
      </div>
      <Icon name="chevronRight" style={{ color: 'var(--label-3)' }} />
    </div>
  </div>
}
