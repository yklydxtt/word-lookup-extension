import { expect, test, vi } from 'vitest';
import { createRouter } from './router';
import { createPreferencesStore } from '../preferences/store';
import type { Preferences } from '../core/types';

function fixture() {
  let settings: Preferences = { schemaVersion: 1, enabled: true, disabledHosts: [] };
  const repository = { lookup: vi.fn(async (word: string) => ({ kind: 'not-found' as const, query: word })) };
  const route = createRouter({
    extensionId: 'test-extension',
    repository,
    preferences: createPreferencesStore({
      read: async () => settings,
      write: async value => { settings = value; },
    }),
    speech: { getVoiceState: async () => ({ status: 'unavailable' }), speak: async () => ({ status: 'cancelled' }) },
    notify: async () => {},
  });
  const page = {
    id: 'test-extension', url: 'https://docs.example.com/article',
    tab: { id: 1, url: 'https://docs.example.com/article' } as chrome.tabs.Tab,
  };
  const popup = { id: 'test-extension', url: 'chrome-extension://test-extension/popup.html' };
  return { route, repository, page, popup };
}

test('拒绝其他扩展、非法词键和页面发起的设置修改', async () => {
  const { route, repository, page } = fixture();
  for (const [message, sender] of [
    [{ type: 'SET_GLOBAL', enabled: false }, page],
    [{ type: 'LOOKUP', word: '../file', requestId: 1 }, page],
    [{ type: 'LOOKUP', word: 'bank', requestId: -1 }, page],
    [{ type: 'LOOKUP', word: 'bank', requestId: 1 }, { ...page, id: 'other' }],
  ] as const) {
    expect(await route(message, sender)).toEqual({ type: 'REQUEST_ERROR', code: 'invalid-request' });
  }
  expect(repository.lookup).not.toHaveBeenCalled();
});

test('网站停用后后台也拒绝查词', async () => {
  const { route, repository, page, popup } = fixture();
  expect(await route({ type: 'LOOKUP', word: 'bank', requestId: 1 }, page)).toMatchObject({ type: 'LOOKUP_RESULT' });
  await route({ type: 'SET_SITE', hostname: 'docs.example.com', enabled: false }, popup);
  expect(await route({ type: 'LOOKUP', word: 'bank', requestId: 2 }, page)).toEqual({ type: 'REQUEST_ERROR', code: 'disabled' });
  expect(repository.lookup).toHaveBeenCalledTimes(1);
});
