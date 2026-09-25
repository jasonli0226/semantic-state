/** Prints the most similar item pairs — used to pick the duplicate threshold. */
import { pipeline } from '@huggingface/transformers'
import { dot } from '../src/core/vector.ts'
import { embeddingText, initialItems, ARRIVALS } from '../src/data/dataset.ts'
import { EMBEDDING_MODEL } from '../src/semantic/config.ts'

const items = [...initialItems, ...Object.values(ARRIVALS)]
const extractor = await pipeline('feature-extraction', EMBEDDING_MODEL, { dtype: 'q8' })
const out = await extractor(items.map(embeddingText), { pooling: 'mean', normalize: true })
const dims = out.dims[1]
const data = out.data as Float32Array
const vec = (i: number) => data.slice(i * dims, (i + 1) * dims)
const pairs = items.flatMap((a, i) => items.slice(i + 1).map((b, j) => ({ a: a.id, b: b.id, sim: dot(vec(i), vec(i + 1 + j)) })))
pairs.sort((x, y) => y.sim - x.sim)
process.stdout.write(pairs.slice(0, 12).map((p) => `${p.sim.toFixed(3)}  ${p.a} ~ ${p.b}`).join('\n') + '\n')
