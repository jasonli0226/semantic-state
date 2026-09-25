/**
 * Builds public/pokedex/{pokedex.json, vectors.bin, meta.json} from PokeAPI's CSV dump.
 *   npm run build:pokedex
 * Embeddings are computed here, once, with the same model the browser uses for queries —
 * so the page never embeds 1000+ texts on load, it only embeds what the user types.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { pipeline } from '@huggingface/transformers'
import Papa from 'papaparse'
import { embeddingTextFor, parsePokedex } from '../src/pokedex/data.ts'
import type { Pokemon, StatKey } from '../src/pokedex/types.ts'
import { EMBEDDING_MODEL } from '../src/semantic/config.ts'

const CSV_BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv'
const CACHE_DIR = 'node_modules/.cache/pokeapi'
const OUT_DIR = 'public/pokedex'
const ENGLISH = '9'
const BATCH = 32

type Row = Record<string, string>

async function csv(name: string): Promise<Row[]> {
  const cached = `${CACHE_DIR}/${name}.csv`
  let text: string
  try {
    text = await readFile(cached, 'utf8')
  } catch {
    const response = await fetch(`${CSV_BASE}/${name}.csv`)
    if (!response.ok) throw new Error(`Download failed: ${name}.csv → HTTP ${response.status}`)
    text = await response.text()
    await mkdir(CACHE_DIR, { recursive: true })
    await writeFile(cached, text)
  }
  const parsed = Papa.parse<Row>(text, { header: true, skipEmptyLines: true })
  if (parsed.errors.length > 0) throw new Error(`${name}.csv: ${parsed.errors[0].message} (row ${parsed.errors[0].row})`)
  return parsed.data
}

const byId = (rows: Row[]) => new Map(rows.map((r) => [r.id, r.identifier.replaceAll('-', ' ')]))
const groupBy = (rows: Row[], key: string) =>
  rows.reduce((map, row) => map.set(row[key], [...(map.get(row[key]) ?? []), row]), new Map<string, Row[]>())

const STAT_BY_ID: Record<string, StatKey> = { '1': 'hp', '2': 'attack', '3': 'defense', '4': 'spAttack', '5': 'spDefense', '6': 'speed' }

const cleanFlavor = (s: string) => s.replace(/[\f\n\r­]+/g, ' ').replace(/\s+/g, ' ').trim()

const [species, pokemon, pokemonTypes, types, stats, names, flavors, colors, habitats] = await Promise.all(
  ['pokemon_species', 'pokemon', 'pokemon_types', 'types', 'pokemon_stats', 'pokemon_species_names', 'pokemon_species_flavor_text', 'pokemon_colors', 'pokemon_habitats'].map(csv),
)

const typeNames = byId(types)
const colorNames = byId(colors)
const habitatNames = byId(habitats)
const defaultForm = new Map(pokemon.filter((p) => p.is_default === '1').map((p) => [p.species_id, p.id]))
const typesOf = groupBy(pokemonTypes, 'pokemon_id')
const statsOf = groupBy(stats, 'pokemon_id')
const englishNames = new Map(names.filter((n) => n.local_language_id === ENGLISH).map((n) => [n.pokemon_species_id, n]))
const latestFlavor = new Map<string, { version: number; text: string }>()
for (const f of flavors) {
  if (f.language_id !== ENGLISH) continue
  const version = Number(f.version_id)
  const current = latestFlavor.get(f.species_id)
  if (!current || version > current.version) latestFlavor.set(f.species_id, { version, text: cleanFlavor(f.flavor_text) })
}

const assembled: Pokemon[] = species
  .map((s) => {
    const formId = defaultForm.get(s.id)!
    const statRows = statsOf.get(formId) ?? []
    return {
      id: Number(s.id),
      name: englishNames.get(s.id)?.name ?? s.identifier,
      genus: englishNames.get(s.id)?.genus ?? '',
      types: (typesOf.get(formId) ?? []).sort((a, b) => Number(a.slot) - Number(b.slot)).map((t) => typeNames.get(t.type_id)!),
      stats: Object.fromEntries(statRows.filter((r) => STAT_BY_ID[r.stat_id]).map((r) => [STAT_BY_ID[r.stat_id], Number(r.base_stat)])),
      generation: Number(s.generation_id),
      color: colorNames.get(s.color_id) ?? 'unknown',
      habitat: habitatNames.get(s.habitat_id) ?? null,
      familyId: Number(s.evolution_chain_id),
      legendary: s.is_legendary === '1',
      mythical: s.is_mythical === '1',
      flavor: latestFlavor.get(s.id)?.text ?? '',
    }
  })
  .sort((a, b) => a.id - b.id) as unknown as Pokemon[]

// Same validation the browser runs: fail the build instead of shipping bad data.
const pokedex = parsePokedex(assembled)

const extractor = await pipeline('feature-extraction', EMBEDDING_MODEL, { dtype: 'q8' })
const texts = pokedex.map(embeddingTextFor)
const chunks: Float32Array[] = []
let dims = 0
for (let i = 0; i < texts.length; i += BATCH) {
  const tensor = await extractor(texts.slice(i, i + BATCH), { pooling: 'mean', normalize: true })
  dims = tensor.dims[1]
  chunks.push(tensor.data as Float32Array)
}
const vectors = new Float32Array(chunks.reduce((n, c) => n + c.length, 0))
chunks.reduce((offset, chunk) => (vectors.set(chunk, offset), offset + chunk.length), 0)

await mkdir(OUT_DIR, { recursive: true })
await writeFile(`${OUT_DIR}/pokedex.json`, JSON.stringify(pokedex))
await writeFile(`${OUT_DIR}/vectors.bin`, new Uint8Array(vectors.buffer))
await writeFile(`${OUT_DIR}/meta.json`, `${JSON.stringify({ model: EMBEDDING_MODEL, dtype: 'q8', dims, count: pokedex.length, source: 'PokeAPI CSV (github.com/PokeAPI/pokeapi)', ids: pokedex.map((p) => p.id) })}\n`)
process.stdout.write(`${pokedex.length} Pokémon · ${dims} dims · vectors ${(vectors.byteLength / 1e6).toFixed(1)} MB\n`)
