import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// .mts so Vite loads it as ESM: as a .ts in a package without "type": "module"
// it is ESM syntax in a CommonJS file, which Vite 8 warns its future native
// config loader will not support.

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    // The server's zone on Vercel. On a machine in Israel a test of "the
    // Israeli month, not the server's" could not tell the two apart.
    env: { TZ: 'UTC' },
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
