import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Monorepo root: hoisted node_modules (fonts, Blend) and the shared packages live here. */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
/** 5173 belongs to another local project; the console always uses its own port (D-054: env, never hard-coded). */
const port = Number(process.env.CONSOLE_PORT ?? 5180);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port,
    strictPort: true,
    open: true,
    // Allow the dev server to serve files from the repo root (e.g. @fontsource Inter woff2).
    fs: { allow: [repoRoot] },
  },
  // Production mode for demos (`npm run demo:prod`): the built console, same port.
  preview: { port, strictPort: true },
});
