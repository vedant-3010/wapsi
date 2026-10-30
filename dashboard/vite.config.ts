import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Local-only: WAPSI_LOCAL_POSTGREST=http://127.0.0.1:3001 (scripts/local_stack.sh) serves /rest/v1 from a
// plain PostgREST, so the dashboard and backend run without Supabase. Realtime is absent locally; the
// dashboard falls back to refreshing every 3 s.
const localPostgrest = process.env.WAPSI_LOCAL_POSTGREST

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: localPostgrest
    ? {
        proxy: {
          '/rest/v1': {
            target: localPostgrest,
            rewrite: (path) => path.replace(/^\/rest\/v1/, ''),
            // PostgREST has no JWT secret locally, so drop the Supabase key it would try to verify.
            configure: (proxy) => proxy.on('proxyReq', (request) => request.removeHeader('authorization')),
          },
        },
      }
    : undefined,
})
