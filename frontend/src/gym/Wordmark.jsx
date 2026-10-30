import Icon from '../components/Icon.jsx'
import { BRAND } from './brand.js'
import { useGymBrand } from './brand-live.js'

// The CADENCE wordmark: one heavy line, the accent part in the accent colour and the rest (if
// any) in the text colour. It follows the accent, so a member's own colour carries through the
// sign-in screen too.
export default function Wordmark({ size = 34, style }) {
  const gym = useGymBrand()
  // A gym's own name (M5) in its place, with CADENCE named small under it.
  if (gym?.name) return <>
    <h1 style={{ fontSize: Math.round(size * 0.85), fontWeight: 900, letterSpacing: '-.02em', margin: '10px 0 2px', color: 'var(--label)', ...style }}>{gym.name}</h1>
    <div className="small muted" style={{ marginBottom: 4 }}>on <span style={{ color: 'var(--acc)', fontWeight: 700 }}>{BRAND.name}</span></div>
  </>
  return (
    <h1 aria-label={BRAND.name} style={{ fontSize: size, fontWeight: 900, letterSpacing: '-.03em', margin: '10px 0 4px', ...style }}>
      <span aria-hidden="true" style={{ color: 'var(--acc)' }}>{BRAND.first}</span>
      {BRAND.second && <span aria-hidden="true">{BRAND.second}</span>}
    </h1>
  )
}

/** Above the wordmark: the gym's logo when it has one (M5), else the app's dumbbell. */
export function BrandIcon() {
  const gym = useGymBrand()
  if (gym?.logo) return <div style={{ display: 'flex', justifyContent: 'center' }}>
    <img src={gym.logo} alt="" width={84} height={84} style={{ borderRadius: 20, objectFit: 'contain', background: 'var(--surface-2)' }} />
  </div>
  return <div style={{ fontSize: 54, display: 'flex', justifyContent: 'center', color: 'var(--acc)' }}><Icon name="dumbbell" /></div>
}
