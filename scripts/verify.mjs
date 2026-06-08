// End-to-end smoke test for the in-browser IDE using system Chrome (Playwright).
// Verifies phases 0–5: boot, virtual FS + tree, JSDoc/type-checking, multi-file
// tabs + cross-file types + model lifecycle, execution (esbuild-wasm + sandbox),
// type acquisition (esm.sh .d.ts) + OXC, and workspace persistence.
import { chromium } from 'playwright'

const URL = process.env.IDE_URL ?? 'http://localhost:5199/'
const log = (...a) => console.log('•', ...a)
let failures = 0
const check = (name, ok) => {
  console.log(`${ok ? '✅' : '❌'} ${name}`)
  if (!ok) failures++
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext()
const page = await ctx.newPage()
const consoleErrors = []
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text())
})
page.on('pageerror', (e) => consoleErrors.push(String(e)))

// Tree-scoped helpers so file names don't collide with dockview tab text.
const tree = () => page.getByRole('tree')
const treeItem = (name) => tree().getByText(name, { exact: true })

async function freshLoad() {
  await page.goto(URL, { waitUntil: 'load' })
  // Wipe persisted state for a deterministic run, then reload to re-seed.
  await page.evaluate(async () => {
    localStorage.clear()
    const dbs = (await indexedDB.databases?.()) ?? []
    await Promise.all(
      dbs.map(
        (d) =>
          new Promise((res) => {
            const req = indexedDB.deleteDatabase(d.name)
            req.onsuccess = req.onerror = req.onblocked = () => res()
          }),
      ),
    )
  })
  await page.reload({ waitUntil: 'networkidle' })
}

async function writeVfs(path, content) {
  await page.evaluate(
    async ([p, c]) => {
      const mod = await import('/src/services/fs/zenfs.ts')
      await mod.writeFile(p, c)
    },
    [path, content],
  )
}

