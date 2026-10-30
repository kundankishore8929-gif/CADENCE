// CADENCE's gym layer on the client: the calls to api/gym/routes.js and the small rules the
// screens share. Kept out of openGym's own lib/ so its releases merge in without clashes.
import { api, appBase, remoteAuth } from '../lib/api.js'
import { plannedDays } from './adherence.js'

// The gym screens use their own string function instead of openGym's t(): openGym's language
// packs stay exactly as they ship. English for now; a pack per language can come later.
export function gt(s, ...args) {
  let v = s
  for (let i = 0; i < args.length; i++) v = v.replaceAll('{' + i + '}', args[i])
  return v
}

const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body || {}) })

// One request for every screen that asks at the same moment (Home has two gym cards).
let meInFlight = null
export const gymMe = () => meInFlight || (meInFlight = api('/api/gym/me').finally(() => { meInFlight = null }))
export const linkTrainer = code => post('/api/gym/link', { code, consent: true })
export const unlinkTrainer = () => post('/api/gym/unlink')
export const listClients = () => api('/api/gym/clients')
export const getClient = id => api('/api/gym/client?id=' + encodeURIComponent(id))
export const removeClient = id => post('/api/gym/client/remove', { id })
export const listTrainers = () => api('/api/gym/trainers')
export const setTrainer = (id, trainer) => post('/api/gym/trainer', { id, trainer })
export const assignProgramme = (id, routines, days, start) => post('/api/gym/programme', { id, routines, days, start })
export const removeProgramme = id => post('/api/gym/programme/remove', { id })
// PT packages and sessions (M3)
export const addPackage = (member, p) => post('/api/gym/pt/package', { member, ...p })
export const removePackage = id => post('/api/gym/pt/package/remove', { id })
export const countSession = (member, d, again = false) => post('/api/gym/pt/session', { member, d, again })
export const undoSession = id => post('/api/gym/pt/session/undo', { id })
export const flagSession = id => post('/api/gym/pt/session/flag', { id })
export const keepSession = id => post('/api/gym/pt/session/keep', { id })
export const adminPt = member => api('/api/gym/pt?member=' + encodeURIComponent(member))
// The front desk (M3)
export const getDesk = () => api('/api/gym/desk')
export const setDesk = on => post('/api/gym/desk', { on })
export const deskCode = (key, since) => post('/api/gym/desk/code', { key, since })
export const checkIn = code => post('/api/gym/checkin', { code })
// The owner's dashboard (M4). Home's card and the Gym screen share one answer for 30 seconds.
let dash = null
export function gymDashboard(fresh = false) {
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0)
  if (fresh || !dash || Date.now() - dash.at > 30000) dash = { at: Date.now(), p: api('/api/gym/dashboard?since=' + midnight.getTime()) }
  dash.p.catch(() => { dash = null })
  return dash.p
}
export const setPhone = (member, phone) => post('/api/gym/phone', { member, phone })
// M5: the gym's look, a client's diet chart and the trainer's notes
export const saveBrand = b => post('/api/gym/brand', b)
export const saveDiet = (member, diet) => post('/api/gym/diet', { member, diet })
export const copyDiet = (member, from) => post('/api/gym/diet', { member, from })
export const addNote = (member, text) => post('/api/gym/note', { member, text })
export const removeNote = id => post('/api/gym/note/remove', { id })

// What the server answers for a refused link, in words.
export function linkError(e, code) {
  const c = e?.data?.code || e?.message
  if (c === 'no-such-code') return gt('No trainer has the code {0}. Check it with your trainer.', code)
  if (c === 'already-linked') return gt('You already share with a trainer. Stop sharing first, then enter the new code.')
  if (c === 'self') return gt('That is your own trainer code.')
  return e?.message || gt('That did not work. Try again.')
}

/** The web address of this gym's app: this page's own, or the paired server's from the phone app. */
export function siteUrl() {
  const remote = remoteAuth?.()?.base
  return remote ? remote.replace(/\/+$/, '') + '/' : location.origin + appBase()
}
export const deskUrl = key => siteUrl() + '#/desk?k=' + encodeURIComponent(key)
export const checkinUrl = (code, base = siteUrl()) => base + '#/gym/checkin?c=' + code

