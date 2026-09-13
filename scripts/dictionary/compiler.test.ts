import { expect, test } from 'vitest';
import { createFixtureReader } from '../../tests/fixtures/reader';
import { shardId } from '../../src/core/shard-id';
import { verifySource } from '../prepare-dictionary';
import { exchangePairs } from './compiler';

test('构建256片并建立不规则词形关联', async () => {
  const fixture = await createFixtureReader();
  expect(Object.keys(fixture.index.shards)).toHaveLength(256);
  const shard = JSON.parse(new TextDecoder().decode(fixture.resources.get(`dictionary/${shardId('went')}.json`)));
  expect(shard.lemmas.went).toEqual(['go']);
  expect(fixture.index.stats.excludedInvalidWord).toBe(1);
});

test('原始字节通过校验，损坏时拒绝', async () => {
  const fixture = await createFixtureReader();
  expect(verifySource(fixture.bytes, fixture.source)).toEqual(fixture.source);
  const damaged = Uint8Array.from(fixture.bytes);
  damaged[0] ^= 1;
  expect(() => verifySource(damaged, fixture.source)).toThrow('校验失败');
});

test('相同词库构建字节一致', async () => {
  const first = await createFixtureReader();
  const second = await createFixtureReader();
  expect(first.resources).toEqual(second.resources);
});

test('关联只来自已知字段，不猜测词尾', () => {
  expect(exchangePairs({ word: 'go', phonetic: '', pos: '', translation: '', exchange: 'p:went/1:p/0:go/x:unknown' })).toEqual([['went', 'go']]);
});
