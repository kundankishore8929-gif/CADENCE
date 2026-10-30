// Vitest setup for the CADENCE fork (vite.config.js test.setupFiles, after src/test-setup.js).
//
// openGym's own tests check openGym's behaviour and read its words ("openGym can no longer write
// to…", the GitHub address of its releases). They run against openGym's identity here, so they
// stay exactly as openGym ships them and its releases keep merging in without test conflicts.
// The rebrand itself is tested in src/gym/brand.test.js, which unmocks this module.
import { vi } from 'vitest'

vi.mock('./brand.js', async (importOriginal) => {
  const real = await importOriginal()
  const REPO = 'DuarteSantos8/openGym'
  return {
    ...real,
    REPO,
    BRAND: {
      ...real.BRAND,
      name: 'openGym', first: 'open', second: 'Gym', lime: '#30d158',
      source: `https://github.com/${REPO}`,
      releases: `https://github.com/${REPO}/releases/latest`,
      openGymLinks: true,
      exerciseMedia: true,
    },
    rebrand: s => s,
  }
})
