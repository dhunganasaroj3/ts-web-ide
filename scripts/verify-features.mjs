// Focused E2E check for the new features: console placement (bottom/right/tab),
// Format (Prettier), and Debug-mode hint. Uses system Chrome via Playwright.
import { chromium } from 'playwright'

const URL = process.env.IDE_URL ?? 'http://localhost:5173/'
let failures = 0
const check = (name, ok) => {
  console.log(`${ok ? '✅' : '❌'} ${name}`)
  if (!ok) failures++
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext()
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('   ⚠ pageerror', String(e)))

const tree = () => page.getByRole('tree')
const treeItem = (name) => tree().getByText(name, { exact: true })

async function freshLoad() {
  await page.goto(URL, { waitUntil: 'load' })
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
  await page.reload({ waitUntil: 'domcontentloaded' })
}

/** Open index.ts and wait until its seeded content is actually in Monaco. */
async function openIndexWithContent() {
  await treeItem('index.ts').waitFor({ timeout: 20000 })
  // The first reseed can race; click + check, retrying a few times.
  for (let i = 0; i < 6; i++) {
    await treeItem('index.ts').click()
    await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
    const ok = await page
      .waitForFunction(
        () =>
          document
            .querySelector('.monaco-editor .view-lines')
            ?.textContent?.includes('returnName'),
        { timeout: 5000 },
      )
      .then(() => true)
      .catch(() => false)
    if (ok) return
    await page.waitForTimeout(500)
  }
  throw new Error('seeded index.ts content never loaded into Monaco')
}

try {
  await freshLoad()
  await openIndexWithContent()

  const placementBtn = page.getByRole('button', { name: /Console:/ })
  const runBtn = page.getByRole('button', { name: /Run/ })
  const consoleLog = (text) =>
    page.locator('.console-line', { hasText: text }).first()

  // ---- Console placement: BOTTOM (default) — Run streams logs ----
  check('placement button starts at Bottom', /Bottom/.test(await placementBtn.innerText()))
  await runBtn.click()
  await consoleLog('Hello, John!').waitFor({ timeout: 30000 })
  check('BOTTOM: Run streams console output', true)

  // ---- Console placement: RIGHT — Run still streams (lifted sandbox host) ----
  await placementBtn.click()
  check('placement cycles to Right', /Right/.test(await placementBtn.innerText()))
  await page.waitForTimeout(200)
  await runBtn.click()
  await consoleLog('Hello, John!').waitFor({ timeout: 30000 })
  check('RIGHT: Run still streams output (sandbox host not detached)', true)

  // ---- Console placement: TAB — a Console tab appears in the dock ----
  await placementBtn.click()
  check('placement cycles to Tab', /Tab/.test(await placementBtn.innerText()))
  await page.locator('.dv-tab', { hasText: 'Console' }).first().waitFor({ timeout: 8000 })
  check('TAB: a Console tab appears in the editor dock', true)
  await runBtn.click()
  await consoleLog('Hello, John!').waitFor({ timeout: 30000 })
  check('TAB: Run still streams output', true)

  // Closing a file tab must NOT remove the console tab.
  await treeItem('greeter.ts').click()
  await page.waitForTimeout(300)
  check(
    'TAB: console tab survives while other tabs change',
    (await page.locator('.dv-tab', { hasText: 'Console' }).count()) > 0,
  )

  // ---- Placement persists across reload ----
  await page.waitForTimeout(600) // debounced persist
  await page.reload({ waitUntil: 'domcontentloaded' })
  await treeItem('index.ts').waitFor({ timeout: 15000 })
  await page.getByRole('button', { name: /Console:/ }).waitFor({ timeout: 12000 })
  // Let the FS-ready restore effect apply the persisted placement.
  const persisted = await page
    .waitForFunction(
      () => {
        const btn = [...document.querySelectorAll('button')].find((b) =>
          /Console:/.test(b.textContent ?? ''),
        )
        return btn && /Tab/.test(btn.textContent ?? '') ? true : false
      },
      { timeout: 8000 },
    )
    .then(() => true)
    .catch(() => false)
  check('placement persists across reload (Tab)', persisted)
  // Cycle back to bottom for the format test (simpler layout).
  const pBtn = page.getByRole('button', { name: /Console:/ })
  while (!/Bottom/.test(await pBtn.innerText())) {
    await pBtn.click()
    await page.waitForTimeout(150)
  }

  // ---- Format (Prettier) ----
  await openIndexWithContent()
  // Click into the editor so it becomes the tracked active editor.
  await page.locator('.monaco-editor .view-lines').first().click()
  await page.waitForTimeout(200)
  // Replace the active model's content with messy code, then format.
  await page.evaluate(() => {
    const m = window.__monaco.editor.getModel(
      window.__monaco.Uri.parse('file:///index.ts'),
    )
    m.setValue('const    x={a:1,b:2}  ;\n\n\nfunction   f(  ){return    x}\n')
  })
  await page.getByRole('button', { name: /Format/ }).click()
  const formatted = await page.waitForFunction(
    () => {
      const m = window.__monaco.editor.getModel(
        window.__monaco.Uri.parse('file:///index.ts'),
      )
      const v = m.getValue()
      return v.includes('const x = { a: 1, b: 2 }') ? v : false
    },
    { timeout: 10000 },
  ).then((h) => h.jsonValue()).catch(() => null)
  check('Format reflows the active file with Prettier', !!formatted)

  // Syntax error → format leaves content intact (provider returns no edits).
  await page.evaluate(() => {
    const m = window.__monaco.editor.getModel(
      window.__monaco.Uri.parse('file:///index.ts'),
    )
    m.setValue('const broken = (\n')
  })
  await page.getByRole('button', { name: /Format/ }).click()
  await page.waitForTimeout(800)
  const intact = await page.evaluate(() => {
    const m = window.__monaco.editor.getModel(
      window.__monaco.Uri.parse('file:///index.ts'),
    )
    return m.getValue().includes('const broken = (')
  })
  check('Format on a syntax error leaves code intact', intact)

  // ---- Debug-mode hint ----
  // Restore valid content so the run pipeline proceeds normally.
  await page.evaluate(() => {
    const m = window.__monaco.editor.getModel(
      window.__monaco.Uri.parse('file:///index.ts'),
    )
    m.setValue("console.log('debug-ready')\n")
  })
  await page.getByRole('button', { name: /Debug/ }).click()
  await page
    .locator('.console-line--system', { hasText: /Debug mode/ })
    .first()
    .waitFor({ timeout: 10000 })
  check('Debug button emits the DevTools hint', true)
} catch (err) {
  console.error('Fatal error during verification:', err)
  failures++
} finally {
  await browser.close()
}

process.exit(failures ? 1 : 0)
