import { expect, test } from 'vitest';
import { defaultPreferences, isEnabled, normalizeHostname, parsePreferences, setSite } from './model';
import { createPreferencesStore } from './store';
import type { Preferences } from '../core/types';

test('全局优先并按完整域名停用', () => {
  const settings = setSite(defaultPreferences(), 'docs.example.com', false);
  expect(isEnabled(settings, 'docs.example.com')).toBe(false);
  expect(isEnabled(settings, 'www.example.com')).toBe(true);
  expect(isEnabled({ ...settings, enabled: false }, 'www.example.com')).toBe(false);
  expect(setSite(settings, 'docs.example.com', true).disabledHosts).toEqual([]);
});

test('拒绝不合法域名及损坏设置', () => {
  for (const host of ['example.com/path', 'example.com:443', 'user@example.com', 'example.com?query']) {
    expect(normalizeHostname(host)).toBeNull();
  }
  expect(normalizeHostname('localhost')).toBe('localhost');
  expect(normalizeHostname('127.0.0.1')).toBe('127.0.0.1');
  expect(parsePreferences(undefined)).toEqual(defaultPreferences());
  expect(() => parsePreferences({ enabled: true })).toThrow();
});

test('并发设置不丢失且失败不阻塞后续写入', async () => {
  let value: Preferences | undefined;
  let fail = false;
  const store = createPreferencesStore({
    read: async () => value,
    write: async next => {
      if (fail) throw new Error('写入失败');
      value = next;
    },
  });
  await Promise.all([store.setSite('docs.example.com', false), store.setGlobal(false)]);
  expect(await store.read()).toEqual({ schemaVersion: 1, enabled: false, disabledHosts: ['docs.example.com'] });
  fail = true;
  await expect(store.setGlobal(true)).rejects.toThrow();
  fail = false;
  await store.setGlobal(true);
  expect((await store.read()).enabled).toBe(true);
});
