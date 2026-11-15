import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const modulePath = id.replace(/\\/g, '/');
          if (modulePath.includes('/node_modules/recharts/')) return 'charts';
          if (modulePath.includes('/node_modules/lucide-react/')) return 'icons';
          if (
            modulePath.includes('/node_modules/react/')
            || modulePath.includes('/node_modules/react-dom/')
            || modulePath.includes('/node_modules/scheduler/')
          ) return 'react-vendor';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/health': 'http://127.0.0.1:8000',
      '/api': 'http://127.0.0.1:8000',
    },
  },
});
