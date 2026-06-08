/**
 * TypeScript language-service configuration for the in-browser project.
 *
 * These options apply to the *virtual* project the user edits — they are
 * independent of the IDE's own tsconfig.json. `allowJs + checkJs` is what makes
 * JSDoc annotations (e.g. `/** @returns {string} *\/`) actually type-check.
 *
 * monaco 0.55 exposes the TypeScript language API both at runtime
 * (`monaco.languages.typescript`) and as a non-deprecated top-level named
 * export `typescript`. We use the named export so the types resolve cleanly.
 */
import { typescript } from 'monaco-editor'

let configured = false

export function configureTypeScript() {
  if (configured) return
  configured = true

  const { typescriptDefaults, javascriptDefaults } = typescript

  const compilerOptions: import('monaco-editor').typescript.CompilerOptions = {
    target: typescript.ScriptTarget.ESNext,
    module: typescript.ModuleKind.ESNext,
    moduleResolution: typescript.ModuleResolutionKind.NodeJs,
    allowJs: true,
    checkJs: true, // JSDoc type-checking in .js files
    strict: true,
    noEmit: true,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    jsx: typescript.JsxEmit.ReactJSX,
    allowNonTsExtensions: true,
    skipLibCheck: true,
  }

  typescriptDefaults.setCompilerOptions(compilerOptions)
  javascriptDefaults.setCompilerOptions(compilerOptions)

  // Ship every open model to the TS worker so cross-file imports resolve.
  typescriptDefaults.setEagerModelSync(true)
  javascriptDefaults.setEagerModelSync(true)

  const diagnosticsOptions = {
    noSemanticValidation: false,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: false,
  }
  typescriptDefaults.setDiagnosticsOptions(diagnosticsOptions)
  javascriptDefaults.setDiagnosticsOptions(diagnosticsOptions)
}
