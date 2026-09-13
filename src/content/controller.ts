import type { LookupResult, SpeechNotification } from '../core/types';
import type { LookupClient } from '../platform/client';
import type { WordCard } from './card';
import type { WordSelection } from './selection';

export interface WordController {
  select(selection: WordSelection): Promise<void>;
  speak(word: string): Promise<void>;
  handleSpeech(notification: SpeechNotification): void;
  close(): void;
  setEnabled(enabled: boolean): void;
  destroy(): void;
}

export function createController(card: WordCard, client: LookupClient): WordController {
  let generation = 0;
  let speechId = 0;
  let enabled = false;
  let destroyed = false;
  let speakable = new Set<string>();
  let speechTerminal = false;

  function close(): void {
    generation += 1;
    speechId += 1;
    speakable.clear();
    card.hide();
  }

  return {
    async select(selection) {
      if (!enabled || destroyed) return;
      const requestId = ++generation;
      speechId += 1;
      speakable.clear();
      card.showLoading(selection);
      let result: LookupResult;
      try {
        result = await client.lookup(selection.word, requestId);
      } catch {
        result = { kind: 'error', query: selection.word, code: 'background-unavailable' };
      }
      if (!enabled || destroyed || requestId !== generation) return;
      if (result.kind === 'found') speakable = new Set(result.entries.map(entry => entry.word));
      card.showResult(selection, result, { status: 'loading' });
      if (result.kind !== 'found') return;
      const voice = await client.getVoice().catch(() => ({ status: 'error' as const }));
      if (!enabled || destroyed || requestId !== generation) return;
      card.updateVoice(voice);
    },
    async speak(word) {
      if (!enabled || destroyed || !speakable.has(word)) return;
      const current = ++speechId;
      speechTerminal = false;
      card.setSpeechMessage('正在准备发音…');
      const result = await client.speak(word, current).catch(() => ({
        status: 'error' as const, code: 'playback-failed' as const,
      }));
      if (destroyed || current !== speechId || speechTerminal) return;
      card.setSpeechMessage(result.status === 'accepted' ? '正在发音'
        : result.status === 'cancelled' ? null
        : result.code === 'no-voice' ? '未找到本地英语语音' : '发音播放失败');
    },
    handleSpeech(notification) {
      if (destroyed || notification.speechId !== speechId) return;
      speechTerminal = true;
      card.setSpeechMessage(notification.event.type === 'error' ? '发音播放失败' : null);
    },
    close,
    setEnabled(value) {
      enabled = value;
      if (!enabled) close();
    },
    destroy() {
      destroyed = true;
      close();
      card.destroy();
    },
  };
}
