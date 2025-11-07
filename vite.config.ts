import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import injectHTML from 'vite-plugin-html-inject'

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    injectHTML()
  ],
  server: {
    port: 8080,
    open: true
  },
  build: {
    target: 'es2020',
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          echarts: ['echarts']
        }
      }
    },
    chunkSizeWarningLimit: 1000,
    outDir: 'dist',
    emptyOutDir: true
  },
  optimizeDeps: {
    include: ['echarts']
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production')
  }
})
