import { expect, test } from 'vitest';
import { canonicalWord, normalizeSelection } from './normalize';
import { shardId } from './shard-id';

test('选区去除外围标点，保留词内撇号和连字符', () => {
  expect(normalizeSelection(' “Don’t!” ')).toBe("don't");
  expect(normalizeSelection('mother-in-law')).toBe('mother-in-law');
  expect(normalizeSelection('(BANK)')).toBe('bank');
  for (const value of ['hello world', '中文', '123', 'bank2', '', 'foo_bar']) {
    expect(normalizeSelection(value)).toBeNull();
  }
});

test('词库键不把后缀和短语转成其他词', () => {
  expect(canonicalWord('-ability')).toBeNull();
  expect(canonicalWord('Bank')).toBe('bank');
  expect(canonicalWord("'hood")).toBeNull();
});

test('分片标识确定且限于256片', () => {
  expect(shardId('bank')).toMatch(/^[a-f0-9]{2}$/);
  expect(shardId('bank')).toBe(shardId('bank'));
  expect(shardId('go')).not.toBe(shardId('went'));
});
