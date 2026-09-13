import { canonicalWord } from '../core/normalize';
import { shardId } from '../core/shard-id';
import type { DictionaryIndex, DictionaryShard, LookupResult, WordEntry } from '../core/types';
import { LruCache } from './lru';

export type ResourceReader = (path: string) => Promise<Uint8Array>;
export interface DictionaryRepository {
  lookup(word: string): Promise<LookupResult>;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateIndex(value: unknown): asserts value is DictionaryIndex {
  if (!record(value) || value.schemaVersion !== 1 || !record(value.shards)
    || !record(value.source) || !record(value.stats)
    || typeof value.source.revision !== 'string'
    || typeof value.source.csvGitBlob !== 'string'
    || typeof value.source.csvSha256 !== 'string'
    || typeof value.source.csvBytes !== 'number'
    || Object.keys(value.shards).length !== 256) {
    throw new Error('词库索引无效');
  }
  for (const [id, metadata] of Object.entries(value.shards)) {
    if (!/^[a-f0-9]{2}$/u.test(id) || !record(metadata)
      || typeof metadata.bytes !== 'number' || metadata.bytes < 1
      || typeof metadata.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(metadata.sha256)) {
      throw new Error('词库分片索引无效');
    }
  }
}

function validateShard(value: unknown, id: string): asserts value is DictionaryShard {
  if (!record(value) || value.schemaVersion !== 1 || !record(value.entries) || !record(value.lemmas)) {
    throw new Error('词库分片无效');
  }
  for (const [word, entries] of Object.entries(value.entries)) {
    if (canonicalWord(word) !== word || shardId(word) !== id || !Array.isArray(entries) || entries.length === 0) {
      throw new Error('词条无效');
    }
    for (const entry of entries) {
      if (!record(entry) || entry.word !== word || typeof entry.translation !== 'string' || !entry.translation
        || (entry.phonetic !== null && typeof entry.phonetic !== 'string')
        || (entry.pos !== null && typeof entry.pos !== 'string')) {
        throw new Error('词条字段无效');
      }
    }
  }
  for (const [word, lemmas] of Object.entries(value.lemmas)) {
    if (canonicalWord(word) !== word || shardId(word) !== id || !Array.isArray(lemmas)
      || lemmas.some(lemma => typeof lemma !== 'string' || canonicalWord(lemma) !== lemma)) {
      throw new Error('词形关联无效');
    }
  }
}

export async function digestBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function createRepository(read: ResourceReader): DictionaryRepository {
  const shards = new LruCache<string, DictionaryShard>(8);
  const results = new LruCache<string, LookupResult>(256);
  const pending = new Map<string, Promise<DictionaryShard>>();
  let indexPromise: Promise<DictionaryIndex> | undefined;

  function loadIndex(): Promise<DictionaryIndex> {
    if (!indexPromise) {
      indexPromise = read('dictionary/index.json').then(bytes => {
        const index: unknown = JSON.parse(new TextDecoder().decode(bytes));
        validateIndex(index);
        return index;
      }).catch(error => {
        indexPromise = undefined;
        throw error;
      });
    }
    return indexPromise;
  }

  function loadShard(id: string): Promise<DictionaryShard> {
    const cached = shards.get(id);
    if (cached) return Promise.resolve(cached);
    const existing = pending.get(id);
    if (existing) return existing;
    const promise = (async () => {
      const index = await loadIndex();
      const metadata = index.shards[id];
      if (!metadata) throw new Error('词库索引缺少分片');
      const bytes = await read(`dictionary/${id}.json`);
      if (bytes.byteLength !== metadata.bytes || await digestBytes(bytes) !== metadata.sha256) {
        throw new Error('词库分片校验失败');
      }
      const shard: unknown = JSON.parse(new TextDecoder().decode(bytes));
      validateShard(shard, id);
      shards.set(id, shard);
      return shard;
    })().finally(() => pending.delete(id));
    pending.set(id, promise);
    return promise;
  }

  return {
    async lookup(word) {
      if (!word || canonicalWord(word) !== word) {
        return { kind: 'error', query: word, code: 'invalid-request' };
      }
      const cached = results.get(word);
      if (cached) return cached;
      try {
        const original = await loadShard(shardId(word));
        const exact = Object.hasOwn(original.entries, word) ? original.entries[word] : undefined;
        let result: LookupResult;
        if (exact?.length) {
          result = { kind: 'found', query: word, matchedBy: 'exact', entries: exact };
        } else {
          const entries: WordEntry[] = [];
          const lemmas = Object.hasOwn(original.lemmas, word) ? original.lemmas[word] : [];
          for (const lemma of lemmas) {
            const shard = await loadShard(shardId(lemma));
            const candidates = Object.hasOwn(shard.entries, lemma) ? shard.entries[lemma] : undefined;
            if (!candidates?.length) throw new Error('词形关联指向缺失词条');
            entries.push(...candidates);
          }
          result = entries.length
            ? { kind: 'found', query: word, matchedBy: 'lemma', entries }
            : { kind: 'not-found', query: word };
        }
        results.set(word, result);
        return result;
      } catch {
        return { kind: 'error', query: word, code: 'dictionary-read' };
      }
    },
  };
}
