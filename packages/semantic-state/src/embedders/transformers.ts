import { type FeatureExtractionPipeline, pipeline } from '@huggingface/transformers'
import type { Vec } from '../core/types.ts'
import type { Embedder } from '../worker/embedder.ts'

export interface TransformersEmbedderOptions {
  /** A feature-extraction model on the Hugging Face hub, e.g. 'Xenova/all-MiniLM-L6-v2' (~23 MB quantized). */
  readonly model: string
  readonly dtype?: 'fp32' | 'fp16' | 'q8' | 'q4'
  readonly batchSize?: number
}

/**
 * On-device embeddings with transformers.js (optional peer dependency). The model downloads on the
 * first embed() call, is cached by the browser, and runs in the worker — text never leaves the device.
 */
export function transformersEmbedder({ model, dtype = 'q8', batchSize = 32 }: TransformersEmbedderOptions): Embedder {
  let loading: Promise<FeatureExtractionPipeline> | null = null
  let report: (progress: number) => void = () => {}
  const files = new Map<string, { loaded: number; total: number }>()

  const load = () =>
    (loading ??= pipeline('feature-extraction', model, {
      dtype,
      progress_callback: (info) => {
        if (info.status !== 'progress') return
        files.set(info.file, { loaded: info.loaded, total: info.total })
        const t = [...files.values()].reduce((a, f) => ({ loaded: a.loaded + f.loaded, total: a.total + f.total }), { loaded: 0, total: 0 })
        if (t.total > 0) report(t.loaded / t.total)
      },
    }).catch((error: unknown) => {
      loading = null // allow a retry
      throw error
    }))

  return {
    async embed(texts, onProgress) {
      if (texts.length === 0) return []
      report = onProgress
      const extractor = await load()
      const out: Vec[] = []
      for (let i = 0; i < texts.length; i += batchSize) {
        const tensor = await extractor([...texts.slice(i, i + batchSize)], { pooling: 'mean', normalize: true })
        const [n, dims] = tensor.dims
        const data = tensor.data as Float32Array
        for (let j = 0; j < n; j++) out.push(data.slice(j * dims, (j + 1) * dims))
      }
      return out
    },
  }
}
