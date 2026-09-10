import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://47.108.78.62:18081'
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': { target: proxyTarget, changeOrigin: true },
      },
    },
    preview: {
      proxy: {
        '/api': { target: proxyTarget, changeOrigin: true },
      },
    },
  }
})
