/**
 * esbuild plugin: resolve bare (npm) imports via the esm.sh CDN.
 *
 * `import _ from 'lodash'` -> https://esm.sh/lodash, fetched at bundle time.
 * Sub-imports (esm.sh returns ESM that imports further https URLs) are resolved
 * relative to their importer URL. Responses are cached in-memory for the run.
 */
import type { Plugin } from 'esbuild-wasm'

const ESM_HOST = 'https://esm.sh/'
const HTTP_NS = 'http-url'

const cache = new Map<string, string>()

async function fetchText(url: string): Promise<string> {
  const hit = cache.get(url)
  if (hit !== undefined) return hit
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`)
  const text = await res.text()
  cache.set(url, text)
  return text
}

export function esmShPlugin(): Plugin {
  return {
    name: 'esm-sh',
    setup(build) {
      // Bare specifiers: not relative, not absolute, not already a URL.
      build.onResolve({ filter: /^[^./]/ }, (args) => {
        if (/^https?:\/\//.test(args.path)) {
          return { path: args.path, namespace: HTTP_NS }
        }
        return { path: ESM_HOST + args.path, namespace: HTTP_NS }
      })

      // Imports originating from a fetched http module.
      build.onResolve({ filter: /.*/, namespace: HTTP_NS }, (args) => {
        const url = /^https?:\/\//.test(args.path)
          ? args.path
          : new URL(args.path, args.importer).toString()
        return { path: url, namespace: HTTP_NS }
      })

      build.onLoad({ filter: /.*/, namespace: HTTP_NS }, async (args) => {
        const contents = await fetchText(args.path)
        return { contents, loader: 'js' }
      })
    },
  }
}
