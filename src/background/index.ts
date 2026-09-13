import { createRepository } from '../dictionary/repository';
import { createPreferencesStore } from '../preferences/store';
import { createSpeechService } from '../speech/service';
import { createRouter } from './router';

const repository = createRepository(async path => {
  if (!/^dictionary\/(?:index|[a-f0-9]{2})\.json$/u.test(path)) throw new Error('不允许的资源路径');
  const response = await fetch(chrome.runtime.getURL(path), { credentials: 'omit', cache: 'no-store' });
  if (!response.ok) throw new Error('词库资源读取失败');
  return new Uint8Array(await response.arrayBuffer());
});

const preferences = createPreferencesStore({
  async read() {
    return (await chrome.storage.local.get('preferences')).preferences;
  },
  async write(value) {
    await chrome.storage.local.set({ preferences: value });
  },
});

const speech = createSpeechService(chrome.tts, () => chrome.runtime.lastError?.message);
const route = createRouter({
  extensionId: chrome.runtime.id,
  repository,
  preferences,
  speech,
  async notify(sender, notification) {
    if (sender.tab?.id === undefined) return;
    await chrome.tabs.sendMessage(sender.tab.id, notification, { frameId: sender.frameId ?? 0 });
  },
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void route(message, sender).then(sendResponse).catch(() => {
    sendResponse({ type: 'REQUEST_ERROR', code: 'invalid-request' });
  });
  return true;
});
