import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

const graph = (page: Page) => page.getByRole('region', { name: 'Memory graph' })
const nodes = (page: Page) => graph(page).getByRole('button')
const detail = (page: Page) => page.getByRole('region', { name: 'Article details' })
const pendingChip = (page: Page) => page.getByText(/\d+ changes? pending/)
const focusedTitle = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute('data-title') ?? null)

async function open(page: Page) {
  await page.goto('/')
  await expect(nodes(page)).toHaveCount(6, { timeout: 30_000 })
}

test('opens on Moon with its five nearest articles', async ({ page }) => {
  await open(page)
  await expect(graph(page).locator('[data-title="Moon"]')).toBeVisible()
  await expect(detail(page).getByRole('heading', { name: 'Moon' })).toBeVisible()
  await expect(detail(page).locator('.why')).toContainText('You clicked this')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'docs/memory-graph.png' })
})

test('clicking a neighbour expands it and explains it', async ({ page }) => {
  await open(page)
  const neighbour = nodes(page).nth(1)
  const title = await neighbour.getAttribute('data-title')
  await neighbour.click()
  await expect.poll(() => nodes(page).count()).toBeGreaterThan(6)
  await expect(detail(page).getByRole('heading', { name: title! })).toBeVisible()
  await expect(detail(page).locator('.why')).toContainText('You clicked this')
})

test('sizes hold still while the pointer is on the graph, then apply when it leaves', async ({ page }) => {
  await open(page)
  await nodes(page).nth(1).click()
  await page.mouse.move(400, 400)
  await expect(pendingChip(page)).toBeVisible()
  await page.mouse.move(5, 5)
  await expect(pendingChip(page)).toBeHidden()
})

test('keyboard: Enter expands, arrows browse neighbours', async ({ page }) => {
  await open(page)
  await nodes(page).nth(2).focus()
  const start = await focusedTitle(page)
  await page.keyboard.press('Enter')
  await expect.poll(() => nodes(page).count()).toBeGreaterThan(6)
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => focusedTitle(page)).not.toBe(start)
  await page.keyboard.press('Escape')
  await expect.poll(() => focusedTitle(page)).toBe(start)
})

test('search runs the model on-device and expands the best match', async ({ page }) => {
  await open(page)
  const search = page.getByRole('searchbox')
  await search.fill('playing the guitar in a band')
  await search.press('Enter')
  await expect(page.getByText('Search model ready')).toBeVisible({ timeout: 150_000 })
  await expect(detail(page).getByRole('heading')).toHaveText(/^(Musical instrument|Music)$/, { timeout: 30_000 })
})

test('reset forgets what you explored', async ({ page }) => {
  await open(page)
  await nodes(page).nth(1).click()
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(nodes(page)).toHaveCount(6)
  await expect(graph(page).locator('.ring')).toHaveCount(0)
})
