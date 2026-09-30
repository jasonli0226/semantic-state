import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

const SEMANTIC = 'useSemantic("what needs my attention right now")'

const panel = (page: Page, name: string) => page.getByRole('region', { name, exact: true })
const stat = (p: Locator, label: string) => p.locator('.stat', { has: p.page().locator('dt', { hasText: label }) }).locator('dd')
const topTitles = (p: Locator, n = 5) => p.locator('.row-title').evaluateAll((els, count) => els.slice(0, count).map((e) => e.textContent ?? ''), n)

async function ready(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '2. Work on payments' })).toBeEnabled({ timeout: 150_000 })
  await expect(panel(page, SEMANTIC).locator('.row').first()).toBeVisible()
}

async function runStep(page: Page, name: string) {
  const button = page.getByRole('button', { name })
  await button.click()
  // Steps with clicks pause between them; the step is done when its buttons re-enable.
  await expect(button).toBeEnabled({ timeout: 15_000 })
}

test('scripted demo: semantic beats rules, ignores spam, adapts, stays offline', async ({ page }) => {
  await ready(page)
  const rules = panel(page, 'Rules')
  const semantic = panel(page, SEMANTIC)

  await runStep(page, '2. Work on payments')
  await expect(stat(semantic, 'precision@5')).toHaveText('5/5')
  await expect(stat(rules, 'precision@5')).toHaveText('2/5')
  await expect(semantic.getByText('+1 similar')).toBeVisible()

  await runStep(page, '3. New item arrives')
  await expect(semantic.locator('.row-title', { hasText: 'Refund job timing out in production' })).toBeVisible()

  await runStep(page, '4. Spam wave')
  await expect.poll(() => topTitles(rules)).toContainEqual(expect.stringContaining('account will be suspended'))
  expect(await topTitles(semantic)).not.toContainEqual(expect.stringContaining('account will be suspended'))
  await page.waitForTimeout(500) // let the FLIP animation settle
  await page.screenshot({ path: 'docs/demo-payments.png' })

  await runStep(page, '5. Switch to hiring')
  await expect(stat(semantic, 'precision@5')).toHaveText(/^[45]\/5$/)
  await expect(stat(rules, 'precision@5')).toHaveText('0/5')
  await expect(stat(semantic, 'network since ready')).toHaveText('0')
  await page.waitForTimeout(500) // let the FLIP animation settle
  await page.screenshot({ path: 'docs/demo-hiring.png' })
})

test('manual commit policy holds the order until Refresh', async ({ page }) => {
  await ready(page)
  await page.getByRole('radio', { name: 'Manual' }).check()
  const semantic = panel(page, SEMANTIC)
  const before = await topTitles(semantic, 12)

  await runStep(page, '2. Work on payments')
  const pending = semantic.getByRole('status').filter({ hasText: 'moved up' })
  await expect(pending).toBeVisible()
  expect(await topTitles(semantic, 12)).toEqual(before)

  await pending.getByRole('button', { name: 'Refresh' }).click()
  await expect(pending).toBeHidden()
  await expect(stat(semantic, 'precision@5')).toHaveText('5/5')
})

test('scale test: 10k items are ranked in the worker, the page stays responsive', async ({ page }) => {
  await ready(page)
  await page.getByRole('button', { name: '+10,000' }).click()
  const semantic = panel(page, SEMANTIC)
  await expect(page.getByText(/Scale test · 10,0\d\d items/)).toBeVisible({ timeout: 30_000 })
  await runStep(page, '2. Work on payments')
  // Precision is not asserted here: synthetic items are near-paraphrases of real ones and crowd the top.
  await expect(stat(semantic, 'rank (worker)')).toHaveText(/ms$/)
  const workerMs = await stat(semantic, 'rank (worker)').textContent()
  test.info().annotations.push({ type: 'rank at 10k', description: `worker ${workerMs} · precision ${await stat(semantic, 'precision@5').textContent()}` })
  await page.waitForTimeout(500) // let the FLIP animation settle
  await page.screenshot({ path: 'docs/demo-10k.png' })
})

/** Entries in the worker's vector cache (0 if the database does not exist yet). */
const cachedVectors = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const req = indexedDB.open('semantic-state')
        req.onupgradeneeded = () => req.transaction?.abort() // not created yet: don't create it here
        req.onerror = () => resolve(0)
        req.onsuccess = () => {
          const db = req.result
          if (!db.objectStoreNames.contains('vectors')) return (db.close(), resolve(0))
          const count = db.transaction('vectors', 'readonly').objectStore('vectors').count()
          count.onsuccess = () => (db.close(), resolve(count.result))
          count.onerror = () => (db.close(), resolve(0))
        }
      }),
  )

test('a reload embeds nothing: item vectors come from the IndexedDB cache', async ({ page }) => {
  await ready(page)
  await expect(page.getByText(/^Embedding \d+ of \d+ items/)).toHaveCount(0)
  // Cache writes are fire-and-forget: wait until the count is non-zero and stable.
  await expect
    .poll(async () => {
      const before = await cachedVectors(page)
      await page.waitForTimeout(300)
      return before > 0 && before === (await cachedVectors(page))
    })
    .toBe(true)

  // Record whether the embedding banner ever appears during the reload.
  await page.addInitScript(() => {
    const w = window as unknown as { sawEmbedding: boolean }
    w.sawEmbedding = false
    new MutationObserver(() => {
      if (/Embedding \d+ of \d+ items/.test(document.body?.textContent ?? '')) w.sawEmbedding = true
    }).observe(document, { childList: true, subtree: true, characterData: true })
  })
  await page.reload()
  await expect(page.getByRole('button', { name: '2. Work on payments' })).toBeEnabled({ timeout: 150_000 })
  await expect(panel(page, SEMANTIC).locator('.row').first()).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { sawEmbedding: boolean }).sawEmbedding)).toBe(false)
})
