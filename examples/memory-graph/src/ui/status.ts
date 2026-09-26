import type { ModelState, SemanticSnapshot } from 'semantic-state'

/**
 * While the model downloads, the worker handles messages in order, so clicks queue behind the first search
 * (a library limitation). Say so, instead of leaving expansion looking broken.
 */
export function modelNote(model: ModelState): string | null {
  if (model.status === 'loading') return `Loading search model… ${Math.round(model.progress * 100)}% · expanding resumes once it has loaded`
  return model.status === 'ready' ? 'Search model ready' : null
}

export function searchDisabledReason(status: SemanticSnapshot<unknown>['status'], error: string | null, model: ModelState): string | null {
  if (status === 'error') return `Search unavailable: the worker stopped (${error ?? 'unknown error'})`
  if (model.status === 'error') return `Search unavailable: ${model.error ?? 'model failed to load'}`
  return null
}
