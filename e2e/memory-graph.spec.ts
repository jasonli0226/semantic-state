import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

const graph = (page: Page) => page.getByRole('region', { name: 'Memory graph' })
const nodes = (page: Page) => graph(page).locator('g.node')
const edges = (page: Page) => graph(page).locator('line.edge')
const node = (page: Page, title: string) => graph(page).locator(`g.node[data-title="${title}"]`)
const detail = (page: Page) => page.getByRole('region', { name: 'Article details' })
const nearest = (page: Page) => detail(page).locator('.neighbours button')
const pendingChip = (page: Page) => page.getByText(/\d+ changes? pending/)
const focusedTitle = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute('data-title') ?? null)
const worldTransform = (page: Page) => graph(page).locator('g.world').getAttribute('transform')
const worldScale = async (page: Page) => Number(/scale\(([\d.]+)\)/.exec((await worldTransform(page)) ?? '')?.[1])

async function open(page: Page) {
  await page.goto('/')
  await expect(nodes(page)).toHaveCount(1003, { timeout: 30_000 })
  await expect(edges(page)).toHaveCount(5)
}

/** Dots overlap when zoomed out, so tests click a specific node directly rather than by coordinates. */
const clickNode = (page: Page, title: string) => node(page, title).dispatchEvent('click')

test('opens on the whole map with the Moon trail', async ({ page }) => {
  await open(page)
  await expect(detail(page).getByRole('heading', { name: 'Moon' })).toBeVisible()
  await expect(detail(page).locator('.why')).toContainText('You clicked this')
  await expect(nearest(page)).toHaveCount(5)
})

test('clicking an article adds its trail and selects it', async ({ page }) => {
  await open(page)
  const title = (await nearest(page).first().textContent())!.replace(/\s[\d.]+$/, '').trim()
  await clickNode(page, title)
  await expect(detail(page).getByRole('heading', { name: title })).toBeVisible()
  await expect.poll(() => edges(page).count()).toBeGreaterThan(5)
})

test('sizes hold still while the pointer is on the map, then apply when it leaves', async ({ page }) => {
  await open(page)
  const box = (await graph(page).boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await nearest(page).first().dispatchEvent('click')
  await page.mouse.move(box.x + box.width / 2 + 5, box.y + box.height / 2 + 5)
  await expect(pendingChip(page)).toBeVisible()
  await page.mouse.move(box.x + box.width + 50, box.y + 10)
  await expect(pendingChip(page)).toBeHidden()
})

test('keyboard: one tab stop on Moon, arrows walk its neighbours, Escape returns', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Fit map' }).focus()
  await page.keyboard.press('Tab')
  expect(await focusedTitle(page)).toBe('Moon')
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => focusedTitle(page)).not.toBe('Moon')
  await page.keyboard.press('Escape')
  await expect.poll(() => focusedTitle(page)).toBe('Moon')
})

test('search runs the model on-device and flies to the best match', async ({ page }) => {
  await open(page)
  const before = await worldTransform(page)
  const search = page.getByRole('searchbox')
  await search.fill('playing the guitar in a band')
  await search.press('Enter')
  await expect(page.getByText('Search model ready')).toBeVisible({ timeout: 150_000 })
  await expect(detail(page).getByRole('heading', { level: 2 })).toHaveText('Musical instrument', { timeout: 30_000 })
  await expect.poll(() => worldTransform(page)).not.toBe(before)
  await expect.poll(() => worldScale(page)).toBeCloseTo(2, 1)
})

test('zoom buttons change the scale and Fit restores it', async ({ page }) => {
  await open(page)
  const fitted = await worldScale(page)
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect.poll(() => worldScale(page)).toBeGreaterThan(fitted)
  await page.getByRole('button', { name: 'Fit map' }).click()
  await expect.poll(() => worldScale(page)).toBeCloseTo(fitted, 2)
})

test('clicking articles never moves the camera, even when the side panel changes height', async ({ page }) => {
  // A shorter window, where the side panel's height (abstract length, neighbour list) exceeds the map's row.
  await page.setViewportSize({ width: 1280, height: 720 })
  await open(page)
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await page.waitForTimeout(300)
  const zoomed = await worldTransform(page)
  for (const i of [0, 1, 2]) {
    await nearest(page).nth(i).dispatchEvent('click')
    await page.waitForTimeout(400)
    expect(await worldTransform(page)).toBe(zoomed)
  }
})

test('reset forgets what you explored', async ({ page }) => {
  await open(page)
  await nearest(page).first().dispatchEvent('click')
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(detail(page).getByRole('heading', { name: 'Moon' })).toBeVisible()
  await expect(edges(page)).toHaveCount(5)
  await expect(graph(page).locator('.ring')).toHaveCount(0)
})

test('screenshot: the whole map after two clicks', async ({ page }) => {
  await open(page)
  await nearest(page).nth(1).dispatchEvent('click')
  await expect.poll(() => edges(page).count()).toBeGreaterThan(5)
  await nearest(page).nth(2).dispatchEvent('click')
  await page.mouse.move(5, 5)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: 'docs/memory-graph.png' })
})
