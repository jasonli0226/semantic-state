/** Import from your worker file only. */
export { defineSemanticWorker, createWorkerRuntime, type SemanticWorkerConfig, type WorkerPort } from './runtime.ts'
export { type Embedder, type VectorFileMeta, decodeVectorFile, fetchVectorFile } from './embedder.ts'
export type { ToWorker, FromWorker } from './protocol.ts'
