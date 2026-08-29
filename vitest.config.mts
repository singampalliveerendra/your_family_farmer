import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Unit tests live in tests/, mirroring the src/ tree they cover
// (tests/lib/pricing.test.ts tests src/lib/pricing.ts).
//
// Deliberately node-environment and dependency-light: nothing here touches the
// database, the network or the DOM. The modules under test are the ones where a
// silent regression costs real money (a wrong fee, an unverified payment
// signature, a forged session), so they must be runnable in CI in a second or
// two with no Supabase project and no secrets beyond a dummy SESSION_SECRET.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Every crypto helper reads SESSION_SECRET at call time and throws when it
    // is missing or under 32 chars. Set a fixed dummy here so the suite is
    // hermetic — the real secret is never needed to prove the maths.
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
