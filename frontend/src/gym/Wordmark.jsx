import { BRAND } from './brand.js'

// The CADENCE wordmark: one heavy line, the accent part in the accent colour and the rest (if
// any) in the text colour. It follows the accent, so a member's own colour carries through the
// sign-in screen too.
export default function Wordmark({ size = 34, style }) {
  return (
    <h1 aria-label={BRAND.name} style={{ fontSize: size, fontWeight: 900, letterSpacing: '-.03em', margin: '10px 0 4px', ...style }}>
      <span aria-hidden="true" style={{ color: 'var(--acc)' }}>{BRAND.first}</span>
      {BRAND.second && <span aria-hidden="true">{BRAND.second}</span>}
    </h1>
  )
}
