// CADENCE's gym layer on the client: the calls to api/gym/routes.js and the small rules the
// screens share. Kept out of openGym's own lib/ so its releases merge in without clashes.
import { api } from '../lib/api.js'

// The gym screens use their own string function instead of openGym's t(): openGym's language
// packs stay exactly as they ship. English for now; a pack per language can come later.
export function gt(s, ...args) {
  let v = s
  for (let i = 0; i < args.length; i++) v = v.replaceAll('{' + i + '}', args[i])
  return v
}

const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body || {}) })

export const gymMe = () => api('/api/gym/me')
export const linkTrainer = code => post('/api/gym/link', { code, consent: true })
export const unlinkTrainer = () => post('/api/gym/unlink')
export const listClients = () => api('/api/gym/clients')
export const getClient = id => api('/api/gym/client?id=' + encodeURIComponent(id))
export const removeClient = id => post('/api/gym/client/remove', { id })
export const listTrainers = () => api('/api/gym/trainers')
export const setTrainer = (id, trainer) => post('/api/gym/trainer', { id, trainer })
export const assignProgramme = (id, routines, days, start) => post('/api/gym/programme', { id, routines, days, start })
export const removeProgramme = id => post('/api/gym/programme/remove', { id })

// What the server answers for a refused link, in words.
export function linkError(e, code) {
  const c = e?.data?.code || e?.message
  if (c === 'no-such-code') return gt('No trainer has the code {0}. Check it with your trainer.', code)
  if (c === 'already-linked') return gt('You already share with a trainer. Stop sharing first, then enter the new code.')
  if (c === 'self') return gt('That is your own trainer code.')
  return e?.message || gt('That did not work. Try again.')
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

export const ATTENTION_DAYS = 7

/** A client line as the screens show it: counts on this device's calendar, and whether they slipped. */
export function clientLine(c, today = new Date()) {
  const week = isoDaysAgo(6, today), month = isoDaysAgo(29, today)
  const recent = Array.isArray(c.recent) ? c.recent : []
  const gap = daysSince(c.lastWorkout, today)
  return {
    ...c,
    last7: recent.filter(d => d >= week).length,
    last30: recent.filter(d => d >= month).length,
    gap,
    attention: gap == null || gap >= ATTENTION_DAYS,
  }
}

/** Slipping clients first (longest gap first), then everyone else by name. */
export function sortClients(lines) {
  return [...lines].sort((a, b) => {
    if (a.attention !== b.attention) return a.attention ? -1 : 1
    if (a.attention && (a.gap ?? Infinity) !== (b.gap ?? Infinity)) return (b.gap ?? Infinity) - (a.gap ?? Infinity)
    return String(a.name).localeCompare(String(b.name))
  })
}
