import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // La app se actualiza sola cuando hay una versión nueva (sin que el
      // usuario tenga que reinstalar).
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Rios Performance',
        short_name: 'Rios',
        description: 'Sistema de gestión de Rios Performance',
        lang: 'es',
        theme_color: '#2563eb',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Los chunks pesados (pdfjs, xlsx, jspdf) pueden superar el límite por
        // defecto; se sube para que el precache no los saltee.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // El SPA sirve index.html para cualquier ruta del cliente.
        navigateFallback: 'index.html',
      },
      // Permite probar la PWA (manifest + service worker) también en `dev`.
      devOptions: {
        enabled: true,
      },
    }),
  ],
})
