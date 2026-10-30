import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUI } from '../store/useUI.js'
import { Section, Row, TextField, Button } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { gt, gymError, saveBrand } from './api.js'
import { useGymBrand, setGymBrand, loadGymBrand } from './brand-live.js'
import { BRAND } from './brand.js'
import { inkOn } from '../lib/accent.js'
import './gym.css'

// Colours a gym can pick in one tap; any other with the colour picker. null = CADENCE's own.
export const SWATCHES = [null, '#ff6b00', '#e63946', '#2f80ed', '#7b61ff', '#00b894', '#f5b700', '#ff2d87']
const LOGO_BYTES = 190 * 1024

/** A picture made into a logo: at most 256 px, as WebP (else PNG, else JPEG) under 190 KB. Null: too big. */
export async function shrinkLogo(file) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url })
    const scale = Math.min(1, 256 / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale))
    c.height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale))
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
    for (const [type, q] of [['image/webp', 0.9], ['image/png'], ['image/jpeg', 0.85]]) {
      const d = c.toDataURL(type, q)
      if (d.startsWith('data:' + type + ';') && d.length * 0.75 < LOGO_BYTES) return d
    }
    return null
  } finally { URL.revokeObjectURL(url) }
}

/**
 * The owner's Gym settings (M5): the gym's name, logo and colour, and the country code its
 * members' phone numbers are read in. Admins only (App.jsx).
 */
export default function GymSettings() {
  const nav = useNavigate()
  const toast = useUI(s => s.toast)
  const gym = useGymBrand()
  const [f, setF] = useState(null)
  const [busy, setBusy] = useState(false)
  const file = useRef(null)
  useEffect(() => { loadGymBrand(true) }, [])
  useEffect(() => { if (gym && !f) setF({ name: gym.name || '', accent: gym.accent || null, cc: gym.cc || '91', logo: gym.logo || null }) }, [gym])

  const pick = async ev => {
    const fl = ev.target.files?.[0]
    ev.target.value = ''
    if (!fl) return
    try {
      const logo = await shrinkLogo(fl)
      if (!logo) return toast(gt('That picture is too big even when shrunk. Try a simpler logo.'))
      setF(x => ({ ...x, logo }))
    } catch { toast(gt('That file is not a picture this phone can read.')) }
  }
  const save = () => {
    setBusy(true)
    saveBrand({ name: f.name.trim(), accent: f.accent, cc: f.cc.replace(/^\+/, ''), logo: f.logo })
      .then(b => { setGymBrand(b); toast(gt('Gym settings saved')) })
      .catch(e => toast(gymError(e)))
      .finally(() => setBusy(false))
  }
  const changed = f && gym && (f.name.trim() !== (gym.name || '') || f.accent !== (gym.accent || null) || f.cc.replace(/^\+/, '') !== (gym.cc || '91') || f.logo !== (gym.logo || null))

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/gym/dashboard" onClick={() => nav('/gym/dashboard')} aria-label={gt('Gym')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{gt('Gym settings')}</h1><div className="sub">{gt('How the app looks for your members')}</div></div>
    </div>

    {!f ? <div className="card small muted">{gt('Loading…')}</div> : <>
      <div className="card gym-brand-preview" style={f.accent ? { '--prev-acc': f.accent } : null}>
        {f.logo ? <img src={f.logo} alt="" /> : <span className="gym-brand-ph"><Icon name="dumbbell" /></span>}
        <div style={{ minWidth: 0 }}>
          <div className="gym-brand-name">{f.name.trim() || BRAND.name}</div>
          <div className="small muted">{f.name.trim() ? gt('on {0}', BRAND.name) : gt('Your gym’s name goes here')}</div>
        </div>
        <span className="gym-brand-btn" style={f.accent ? { color: inkOn(f.accent) } : null}>{gt('Start')}</span>
      </div>

      <Section title={gt('Gym name')}>
        <div className="lrow"><TextField value={f.name} maxLength={40} onChange={e => setF({ ...f, name: e.target.value })} placeholder={gt('e.g. Iron Temple Gym')} aria-label={gt('Gym name')} style={{ flex: 1 }} /></div>
      </Section>

      <Section title={gt('Logo')} footer={gt('A square picture works best. It is shrunk to 256 px on this phone before it is saved.')}>
        <Row icon="image" iconTint="var(--acc)" title={f.logo ? gt('Change logo') : gt('Choose a picture')} accessory="chevron" onClick={() => file.current?.click()} />
        {f.logo && <Row icon="xmark" iconTint="var(--red)" title={gt('Remove logo')} danger onClick={() => setF({ ...f, logo: null })} />}
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pick} />
      </Section>

      <Section title={gt('Colour')} footer={gt('Members who never picked a colour of their own see the app in this one. CADENCE green is the default.')}>
        <div className="gym-swatches" role="group" aria-label={gt('Colour')}>
          {SWATCHES.map(c => <button key={c || 'default'} type="button" className={'gym-swatch' + (f.accent === c ? ' on' : '')} aria-pressed={f.accent === c}
            aria-label={c ? c : gt('CADENCE green')} style={{ background: c || BRAND.lime }} onClick={() => setF({ ...f, accent: c })} />)}
          <label className={'gym-swatch gym-swatch-own' + (f.accent && !SWATCHES.includes(f.accent) ? ' on' : '')} aria-label={gt('Your own colour')}
            style={f.accent && !SWATCHES.includes(f.accent) ? { background: f.accent } : null}>
            <Icon name="palette" />
            <input type="color" value={f.accent || BRAND.lime} onChange={e => setF({ ...f, accent: e.target.value.toLowerCase() })} />
          </label>
        </div>
      </Section>

      <Section title={gt('Country code')} footer={gt('For WhatsApp: a 10-digit phone number is read with this code. India is 91.')}>
        <div className="lrow"><span style={{ color: 'var(--label-2)', marginInlineEnd: 6 }}>+</span>
          <TextField inputMode="numeric" maxLength={4} value={f.cc} onChange={e => setF({ ...f, cc: e.target.value.replace(/[^\d+]/g, '') })} aria-label={gt('Country code')} style={{ flex: 1 }} /></div>
      </Section>

      <Button variant="primary" disabled={!changed || busy || !/^\+?\d{1,3}$/.test(f.cc)} onClick={save}>{busy ? gt('Saving…') : gt('Save')}</Button>
      <div style={{ height: 14 }} />
      <div className="small muted" style={{ lineHeight: 1.5, padding: '0 4px 24px' }}>
        {gt('Shown on the sign-in screen, in the browser tab, on the desk screen and in WhatsApp messages. The app’s icon and name on phones stay CADENCE until the store app is built.')}
      </div>
    </>}
  </div>
}
