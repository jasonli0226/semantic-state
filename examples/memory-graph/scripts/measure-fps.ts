/**
 * Frames per second while panning and zooming the map, on a production build.
 *   npm run build -w examples/memory-graph && npx vite preview --port 4175 --strictPort (in examples/memory-graph)
 *   npm run measure:fps -w examples/memory-graph
 */
import { chromium } from '@playwright/test'

const URL = process.env.GRAPH_URL ?? 'http://localhost:4175/'
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1480, height: 1000 } })
await page.goto(URL)
await page.locator('g.node').nth(1000).waitFor()
await page.waitForTimeout(1500)
const box = (await page.getByRole('region', { name: 'Memory graph' }).boundingBox())!
const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2]

await page.evaluate(() => {
  const w = window as unknown as { frames: number; counting: boolean }
  w.frames = 0
  w.counting = true
  const tick = () => {
    if (!w.counting) return
    w.frames += 1
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})
const started = Date.now()
await page.mouse.move(cx, cy)
await page.mouse.down()
for (let i = 0; i < 40; i += 1) await page.mouse.move(cx + Math.sin(i / 4) * 200, cy + Math.cos(i / 4) * 120)
await page.mouse.up()
for (let i = 0; i < 20; i += 1) await page.mouse.wheel(0, i < 10 ? -120 : 120)
const seconds = (Date.now() - started) / 1000
const frames = await page.evaluate(() => {
  const w = window as unknown as { frames: number; counting: boolean }
  w.counting = false
  return w.frames
})
console.log(`${(frames / seconds).toFixed(0)} fps over ${seconds.toFixed(1)} s of panning and zooming (1003 articles)`)
await browser.close()
