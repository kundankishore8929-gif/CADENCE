import { useEffect, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { confirmSheet } from '../sheets.jsx'
import { listTrainers, setTrainer } from './api.js'

// The admin dashboard's trainer controls. English only, like the rest of that page
// (views/Admin.jsx): it is the operator's screen, not part of the translated app.

/** In a member's sheet: give or take the trainer role. */
export function TrainerControl({ user, onChanged }) {
  const toast = useUI(s => s.toast)
  const [t, setT] = useState(undefined)
  useEffect(() => {
    listTrainers().then(r => setT(r.trainers.find(x => x.id === user.id) || null)).catch(() => setT(null))
  }, [user.id])
  if (t === undefined || user.disabled) return null
  const give = () => confirmSheet({
    title: 'Make ' + user.name + ' a trainer?',
    message: 'They get a trainer code to hand to members. Members who enter it and agree share their workouts, body weight and measurements with them. Never photos, videos or notes.',
    confirmText: 'Make trainer',
    onConfirm: () => setTrainer(user.id, true)
      .then(r => { setT(r.trainer); toast(user.name + ' is a trainer · code ' + r.trainer.code); onChanged?.() })
      .catch(e => toast(e.message)),
  })
  const take = () => confirmSheet({
    title: 'Remove ' + user.name + ' as trainer?',
    message: t.clients
      ? 'Their ' + t.clients + (t.clients === 1 ? ' client stops' : ' clients stop') + ' sharing with them at once. Nobody’s data is deleted.'
      : 'They have no clients. Their own account stays as it is.',
    confirmText: 'Remove trainer', danger: true,
    onConfirm: () => setTrainer(user.id, false)
      .then(() => { setT(null); toast(user.name + ' is no longer a trainer'); onChanged?.() })
      .catch(e => toast(e.message)),
  })
  return <>
    {t && <div className="row" style={{ gap: 6, flexWrap: 'wrap', margin: '0 0 8px' }}>
      <span className="adm-pill acc">trainer {t.code}</span>
      <span className="adm-pill">{t.clients} {t.clients === 1 ? 'client' : 'clients'}</span>
    </div>}
    <button className="btn" style={{ margin: '12px 0 4px' }} onClick={t ? take : give}>{t ? 'Remove trainer' : 'Make trainer'}</button>
    <div className="adm-hint">{t
      ? 'Members enter ' + t.code + ' under Settings → My trainer. Removing the role ends every client’s sharing.'
      : 'Trainers see the training of members who share with them, nothing else.'}</div>
  </>
}

/** On the dashboard: who trains here, and how many clients each has. */
export function TrainersCard({ users, openUser, tick }) {
  const [list, setList] = useState(null)
  useEffect(() => { listTrainers().then(r => setList(r.trainers)).catch(() => setList([])) }, [tick, (users || []).length])
  if (!list) return null
  return <div className="card">
    <h2 style={{ margin: 0 }}>Trainers</h2>
    <div className="adm-lead">The trainers at this gym and their clients. To add one, open a user below and tap “Make trainer”. Members join a trainer by entering the code under Settings → My trainer.</div>
    <div className="list">
      {list.map(t => <div key={t.id} className="item" onClick={() => openUser(t.id)}>
        <div className="grow"><div className="tt">{t.name} <span className="adm-pill acc" style={{ marginInlineStart: 4 }}>{t.code}</span></div>
          <div className="ss">{t.clients} {t.clients === 1 ? 'client' : 'clients'}</div></div>
      </div>)}
      {!list.length && <div className="adm-empty">No trainers yet.</div>}
    </div>
  </div>
}
