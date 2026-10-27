import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// /api/* is forwarded to the analysis server on :8000
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': { target: 'http://localhost:8000', rewrite: (p) => p.replace(/^\/api/, '') } },
  },
})
