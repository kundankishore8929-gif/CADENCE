import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import Icon from '../components/Icon.jsx'
import { gt, listClients, clientLine, gymAvailable, gymMe } from './api.js'

// On Home, for trainers only: how many clients, and how many slipped. Nothing for anyone else.
export function ClientsCard() {
  const nav = useNavigate()
  const user = useStore(s => s.user)
  const [d, setD] = useState(null)
  useEffect(() => {
    if (!gymAvailable(user)) return
    let live = true
    gymMe().then(m => m.trainer ? listClients() : null).then(r => { if (live) setD(r) }).catch(() => {})
    return () => { live = false }
  }, [user?.id])
  if (!d) return null
  const lines = d.clients.map(c => clientLine(c))
  const slipping = lines.filter(c => c.attention).length
  return <div className="card tappable" style={{ cursor: 'pointer' }} role="button" tabIndex={0}
    onClick={() => nav('/gym/clients')} onKeyDown={e => { if (e.key === 'Enter') nav('/gym/clients') }}>
    <div className="row between">
      <div>
        <div className="small muted" style={{ fontWeight: 600 }}>{gt('YOUR CLIENTS')}</div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{lines.length}</div>
        <div className="small" style={{ color: slipping ? 'var(--orange)' : 'var(--label-2)' }}>
          {slipping ? gt('{0} need attention', slipping) : gt('Everyone trained this week')}</div>
      </div>
      <Icon name="chevronRight" style={{ color: 'var(--label-3)' }} />
    </div>
  </div>
}
