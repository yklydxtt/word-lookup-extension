import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { manifest } from '../src/manifest';
import { validateIndex } from '../src/dictionary/repository';
import { buildIcons } from './icons';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function buildExtension(): Promise<void> {
  const dictionary = resolve(root, '.generated/dictionary');
  const index: unknown = JSON.parse(await readFile(resolve(dictionary, 'index.json'), 'utf8'));
  validateIndex(index);
  const license = await readFile(resolve(root, 'third-party/ECDICT.LICENSE'));
  const notices = await readFile(resolve(root, 'THIRD_PARTY_NOTICES.md'));
  const output = resolve(root, 'dist');
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await build({
    absWorkingDir: root,
    entryPoints: ['src/content/index.ts'],
    outfile: resolve(output, 'content.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome120',
    minify: true,
    legalComments: 'none',
    plugins: [{
      name: 'inline-css',
      setup(builder) {
        builder.onResolve({ filter: /\.css\?inline$/ }, args => ({
          path: resolve(args.resolveDir, args.path.replace(/\?inline$/, '')),
          namespace: 'inline-css',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'inline-css' }, async args => ({
          contents: await readFile(args.path, 'utf8'),
          loader: 'text',
        }));
      },
    }],
  });
  await build({
    absWorkingDir: root,
    entryPoints: { background: 'src/background/index.ts', popup: 'src/popup/index.ts' },
    outdir: output,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'chrome120',
    minify: true,
    legalComments: 'none',
  });
  await cp(dictionary, resolve(output, 'dictionary'), { recursive: true });
  await cp(resolve(root, 'src/popup/popup.html'), resolve(output, 'popup.html'));
  await cp(resolve(root, 'src/popup/popup.css'), resolve(output, 'popup.css'));
  await buildIcons(resolve(output, 'icons'));
  await writeFile(resolve(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(resolve(output, 'ECDICT.LICENSE'), license);
  await writeFile(resolve(output, 'THIRD_PARTY_NOTICES.md'), notices);
  console.log(`扩展已构建：${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await buildExtension();
}
