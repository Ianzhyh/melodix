import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],

  // Tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: true,
    watch: {
      ignored: ['**/cookies.json', '**/qr*.png', '**/qrcode*.png']
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        tray: 'tray.html',
      },
    },
  },
});
