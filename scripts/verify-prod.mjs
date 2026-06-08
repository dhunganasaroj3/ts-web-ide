// Production-build smoke test: drives only the real UI (no /src imports), to
// confirm the built app boots, type-checks, and runs code with wasm assets.
import { chromium } from 'playwright'

const URL = process.env.IDE_URL ?? 'http://localhost:5188/'
let failures = 0
const check = (name, ok) => {
  console.log(`${ok ? '✅' : '❌'} ${name}`)
  if (!ok) failures++
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await (await browser.newContext()).newPage()
const tree = () => page.getByRole('tree')
const treeItem = (n) => tree().getByText(n, { exact: true })

try {
  await page.goto(URL, { waitUntil: 'load' })
  await page.evaluate(async () => {
    localStorage.clear()
    const dbs = (await indexedDB.databases?.()) ?? []
    await Promise.all(
      dbs.map(
        (d) =>
          new Promise((res) => {
            const r = indexedDB.deleteDatabase(d.name)
            r.onsuccess = r.onerror = r.onblocked = () => res()
          }),
      ),
    )
  })
  await page.reload({ waitUntil: 'networkidle' })

  await treeItem('index.ts').waitFor({ timeout: 15000 })
  check('prod build boots & seeds the file tree', true)

  // Run the seeded project — exercises esbuild-wasm bundling + sandbox in prod.
  await treeItem('index.ts').click()
  await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
  await page.getByRole('button', { name: /Run/ }).click()
  await page
    .locator('.console-line', { hasText: 'Hello, John!' })
    .first()
    .waitFor({ timeout: 40000 })
  check('prod build runs multi-file code (esbuild-wasm + sandbox)', true)
} catch (err) {
  console.error('Fatal error:', err)
  failures++
} finally {
  await browser.close()
}
process.exit(failures ? 1 : 0)
