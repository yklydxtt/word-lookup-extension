import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const sizes = [16, 32, 48, 128] as const;

export function renderIcon(source: string, size: number): Buffer {
  if (!sizes.some(value => value === size)) throw new Error('不支持的图标尺寸');
  const svg = size === 16
    ? source.replace('stroke-width="6.5"', 'stroke-width="8"').replace('stroke-width="5"', 'stroke-width="6.5"')
    : source;
  return new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    font: { loadSystemFonts: false },
  }).render().asPng();
}

export async function buildIcons(output: string): Promise<void> {
  const source = await readFile(new URL('../src/assets/cat-logo.svg', import.meta.url), 'utf8');
  const images = sizes.map(size => ({ size, bytes: renderIcon(source, size) }));
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, 'cat-logo.svg'), source);
  for (const { size, bytes } of images) {
    await writeFile(resolve(output, `icon-${size}.png`), bytes);
  }
}
