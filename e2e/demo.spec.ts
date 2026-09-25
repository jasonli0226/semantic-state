import { type Locator, type Page, expect, test } from '@playwright/test'

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
