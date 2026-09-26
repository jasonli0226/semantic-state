/** Imports every public entry point from the installed tarball with plain Node ESM. */
const expected = {
  'semantic-state': ['createSemanticStore', 'normalizeQuery'],
  'semantic-state/core': ['scoreAll', 'rankForDisplay', 'similarTo', 'defaultScorer', 'planCommit'],
  'semantic-state/react': ['SemanticProvider', 'useSemantic', 'useSimilar', 'useCommitPolicy', 'useActivity'],
  'semantic-state/worker': ['defineSemanticWorker', 'createWorkerRuntime', 'fetchVectorFile', 'decodeVectorFile'],
  'semantic-state/transformers': ['transformersEmbedder'],
}

const failures = []
for (const [specifier, names] of Object.entries(expected)) {
  try {
    const mod = await import(specifier)
    const missing = names.filter((name) => typeof mod[name] !== 'function')
    if (missing.length > 0) failures.push(`${specifier}: missing ${missing.join(', ')}`)
    else console.log(`  ok  ${specifier}`)
  } catch (error) {
    failures.push(`${specifier}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

if (failures.length > 0) {
  console.error(failures.map((f) => `  FAIL ${f}`).join('\n'))
  process.exit(1)
}
