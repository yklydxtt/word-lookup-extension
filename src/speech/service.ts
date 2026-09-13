import { canonicalWord } from '../core/normalize';
import type { SpeechEvent, SpeechStart, VoiceChoice, VoiceState } from '../core/types';
import { selectVoice } from './voices';

export interface TtsPort {
  getVoices(callback: (voices: chrome.tts.TtsVoice[]) => void): void;
  speak(word: string, options: chrome.tts.TtsOptions, callback: () => void): void;
  onVoicesChanged?: Pick<typeof chrome.tts.onVoicesChanged, 'addListener' | 'removeListener'>;
}

export interface SpeechService {
  getVoiceState(): Promise<VoiceState>;
  speak(word: string, emit: (event: SpeechEvent) => void, allowed?: () => Promise<boolean>): Promise<SpeechStart>;
}

export function createSpeechService(
  tts: TtsPort | undefined,
  getLastError: () => string | undefined,
): SpeechService {
  let generation = 0;

  function readVoices(): Promise<chrome.tts.TtsVoice[]> {
    return new Promise((resolve, reject) => {
      if (!tts) {
        resolve([]);
        return;
      }
      const timeout = setTimeout(() => reject(new Error('语音列表读取超时')), 1500);
      try {
        tts.getVoices(voices => {
          clearTimeout(timeout);
          const error = getLastError();
          if (error) reject(new Error(error));
          else resolve(voices);
        });
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  async function resolveVoice(): Promise<VoiceChoice | null> {
    const voices = await readVoices();
    const first = selectVoice(voices);
    if (first || voices.length > 0 || !tts?.onVoicesChanged) return first;
    const changes = tts.onVoicesChanged;
    return new Promise(resolve => {
      let finished = false;
      const finish = (choice: VoiceChoice | null) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        changes.removeListener(changed);
        resolve(choice);
      };
      const changed = () => {
        void readVoices().then(next => {
          const choice = selectVoice(next);
          if (choice) finish(choice);
        }).catch(() => finish(null));
      };
      const timeout = setTimeout(() => finish(null), 1500);
      changes.addListener(changed);
      changed();
    });
  }

  return {
    async getVoiceState() {
      try {
        const voice = await resolveVoice();
        return voice ? { status: 'ready', voice } : { status: 'unavailable' };
      } catch {
        return { status: 'error' };
      }
    },
    async speak(word, emit, allowed = async () => true) {
      const current = ++generation;
      if (canonicalWord(word) !== word || !tts) return { status: 'error', code: 'no-voice' };
      try {
        const voice = await resolveVoice();
        if (current !== generation) return { status: 'cancelled' };
        const permitted = await allowed();
        if (current !== generation || !permitted) return { status: 'cancelled' };
        if (!voice) return { status: 'error', code: 'no-voice' };
        return await new Promise<SpeechStart>(resolve => {
          let expired = false;
          const timeout = setTimeout(() => {
            expired = true;
            resolve({ status: 'error', code: 'playback-failed' });
          }, 4000);
          const options: chrome.tts.TtsOptions = {
            voiceName: voice.name,
            lang: voice.lang,
            enqueue: false,
            onEvent(event) {
              if (current !== generation || expired) return;
              if (event.type === 'error') emit({ type: 'error', message: '发音播放失败' });
              if (event.type === 'end') emit({ type: 'end' });
              if (event.type === 'interrupted' || event.type === 'cancelled') emit({ type: 'interrupted' });
            },
          };
          try {
            tts.speak(word, options, () => {
              clearTimeout(timeout);
              const error = getLastError();
              if (current !== generation) resolve({ status: 'cancelled' });
              else resolve(error ? { status: 'error', code: 'playback-failed' } : { status: 'accepted', voice });
            });
          } catch {
            clearTimeout(timeout);
            resolve({ status: 'error', code: 'playback-failed' });
          }
        });
      } catch {
        return { status: 'error', code: 'playback-failed' };
      }
    },
  };
}
