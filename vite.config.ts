import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  // Relative base so the bundle works from file-like origins inside the Capacitor WebView.
  base: './',
  build: { assetsInlineLimit: 0 },
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
