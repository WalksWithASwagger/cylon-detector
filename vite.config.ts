import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import tsconfigPaths from 'vite-tsconfig-paths'
import injectHTML from 'vite-plugin-html-inject'

const publicContracts = [
  'benchmarks/mac-lab-001/0.1.0-alpha.1.json',
  'benchmarks/mac-lab-001/1.0.0.json',
  'benchmarks/challenges/provenance-flip/1.0.0.json',
  'benchmarks/challenges/synesthesia/1.0.0.json',
  'benchmarks/challenges/blindsight/1.0.0.json',
  'schemas/benchmark-definition.v1.schema.json',
  'schemas/evaluation-run.v1.schema.json',
  'schemas/benchmark-definition.v2.schema.json',
  'schemas/evaluation-run.v2.schema.json',
  'schemas/blind-review-packet.v1.schema.json',
  'schemas/review-contribution.v1.schema.json',
  'schemas/review-bundle.v1.schema.json',
  'schemas/preregistration.v1.schema.json',
  'fixtures/demo/witness-theory-adjudicated.v2.json',
  'indicators/templates/minimal-witness/0.1.0-draft.json'
]

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    injectHTML(),
    {
      name: 'cylon-public-contracts',
      generateBundle() {
        for (const fileName of publicContracts) {
          this.emitFile({
            type: 'asset',
            fileName,
            source: readFileSync(new URL(fileName, import.meta.url), 'utf8')
          })
        }
      }
    }
  ],
  server: {
    port: 8080,
    open: false
  },
  build: {
    target: 'es2020',
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      input: {
        main: './index.html',
        paper: './paper.html',
        bench: './bench.html'
      },
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
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
    '__SOURCE_COMMIT__': JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA || 'local-uncommitted')
  }
})
