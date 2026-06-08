/**
 * esbuild-wasm initialisation.
 *
 * Runs on the main thread (`worker: false`) — this avoids SharedArrayBuffer, so
 * no COOP/COEP cross-origin-isolation headers are required. `initialize()` may
 * only be called once per page, so we guard it.
 *
 * esbuild-wasm's browser build is CommonJS. Importing the namespace and reading
 * members off it (with a `.default` fallback) is the interop-safe way to get
 * `initialize`/`build` under Vite.
 */
import * as esbuildNs from 'esbuild-wasm'
// Vite serves the wasm binary as a URL asset.
import wasmURL from 'esbuild-wasm/esbuild.wasm?url'

// Normalise across CJS/ESM interop shapes.
const esbuild = (
  'initialize' in esbuildNs
    ? esbuildNs
    : (esbuildNs as unknown as { default: typeof esbuildNs }).default
) as typeof import('esbuild-wasm')

let initPromise: Promise<void> | null = null

export function initEsbuild(): Promise<void> {
  if (!initPromise) {
    initPromise = esbuild.initialize({ wasmURL, worker: false })
  }
  return initPromise
}

export const build = esbuild.build
