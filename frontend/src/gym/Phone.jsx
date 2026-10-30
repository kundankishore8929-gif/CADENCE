import { useState } from 'react'
import { useUI } from '../store/useUI.js'
import { Section, TextField, Button } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { gt, gymError, setPhone } from './api.js'

/**
 * The front desk's sheet for a member's phone number (M4), for WhatsApp. Only admins ever see
 * it; the member's trainer does not.
 */
export function PhoneSheet({ member, phone, close, onDone }) {
  const toast = useUI(s => s.toast)
  const [v, setV] = useState(phone || '')
  const [busy, setBusy] = useState(false)
  const save = value => {
    setBusy(true)
    setPhone(member.id, value)
      .then(r => { onDone?.(r.phone); toast(r.phone ? gt('Number saved for {0}', member.name) : gt('Number removed')); close() })
      .catch(e => toast(gymError(e)))
      .finally(() => setBusy(false))
  }
  return <>
    <h3 style={{ marginTop: 0 }}>{gt('{0}’s phone number', member.name)}</h3>
    <Section footer={gt('For WhatsApp messages from the front desk. Only the owner and admins see it, never trainers. 10 digits are read as an Indian number.')}>
      <div className="lrow"><Icon name="phoneScreen" style={{ color: 'var(--acc)', marginInlineEnd: 10 }} />
        <TextField type="tel" inputMode="tel" autoComplete="off" value={v} onChange={e => setV(e.target.value)} placeholder={gt('e.g. 98765 43210')}
          aria-label={gt('Phone number')} style={{ flex: 1 }} onKeyDown={e => { if (e.key === 'Enter' && v.trim()) save(v.trim()) }} /></div>
    </Section>
    <Button variant="primary" disabled={!v.trim() || busy} onClick={() => save(v.trim())}>{gt('Save number')}</Button>
    <div style={{ height: 8 }} />
    {phone && <><Button className="danger" disabled={busy} onClick={() => save('')}>{gt('Remove number')}</Button><div style={{ height: 8 }} /></>}
    <Button onClick={close}>{gt('Cancel')}</Button>
  </>
}
