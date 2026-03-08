import path from 'path'
import { fileURLToPath } from 'url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load .env from the same directory as this config (apps/web) so Mapbox token is always found
  const env = loadEnv(mode, __dirname, '')
  return {
    plugins: [react()],
    define: {
      /** Injected at build so Map always gets token from apps/web/.env (avoids Vite env quirks). */
      __MAPBOX_ACCESS_TOKEN__: JSON.stringify((env.VITE_MAPBOX_ACCESS_TOKEN ?? '').trim()),
    },
  }
})
