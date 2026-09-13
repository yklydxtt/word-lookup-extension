import { expect, test } from 'vitest';
import { createFixtureReader } from '../../tests/fixtures/reader';
import { shardId } from '../core/shard-id';
import { LruCache } from './lru';
import { createRepository } from './repository';
import { compileDictionary, type RawWordRow } from '../../scripts/dictionary/compiler';

test('原词优先并支持跨片原形回查', async () => {
  const fixture = await createFixtureReader();
  const repository = createRepository(fixture.read);
  expect(await repository.lookup('saw')).toMatchObject({ kind: 'found', matchedBy: 'exact', entries: [{ word: 'saw' }] });
  expect(await repository.lookup('went')).toMatchObject({ kind: 'found', matchedBy: 'lemma', entries: [{ word: 'go' }] });
  expect(await repository.lookup('zznotaword')).toEqual({ kind: 'not-found', query: 'zznotaword' });
  expect(await repository.lookup('BANK')).toMatchObject({ kind: 'error', code: 'invalid-request' });
});

test('相同分片并发请求只读取一次', async () => {
  const fixture = await createFixtureReader();
  const repository = createRepository(fixture.read);
  await Promise.all([repository.lookup('bank'), repository.lookup('bank')]);
  expect(fixture.requests.filter(path => path === `dictionary/${shardId('bank')}.json`)).toHaveLength(1);
});

test('损坏分片报读取错误，恢复后可重试', async () => {
  const fixture = await createFixtureReader();
  let damaged = true;
  const repository = createRepository(async path => {
    if (damaged && path.endsWith(`${shardId('bank')}.json`)) return new TextEncoder().encode('{}');
    return fixture.read(path);
  });
  expect(await repository.lookup('bank')).toMatchObject({ kind: 'error', code: 'dictionary-read' });
  damaged = false;
  expect(await repository.lookup('bank')).toMatchObject({ kind: 'found' });
});

test('索引丢失不当作未收录，并允许恢复', async () => {
  const fixture = await createFixtureReader();
  let fail = true;
  const repository = createRepository(async path => {
    if (fail) throw new Error('读取中断');
    return fixture.read(path);
  });
  expect(await repository.lookup('bank')).toMatchObject({ kind: 'error', code: 'dictionary-read' });
  fail = false;
  expect(await repository.lookup('bank')).toMatchObject({ kind: 'found' });
});

test('LRU 按最近访问淘汰并限制容量', () => {
  const cache = new LruCache<string, number>(2);
  cache.set('first', 1);
  cache.set('second', 2);
  expect(cache.get('first')).toBe(1);
  cache.set('third', 3);
  expect(cache.get('second')).toBeUndefined();
  expect(cache.size).toBe(2);
  expect(() => new LruCache(0)).toThrow();
});

test('原型属性名称不是词形关联', async () => {
  const fixture = await createFixtureReader();
  expect(await createRepository(fixture.read).lookup('constructor')).toEqual({
    kind: 'not-found', query: 'constructor',
  });
});

test('多原形保留全部可用释义', async () => {
  const fixture = await createFixtureReader();
  async function* rows(): AsyncIterable<RawWordRow> {
    yield { word: 'alpha', translation: 'n. 甲', phonetic: '', pos: '', exchange: 'p:shared' };
    yield { word: 'beta', translation: 'n. 乙', phonetic: '', pos: '', exchange: 'p:shared' };
  }
  const compiled = await compileDictionary(rows(), fixture.source);
  const repository = createRepository(async path => {
    const resource = compiled.resources.get(path);
    if (!resource) throw new Error('缺少资源');
    return resource;
  });
  expect(await repository.lookup('shared')).toMatchObject({
    kind: 'found', matchedBy: 'lemma', entries: [{ word: 'alpha' }, { word: 'beta' }],
  });
});

test('查询结果和分片缓存有界，旧词淘汰后重新读取', async () => {
  const fixture = await createFixtureReader();
  const repository = createRepository(fixture.read);
  const first = 'zzcacheaa';
  await repository.lookup(first);
  for (let index = 1; index < 300; index += 1) {
    const suffix = `${String.fromCharCode(97 + Math.floor(index / 26))}${String.fromCharCode(97 + index % 26)}`;
    await repository.lookup(`zzcache${suffix}`);
  }
  const resourcePath = `dictionary/${shardId(first)}.json`;
  const before = fixture.requests.filter(path => path === resourcePath).length;
  await repository.lookup(first);
  expect(fixture.requests.filter(path => path === resourcePath).length).toBe(before + 1);
});
