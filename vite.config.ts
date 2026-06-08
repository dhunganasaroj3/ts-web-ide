import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// In production (GitHub Pages project site) the app is served from
// /ts-web-ide/, so assets — including the wasm binaries — must resolve under
// that base. Dev stays at root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/ts-web-ide/' : '/',
  plugins: [react()],
  // @oxc-parser/wasm is an ESM wasm-bindgen module with its own loader/.wasm —
  // pre-bundling rewrites its wasm fetch and breaks init, so exclude it. Its
  // wasm binary is pulled in via a `?url` import.
  //
  // esbuild-wasm is CommonJS and MUST be pre-bundled by Vite to be consumed as
  // ESM, so it is intentionally NOT excluded; its .wasm comes via `?url`.
  optimizeDeps: {
    exclude: ['@oxc-parser/wasm'],
  },
  worker: {
    format: 'es',
  },
  build: {
    // Monaco is intentionally large and lazy-loads its per-language chunks at
    // runtime; the single big entry chunk is expected.
    chunkSizeWarningLimit: 5000,
  },
}))
