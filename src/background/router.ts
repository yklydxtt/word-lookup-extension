import { canonicalWord } from '../core/normalize';
import type { ExtensionRequest, ExtensionResponse, SpeechNotification } from '../core/types';
import type { DictionaryRepository } from '../dictionary/repository';
import { isEnabled, normalizeHostname } from '../preferences/model';
import type { PreferencesStore } from '../preferences/store';
import type { SpeechService } from '../speech/service';

interface RouterDependencies {
  extensionId: string;
  repository: DictionaryRepository;
  preferences: PreferencesStore;
  speech: SpeechService;
  notify(sender: chrome.runtime.MessageSender, notification: SpeechNotification): Promise<void>;
}

function validRequest(value: unknown): value is ExtensionRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;
  switch (message.type) {
    case 'LOOKUP':
      return typeof message.word === 'string' && message.word.length <= 200 && canonicalWord(message.word) === message.word
        && Number.isSafeInteger(message.requestId) && Number(message.requestId) >= 0;
    case 'SPEAK':
      return typeof message.word === 'string' && message.word.length <= 200 && canonicalWord(message.word) === message.word
        && Number.isSafeInteger(message.speechId) && Number(message.speechId) >= 0;
    case 'SET_GLOBAL':
      return typeof message.enabled === 'boolean';
    case 'SET_SITE':
      return typeof message.enabled === 'boolean' && typeof message.hostname === 'string'
        && normalizeHostname(message.hostname) === message.hostname;
    case 'GET_PREFERENCES':
    case 'GET_VOICE':
    case 'PING':
      return true;
    default:
      return false;
  }
}

function senderHostname(sender: chrome.runtime.MessageSender): string | null {
  try {
    const url = new URL(sender.tab?.url ?? sender.url ?? '');
    return /^https?:$/u.test(url.protocol) ? url.hostname : null;
  } catch {
    return null;
  }
}

export function createRouter(dependencies: RouterDependencies) {
  const { extensionId, repository, preferences, speech, notify } = dependencies;
  return async function route(value: unknown, sender: chrome.runtime.MessageSender): Promise<ExtensionResponse> {
    const invalid = { type: 'REQUEST_ERROR', code: 'invalid-request' } as const;
    if (sender.id !== extensionId || !validRequest(value)) return invalid;
    const popup = sender.url === `chrome-extension://${extensionId}/popup.html` && !sender.tab;
    const hostname = senderHostname(sender);
    if (!popup && (!hostname || sender.tab?.id === undefined)) return invalid;
    if ((value.type === 'SET_GLOBAL' || value.type === 'SET_SITE') && !popup) return invalid;

    let currentPreferences;
    try {
      currentPreferences = await preferences.read();
      if (value.type === 'GET_PREFERENCES') return { type: 'PREFERENCES', value: currentPreferences };
      if (value.type === 'SET_GLOBAL') return { type: 'PREFERENCES', value: await preferences.setGlobal(value.enabled) };
      if (value.type === 'SET_SITE') return { type: 'PREFERENCES', value: await preferences.setSite(value.hostname, value.enabled) };
    } catch {
      return { type: 'REQUEST_ERROR', code: 'storage-failed' };
    }
    if (value.type === 'PING') return { type: 'AVAILABLE' };
    if (!hostname || !isEnabled(currentPreferences, hostname)) return { type: 'REQUEST_ERROR', code: 'disabled' };

    if (value.type === 'LOOKUP') {
      let result = await repository.lookup(value.word);
      if (!await permitted()) return { type: 'REQUEST_ERROR', code: 'disabled' };
      return { type: 'LOOKUP_RESULT', requestId: value.requestId, result };
    }
    if (value.type === 'GET_VOICE') return { type: 'VOICE', state: await speech.getVoiceState() };
    if (value.type === 'SPEAK') {
      const result = await speech.speak(value.word, event => {
        void notify(sender, { type: 'SPEECH_EVENT', speechId: value.speechId, event }).catch(() => {});
      }, permitted);
      return { type: 'SPEECH_STARTED', speechId: value.speechId, result };
    }
    return invalid;

    async function permitted(): Promise<boolean> {
      try {
        return Boolean(hostname && isEnabled(await preferences.read(), hostname));
      } catch {
        return false;
      }
    }
  };
}