// What the server answers for a refused PT or check-in call, in words.
const GYM_ERRORS = {
  'no-package': 'No PT package yet. Add one first.',
  'used-up': 'Every session of the package is used. Add a new package.',
  expired: 'The package had expired by that day. Add a new package.',
  'before-start': 'The package starts after that day.',
  future: 'That day has not come yet.',
  'has-sessions': 'Sessions are counted on this package, so it stays.',
  'not-yours': 'Another trainer counted this session. Ask the front desk.',
  'too-late': 'Too late to change that here. Ask the front desk.',
  'bad-total': 'A package has 1 to 200 sessions.',
  'bad-expiry': 'The expiry is before the start.',
  'stale-code': 'That code has changed. Scan the screen again.',
  'desk-off': 'Check-in at the desk is off at this gym.',
  'bad-phone': 'That is not a phone number. Use 10 digits, or + and the country code.',
  'bad-logo': 'The logo has to be a PNG, JPEG or WebP picture.',
  'logo-too-big': 'That logo is too big. Pick a smaller picture.',
  'bad-name': 'A gym name has at most 40 characters.',
  'bad-cc': 'A country code is 1 to 3 digits.',
  'bad-diet': 'Fill in a target or a meal, with numbers in range.',
  'no-diet': 'That client has no diet chart yet.',
}
export function gymError(e) {
  const c = e?.data?.code
  return GYM_ERRORS[c] ? gt(GYM_ERRORS[c]) : e?.message || gt('That did not work. Try again.')
}

// The gym features need an account on a server: a guest, the demo and a phone in local mode
// (no signed-in user in any of them) have nobody to share with.
export const gymAvailable = user => !!user

/* ---------- dates, on this device's own calendar ---------- */

const DAY = 86400000
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
export const isoDaysAgo = (n, today = new Date()) => iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - n))
/** The local calendar day of a server timestamp ('2026-10-29T20:15:00Z' is the 30th in India). */
export const localDay = ts => { const d = new Date(ts); return Number.isNaN(d.getTime()) ? null : iso(d) }
const atNoon = s => new Date(s + 'T12:00:00')

/** Whole days from `d` ('YYYY-MM-DD') to today; null for no date. */
export function daysSince(d, today = new Date()) {
  if (!d) return null
  return Math.max(0, Math.round((atNoon(iso(today)) - atNoon(d)) / DAY))
}

/** "today", "yesterday", "5 days ago", or "never". */
export function agoLabel(d, today = new Date()) {
  const n = daysSince(d, today)
  if (n == null) return gt('never')
  if (n === 0) return gt('today')
  if (n === 1) return gt('yesterday')
  return gt('{0} days ago', n)
}

/** Whole days from today to `d` ('YYYY-MM-DD'): 0 today, negative once it is past. */
export const daysUntil = (d, today = new Date()) => Math.round((atNoon(d) - atNoon(iso(today))) / DAY)

export const ATTENTION_DAYS = 7
export const LOW_LEFT = 2
export const EXPIRY_DAYS = 7

/**
 * What a trainer should act on in a client's PT (the list's summary, api/gym/pt.js ptSummary):
 * a flagged session, 2 or fewer left, expiring within 7 days, or a package that just ran out
 * (the moment to sell the next one: a last session in the past 14 days and nothing left).
 */
export function ptAlerts(pt, today = new Date()) {
  if (!pt) return []
  const out = []
  if (pt.flagged) out.push({ kind: 'flagged', text: pt.flagged === 1 ? gt('1 session flagged') : gt('{0} sessions flagged', pt.flagged) })
  if (!pt.live) {
    if (pt.lastSession && daysSince(pt.lastSession, today) <= 14) out.push({ kind: 'ended', text: gt('PT package finished') })
    return out
  }
  if (pt.left <= LOW_LEFT) out.push({ kind: 'low', text: pt.left === 1 ? gt('1 session left') : gt('{0} sessions left', pt.left) })
  if (pt.expires) {
    const n = daysUntil(pt.expires, today)
    if (n <= EXPIRY_DAYS) out.push({ kind: 'expiring', text: n <= 0 ? gt('expires today') : n === 1 ? gt('expires tomorrow') : gt('expires in {0} days', n) })
  }
  return out
}

/**
 * The last 2 planned days of a client's programme, both missed and nothing trained since (M5):
 * those two days, or null. `programme` and `recent` as in the client list.
 */
export function missedInRow(c, today = new Date()) {
  if (!c?.programme) return null
  const week = Object.fromEntries((c.programme.days || []).map(d => [d, ['x']]))
  const planned = plannedDays({ start: c.programme.start, week }, isoDaysAgo(40, today), isoDaysAgo(1, today))
  if (planned.length < 2) return null
  const [a, b] = planned.slice(-2)
  return (c.recent || []).some(d => d >= a) ? null : [a, b]
}

