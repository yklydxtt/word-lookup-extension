import styles from './card.css?inline';
import type { LookupResult, VoiceState, WordEntry } from '../core/types';
import type { WordSelection } from './selection';
import { placeCard } from './position';

export interface WordCard {
  host: HTMLElement;
  showLoading(selection: WordSelection): void;
  showResult(selection: WordSelection, result: LookupResult, voice: VoiceState): void;
  updateVoice(voice: VoiceState): void;
  setSpeechMessage(message: string | null): void;
  hide(): void;
  destroy(): void;
}

export function createCard(document: Document, onSpeak: (word: string) => void, onClose: () => void = () => {}): WordCard {
  const host = document.createElement('div');
  host.id = 'offline-word-lookup';
  host.hidden = true;
  const shadow = host.attachShadow({ mode: 'open' });
  const sheet = document.createElement('style');
  sheet.textContent = styles;
  shadow.append(sheet);

  function element<Tag extends keyof HTMLElementTagNameMap>(tag: Tag, className: string, text?: string): HTMLElementTagNameMap[Tag] {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  const panel = element('section', 'card');
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', '单词查词卡片');
  const header = element('div', 'head');
  const close = element('button', 'close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', '关闭查词卡片');
  header.append(element('span', 'source', '本地词库'), close);
  const body = element('div', 'body');
  const footer = element('div', 'footer');
  const status = element('span', 'status', '离线查询');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const hint = element('span', 'hint');
  hint.append(element('kbd', '', 'Esc'), document.createTextNode(' 关闭'));
  footer.append(status, hint);
  panel.append(header, body, footer);
  shadow.append(panel);
  let selection: WordSelection | undefined;
  let voiceControls: Array<{ button: HTMLButtonElement; note: HTMLParagraphElement; word: string }> = [];

  function position(): void {
    if (!selection || host.hidden) return;
    const viewport = document.defaultView;
    const size = panel.getBoundingClientRect();
    const result = placeCard(selection.rect, size, { width: viewport?.innerWidth ?? 1024, height: viewport?.innerHeight ?? 768 });
    host.style.setProperty('left', `${result.left}px`, 'important');
    host.style.setProperty('top', `${result.top}px`, 'important');
  }

  function show(next: WordSelection): void {
    selection = next;
    if (!host.isConnected) document.documentElement.append(host);
    host.hidden = false;
    body.scrollTop = 0;
    status.textContent = '离线查询';
  }

  function updateVoice(voice: VoiceState): void {
    for (const control of voiceControls) {
      control.button.disabled = voice.status !== 'ready';
      control.button.textContent = voice.status === 'ready' ? voice.voice.label : voice.status === 'loading' ? '检查语音…' : '发音不可用';
      control.button.setAttribute('aria-label', voice.status === 'ready'
        ? `${control.word} ${voice.voice.label}`
        : `${control.word} 发音不可用`);
      control.note.hidden = voice.status === 'ready' || voice.status === 'loading';
      control.note.textContent = voice.status === 'error' ? '读取本地语音失败，可重新选词重试' : '未找到本地英式或美式语音';
    }
    position();
  }

  function renderEntry(entry: WordEntry, query: string, matchedBy: 'exact' | 'lemma'): HTMLElement {
    const section = element('section', 'entry');
    const title = element('h3', 'word');
    if (matchedBy === 'lemma') title.append(element('span', 'origin', `${query} →`));
    title.append(document.createTextNode(entry.word));
    const pronunciation = element('div', 'pronunciation');
    const audio = element('button', 'audio');
    audio.type = 'button';
    audio.addEventListener('click', () => onSpeak(entry.word));
    pronunciation.append(element('span', 'phonetic', entry.phonetic ? `/${entry.phonetic.replace(/^\/|\/$/g, '')}/` : '暂无音标'), audio);
    const note = element('p', 'voice-warning');
    voiceControls.push({ button: audio, note, word: entry.word });
    section.append(title, pronunciation, note);
    if (matchedBy === 'lemma') section.append(element('p', 'lemma-note', `释义、音标与发音对应原形 ${entry.word}`));
    const definitions = element('div', 'definitions');
    for (const line of entry.translation.replace(/\\n/g, '\n').split('\n').filter(line => line.trim())) {
      const match = line.trim().match(/^(n|v|vt|vi|adj|adv|prep|pron|conj|num|art|int|interj|aux|abbr)\.\s*(.*)$/u);
      const row = element('div', match ? 'definition' : 'definition no-pos');
      if (match) row.append(element('span', 'pos', `${match[1]}.`));
      row.append(element('p', 'meaning', match ? match[2] : line));
      definitions.append(row);
    }
    section.append(definitions);
    return section;
  }

  close.addEventListener('click', () => {
    host.hidden = true;
    onClose();
  });
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(position) : undefined;
  observer?.observe(panel);

  return {
    host,
    showLoading(next) {
      show(next);
      voiceControls = [];
      body.replaceChildren(element('h3', 'word', next.word), element('p', 'message', '正在查词'));
      position();
    },
    showResult(next, result, voice) {
      show(next);
      voiceControls = [];
      body.replaceChildren();
      if (result.kind === 'found') {
        for (const entry of result.entries) body.append(renderEntry(entry, next.word, result.matchedBy));
        updateVoice(voice);
      } else {
        const message = result.kind === 'not-found' ? '本地词库未收录'
          : result.code === 'dictionary-read' ? '词库读取失败'
          : '查词失败，请刷新页面后重试';
        body.append(element('h3', 'word', next.word), element('p', 'message', message));
      }
      position();
    },
    updateVoice,
    setSpeechMessage(message) {
      status.textContent = message || '离线查询';
    },
    hide() {
      host.hidden = true;
      selection = undefined;
    },
    destroy() {
      observer?.disconnect();
      host.remove();
    },
  };
}
