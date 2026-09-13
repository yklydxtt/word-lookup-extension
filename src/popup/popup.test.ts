import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { defaultPreferences, setSite } from '../preferences/model';
import { popupState } from './model';

test('菜单用装饰性小猫标识替换文字并保留设置开关', async () => {
  const html = await readFile(resolve('src/popup/popup.html'), 'utf8');
  const page = new DOMParser().parseFromString(html, 'text/html');
  expect(page.querySelector('.brand')?.getAttribute('aria-hidden')).toBe('true');
  expect(page.querySelector('.brand-logo')).not.toBeNull();
  expect(page.querySelector('.brand')?.textContent?.trim()).toBe('');
  expect(page.querySelector('h1')?.textContent).toBe('划词查词');
  expect(page.querySelectorAll('input[role="switch"]')).toHaveLength(2);
  expect(page.querySelector('#global-enabled')).not.toBeNull();
  expect(page.querySelector('#site-enabled')).not.toBeNull();
  const css = await readFile(resolve('src/popup/popup.css'), 'utf8');
  expect(css).toContain("mask: url('icons/cat-logo.svg')");
  expect(css).toContain('background: currentColor');
});

test('受限页面保留全局开关语义并停用网站开关', () => {
  const state = popupState(defaultPreferences(), null, false);
  expect(state.globalChecked).toBe(true);
  expect(state.siteDisabled).toBe(true);
  expect(state.status).toContain('当前页面不可用');
});

test('全局停用不丢失网站独立设置', () => {
  const settings = setSite(defaultPreferences(), 'docs.example.com', false);
  expect(popupState(settings, 'docs.example.com', true).siteChecked).toBe(false);
  expect(popupState(settings, 'www.example.com', true).siteChecked).toBe(true);
  expect(popupState({ ...settings, enabled: false }, 'www.example.com', true).siteDisabled).toBe(true);
});
