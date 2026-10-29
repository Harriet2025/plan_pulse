import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The PHP server (npm run api) listens here. Requests to /api are forwarded to it, so the browser
// only ever talks to one origin and the login cookie works without CORS.
const API = 'http://127.0.0.1:8000';

// The app calls /api/auth (no .php, which some hosts block); PHP needs /api/auth.php
const toPhp = { target: API, rewrite: (path) => path.replace(/^\/api\/([A-Za-z_]+)(?=\?|$)/, '/api/$1.php') };

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': toPhp } },
  preview: { proxy: { '/api': toPhp } },
});
