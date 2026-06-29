// Focused E2E check for file-tree context-menu operations: right-click menu,
// delete (menu + keyboard), duplicate, and the empty-space root menu.
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
const menu = () => page.getByRole('menu')
const menuItem = (name) => menu().getByRole('menuitem', { name, exact: true })

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
  await treeItem('index.ts').waitFor({ timeout: 20000 })
}

await freshLoad()

// 1. Right-click a file row opens the context menu with the expected items.
await treeItem('greeter.ts').click({ button: 'right' })
await menu().waitFor({ timeout: 5000 })
const labels = await menu().getByRole('menuitem').allInnerTexts()
check(
  'file menu has expected items',
  ['New File', 'New Folder', 'Rename', 'Duplicate', 'Copy Path', 'Delete'].every(
    (l) => labels.includes(l),
  ),
)

// 2. Escape closes the menu.
await page.keyboard.press('Escape')
await menu().waitFor({ state: 'hidden', timeout: 3000 }).then(
  () => check('Escape closes menu', true),
  () => check('Escape closes menu', false),
)

// 3. Duplicate creates greeter-copy.ts with identical contents.
await treeItem('greeter.ts').click({ button: 'right' })
await menuItem('Duplicate').click()
await treeItem('greeter-copy.ts')
  .waitFor({ timeout: 5000 })
  .then(
    () => check('Duplicate creates greeter-copy.ts', true),
    () => check('Duplicate creates greeter-copy.ts', false),
  )

// 4. Delete via menu (accept the confirm dialog) removes the duplicate.
page.once('dialog', (d) => d.accept())
await treeItem('greeter-copy.ts').click({ button: 'right' })
await menuItem('Delete').click()
await treeItem('greeter-copy.ts')
  .waitFor({ state: 'detached', timeout: 5000 })
  .then(
    () => check('Delete via menu removes file', true),
    () => check('Delete via menu removes file', false),
  )

// 5. Delete via keyboard: select a file, press Delete, accept dialog.
page.once('dialog', (d) => d.accept())
await treeItem('greeter.ts').click()
await page.keyboard.press('Delete')
const keyDeleted = await treeItem('greeter.ts')
  .waitFor({ state: 'detached', timeout: 5000 })
  .then(() => true, () => false)
check('Delete via keyboard removes file', keyDeleted)

// 6. Empty-space right-click shows a root menu with only create actions.
try {
  const body = page.locator('.file-tree__body')
  const box = await body.boundingBox()
  await body.click({
    button: 'right',
    position: { x: box.width / 2, y: box.height - 8 },
  })
  await menu().waitFor({ timeout: 5000 })
  const rootLabels = await menu().getByRole('menuitem').allInnerTexts()
  check(
    'root menu has only create actions',
    rootLabels.length === 2 &&
      rootLabels.includes('New File') &&
      rootLabels.includes('New Folder'),
  )
} catch (err) {
  check('root menu has only create actions', false)
  console.log('   ⚠', String(err).split('\n')[0])
}

await browser.close()
console.log(failures ? `\n${failures} failure(s)` : '\nall file-tree checks passed')
process.exit(failures ? 1 : 0)
