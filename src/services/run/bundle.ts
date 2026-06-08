/**
 * Bundle the virtual project starting from an entry file.
 */
import { initEsbuild, build } from './esbuild'
import { zenfsPlugin } from './zenfsPlugin'
import { esmShPlugin } from './esmShPlugin'

export interface BundleResult {
  code: string | null
  errors: string[]
  warnings: string[]
}

export async function bundle(entry: string): Promise<BundleResult> {
  await initEsbuild()
  try {
    const result = await build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      format: 'esm',
      target: 'es2020',
      sourcemap: 'inline',
      logLevel: 'silent',
      plugins: [zenfsPlugin(), esmShPlugin()],
    })
    return {
      code: result.outputFiles?.[0]?.text ?? null,
      errors: result.errors.map(formatMessage),
      warnings: result.warnings.map(formatMessage),
    }
  } catch (err) {
    // esbuild throws a BuildFailure with structured errors.
    const failure = err as { errors?: { text: string; location?: unknown }[] }
    const errors =
      failure.errors?.map((e) => e.text) ?? [String((err as Error).message ?? err)]
    return { code: null, errors, warnings: [] }
  }
}

function formatMessage(m: {
  text: string
  location?: { file?: string; line?: number; column?: number } | null
}): string {
  if (m.location?.file) {
    return `${m.location.file}:${m.location.line}:${m.location.column}: ${m.text}`
  }
  return m.text
}
