import { afterEach, expect, test, vi } from 'vitest';
import { createClient, sendRequest } from './client';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test('后台错误不会当作未收录', async () => {
  vi.stubGlobal('chrome', {
    runtime: {
      lastError: { message: '后台已停止' },
      sendMessage: (_request: unknown, callback: (value: unknown) => void) => callback(undefined),
    },
  });
  expect(await createClient().lookup('bank', 1)).toEqual({
    kind: 'error', query: 'bank', code: 'background-unavailable',
  });
});

test('请求只传单词和标识，不传正文或网址', async () => {
  const sendMessage = vi.fn((request, callback) => callback({
    type: 'LOOKUP_RESULT',
    requestId: request.requestId,
    result: { kind: 'not-found', query: request.word },
  }));
  vi.stubGlobal('chrome', { runtime: { sendMessage } });
  expect(await createClient().lookup('bank', 7)).toEqual({ kind: 'not-found', query: 'bank' });
  expect(sendMessage.mock.calls[0][0]).toEqual({ type: 'LOOKUP', word: 'bank', requestId: 7 });
});

test('后台无响应时按时结束，不永久等待', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('chrome', { runtime: { sendMessage: vi.fn() } });
  const pending = sendRequest({ type: 'GET_PREFERENCES' });
  const assertion = expect(pending).rejects.toThrow('超时');
  await vi.advanceTimersByTimeAsync(5000);
  await assertion;
});
