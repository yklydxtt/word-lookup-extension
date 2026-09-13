import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { expect, test } from 'vitest';
import { buildIcons, renderIcon } from './icons';

const sourceUrl = new URL('../src/assets/cat-logo.svg', import.meta.url);

test.each([16, 32, 48, 128])('小猫图标生成 %i 像素透明 PNG 且结果稳定', async size => {
  const source = await readFile(sourceUrl, 'utf8');
  const bytes = renderIcon(source, size);
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(bytes.readUInt32BE(16)).toBe(size);
  expect(bytes.readUInt32BE(20)).toBe(size);
  expect(bytes[25]).toBe(6);
  expect(bytes).toEqual(renderIcon(source, size));
});

test('小猫图形具有透明留白且不依赖脚本或外部图片', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  expect(source).toContain('蜷睡猫');
  expect(source).not.toMatch(/<script|<image|(?:href|src)=/u);
  const image = new Resvg(source, { font: { loadSystemFonts: false } }).render();
  expect(image.width).toBe(128);
  expect(image.height).toBe(128);
  const alpha = Array.from(image.pixels).filter((_value, index) => index % 4 === 3);
  expect(alpha[0]).toBe(0);
  expect(alpha.at(-1)).toBe(0);
  expect(alpha.filter(value => value > 0).length).toBeGreaterThan(500);
  expect(alpha.filter(value => value === 0).length).toBeGreaterThan(5000);
});

test('16 像素加粗线条，其余尺寸保持矢量源笔画', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  const standard = new Resvg(source, {
    fitTo: { mode: 'width', value: 16 },
    font: { loadSystemFonts: false },
  }).render().asPng();
  expect(renderIcon(source, 16)).not.toEqual(standard);
  expect(() => renderIcon(source, 0)).toThrow();
  expect(() => renderIcon(source, 17)).toThrow();
});

test('构建输出四种 PNG 及菜单共享 SVG', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'word-lookup-icons-'));
  try {
    await buildIcons(directory);
    expect((await readdir(directory)).sort()).toEqual([
      'cat-logo.svg', 'icon-128.png', 'icon-16.png', 'icon-32.png', 'icon-48.png',
    ]);
    expect(await readFile(join(directory, 'cat-logo.svg'), 'utf8')).toBe(await readFile(sourceUrl, 'utf8'));
    for (const size of [16, 32, 48, 128]) {
      const bytes = await readFile(join(directory, `icon-${size}.png`));
      expect(bytes.readUInt32BE(16)).toBe(size);
      expect(bytes.readUInt32BE(20)).toBe(size);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
