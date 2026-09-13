import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sourceConfig from '../data/ecdict-source.json';
import { digestBytes, validateIndex, createRepository } from '../src/dictionary/repository';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function checkPackage(output = resolve(root, 'dist')) {
  const manifest = JSON.parse(await readFile(resolve(output, 'manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['storage', 'tts']);
  assert.deepEqual(manifest.host_permissions, ['http://*/*', 'https://*/*']);
  assert.equal(manifest.web_accessible_resources, undefined);
  assert.deepEqual(manifest.icons, {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  });
  assert.deepEqual(manifest.action.default_icon, manifest.icons);
  for (const size of [16, 32, 48, 128]) {
    const bytes = await readFile(resolve(output, manifest.icons[size]));
    assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
    assert.equal(bytes[25], 6);
  }
  assert((await readFile(resolve(output, 'icons/cat-logo.svg'), 'utf8')).includes('蜷睡猫'));
  const index: unknown = JSON.parse(await readFile(resolve(output, 'dictionary/index.json'), 'utf8'));
  validateIndex(index);
  assert.equal(index.source.revision, sourceConfig.revision);
  assert.equal(index.source.csvGitBlob, sourceConfig.csvGitBlob);
  assert.equal(index.source.csvBytes, sourceConfig.csvBytes);
  assert(index.stats.entryCount > 100_000, '不能以少量示例词冒充完整词库');
  for (const [id, metadata] of Object.entries(index.shards)) {
    const bytes = await readFile(resolve(output, `dictionary/${id}.json`));
    assert.equal(bytes.byteLength, metadata.bytes);
    assert.equal(await digestBytes(bytes), metadata.sha256);
  }
  for (const path of ['background.js', 'content.js', 'popup.js', 'popup.html', 'popup.css', 'ECDICT.LICENSE', 'THIRD_PARTY_NOTICES.md']) {
    assert((await stat(resolve(output, path))).size > 0);
  }
  assert((await readFile(resolve(output, 'ECDICT.LICENSE'), 'utf8')).includes('MIT License'));
  const repository = createRepository(path => readFile(resolve(output, path)));
  for (const word of ['bank', 'hello', 'dictionary', 'running']) {
    assert.equal((await repository.lookup(word)).kind, 'found', `${word} 应可查到`);
  }
  const paths = await readdir(output, { recursive: true });
  let bytes = 0;
  let fileCount = 0;
  for (const path of paths) {
    const info = await stat(resolve(output, path));
    if (!info.isFile()) continue;
    assert(!/(?:node_modules|fixtures|\.cache|\.test\.|\.map$|\.csv$)/u.test(path));
    assert(relative(output, resolve(output, path)).startsWith('..') === false);
    fileCount += 1;
    bytes += info.size;
  }
  const result = { fileCount, bytes, mebibytes: Number((bytes / 1024 / 1024).toFixed(2)), entryCount: index.stats.entryCount };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await checkPackage();
}
