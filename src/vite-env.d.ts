/// <reference types="vite/client" />

// The OXC wasm binary imported as a URL asset.
declare module '@oxc-parser/wasm/web/oxc_parser_wasm_bg.wasm?url' {
  const url: string
  export default url
}

// Allow probing the live monaco instance from e2e checks (DEV only).
interface Window {
  __monaco?: typeof import('monaco-editor')
}
