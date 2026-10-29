import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { Section, Row, TextField, Button } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { confirmSheet } from '../sheets.jsx'
import { fmtDate } from '../lib/format.js'
import { gt, gymMe, linkTrainer, unlinkTrainer, linkError, gymAvailable, localDay } from './api.js'
import { MemberPt } from './PtPackages.jsx'

// What a trainer gets, and what they never get: said before the member agrees, and again while
// they share (api/gym/routes.js strips the second list on the server).
export const SHARED = ['Your workouts: exercises, sets, reps and weights', 'Your body weight', 'Your body measurements', 'The names of your routines']
export const NOT_SHARED = ['Progress photos, workout photos and videos', 'Your notes', 'Anything else in the app']

function ShareList() {
  return <>
    <Section title={gt('Your trainer sees')}>
      {SHARED.map(s => <Row key={s} icon="check" iconTint="var(--acc)" title={gt(s)} />)}
    </Section>
    <Section title={gt('Never shared')}>
      {NOT_SHARED.map(s => <Row key={s} icon="lock" iconTint="var(--grey)" title={gt(s)} />)}
    </Section>
  </>
}

// Settings → My trainer: share your training with one trainer by their code, or stop.
export default function MyTrainer() {
  const nav = useNavigate()
  const user = useStore(s => s.user)
  const toast = useUI(s => s.toast)
  const [me, setMe] = useState(null)
  const [err, setErr] = useState(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () => gymMe().then(m => { setMe(m); setErr(null) }).catch(e => setErr(e.message))
  useEffect(() => { if (gymAvailable(user)) load() }, [user?.id])

  const share = () => {
    const c = code.replace(/\s+/g, '').toUpperCase()
    if (!c) return
    confirmSheet({
      title: gt('Share your training?'),
      message: gt('The trainer with code {0} will see your workouts, body weight, measurements and routine names. Never your photos, videos or notes. You can stop sharing at any time.', c),
      confirmText: gt('Share'),
      onConfirm: () => {
        setBusy(true)
        linkTrainer(c)
          .then(r => { setMe(m => ({ ...(m || {}), myTrainer: r.myTrainer })); setCode(''); toast(gt('You now share with {0}', r.myTrainer.name)) })
          .catch(e => toast(linkError(e, c)))
          .finally(() => setBusy(false))
      },
    })
  }
  const stop = () => confirmSheet({
    title: gt('Stop sharing with {0}?', me.myTrainer.name),
    message: gt('{0} loses access to your training at once. Your data stays with you.', me.myTrainer.name),
    confirmText: gt('Stop sharing'), danger: true,
    onConfirm: () => unlinkTrainer()
      .then(() => { setMe(m => ({ ...m, myTrainer: null })); toast(gt('Sharing stopped')) })
      .catch(e => toast(e.message)),
  })

  const t = me?.myTrainer
  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/settings" onClick={() => nav('/settings')} aria-label={gt('Settings')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{gt('My trainer')}</h1><div className="sub">{gt('Share your training with your trainer')}</div></div>
    </div>

    {!gymAvailable(user) ? <div className="card small muted">{gt('Sign in to your gym’s account first. A trainer can only see training that is synced to your gym.')}</div>
      : err ? <div className="card small" role="alert">{err} <Button size="sm" icon="reset" onClick={load}>{gt('Try again')}</Button></div>
      : !me ? <div className="card small muted">{gt('Loading…')}</div>
      : <>
        <MemberPt pt={me.pt} onChange={r => setMe(m => ({ ...m, pt: { packages: r.packages } }))} />
        {t ? <>
          <Section footer={gt('Sharing since {0}.', localDay(t.since) ? fmtDate(localDay(t.since), true, true) : '–')}>
            <Row icon="person" iconTint="var(--acc)" title={t.name} subtitle={gt('Your trainer · code {0}', t.code)} />
          </Section>
          <ShareList />
          <Section>
            <Row icon="xmark" iconTint="var(--red)" title={gt('Stop sharing')} danger onClick={stop} />
          </Section>
        </> : <>
          <Section title={gt('Trainer code')} footer={gt('Ask your trainer for their code, for example AMAN01. You can share with one trainer at a time.')}>
            <div className="lrow">
              <TextField value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder={gt('Enter code')}
                aria-label={gt('Trainer code')} autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={12}
                onKeyDown={e => { if (e.key === 'Enter') share() }} style={{ flex: 1 }} />
            </div>
          </Section>
          <Button variant="primary" disabled={!code.trim() || busy} onClick={share}>{gt('Continue')}</Button>
          <div style={{ height: 18 }} />
          <ShareList />
        </>}

        {me.trainer && <Section title={gt('You are a trainer')} footer={gt('Members enter this code under Settings → My trainer to share their training with you.')}>
          <Row icon="key" iconTint="var(--acc)" title={gt('Your trainer code')} value={me.trainer.code} />
          <Row icon="person" title={gt('Your clients')} value={String(me.trainer.clients)} accessory="chevron" onClick={() => nav('/gym/clients')} />
        </Section>}
      </>}
  </div>
}
