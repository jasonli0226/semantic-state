/**
 * Pack-and-install smoke test for the published package (issue #6).
 * Packs packages/semantic-state, installs the tarball into a scratch app outside the repo, then checks:
 *   1. the tarball holds every file its `exports` map points at, no tests, and a changelog entry for its version
 *   2. plain Node ESM can import every entry point
 *   3. strict tsc accepts the .d.ts files (skipLibCheck: false) with moduleResolution bundler and nodenext
 *   4. Vite builds an app that uses the library from a module worker
 *   npm run smoke:pack            (add -- --keep to leave the scratch app on disk)
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const pkgDir = join(root, 'packages/semantic-state')
const fixture = join(root, 'scripts/pack-smoke')
const keep = process.argv.includes('--keep')
const app = mkdtempSync(join(tmpdir(), 'semantic-state-smoke-'))

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit' })
const step = (name) => console.log(`\n▶ ${name}`)

/** Same versions the workspace develops against, so a failure means the package broke, not a dependency. */
const installedVersion = (name) => JSON.parse(readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8')).version

function packTarball() {
  step('npm pack')
  const out = execFileSync('npm', ['pack', '--json', '--pack-destination', app], { cwd: pkgDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
  const [info] = JSON.parse(out.slice(out.indexOf('[')))
  return info
}

function checkTarballContents(info) {
  step('tarball contents')
  const files = new Set(info.files.map((f) => f.path))
  const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
  const targets = Object.values(pkg.exports).flatMap((conditions) => Object.values(conditions)).map((p) => p.replace(/^\.\//, ''))
  const hasChangelogEntry = readFileSync(join(pkgDir, 'CHANGELOG.md'), 'utf8').includes(`## [${pkg.version}]`)
  const problems = [
    ...targets.filter((t) => !files.has(t)).map((t) => `exports target not in tarball: ${t}`),
    ...[...files].filter((f) => /\.test\.tsx?$/.test(f)).map((f) => `test file shipped: ${f}`),
    ...['README.md', 'CHANGELOG.md', 'LICENSE', 'package.json'].filter((f) => !files.has(f)).map((f) => `missing: ${f}`),
    ...(hasChangelogEntry ? [] : [`CHANGELOG.md has no "## [${pkg.version}]" heading`]),
  ]
  if (problems.length > 0) throw new Error(problems.join('\n'))
  console.log(`  ok  ${files.size} files, ${targets.length} exports targets present, changelog has ${pkg.version}`)
}

function scaffoldApp(tarball) {
  step(`scratch app in ${app}`)
  for (const entry of readdirSync(fixture)) cpSync(join(fixture, entry), join(app, entry), { recursive: true })
  const deps = ['react', 'react-dom', '@huggingface/transformers']
  const devDeps = ['typescript', 'vite', '@types/react', '@types/react-dom']
  writeFileSync(join(app, 'package.json'), JSON.stringify({
    name: 'semantic-state-smoke',
    private: true,
    type: 'module',
    dependencies: { 'semantic-state': `file:./${tarball}`, ...Object.fromEntries(deps.map((d) => [d, installedVersion(d)])) },
    devDependencies: Object.fromEntries(devDeps.map((d) => [d, installedVersion(d)])),
  }, null, 2))
  const tsconfig = (moduleOptions) => JSON.stringify({
    compilerOptions: {
      target: 'es2023', lib: ['ES2023', 'DOM'], jsx: 'react-jsx', strict: true, skipLibCheck: false,
      noEmit: true, verbatimModuleSyntax: true, types: [], ...moduleOptions,
    },
    include: ['src'],
  }, null, 2)
  writeFileSync(join(app, 'tsconfig.bundler.json'), tsconfig({ module: 'esnext', moduleResolution: 'bundler' }))
  writeFileSync(join(app, 'tsconfig.nodenext.json'), tsconfig({ module: 'nodenext', moduleResolution: 'nodenext' }))
  // Scripts are skipped: onnxruntime's postinstall downloads GPU binaries this test never uses.
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline'], app)
}

function checkApp() {
  step('Node ESM import of every entry point')
  run('node', ['node-import.mjs'], app)

  for (const mode of ['bundler', 'nodenext']) {
    step(`tsc --strict, skipLibCheck false, moduleResolution ${mode}`)
    run('npx', ['tsc', '-p', `tsconfig.${mode}.json`], app)
    console.log('  ok')
  }

  step('vite build with a module worker')
  run('npx', ['vite', 'build', '--logLevel', 'warn'], app)
  const assets = readdirSync(join(app, 'dist/assets'))
  const worker = assets.find((f) => f.startsWith('search.worker') && f.endsWith('.js'))
  if (!worker) throw new Error(`no worker chunk in dist/assets: ${assets.join(', ')}`)
  if (!readFileSync(join(app, 'dist/assets', worker), 'utf8').includes('defineSemanticWorker')) {
    // Unminified build: the runtime's name survives if the library code was bundled into the worker.
    throw new Error(`worker chunk ${worker} does not contain the semantic-state worker runtime`)
  }
  console.log(`  ok  worker chunk ${worker}`)
}

try {
  const info = packTarball()
  checkTarballContents(info)
  scaffoldApp(info.filename)
  checkApp()
  console.log('\n✔ pack smoke test passed')
} catch (error) {
  console.error(`\n✘ pack smoke test failed${error instanceof Error && error.message ? `:\n${error.message}` : ''}`)
  console.error(`  scratch app kept at ${app}`)
  process.exitCode = 1
} finally {
  if (process.exitCode !== 1 && !keep && existsSync(app)) rmSync(app, { recursive: true, force: true })
}
