import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Port 5173 is baked in because the Spotify redirect URI must match exactly.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true },
});
