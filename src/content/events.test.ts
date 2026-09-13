import { afterEach, expect, test, vi } from 'vitest';
import { bindPageEvents } from './events';
import type { WordController } from './controller';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.restoreAllMocks();
  document.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
});

function setup() {
  document.body.innerHTML = '<p id="word">bank</p><button id="outside">外部按钮</button><div id="host"></div>';
  const host = document.querySelector<HTMLElement>('#host')!;
  const shadow = host.attachShadow({ mode: 'open' });
  const button = document.createElement('button');
  button.textContent = '发音';
  shadow.append(button);
  const controller: WordController = {
    select: vi.fn(async () => {}),
    close: vi.fn(),
    speak: vi.fn(async () => {}),
    setEnabled: vi.fn(),
    destroy: vi.fn(),
    handleSpeech: vi.fn(),
  };
  cleanup = bindPageEvents(document, host, controller);
  return { controller, host, button };
}

test('点击外部且选区没有变化，不得重新触发查词', () => {
  const { controller } = setup();
  const range = document.createRange();
  range.selectNodeContents(document.querySelector('#word')!);
  document.getSelection()!.addRange(range);
  const outside = document.querySelector('#outside')!;
  outside.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  outside.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, detail: 1 }));
  expect(controller.close).toHaveBeenCalled();
  expect(controller.select).not.toHaveBeenCalled();
});

test('卡片内部点击与滚动不关闭，页面滚动关闭', () => {
  const { controller, button } = setup();
  button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, composed: true }));
  button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, composed: true, detail: 1 }));
  button.dispatchEvent(new Event('scroll', { bubbles: true, composed: true }));
  expect(controller.close).not.toHaveBeenCalled();
  document.dispatchEvent(new Event('scroll'));
  expect(controller.close).toHaveBeenCalledOnce();
});

test('卡片选区被重映射为正文折叠选区后，延迟事件不关闭卡片', () => {
  const { controller, host, button } = setup();
  button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, composed: true }));
  button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, composed: true, detail: 1 }));
  const getComposedRanges = vi.fn(() => [{
    startContainer: button.firstChild!,
    endContainer: button.firstChild!,
  }]);
  vi.spyOn(document, 'getSelection').mockReturnValue({
    anchorNode: document.documentElement,
    isCollapsed: true,
    getComposedRanges,
  } as unknown as Selection);
  document.dispatchEvent(new Event('selectionchange'));
  expect(getComposedRanges).toHaveBeenCalledWith({ shadowRoots: [host.shadowRoot] });
  expect(controller.close).not.toHaveBeenCalled();
  expect(controller.select).not.toHaveBeenCalled();
});

test('组合选区回到正文并折叠时仍关闭卡片', () => {
  const { controller } = setup();
  const outside = document.querySelector('#word')!.firstChild!;
  vi.spyOn(document, 'getSelection').mockReturnValue({
    anchorNode: outside,
    isCollapsed: true,
    getComposedRanges: () => [{ startContainer: outside, endContainer: outside }],
  } as unknown as Selection);
  document.dispatchEvent(new Event('selectionchange'));
  expect(controller.close).toHaveBeenCalledOnce();
});

test('Esc 和视口变化取消尚未处理的选词帧', () => {
  const { controller } = setup();
  const cancel = vi.spyOn(window, 'cancelAnimationFrame');
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(99);
  document.dispatchEvent(new MouseEvent('mouseup', { detail: 2 }));
  window.dispatchEvent(new Event('resize'));
  expect(cancel).toHaveBeenCalledWith(99);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(controller.close).toHaveBeenCalledTimes(2);
});
