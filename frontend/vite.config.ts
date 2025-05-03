// filepath: /home/xmas/GIT-PG/vmark/frontend/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy requests starting with /api to your backend server
      '/api': {
        target: 'http://127.0.0.1:8000', // Use localhost to reach the backend on the same machine
        changeOrigin: true, // Recommended for virtual hosted sites
        // secure: false, // Uncomment if your backend uses HTTPS with a self-signed certificate
        // rewrite: (path) => path.replace(/^\/api/, ''), // Uncomment if your backend doesn't expect '/api' prefix
      }
    }
    // If you want Vite to be accessible from other devices on your network,
    // uncomment and set the host below. Otherwise, it defaults to localhost.
    // host: '0.0.0.0'
  }
})