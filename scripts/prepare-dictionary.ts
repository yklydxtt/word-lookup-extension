import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'csv-parse';
import sourceConfig from '../data/ecdict-source.json';
import type { SourceProvenance } from '../src/core/types';
import { compileDictionary } from './dictionary/compiler';

export interface SourceExpectation {
  revision: string;
  csvGitBlob: string;
  csvBytes: number;
}

export function verifySource(bytes: Uint8Array, expected: SourceExpectation): SourceProvenance {
  const csvGitBlob = createHash('sha1')
    .update(`blob ${bytes.byteLength}\0`)
    .update(bytes)
    .digest('hex');
  if (bytes.byteLength !== expected.csvBytes || csvGitBlob !== expected.csvGitBlob) {
    throw new Error('词库原始文件校验失败，停止构建');
  }
  return {
    revision: expected.revision,
    csvGitBlob,
    csvBytes: bytes.byteLength,
    csvSha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`下载失败：${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function prepareDictionary(): Promise<void> {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const cacheDirectory = resolve(root, '.cache/ecdict');
  const csvPath = resolve(cacheDirectory, 'ecdict.csv');
  await mkdir(cacheDirectory, { recursive: true });
  let bytes: Uint8Array;
  try {
    bytes = await readFile(csvPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    bytes = await download(`https://raw.githubusercontent.com/skywind3000/ECDICT/${sourceConfig.revision}/ecdict.csv`);
    verifySource(bytes, sourceConfig);
    await writeFile(`${csvPath}.tmp`, bytes);
    await rename(`${csvPath}.tmp`, csvPath);
  }
  const provenance = verifySource(bytes, sourceConfig);
  const licensePath = resolve(root, 'third-party/ECDICT.LICENSE');
  let license: Uint8Array;
  try {
    license = await readFile(resolve(cacheDirectory, 'LICENSE'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    license = await download(`https://raw.githubusercontent.com/skywind3000/ECDICT/${sourceConfig.revision}/LICENSE`);
    await writeFile(resolve(cacheDirectory, 'LICENSE'), license);
  }
  if (!new TextDecoder().decode(license).includes('MIT License')) throw new Error('许可文件格式异常');
  await mkdir(dirname(licensePath), { recursive: true });
  await writeFile(licensePath, license);
  const rows = createReadStream(csvPath).pipe(parse({ columns: true, bom: true }));
  const compiled = await compileDictionary(rows, provenance);
  const staging = resolve(root, '.generated/dictionary-staging');
  await mkdir(staging, { recursive: true });
  for (const [path, resource] of compiled.resources) {
    await writeFile(resolve(staging, path.slice('dictionary/'.length)), resource);
  }
  const output = resolve(root, '.generated/dictionary');
  await rm(output, { recursive: true, force: true });
  await rename(staging, output);
  console.log(JSON.stringify({ source: provenance, stats: compiled.index.stats, shards: 256 }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await prepareDictionary();
}
