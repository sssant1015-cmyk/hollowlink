import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Allow access via Cloudflare Tunnel / ngrok / LAN IP (dev only — Vite blocks unknown
    // Host headers by default). Quick-tunnel URLs are random, so we allow all hosts here.
    allowedHosts: true,
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
      '/socket.io': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    sourcemap: false,
    target: 'es2020',
  },
});
