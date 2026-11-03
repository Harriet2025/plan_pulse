import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],   // .env.local uses NEXT_PUBLIC_; only ever the browser-safe Supabase key
});
