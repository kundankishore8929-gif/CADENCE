// The gym's own look at run time (M5): its name, logo, colour and country code, from the public
// GET /api/gym/brand (api/gym/brand.js). brand.js stays CADENCE's fixed identity; this is what a
// gym's owner set on top of it, loaded once per app start.
import { useEffect, useSyncExternalStore } from 'react'
import { api } from '../lib/api.js'
import { DEFAULT_ACCENT } from '../lib/accent.js'
import { BRAND } from './brand.js'

let brand = null
let loading = null
const subs = new Set()
const emit = () => subs.forEach(f => f())

function show(b) {
  brand = b && typeof b === 'object' ? b : null
  if (typeof document !== 'undefined') document.title = brand?.name || BRAND.name
  emit()
}

/** Asks the server once (again with `fresh`). A server from before M5, or none, leaves CADENCE's look. */
export function loadGymBrand(fresh = false) {
  if (loading && !fresh) return loading
  try { loading = api('/api/gym/brand').then(show, () => null) } catch { loading = Promise.resolve(null) }
  return loading
}

/** After the owner saved: everyone on this device sees it at once. */
export const setGymBrand = b => show(b)
export const gymBrand = () => brand

/** The gym's brand in a component, loaded on first use. */
export function useGymBrand() {
  useEffect(() => { loadGymBrand() }, [])
  return useSyncExternalStore(f => { subs.add(f); return () => subs.delete(f) }, () => brand, () => null)
}

/** The accent to draw: the gym's colour for a member still on the default one, else their own. */
export const gymAccent = (value, b = brand) => (b?.accent && value === DEFAULT_ACCENT ? b.accent : value)

/** The gym's name, or CADENCE's. */
export const gymName = (b = brand) => b?.name || BRAND.name