/**
 * What a client's training says (M5): 2 planned sessions missed in a row, a lift that stalled
 * (api/gym/lifts.js), and a new personal record this week, which is good news (`good`), not a
 * reason for attention.
 */
export function trainingAlerts(c, today = new Date()) {
  const out = []
  if (missedInRow(c, today)) out.push({ kind: 'missed', text: gt('Missed 2 planned sessions') })
  const stalls = c?.lifts?.stalls?.length || 0
  if (stalls) out.push({ kind: 'stall', text: stalls === 1 ? gt('1 lift stalled') : gt('{0} lifts stalled', stalls) })
  if (c?.lifts?.prs?.length) out.push({ kind: 'pr', good: true, text: gt('New PR this week') })
  return out
}

/** Check-ins (epoch ms) in this calendar month, on this device's calendar. */
export function visitsThisMonth(visits, today = new Date()) {
  const first = new Date(today.getFullYear(), today.getMonth(), 1).getTime()
  return (Array.isArray(visits) ? visits : []).filter(t => t >= first).length
}

/**
 * A client line as the screens show it: counts on this device's calendar, whether they slipped
 * (`attention`), what their PT package needs (`alerts`), and whether either puts them on top (`needs`).
 */
export function clientLine(c, today = new Date()) {
  const week = isoDaysAgo(6, today), month = isoDaysAgo(29, today)
  const recent = Array.isArray(c.recent) ? c.recent : []
  const gap = daysSince(c.lastWorkout, today)
  const attention = gap == null || gap >= ATTENTION_DAYS
  const alerts = [...ptAlerts(c.pt, today), ...trainingAlerts(c, today)]
  return {
    ...c,
    last7: recent.filter(d => d >= week).length,
    last30: recent.filter(d => d >= month).length,
    visits: visitsThisMonth(c.visits, today),
    gap,
    attention,
    alerts,
    needs: attention || alerts.some(a => !a.good),
  }
}

/** Clients who need something first (the longest gap first), then everyone else by name. */
export function sortClients(lines) {
  return [...lines].sort((a, b) => {
    if (a.needs !== b.needs) return a.needs ? -1 : 1
    if (a.needs && (a.gap ?? Infinity) !== (b.gap ?? Infinity)) return (b.gap ?? Infinity) - (a.gap ?? Infinity)
    return String(a.name).localeCompare(String(b.name))
  })
}

/* ---------- PT packages, in words ---------- */

/**
 * A package's state on this device's calendar. The server's own day can be a day off (it runs on
 * UTC: in India it is still yesterday there until 5:30 in the morning), so a package starting
 * today would read as "starts tomorrow".
 */
export function localState(p, today = new Date()) {
  const d = isoDaysAgo(0, today)
  if (p.used >= p.total) return 'used-up'
  if (p.expires && d > p.expires) return 'expired'
  if (p.start > d) return 'upcoming'
  return 'active'
}
export const onThisCalendar = (packages, today = new Date()) => (Array.isArray(packages) ? packages : []).map(p => ({ ...p, state: localState(p, today) }))

/** The package a screen leads with: the one running now, else the next, else the latest. */
export function currentPackage(packages) {
  const list = Array.isArray(packages) ? packages : []
  return list.find(p => p.state === 'active') || list.find(p => p.state === 'upcoming') || list[list.length - 1] || null
}

/** "7 of 12 used · 5 left · expires 30 Nov", or how it ended. `fmt` turns a day into words. */
export function packageLine(p, fmt) {
  if (!p) return ''
  if (p.state === 'upcoming') return gt('{0} sessions · starts {1}', p.total, fmt(p.start))
  if (p.state === 'used-up') return gt('All {0} sessions used', p.total)
  if (p.state === 'expired') return gt('Expired {0} · {1} of {2} used', fmt(p.expires), p.used, p.total)
  return gt('{0} of {1} used · {2} left', p.used, p.total, p.left) + (p.expires ? ' · ' + gt('expires {0}', fmt(p.expires)) : '')
}

/** The code inside what a phone scanned at the desk: the screen's link (…#/gym/checkin?c=CODE) or the bare code. */
export function codeFromScan(value) {
  const v = String(value || '').trim()
  const m = /[?&]c=([A-Za-z0-9]+)/.exec(v)
  const code = (m ? m[1] : v).toUpperCase()
  return /^[A-HJ-NP-Z2-9]{10}$/.test(code) ? code : null
}
