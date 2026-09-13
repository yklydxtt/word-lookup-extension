import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parse } from 'csv-parse';
import { compileDictionary } from '../../scripts/dictionary/compiler';
import type { SourceProvenance } from '../../src/core/types';

export async function createFixtureReader() {
  const bytes = await readFile(new URL('./ecdict.csv', import.meta.url));
  const source: SourceProvenance = {
    revision: 'test-fixture',
    csvBytes: bytes.byteLength,
    csvGitBlob: createHash('sha1').update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex'),
    csvSha256: createHash('sha256').update(bytes).digest('hex'),
  };
  const compiled = await compileDictionary(parse(bytes, { columns: true }), source);
  const requests: string[] = [];
  return {
    ...compiled,
    source,
    bytes,
    requests,
    async read(path: string): Promise<Uint8Array> {
      requests.push(path);
      const resource = compiled.resources.get(path);
      if (!resource) throw new Error('不存在的资源');
      return resource;
    },
  };
}
