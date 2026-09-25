/**
 * Smoke test: does the embedding model understand Chinese, and match across languages?
 * 7 mixed Chinese/English items, 4 queries (2 Chinese, 2 English), top-2 precision per model.
 *   npm run check:multilingual
 */
import { pipeline } from '@huggingface/transformers'
const items = [
  ['refund', '退款處理延遲，客戶要求盡快回覆'],
  ['migration', '付款服務遷移計劃：下星期切換到新系統'],
  ['stripe', 'Stripe webhook retries failing in staging'],
  ['interview', '面試安排：後端工程師候選人星期三下午'],
  ['committee', '招聘委員會會議，討論錄取決定'],
  ['cake', '下午三點廚房有生日蛋糕'],
  ['parking', '停車場星期六維修'],
]
const queries = [
  ['付款問題', ['refund', 'migration', 'stripe']],
  ['招聘進度', ['interview', 'committee']],
  ['hiring decisions', ['interview', 'committee']],
  ['payment failures', ['refund', 'migration', 'stripe']],
]
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0)
for (const model of ['Xenova/all-MiniLM-L6-v2', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2']) {
  const ex = await pipeline('feature-extraction', model, { dtype: 'q8' })
  const embed = async (t) => (await ex(t, { pooling: 'mean', normalize: true })).tolist()
  const vecs = await embed(items.map((i) => i[1]))
  let hits = 0, total = 0
  const lines = []
  for (const [q, want] of queries) {
    const [qv] = await embed([q])
    const top = items.map((it, i) => [it[0], dot(qv, vecs[i])]).sort((a, b) => b[1] - a[1]).slice(0, 2).map((x) => x[0])
    const h = top.filter((t) => want.includes(t)).length
    hits += h; total += 2
    lines.push(`  "${q}" → ${top.join(', ')} (${h}/2)`)
  }
  console.log(`${model}: top-2 precision ${hits}/${total}\n${lines.join('\n')}`)
}
