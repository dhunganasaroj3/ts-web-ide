# ts-web-ide

A **100% frontend** (no backend) multi-file TypeScript IDE that runs entirely in
the browser — edit, type-check, and execute TypeScript/JavaScript projects with
no server. React + Vite.

**🔗 Live demo:** https://dhunganasaroj3.github.io/ts-web-ide/

## Features

- **Multi-file editor** with a VS Code–style shell: file tree, dockable editor
  tabs, split panes, and a console panel.
- **File explorer operations** — right-click any file/folder (or empty space)
  for a context menu: New File, New Folder, Rename, Duplicate, Copy Path, and
  Delete (with confirm). Delete/Backspace removes the selected item too.
- **Full TypeScript type-checking, IntelliSense & JSDoc inference** via Monaco's
  TypeScript language service (e.g. `/** @returns {string} */` is checked).
- **Cross-file imports** resolve between virtual files (go-to-definition,
  find-references, etc.).
- **Run code in the browser** — multi-file projects are bundled with
  `esbuild-wasm` and executed in a sandboxed `<iframe>`; `console.*` output and
  runtime errors stream to the console panel.
- **npm packages at runtime** — bare imports (e.g. `import _ from 'lodash-es'`)
  are resolved from the [esm.sh](https://esm.sh) CDN, with `.d.ts` auto-acquired
  for IntelliSense.
- **Fast structural features via OXC** — `@oxc-parser/wasm` powers the document
  outline and instant syntax-error markers.
- **Persistent workspace** — files live in IndexedDB (via ZenFS) and survive
  reloads; open tabs are restored.

## Architecture

| Layer | Tech |
|---|---|
| Editor / type-checking / JSDoc | `monaco-editor` + `@monaco-editor/react` (TS worker, multi-model) |
| Fast parse / outline / syntax errors | `@oxc-parser/wasm` (parse-only) |
| Execution / bundling | `esbuild-wasm` (main thread, no COOP/COEP needed) |
| npm resolution + types | `esm.sh` CDN |
| Virtual filesystem + persistence | `@zenfs/core` + `@zenfs/dom` (IndexedDB) |
| File tree | `react-arborist` |
| Layout | `allotment` (shell) + `dockview-react` (tabs) |
| Workspace metadata | `localStorage` |

> **Why hybrid (Monaco + OXC)?** OXC has no production browser type checker and
> oxlint-WASM is unpublished, so Monaco's TypeScript worker handles
> type-checking/IntelliSense while OXC handles fast parse-level features.

Key modules:

- `src/monaco-env.ts` — Monaco worker wiring for Vite.
- `src/services/monaco/` — compiler options, multi-model manager, type
  acquisition, OXC markers.
- `src/services/fs/` — ZenFS virtual filesystem + tree.
- `src/services/run/` — esbuild bundle pipeline (`zenfsPlugin`, `esmShPlugin`)
  and the iframe sandbox.
- `src/services/oxc/oxc.ts` — guarded OXC loader (outline, parse errors).
- `src/services/persist/workspace.ts` — open-tabs/layout persistence.

## Develop

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

## Build

```bash
pnpm build
pnpm preview
```

## Verify

End-to-end browser tests (Playwright, driving system Chrome — no chromium
download):

```bash
pnpm dev --port 5199 &
pnpm verify           # full suite against the dev server

pnpm build && pnpm preview --port 5188 &
pnpm verify:prod      # UI-only smoke test against the production build
```

## Notes / gotchas

- `@oxc-parser/wasm` is pinned at the deprecated `0.60.0` (the napi build is far
  ahead); it is lazy-loaded and guarded, so OXC features degrade gracefully if
  it ever fails to load. Type-checking and execution are unaffected.
- The sandbox iframe uses `sandbox="allow-scripts"` without `allow-same-origin`,
  so user code runs at an opaque origin and cannot reach app storage.
- Every virtual file should be an ES module (have an `import`/`export`) so the TS
  worker treats it as a module rather than a global script.
