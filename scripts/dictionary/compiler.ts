import { createHash } from 'node:crypto';
import { canonicalWord } from '../../src/core/normalize';
import { shardId } from '../../src/core/shard-id';
import type { DictionaryIndex, DictionaryShard, SourceProvenance, WordEntry } from '../../src/core/types';

export interface RawWordRow {
  word: string;
  phonetic: string;
  translation: string;
  pos: string;
  exchange: string;
}

export interface CompiledDictionary {
  index: DictionaryIndex;
  resources: Map<string, Uint8Array>;
}

export function exchangePairs(row: RawWordRow): Array<[string, string]> {
  const base = canonicalWord(row.word);
  if (!base) return [];
  const pairs: Array<[string, string]> = [];
  const inflections = new Set(['p', 'd', 'i', '3', 'r', 't', 's']);
  for (const token of (row.exchange ?? '').split('/')) {
    const separator = token.indexOf(':');
    if (separator < 0) continue;
    const kind = token.slice(0, separator);
    for (const rawValue of token.slice(separator + 1).split(',')) {
      const value = canonicalWord(rawValue);
      if (!value || value === base) continue;
      if (kind === '0') pairs.push([base, value]);
      if (inflections.has(kind)) pairs.push([value, base]);
    }
  }
  return pairs;
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function compileDictionary(
  rows: AsyncIterable<RawWordRow>,
  source: SourceProvenance,
): Promise<CompiledDictionary> {
  const entries = new Map<string, WordEntry[]>();
  const lemmaSets = new Map<string, Set<string>>();
  const stats = {
    sourceRows: 0,
    entryCount: 0,
    lemmaCount: 0,
    excludedInvalidWord: 0,
    missingTranslationRows: 0,
    duplicateRows: 0,
  };
  for await (const row of rows) {
    stats.sourceRows += 1;
    const word = canonicalWord(row.word);
    if (!word) {
      stats.excludedInvalidWord += 1;
      continue;
    }
    for (const [variant, lemma] of exchangePairs(row)) {
      const candidates = lemmaSets.get(variant) ?? new Set<string>();
      candidates.add(lemma);
      lemmaSets.set(variant, candidates);
    }
    const translation = row.translation?.trim();
    if (!translation) {
      stats.missingTranslationRows += 1;
      continue;
    }
    const entry: WordEntry = {
      word,
      phonetic: row.phonetic?.trim() || null,
      translation,
      pos: row.pos?.trim() || null,
    };
    const candidates = entries.get(word) ?? [];
    if (candidates.some(candidate => JSON.stringify(candidate) === JSON.stringify(entry))) {
      stats.duplicateRows += 1;
    } else {
      candidates.push(entry);
      stats.entryCount += 1;
    }
    entries.set(word, candidates);
  }
  const shards = new Map<string, DictionaryShard>();
  for (let index = 0; index < 256; index += 1) {
    shards.set(index.toString(16).padStart(2, '0'), {
      schemaVersion: 1,
      entries: Object.create(null),
      lemmas: Object.create(null),
    });
  }
  for (const word of [...entries.keys()].sort()) {
    shards.get(shardId(word))!.entries[word] = entries.get(word)!;
  }
  for (const variant of [...lemmaSets.keys()].sort()) {
    const lemmas = [...lemmaSets.get(variant)!].filter(lemma => entries.has(lemma)).sort();
    if (lemmas.length) {
      shards.get(shardId(variant))!.lemmas[variant] = lemmas;
      stats.lemmaCount += 1;
    }
  }
  const resources = new Map<string, Uint8Array>();
  const index: DictionaryIndex = { schemaVersion: 1, source, stats, shards: {} };
  for (const [id, shard] of shards) {
    const bytes = new TextEncoder().encode(JSON.stringify(shard));
    resources.set(`dictionary/${id}.json`, bytes);
    index.shards[id] = { bytes: bytes.byteLength, sha256: sha256(bytes) };
  }
  resources.set('dictionary/index.json', new TextEncoder().encode(JSON.stringify(index)));
  return { index, resources };
}
