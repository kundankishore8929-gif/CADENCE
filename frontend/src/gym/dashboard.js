// The owner's dashboard, counted (M4): member status, the trainers' numbers, the check-in charts
// and the WhatsApp message. Pure, on this device's calendar, from GET /api/gym/dashboard's raw
// days and times (api/gym/dashboard.js).
import { fmtDate } from '../lib/format.js'
import { gt, isoDaysAgo, daysSince, localDay, clientLine, ptAlerts } from './api.js'
import { listConsistency } from './adherence.js'

/* ---------- member status (SPEC "Numbers, defined once") ---------- */

// Days since the last visit or workout: up to 7 active, 8–14 slipping, 15–30 at risk, then lost.
export const STATUSES = [
  { key: 'slipping', label: 'Slipping', upTo: 14 },
  { key: 'at-risk', label: 'At risk', upTo: 30 },
  { key: 'lost', label: 'Lost', upTo: Infinity },
  { key: 'active', label: 'Active', upTo: 7 },
]

/** The member's last day at the gym: a check-in or a workout. Null: neither, ever. */
export function lastActive(m) {
  const days = [m.lastVisit ? localDay(m.lastVisit) : null, m.lastWorkout].filter(Boolean).sort()
  return days[days.length - 1] || null
}

/**
 * A member's status. Someone who has never come counts from the day they joined, so a new member
 * is Active for their first week and Lost a month later if they never came.
 */
export function statusOf(m, today = new Date()) {
  const n = daysSince(lastActive(m) || (m.joined ? localDay(m.joined) : null), today)
  if (n == null || n > 30) return 'lost'
  return n <= 7 ? 'active' : n <= 14 ? 'slipping' : 'at-risk'
}

/** The staff (owner, admins, trainers) run the gym: they are not in the members' numbers. */
export const isMember = m => !m.role

/* ---------- the trainers ---------- */

const monthStart = (today, back = 0) => new Date(today.getFullYear(), today.getMonth() - back, 1)

/**
 * One trainer's month: clients, PT sessions counted this month, the clients' average consistency
 * (only clients with a programme have one), clients who need something, and retention: of last
 * month's clients, how many are still theirs and Active or Slipping now.
 */
export function trainerStats(t, byId, sessions, today = new Date()) {
  const clients = t.clients.map(c => byId[c.member]).filter(Boolean)
  const lines = clients.map(m => clientLine(m, today))
  const pcts = clients.map(m => listConsistency(m, today)).filter(x => x != null)
  const from = isoDaysAgo(0, monthStart(today))
  const m0 = monthStart(today).getTime(), m1 = monthStart(today, 1).getTime()
  const lastMonth = new Set([
    ...t.clients.filter(c => Date.parse(c.since) < m0).map(c => c.member),
    ...t.past.filter(p => Date.parse(p.since) < m0 && Date.parse(p.ended) >= m1).map(p => p.member),
  ])
  const kept = [...lastMonth].filter(id => t.clients.some(c => c.member === id) && byId[id]
    && ['active', 'slipping'].includes(statusOf(byId[id], today))).length
  return {
    clients: clients.length,
    lines,
    ptMonth: sessions.filter(s => s.by === t.id && s.d >= from).length,
    consistency: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null,
    attention: lines.filter(l => l.needs).length,
    retention: lastMonth.size ? { kept, of: lastMonth.size, pct: Math.round((kept / lastMonth.size) * 100) } : null,
  }
}

/* ---------- check-ins ---------- */

/** Visits on each of the last `days` days, today last: [{ d, n }]. */
export function visitsByDay(times, today = new Date(), days = 30) {
  const out = Array.from({ length: days }, (_, i) => ({ d: isoDaysAgo(days - 1 - i, today), n: 0 }))
  const at = Object.fromEntries(out.map((x, i) => [x.d, i]))
  for (const t of times || []) { const i = at[localDay(t)]; if (i != null) out[i].n++ }
  return out
}

