import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_BASE lets the same source build for two very different hosts:
//   unset                 -> served at the root (Pi kiosk, python -m http.server)
//   /pi-album-art/        -> GitHub Pages project site
// The Spotify redirect URI is derived from it at runtime, so both stay correct.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || '/',
  // Old Android tablets are a target here, and their Chrome can be years
  // behind. esbuild transpiles down rather than shipping modern syntax.
  build: {
    target: ['es2015', 'chrome58', 'safari11'],
  },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true },
});
