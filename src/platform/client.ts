import type { ExtensionRequest, ExtensionResponse, LookupResult, SpeechStart, VoiceState } from '../core/types';

export interface LookupClient {
  lookup(word: string, requestId: number): Promise<LookupResult>;
  getVoice(): Promise<VoiceState>;
  speak(word: string, speechId: number): Promise<SpeechStart>;
}

export function sendRequest(message: ExtensionRequest): Promise<ExtensionResponse> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('扩展后台请求超时')), 5000);
    try {
      chrome.runtime.sendMessage(message, (response: ExtensionResponse | undefined) => {
        clearTimeout(timeout);
        const error = chrome.runtime.lastError;
        if (error || !response) reject(new Error(error?.message || '扩展后台不可用'));
        else resolve(response);
      });
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}

export function createClient(): LookupClient {
  return {
    async lookup(word, requestId) {
      try {
        const response = await sendRequest({ type: 'LOOKUP', word, requestId });
        if (response.type === 'LOOKUP_RESULT' && response.requestId === requestId) return response.result;
      } catch {}
      return { kind: 'error', query: word, code: 'background-unavailable' };
    },
    async getVoice() {
      try {
        const response = await sendRequest({ type: 'GET_VOICE' });
        if (response.type === 'VOICE') return response.state;
      } catch {}
      return { status: 'error' };
    },
    async speak(word, speechId) {
      try {
        const response = await sendRequest({ type: 'SPEAK', word, speechId });
        if (response.type === 'SPEECH_STARTED' && response.speechId === speechId) return response.result;
      } catch {}
      return { status: 'error', code: 'playback-failed' };
    },
  };
}
