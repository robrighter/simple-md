import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  clearScreen: false,
  plugins: [react()],
  define: {
    __STORE_BUILD__: JSON.stringify(process.env.SIMPLE_MD_STORE_BUILD === '1'),
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return
          }

          if (id.includes('@uiw')) {
            return 'uiw-vendor'
          }

          if (id.includes('@codemirror/lang-markdown') || id.includes('@lezer')) {
            return 'markdown-editor-vendor'
          }

          if (id.includes('@codemirror')) {
            return 'editor-vendor'
          }

          if (
            id.includes('react-markdown') ||
            id.includes('remark-') ||
            id.includes('rehype-')
          ) {
            return 'markdown-pipeline-vendor'
          }

          if (id.includes('katex')) {
            return 'katex-vendor'
          }

          if (id.includes('highlight.js')) {
            return 'highlight-vendor'
          }

          if (id.includes('recharts') || id.includes('/d3-')) {
            return 'chart-vendor'
          }

          if (id.includes('@tauri-apps')) {
            return 'tauri-vendor'
          }
        },
      },
    },
  },
  server: {
    host: host || '0.0.0.0',
    port: 1420,
    strictPort: true,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
  },
})
