import { createCard } from './card';
import { createController } from './controller';
import { createClient, sendRequest } from '../platform/client';
import { isEnabled, parsePreferences } from '../preferences/model';
import { bindPageEvents } from './events';
import type { SpeechNotification } from '../core/types';

if (document.contentType !== 'application/pdf' && !document.getElementById('offline-word-lookup')) {
  const card = createCard(document, word => { void controller.speak(word); }, () => controller.close());
  const controller = createController(card, createClient());
  let settingsGeneration = 0;

  function applyPreferences(value: unknown): void {
    try {
      controller.setEnabled(isEnabled(parsePreferences(value), location.hostname));
    } catch {
      controller.setEnabled(false);
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.preferences) return;
    settingsGeneration += 1;
    applyPreferences(changes.preferences.newValue);
  });
  const initialGeneration = settingsGeneration;
  void sendRequest({ type: 'GET_PREFERENCES' }).then(response => {
    if (settingsGeneration === initialGeneration && response.type === 'PREFERENCES') {
      applyPreferences(response.value);
    }
  }).catch(() => {
    if (settingsGeneration === initialGeneration) controller.setEnabled(false);
  });

  bindPageEvents(document, card.host, controller);

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message?.type === 'PING') sendResponse({ type: 'AVAILABLE' });
    if (message?.type === 'SPEECH_EVENT' && Number.isSafeInteger(message.speechId)
      && ['end', 'interrupted', 'error'].includes(message.event?.type)) {
      controller.handleSpeech(message as SpeechNotification);
    }
  });
}
