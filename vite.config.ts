import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

// The one place the version is written is package.json (PLAN-2.md, D8).
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  plugins: [preact()],
  // Relative base so the bundle works from file-like origins inside the Capacitor WebView.
  base: './',
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: { assetsInlineLimit: 0 },
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
