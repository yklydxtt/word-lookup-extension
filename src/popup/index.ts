import { sendRequest } from '../platform/client';
import { defaultPreferences, parsePreferences } from '../preferences/model';
import type { ExtensionRequest } from '../core/types';
import { popupState } from './model';

const globalSwitch = document.querySelector<HTMLInputElement>('#global-enabled')!;
const siteSwitch = document.querySelector<HTMLInputElement>('#site-enabled')!;
const hostnameLabel = document.querySelector<HTMLElement>('#hostname')!;
const status = document.querySelector<HTMLElement>('#status')!;
let preferences = defaultPreferences();
let hostname: string | null = null;
let available = false;
let ready = false;
let saving = false;
let storageGeneration = 0;

function render(): void {
  const state = popupState(preferences, hostname, available);
  globalSwitch.checked = state.globalChecked;
  siteSwitch.checked = state.siteChecked;
  globalSwitch.disabled = !ready || saving;
  siteSwitch.disabled = !ready || saving || state.siteDisabled;
  status.textContent = state.status;
  status.dataset.error = 'false';
}

async function save(request: ExtensionRequest): Promise<void> {
  saving = true;
  render();
  try {
    const response = await sendRequest(request);
    if (response.type !== 'PREFERENCES') throw new Error('设置保存失败');
    preferences = parsePreferences(response.value);
    saving = false;
    render();
  } catch {
    saving = false;
    render();
    status.textContent = '设置保存失败，请重试';
    status.dataset.error = 'true';
  }
}

globalSwitch.addEventListener('change', () => { void save({ type: 'SET_GLOBAL', enabled: globalSwitch.checked }); });
siteSwitch.addEventListener('change', () => {
  if (hostname) void save({ type: 'SET_SITE', hostname, enabled: siteSwitch.checked });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.preferences) return;
  storageGeneration += 1;
  try {
    preferences = parsePreferences(changes.preferences.newValue);
    render();
  } catch {
    ready = false;
    render();
    status.textContent = '本地设置读取失败';
    status.dataset.error = 'true';
  }
});

async function initialize(): Promise<void> {
  const initialGeneration = storageGeneration;
  try {
    const response = await sendRequest({ type: 'GET_PREFERENCES' });
    if (response.type !== 'PREFERENCES') throw new Error('读取失败');
    if (initialGeneration === storageGeneration) preferences = parsePreferences(response.value);
    ready = true;
    render();
  } catch {
    status.textContent = '本地设置读取失败，请重新打开插件菜单';
    status.dataset.error = 'true';
    return;
  }
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id !== undefined && tab.url) {
      const url = new URL(tab.url);
      if (/^https?:$/u.test(url.protocol)) {
        hostname = url.hostname;
        const probe = await Promise.race([
          chrome.tabs.sendMessage(tab.id, { type: 'PING' }),
          new Promise(resolve => setTimeout(() => resolve(null), 1500)),
        ]);
        available = probe?.type === 'AVAILABLE';
      }
    }
  } catch {
    available = false;
  }
  hostnameLabel.textContent = hostname || '当前页面不支持查词';
  render();
}

void initialize();
