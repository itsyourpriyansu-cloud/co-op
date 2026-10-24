import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Monorepo root: hoisted node_modules (fonts, Blend) and the shared packages live here. */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    open: true,
    // Allow the dev server to serve files from the repo root (e.g. @fontsource Inter woff2).
    fs: { allow: [repoRoot] },
  },
});
