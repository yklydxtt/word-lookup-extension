export interface WordEntry {
  word: string;
  phonetic: string | null;
  translation: string;
  pos: string | null;
}

export interface SourceProvenance {
  revision: string;
  csvGitBlob: string;
  csvSha256: string;
  csvBytes: number;
}

export interface DictionaryShard {
  schemaVersion: 1;
  entries: Record<string, WordEntry[]>;
  lemmas: Record<string, string[]>;
}

export interface DictionaryIndex {
  schemaVersion: 1;
  source: SourceProvenance;
  stats: Record<string, number>;
  shards: Record<string, { bytes: number; sha256: string }>;
}

export type LookupResult =
  | { kind: 'found'; query: string; matchedBy: 'exact' | 'lemma'; entries: WordEntry[] }
  | { kind: 'not-found'; query: string }
  | { kind: 'error'; query: string; code: 'dictionary-read' | 'background-unavailable' | 'invalid-request' };

export interface Preferences {
  schemaVersion: 1;
  enabled: boolean;
  disabledHosts: string[];
}

export interface VoiceChoice {
  name: string;
  lang: 'en-GB' | 'en-US';
  label: '英式发音' | '美式发音';
}

export type VoiceState =
  | { status: 'ready'; voice: VoiceChoice }
  | { status: 'loading' | 'unavailable' | 'error' };

export type SpeechStart =
  | { status: 'accepted'; voice: VoiceChoice }
  | { status: 'cancelled' }
  | { status: 'error'; code: 'no-voice' | 'playback-failed' };

export interface SpeechEvent {
  type: 'end' | 'interrupted' | 'error';
  message?: string;
}

export type ExtensionRequest =
  | { type: 'LOOKUP'; requestId: number; word: string }
  | { type: 'GET_PREFERENCES' }
  | { type: 'SET_GLOBAL'; enabled: boolean }
  | { type: 'SET_SITE'; hostname: string; enabled: boolean }
  | { type: 'GET_VOICE' }
  | { type: 'SPEAK'; speechId: number; word: string }
  | { type: 'PING' };

export type ExtensionResponse =
  | { type: 'LOOKUP_RESULT'; requestId: number; result: LookupResult }
  | { type: 'PREFERENCES'; value: Preferences }
  | { type: 'VOICE'; state: VoiceState }
  | { type: 'SPEECH_STARTED'; speechId: number; result: SpeechStart }
  | { type: 'AVAILABLE' }
  | { type: 'REQUEST_ERROR'; code: 'invalid-request' | 'storage-failed' | 'disabled' };

export interface SpeechNotification {
  type: 'SPEECH_EVENT';
  speechId: number;
  event: SpeechEvent;
}
