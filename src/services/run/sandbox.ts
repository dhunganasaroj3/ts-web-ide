/**
 * Sandbox: run bundled code inside an isolated <iframe> and stream console
 * output / errors back to the parent via postMessage.
 *
 * The iframe uses `sandbox="allow-scripts"` WITHOUT `allow-same-origin`, so the
 * code runs at an opaque origin and cannot reach our localStorage / IndexedDB /
 * DOM. postMessage still works across the boundary.
 *
 * Re-running replaces the iframe entirely, guaranteeing a fresh global scope.
 */

export type ConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug'

export interface SandboxMessage {
  channel: 'ts-web-ide-sandbox'
  runId: string
  kind: 'console' | 'error' | 'done'
  level?: ConsoleLevel
  text?: string
}

function srcdocFor(runId: string, code: string): string {
  // The shim serialises arguments to strings (structured-clone safe) and
  // forwards them to the parent. Module code runs after the shim is installed.
  const bootstrap = `
    const RUN_ID = ${JSON.stringify(runId)};
    function send(kind, level, parts) {
      parent.postMessage({
        channel: 'ts-web-ide-sandbox',
        runId: RUN_ID,
        kind, level,
        text: parts === undefined ? undefined : parts,
      }, '*');
    }
    function fmt(args) {
      return args.map((a) => {
        if (typeof a === 'string') return a;
        try { return JSON.stringify(a, replacer, 2); }
        catch { return String(a); }
      }).join(' ');
    }
    const seen = new WeakSet();
    function replacer(_k, v) {
      if (typeof v === 'function') return '[Function ' + (v.name || 'anonymous') + ']';
      if (typeof v === 'bigint') return v.toString() + 'n';
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[Circular]';
        seen.add(v);
      }
      return v;
    }
    for (const level of ['log','info','warn','error','debug']) {
      const orig = console[level].bind(console);
      console[level] = (...args) => { send('console', level, fmt(args)); orig(...args); };
    }
    window.addEventListener('error', (e) => {
      send('error', 'error', (e.error && e.error.stack) ? e.error.stack : e.message);
    });
    window.addEventListener('unhandledrejection', (e) => {
      const r = e.reason;
      send('error', 'error', (r && r.stack) ? r.stack : String(r));
    });
  `

  // The bundled code is an ES module and may contain top-level `export`
  // statements (esbuild preserves the entry module's exports). `export` is only
  // legal at the top level of a module, so the code must NOT be wrapped in a
  // try/catch block. Synchronous throws and rejected promises are already
  // captured by the window 'error' / 'unhandledrejection' listeners installed in
  // the bootstrap. A second module script signals completion after the first.
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>
<script>${bootstrap}</script>
<script type="module">
${code}
</script>
<script type="module">
parent.postMessage({ channel: 'ts-web-ide-sandbox', runId: ${JSON.stringify(runId)}, kind: 'done' }, '*');
</script>
</body></html>`
}

/**
 * Render the bundled code into a host element, replacing any prior iframe.
 * Returns the runId so the caller can filter postMessages.
 */
export function runInSandbox(
  host: HTMLElement,
  code: string,
  runId: string,
): void {
  host.replaceChildren()
  const iframe = document.createElement('iframe')
  iframe.setAttribute('sandbox', 'allow-scripts')
  iframe.style.width = '100%'
  iframe.style.height = '100%'
  iframe.style.border = 'none'
  iframe.srcdoc = srcdocFor(runId, code)
  host.appendChild(iframe)
}
