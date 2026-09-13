import { afterEach, expect, test, vi } from 'vitest';
import { createCard, type WordCard } from './card';
import { placeCard } from './position';
import { isExcludedNode, readSelection, type WordSelection } from './selection';
import { createController } from './controller';
import type { LookupClient } from '../platform/client';
import type { LookupResult } from '../core/types';

const cards: WordCard[] = [];
const selection: WordSelection = {
  selectedText: 'went',
  word: 'went',
  rect: { left: 10, right: 60, top: 10, bottom: 30 },
};

function makeCard() {
  const speak = vi.fn();
  const card = createCard(document, speak);
  cards.push(card);
  return { card, speak };
}

afterEach(() => {
  cards.splice(0).forEach(card => card.destroy());
  document.body.replaceChildren();
  document.getSelection()?.removeAllRanges();
});

test('原形卡片安全渲染且发音对应原形', () => {
  const { card, speak } = makeCard();
  card.showResult(selection, {
    kind: 'found', query: 'went', matchedBy: 'lemma',
    entries: [{ word: 'go', phonetic: 'ɡəʊ', translation: 'v. 去 <img src=x>', pos: null }],
  }, { status: 'ready', voice: { name: '本地', lang: 'en-GB', label: '英式发音' } });
  expect(card.host.shadowRoot?.textContent).toContain('went →go');
  expect(card.host.shadowRoot?.querySelector('img')).toBeNull();
  card.host.shadowRoot?.querySelector<HTMLButtonElement>('.audio')?.click();
  expect(speak).toHaveBeenCalledWith('go');
});

test('异常状态区分且缺音标不阻止释义', () => {
  const { card } = makeCard();
  card.showResult(selection, { kind: 'not-found', query: 'went' }, { status: 'unavailable' });
  expect(card.host.shadowRoot?.textContent).toContain('本地词库未收录');
  card.showResult(selection, { kind: 'error', query: 'went', code: 'dictionary-read' }, { status: 'error' });
  expect(card.host.shadowRoot?.textContent).toContain('词库读取失败');
  card.showResult(selection, {
    kind: 'found', query: 'went', matchedBy: 'exact',
    entries: [{ word: 'went', phonetic: null, translation: 'v. 去', pos: null }],
  }, { status: 'unavailable' });
  expect(card.host.shadowRoot?.textContent).toContain('暂无音标');
  expect(card.host.shadowRoot?.querySelector<HTMLButtonElement>('.audio')?.disabled).toBe(true);
});

test('显示卡片不改变正文或插入下划线', () => {
  document.body.innerHTML = '<p id="article">An entirely English document.</p>';
  const original = document.body.innerHTML;
  const { card } = makeCard();
  card.showLoading(selection);
  expect(document.body.innerHTML).toBe(original);
  expect(document.querySelector('u, mark')).toBeNull();
  card.hide();
  expect(card.host.hidden).toBe(true);
});

test('定位保持在视口内', () => {
  expect(placeCard({ left: 970, right: 990, top: 750, bottom: 760 }, { width: 340, height: 300 }, { width: 1024, height: 768 }))
    .toEqual({ left: 676, top: 442 });
  expect(placeCard(selection.rect, { width: 304, height: 300 }, { width: 320, height: 480 }).left).toBe(8);
});

test('编辑区及卡片被排除，普通单词可识别', () => {
  const { card } = makeCard();
  document.body.innerHTML = '<p id="word">Bank</p><div contenteditable="true"><span id="editable">bank</span></div><textarea>bank</textarea>';
  expect(isExcludedNode(document.querySelector('#editable')!.firstChild, card.host)).toBe(true);
  expect(isExcludedNode(document.querySelector('textarea'), card.host)).toBe(true);
  const range = document.createRange();
  range.selectNodeContents(document.querySelector('#word')!);
  range.getBoundingClientRect = () => ({ ...selection.rect, width: 50, height: 20, x: 10, y: 10, toJSON: () => ({}) });
  document.getSelection()!.addRange(range);
  expect(readSelection(document, card.host)?.word).toBe('bank');
});

test('关闭后晚到结果不得重新打开', async () => {
  let resolveLookup!: (result: LookupResult) => void;
  const client: LookupClient = {
    lookup: () => new Promise(resolve => { resolveLookup = resolve; }),
    getVoice: async () => ({ status: 'unavailable' }),
    speak: async () => ({ status: 'cancelled' }),
  };
  const { card } = makeCard();
  const controller = createController(card, client);
  controller.setEnabled(true);
  const action = controller.select(selection);
  controller.close();
  resolveLookup({ kind: 'not-found', query: 'went' });
  await action;
  expect(card.host.hidden).toBe(true);
});

test('逆序响应不覆盖新词，语音晚到不重置内容', async () => {
  const callbacks = new Map<string, (result: LookupResult) => void>();
  const client: LookupClient = {
    lookup: word => new Promise(resolve => callbacks.set(word, resolve)),
    getVoice: async () => ({ status: 'unavailable' }),
    speak: async () => ({ status: 'cancelled' }),
  };
  const { card } = makeCard();
  const controller = createController(card, client);
  controller.setEnabled(true);
  const first = controller.select(selection);
  const second = controller.select({ ...selection, word: 'bank', selectedText: 'bank' });
  callbacks.get('bank')!({ kind: 'not-found', query: 'bank' });
  await second;
  callbacks.get('went')!({ kind: 'not-found', query: 'went' });
  await first;
  expect(card.host.shadowRoot?.querySelector('.word')?.textContent).toBe('bank');
});
