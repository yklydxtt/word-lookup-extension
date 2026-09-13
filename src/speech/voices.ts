import type { VoiceChoice } from '../core/types';

export function selectVoice(voices: chrome.tts.TtsVoice[]): VoiceChoice | null {
  const local = voices.filter(voice =>
    voice.remote === false && !voice.extensionId && Boolean(voice.voiceName?.trim()),
  );
  for (const lang of ['en-GB', 'en-US'] as const) {
    const voice = local.find(candidate => candidate.lang?.toLowerCase() === lang.toLowerCase());
    if (voice?.voiceName) {
      return { name: voice.voiceName, lang, label: lang === 'en-GB' ? '英式发音' : '美式发音' };
    }
  }
  return null;
}
