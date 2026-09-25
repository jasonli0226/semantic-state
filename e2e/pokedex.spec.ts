import { type Page, expect, test } from '@playwright/test'

const ranked = (page: Page) => page.getByRole('region', { name: 'Ranked for you' })
const rankedNames = (page: Page, n = 15) =>
  ranked(page).locator('.row-title').evaluateAll((els, count) => els.slice(0, count).map((e) => e.textContent ?? ''), n)
const card = (page: Page, name: string) => page.getByRole('list', { name: 'Pokédex' }).getByRole('button', { name: new RegExp(`\\b${name}\\b`) })

async function open(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('list', { name: 'Pokédex' }).getByRole('listitem')).toHaveCount(1025, { timeout: 30_000 })
}

test('clicks: each interest keeps a lane, the Pokédex order never changes', async ({ page }) => {
  await open(page)
  await card(page, 'Squirtle').click()
  await card(page, 'Charmander').click()

  const reasons = ranked(page).locator('.reason')
  await expect(reasons.first()).toBeVisible()
  const top6 = await reasons.evaluateAll((els) => els.slice(0, 6).map((e) => e.textContent))
  expect(top6).toContain('like Squirtle')
  expect(top6).toContain('like Charmander')

  const detail = page.getByRole('region', { name: 'Charmander details' })
  await expect(detail.getByRole('heading', { name: 'Similar to Charmander' })).toBeVisible()
  await expect(detail.locator('.similar li')).toHaveCount(6)
  await expect(page.getByRole('list', { name: 'Pokédex' }).locator('.card-name').first()).toHaveText('Bulbasaur')
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'docs/pokedex-clicks.png' })
})

test('free-text search runs the model on-device and finds the right types', async ({ page }) => {
  await open(page)
  await page.getByRole('searchbox').fill('ghost that haunts old houses')
  await expect(page.getByText('Search model ready')).toBeVisible({ timeout: 150_000 })
  await expect(ranked(page).locator('.reason').first()).toHaveText('matches “ghost that haunts old houses”')
  const ghostsInTop5 = await ranked(page)
    .locator('.row')
    .evaluateAll((rows) => rows.slice(0, 5).filter((r) => r.querySelector('.type-ghost')).length)
  expect(ghostsInTop5).toBeGreaterThanOrEqual(4)
  await expect(ranked(page).locator('.stat', { hasText: 'network since model' }).locator('dd')).toHaveText('0')
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'docs/pokedex-search.png' })
})

test('the ranked list holds still while you click inside it, then applies on leave', async ({ page }) => {
  await open(page)
  await card(page, 'Pikachu').click()
  await expect(ranked(page).locator('.row').first()).toBeVisible()
  const before = await rankedNames(page)

  await ranked(page).locator('.row-main').nth(2).click() // a new interest, clicked from inside the panel
  await expect(ranked(page).getByRole('status').filter({ hasText: /moved up|new/ })).toBeVisible()
  // Held: only the clicked row is gone (the 16th slides into view at the bottom).
  const held = before.filter((name) => name !== before[2])
  expect(await rankedNames(page, 14)).toEqual(held)

  await page.mouse.move(5, 5) // leave the panel
  await expect(ranked(page).getByRole('status').filter({ hasText: /moved up|new/ })).toBeHidden()
  expect(await rankedNames(page, 14)).not.toEqual(held)
})
