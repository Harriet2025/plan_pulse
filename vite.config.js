import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],   // .env.local uses NEXT_PUBLIC_; only ever the browser-safe Supabase key
  build: {
    rollupOptions: {
      output: {
        // Libraries in their own files: they rarely change, so after an update the browser keeps them and only
        // downloads the app's own (small) changes
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('framer-motion') || id.includes('motion-dom') || id.includes('motion-utils')) return 'motion';
          if (id.includes('lucide-react')) return 'icons';
          return 'vendor';
        },
      },
    },
  },
});