// Rows Monday first; columns are the hours a gym is open.
export const HOURS = Array.from({ length: 19 }, (_, i) => i + 5)   // 5:00 … 23:00
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/**
 * The busy hours: the average visits in each weekday × hour over the last 4 full weeks (today
 * left out, it is not over), and the busiest slot.
 */
export function busyHours(times, today = new Date(), weeks = 4) {
  const grid = DAYS.map(() => HOURS.map(() => 0))
  const first = isoDaysAgo(weeks * 7, today), last = isoDaysAgo(1, today)
  for (const t of times || []) {
    const d = localDay(t)
    if (!d || d < first || d > last) continue
    const when = new Date(t)
    const h = HOURS.indexOf(when.getHours())
    if (h >= 0) grid[(when.getDay() + 6) % 7][h]++
  }
  let busiest = null
  const avg = grid.map((row, r) => row.map((n, c) => {
    const v = Math.round((n / weeks) * 10) / 10
    if (v > 0 && (!busiest || v > busiest.avg)) busiest = { day: r, hour: HOURS[c], avg: v }
    return v
  }))
  return { grid: avg, busiest }
}

/** Shade 0–4 for a value, by quarters of the values above zero (as openGym's own heatmap). */
export function levels(values) {
  const v = values.filter(x => x > 0).sort((a, b) => a - b)
  const q = p => (v.length ? v[Math.min(v.length - 1, Math.floor(p * v.length))] : 0)
  const t1 = q(0.25), t2 = q(0.5), t3 = q(0.75)
  return x => (!x ? 0 : x >= t3 ? 4 : x >= t2 ? 3 : x >= t1 ? 2 : 1)
}

/* ---------- WhatsApp ---------- */

// Until the gym's own country comes with its settings (M5): a 10-digit number is Indian.
export const DEFAULT_CC = '91'

/** The number wa.me wants: the country code (the gym's, M5) and digits, nothing else. */
export function waNumber(phone, cc = DEFAULT_CC) {
  const s = String(phone || '').trim()
  const d = s.replace(/\D/g, '')
  if (!d) return null
  if (s.startsWith('+')) return d
  if (d.length === 10) return cc + d
  if (d.length === 11 && d.startsWith('0')) return cc + d.slice(1)
  return d
}

export const waLink = (phone, text, cc) => { const n = waNumber(phone, cc); return n ? 'https://wa.me/' + n + '?text=' + encodeURIComponent(text) : null }

/**
 * The message the owner starts from, by what the member needs: a renewal when the PT package
 * runs out, a nudge when they slipped, a gentler one after a long gap. The owner edits it in
 * WhatsApp before sending; the app sends nothing itself.
 */
export function waText(m, today = new Date(), gym = '') {
  const at = gym || gt('the gym')
  const first = String(m.name || '').trim().split(/\s+/)[0] || ''
  const status = statusOf(m, today)
  const last = lastActive(m)
  const pt = ptAlerts(m.pt, today).find(a => a.kind === 'low' || a.kind === 'expiring' || a.kind === 'ended')
  if (pt && status === 'active') {
    return pt.kind === 'ended'
      ? gt('Hi {0}, your PT package is finished. Shall we set up the next one?', first)
      : gt('Hi {0}, you have {1} PT sessions left{2}. Shall we plan the next package?', first, m.pt.left, m.pt.expires ? gt(' (valid till {0})', fmtDate(m.pt.expires)) : '')
  }
  if (status === 'active') return gt('Hi {0}, great to see you at {1} this week. Keep it going!', first, at)
  if (!last) return gt('Hi {0}, welcome to {1}! We haven’t seen you yet. When can we expect you? Reply here and we’ll help you get started.', first, at)
  if (status === 'slipping') return gt('Hi {0}, we haven’t seen you at {2} since {1}. All good? We’d love to see you back this week.', first, fmtDate(last), at)
  return gt('Hi {0}, it’s been a while since your last visit ({1}). Is anything stopping you? Reply here and we’ll help you get back on track.', first, fmtDate(last))
}
