import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { manifest } from '../src/manifest';

test('Manifest 只声明普通网页、本地设置与发音权限', () => {
  expect(manifest.manifest_version).toBe(3);
  expect(manifest.permissions).toEqual(['storage', 'tts']);
  expect(manifest.host_permissions).toEqual(['http://*/*', 'https://*/*']);
  expect(manifest.background).toEqual({ service_worker: 'background.js', type: 'module' });
  expect(manifest.web_accessible_resources).toBeUndefined();
  expect(manifest.action?.default_popup).toBe('popup.html');
});

test('扩展与工具栏声明同一组小猫图标', () => {
  expect(manifest.icons).toEqual({
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  });
  expect(manifest.action?.default_icon).toEqual(manifest.icons);
});

test('卡片样式仅注入 Shadow DOM，不增加正文下划线', async () => {
  const script = await readFile(new URL('../src/content/index.ts', import.meta.url), 'utf8');
  expect(script).not.toMatch(/innerHTML|createTreeWalker|text-decoration|surroundContents/u);
  const card = await readFile(new URL('../src/content/card.ts', import.meta.url), 'utf8');
  expect(card).toContain("host.attachShadow({ mode: 'open' })");
});