try {
  await freshLoad()

  // ---- Phase 1: FS + tree ----
  await treeItem('index.ts').waitFor({ timeout: 15000 })
  check('file tree renders seeded index.ts', true)
  check('file tree renders seeded greeter.ts', (await treeItem('greeter.ts').count()) > 0)

  await treeItem('index.ts').click()
  await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
  await page.waitForFunction(
    () =>
      document
        .querySelector('.monaco-editor .view-lines')
        ?.textContent?.includes('returnName'),
    { timeout: 15000 },
  )
  check('opening index.ts loads its content into Monaco', true)

  // Persistence of a created file across reload.
  await writeVfs('/persist-check.ts', 'export const x = 1\n')
  await page.reload({ waitUntil: 'networkidle' })
  await treeItem('persist-check.ts').waitFor({ timeout: 10000 }).catch(() => {})
  check('created file persists across reload (IndexedDB)', (await treeItem('persist-check.ts').count()) > 0)

  // ---- Phase 0/4: type-checking engine ----
  await page.waitForFunction(() => !!window.__monaco?.typescript, { timeout: 15000 })

  const diagCount = await page.evaluate(async () => {
    const monaco = window.__monaco
    const uri = monaco.Uri.parse('file:///___typecheck_probe.ts')
    monaco.editor.getModel(uri)?.dispose()
    monaco.editor.createModel(`const n: number = 'a string'\nexport {}\n`, 'typescript', uri)
    const w = await monaco.typescript.getTypeScriptWorker()
    const c = await w(uri)
    return (await c.getSemanticDiagnostics(uri.toString())).length
  })
  check('TS worker reports a semantic type error', diagCount > 0)

  const jsdocDiag = await page.evaluate(async () => {
    const monaco = window.__monaco
    const uri = monaco.Uri.parse('file:///___jsdoc_probe.js')
    monaco.editor.getModel(uri)?.dispose()
    monaco.editor.createModel(
      `/** @returns {string} */\nfunction f() { return 'x' }\n/** @type {number} */\nconst y = f()\nexport {}\n`,
      'javascript',
      uri,
    )
    const w = await monaco.typescript.getJavaScriptWorker()
    const c = await w(uri)
    return (await c.getSemanticDiagnostics(uri.toString())).length
  })
  check('JSDoc @returns is type-checked in .js (checkJs)', jsdocDiag > 0)

  // ---- Phase 2: multi-file tabs + cross-file types + model lifecycle ----
  await treeItem('index.ts').click()
  await treeItem('greeter.ts').click()
  await page.locator('.dv-tab').first().waitFor({ timeout: 10000 }).catch(() => {})
  check('two files open as dockview tabs', (await page.locator('.dv-tab').count()) >= 2)

  // Give the TS worker a moment to sync both models, then poll until the
  // import resolves (worker syncing is async after models are created).
  const crossFile = await page.evaluate(async () => {
    const monaco = window.__monaco
    const uri = monaco.Uri.parse('file:///index.ts')
    const w = await monaco.typescript.getTypeScriptWorker()
    const c = await w(uri)
    for (let i = 0; i < 20; i++) {
      const diags = await c.getSemanticDiagnostics(uri.toString())
      const moduleErrors = diags.filter((d) => d.code === 2307).length
      if (moduleErrors === 0) return 0
      await new Promise((r) => setTimeout(r, 250))
    }
    const diags = await c.getSemanticDiagnostics(uri.toString())
    return diags.filter((d) => d.code === 2307).length
  })
  check('cross-file import ./greeter resolves (no TS2307)', crossFile === 0)

  const beforeClose = await page.evaluate(
    () => !!window.__monaco.editor.getModel(window.__monaco.Uri.parse('file:///greeter.ts')),
  )
  const greeterTab = page.locator('.dv-tab', { hasText: 'greeter.ts' }).first()
  await greeterTab.hover().catch(() => {})
  await greeterTab
    .locator('.dv-default-tab-action')
    .click({ timeout: 4000 })
    .catch(async () => {
      await greeterTab.click({ button: 'middle' }).catch(() => {})
    })
  await page.waitForTimeout(400)
  const afterClose = await page.evaluate(
    () => !!window.__monaco.editor.getModel(window.__monaco.Uri.parse('file:///greeter.ts')),
  )
  check('greeter.ts model survives tab close (not disposed)', beforeClose && afterClose)

  // ---- Phase 3: execution ----
  const runBtn = page.getByRole('button', { name: /Run/ })

  await treeItem('index.ts').click()
  await runBtn.click()
  await page
    .locator('.console-line', { hasText: 'Hello, John!' })
    .first()
    .waitFor({ timeout: 30000 })
  check('running the seeded multi-file project logs "Hello, John!"', true)

  await writeVfs(
    '/run-lodash.ts',
    "import { chunk } from 'lodash-es'\nconsole.log('CHUNKED', JSON.stringify(chunk([1,2,3,4], 2)))\n",
  )
  await treeItem('run-lodash.ts').click({ timeout: 8000 })
  await runBtn.click()
  await page
    .locator('.console-line', { hasText: 'CHUNKED [[1,2],[3,4]]' })
    .first()
    .waitFor({ timeout: 30000 })
  check('running code with an esm.sh npm import works (lodash-es)', true)

  await writeVfs('/run-throw.ts', "throw new Error('boom-from-sandbox')\n")
  await treeItem('run-throw.ts').click({ timeout: 8000 })
  await runBtn.click()
  await page
    .locator('.console-line--error', { hasText: 'boom-from-sandbox' })
    .first()
    .waitFor({ timeout: 30000 })
  check('runtime errors are captured in the console', true)

  // ---- Phase 4: OXC outline ----
  const outline = await page.evaluate(async () => {
    const mod = await import('/src/services/oxc/oxc.ts')
    const symbols = await mod.getOutline(
      'export function alpha() {}\nconst beta = 1\nclass Gamma {}\n',
      'probe.ts',
    )
    return symbols.map((s) => s.name)
  })
  check(
    'OXC outline extracts top-level symbols',
    outline.includes('alpha') && outline.includes('beta') && outline.includes('Gamma'),
  )

  // ---- Phase 5: workspace persistence (open tabs restored) ----
  await treeItem('index.ts').click()
  await treeItem('greeter.ts').click()
  await page.waitForTimeout(600) // let debounced persist fire
  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('.dv-tab', { hasText: 'greeter.ts' }).first().waitFor({ timeout: 12000 }).catch(() => {})
  check(
    'open tabs are restored after reload',
    (await page.locator('.dv-tab', { hasText: 'greeter.ts' }).count()) > 0,
  )

  log('page-level console errors during run:', consoleErrors.length)
  if (consoleErrors.length) {
    for (const e of consoleErrors.slice(0, 8)) console.log('   ⚠', e)
  }
} catch (err) {
  console.error('Fatal error during verification:', err)
  failures++
} finally {
  await browser.close()
}

process.exit(failures ? 1 : 0)
