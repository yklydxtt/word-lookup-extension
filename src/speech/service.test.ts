import { expect, test, vi } from 'vitest';
import { selectVoice } from './voices';
import { createSpeechService, type TtsPort } from './service';

const british: chrome.tts.TtsVoice = { voiceName: '本地英式', lang: 'en-GB', remote: false };
const american: chrome.tts.TtsVoice = { voiceName: '本地美式', lang: 'en-US', remote: false };

test('只选择明确本地的系统语音', () => {
  const remote = { ...british, remote: true };
  const unknown = { voiceName: '未知', lang: 'en-GB' };
  expect(selectVoice([remote, unknown, american, british])?.name).toBe('本地英式');
  expect(selectVoice([remote, american])?.lang).toBe('en-US');
  expect(selectVoice([remote, unknown, { ...british, extensionId: 'other' }])).toBeNull();
});

test('缺语音不调用播放接口', async () => {
  const speak = vi.fn();
  const service = createSpeechService({ getVoices: callback => callback([]), speak }, () => undefined);
  expect(await service.getVoiceState()).toEqual({ status: 'unavailable' });
  expect(await service.speak('bank', vi.fn())).toEqual({ status: 'error', code: 'no-voice' });
  expect(speak).not.toHaveBeenCalled();
});

test('显式选择口音，回调成功仅表示接受并报告后续错误', async () => {
  let options: chrome.tts.TtsOptions | undefined;
  const port: TtsPort = {
    getVoices: callback => callback([british]),
    speak: (_word, next, callback) => { options = next; callback(); },
  };
  const emit = vi.fn();
  const service = createSpeechService(port, () => undefined);
  expect(await service.speak('bank', emit)).toMatchObject({ status: 'accepted', voice: { lang: 'en-GB' } });
  expect(options).toMatchObject({ voiceName: '本地英式', enqueue: false });
  options?.onEvent?.({ type: 'error', errorMessage: '故障' });
  expect(emit).toHaveBeenCalledWith({ type: 'error', message: '发音播放失败' });
});

test('设备回调错误与停用状态阻止播放', async () => {
  const speak = vi.fn((_word, _options, callback) => callback());
  const service = createSpeechService({ getVoices: callback => callback([british]), speak }, () => undefined);
  expect(await service.speak('bank', vi.fn(), async () => false)).toEqual({ status: 'cancelled' });
  expect(speak).not.toHaveBeenCalled();
  const broken = createSpeechService({ getVoices: callback => callback([british]), speak }, () => '读取失败');
  expect(await broken.getVoiceState()).toEqual({ status: 'error' });
});

test('语音异步出现后恢复且移除监听', async () => {
  let voices: chrome.tts.TtsVoice[] = [];
  const listeners = new Set<() => void>();
  const service = createSpeechService({
    getVoices: callback => callback(voices),
    speak: vi.fn(),
    onVoicesChanged: {
      addListener: listener => { listeners.add(listener); },
      removeListener: listener => { listeners.delete(listener); },
    },
  }, () => undefined);
  const result = service.getVoiceState();
  await Promise.resolve();
  await Promise.resolve();
  voices = [british];
  listeners.forEach(listener => listener());
  expect(await result).toMatchObject({ status: 'ready' });
  expect(listeners.size).toBe(0);
});

test('旧播放在等待权限时被新点击替代，不得反向播放', async () => {
  let allowFirst!: (allowed: boolean) => void;
  const speak = vi.fn((_word, _options, callback) => callback());
  const service = createSpeechService({
    getVoices: callback => callback([british]),
    speak,
  }, () => undefined);
  const first = service.speak('bank', vi.fn(), () => new Promise(resolve => { allowFirst = resolve; }));
  await vi.waitFor(() => expect(allowFirst).toBeTypeOf('function'));
  expect(await service.speak('go', vi.fn())).toMatchObject({ status: 'accepted' });
  allowFirst(true);
  expect(await first).toEqual({ status: 'cancelled' });
  expect(speak.mock.calls.map(call => call[0])).toEqual(['go']);
});
