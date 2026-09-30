import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import { notificationCatalog } from './scripts/notification-catalog.mjs'
export default defineConfig({
  plugins: [
    react(),
    tailwind(),
    {
      name: 'panasms-notification-catalog',
      apply: 'build',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'notification-catalog.json',
          source: JSON.stringify(notificationCatalog()),
        })
      },
    },
  ],
  server: { proxy: { '/api': { target: 'http://127.0.0.1:8080', ws: true } } },
})
