# 离线英文划词查词扩展实施计划

> **执行约定：** 默认在当前任务中顺序执行，各步骤使用复选框跟踪。只有用户明确授权子代理后，才使用 `subagent-driven-development` 分工；不自行启动子代理、创建分支或提交 Git。本文是实施计划，代码块不是已经写入项目的实现。

## 当前执行记录

- [x] 工程、输入规则、共享协议及测试环境。
- [x] 真实 ECDICT 构建、256 分片、有限缓存与后台查询。
- [x] 全局及网站设置、本地语音筛选、发音竞态回归。
- [x] 已确认的卡片样式、正文不加下划线、选区与工具栏菜单。
- [x] 扩展构建、分片完整性校验、真实词条离线文件查询。
- [x] 用户在 `ego lite` 加载真实扩展；查词、交互、工具栏设置、域名隔离及后台冷启动验收。
- [x] 修复 Shadow DOM 选区重映射引起的卡片误关闭，新增两项回归，全部 45 项测试通过。
- [x] 实际本地英式语音属性及播放事件；新词查询的后台包内资源抽样。
- [x] 用户确认 `bank` 的实际发音可正常听见。
- [x] 用户对断网首次查词与发音步骤回复“已验收”，按人工确认记录并交付首版。
- [ ] 完整网络链路独立验证，保留为未测试，不因用户确认断网功能而视为通过。

实测证据、故障修复及仍未测试的项目分别记录在 `docs/qa/ego-lite-acceptance.md`。修复后的产物为 265 个文件、49,723,895 字节；已重新加载到用户的 `ego lite`。

以下分步示例保留为原计划，不表示每项都严格按相同文件切分或先失败后实现的顺序执行；当前完成状态以上表及验收记录为准。实际测试合并在相邻模块测试文件中，页面事件单独提取到 `src/content/events.ts`，便于验证关闭规则。

**目标：** 实现个人自用的离线英文划词扩展，选词后显示中文释义、音标及本地发音按钮，并完成 `ego lite` 中的真实扩展验收。

**架构：** 使用 `Manifest V3 + TypeScript`，页面脚本负责选区与 Shadow DOM 卡片，Service Worker 统一读取内置词库分片、处理本地设置及系统语音。词库在构建阶段固定版本并生成静态资源，运行时不调用外部服务。

**技术栈：** Node.js、npm、TypeScript、esbuild、Vitest、jsdom、csv-parse、`chrome.storage.local`、`chrome.tts`、`ego-browser`。

**设计依据：** `/Users/bytedance/Documents/code/test/word-lookup-extension/docs/superpowers/specs/2026-09-12-offline-word-lookup-design.md`，已获用户确认。

## 全局约束

- 采用本地加载扩展的安装方式，不发布扩展商店。
- 以桌面 Chromium 扩展体系为目标，使用 `Manifest V3 + TypeScript`。
- 保留 Chrome、Edge 兼容目标，但实机验收仅在 `ego lite` 中进行，不要求分别测试 Chrome、Edge。
- 日常查词及发音不依赖网络、API Key、后端或账号。
- 多个单词、中文、纯数字及不符合上述规则的选区不触发查词。
- 不使用简单删除 `-s`、`-ed`、`-ing` 等词尾的方式猜测原形。
- 缓存不持久化为查词历史，不使用 `storage.sync`。
- 初始上限为 8 个已加载分片、256 条查询结果；在途读取结束后同样执行容量约束。
- 不请求词典 API、在线音频或遥测服务；不自动下载语音或词库更新。
- 只有明确点击发音按钮才播放。
- 输入框、文本域、可编辑区域及能够识别的编辑器区域不触发查词。
- 代码标识符、命令和第三方许可原文可保留英文，用户界面、文档说明及测试描述使用中文。
- 不添加未要求的代码内注释，不使用单字母变量名。
- 设计及界面确认后执行实现；浏览器原生权限、系统网络变更及其他扩展操作仍须用户确认。

所有命令的工作目录均为 `/Users/bytedance/Documents/code/test/word-lookup-extension`。文中的测试数据只供测试使用，不得代替最终扩展中的真实词库。

## 已核验事实与前置门槛

| 项目 | 已知事实 | 对实施的约束 |
| --- | --- | --- |
| 项目 | 只有设计文档，未初始化 Git | 使用最小工程结构；不沿用不存在的配置 |
| Node.js | 本机为 `v22.22.1`，npm 为 `10.9.4` | 依赖必须兼容该版本，不升级用户运行环境 |
| ECDICT | 固定版本 `bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b`；CSV 为 65,933,428 字节，Git blob 为 `c4ade63ea08cf39d9c3475e96929036d64d94c94` | 下载后先验证原始字节，再计算 SHA-256 并构建 |
| 词形来源 | CSV 的 `exchange` 提供原形及屈折关系 | 不下载或打包另有研究、教育用途说明的 `lemma.en.txt` |
| 发音接口 | `chrome.tts` 提供 `remote`、`voiceName`、`lang` 和发音事件 | 严格筛选明确本地的系统语音；当前设备是否满足需实测 |
| 浏览器 | `ego lite 0.5.0.28` 可以访问扩展管理页，开发者模式关闭 | 真实安装前请用户确认开发者模式和加载操作，不修改已有扩展 |
| 自动化限制 | 本次 `Browser.getVersion` 不受当前浏览器协议入口支持 | 从可见版本信息记录版本，不依赖该命令，不换浏览器 |

开发者模式可能影响已有的未打包扩展，不能擅自开启。浏览器提示存在更新，但没有升级授权；不将升级设为默认步骤。

官方依据：[ECDICT 固定版本](https://github.com/skywind3000/ECDICT/tree/bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b)、[ECDICT 字段说明](https://github.com/skywind3000/ECDICT/blob/bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b/README.md)、[chrome.tts](https://developer.chrome.com/docs/extensions/reference/api/tts)。

## 文件结构与职责

下列路径以项目根目录 `/Users/bytedance/Documents/code/test/word-lookup-extension` 为基准，均为计划新增，已有设计文档除外。

```text
/Users/bytedance/Documents/code/test/word-lookup-extension/
├── package.json、package-lock.json、tsconfig.json、vitest.config.ts、.gitignore
├── data/ecdict-source.json
├── third-party/ECDICT.LICENSE
├── scripts/
│   ├── dictionary/compiler.ts、compiler.test.ts
│   ├── prepare-dictionary.ts、prepare-dictionary.test.ts
│   ├── build-extension.ts、check-package.ts、package.test.ts
│   └── serve-fixture.ts
├── src/
│   ├── core/types.ts、normalize.ts、normalize.test.ts、shard-id.ts
│   ├── dictionary/lru.ts、lru.test.ts、repository.ts、repository.test.ts
│   ├── preferences/model.ts、model.test.ts、store.ts、store.test.ts
│   ├── speech/voices.ts、voices.test.ts、service.ts、service.test.ts
│   ├── content/selection.ts、selection.test.ts、position.ts、position.test.ts
│   ├── content/card.ts、card.test.ts、card.css、controller.ts、controller.test.ts
│   ├── content/index.ts
│   ├── background/router.ts、router.test.ts、index.ts
│   ├── popup/index.ts、popup.test.ts、popup.html、popup.css
│   ├── platform/client.ts、client.test.ts
│   ├── manifest.ts
│   └── styles.d.ts
├── tests/fixtures/ecdict.csv、provenance.ts、reader.ts、page.html
├── docs/qa/ego-lite-acceptance.md
├── README.md
├── THIRD_PARTY_NOTICES.md
├── .cache/ecdict/                 下载缓存，不交付
├── .generated/dictionary/         构建后的词库中间产物
└── dist/                         唯一可加载扩展目录
```

所有运行时模块避免导入 `scripts/`、Node.js 内置模块或测试夹具。`scripts/` 可以引用纯 TypeScript 的规范化和分片算法，保证构建与查询使用同一规则。

## 任务依赖

按任务 1 至任务 9 顺序推进。任务 2、3 组成词库链路；任务 4、5 分别提供设置和发音；任务 6 提供卡片；任务 7 接通后台；任务 8 产出真实扩展；任务 9 验收。

每个任务优先运行针对性测试，再运行类型检查；最终运行全套测试与实际词库构建。下列命令是实施阶段的执行依据。

---

### 任务 1：建立规范化规则、共享协议与测试入口

**文件：**

- 新增 `/Users/bytedance/Documents/code/test/word-lookup-extension/package.json`、`/Users/bytedance/Documents/code/test/word-lookup-extension/tsconfig.json`、`/Users/bytedance/Documents/code/test/word-lookup-extension/vitest.config.ts`。
- 新增 `/Users/bytedance/Documents/code/test/word-lookup-extension/src/core/types.ts`、`/Users/bytedance/Documents/code/test/word-lookup-extension/src/core/normalize.ts`、`/Users/bytedance/Documents/code/test/word-lookup-extension/src/core/shard-id.ts`。
- 测试 `/Users/bytedance/Documents/code/test/word-lookup-extension/src/core/normalize.test.ts`。

**接口：**

- `canonicalWord(value: string): string | null`：词库键的严格规范化，不删除词头、词尾标点。
- `normalizeSelection(value: string): string | null`：对用户选区额外清理外围标点，再调用严格规范化。
- `shardId(word: string): string`：返回两位小写十六进制分片标识。
- 共享数据和消息结构定义在本任务，后续任务不得自行创造不兼容的同名字段。

- [ ] **步骤 1：安装已核验兼容的固定依赖，建立测试命令。**

```bash
npm install --save-dev --save-exact typescript@5.9.3 esbuild@0.28.2 vitest@5.0.0 jsdom@26.1.0 tsx@4.23.13 csv-parse@7.0.2 @types/chrome@0.2.9 @types/node@22.18.6
```

`package.json` 声明 `"private": true`、`"type": "module"`、`"engines": {"node": ">=22.12.0"}`，配置以下命令；提交执行权限不由这些脚本授予。

```json
{
  "test": "vitest run",
  "typecheck": "tsc --noEmit",
  "prepare:dictionary": "tsx scripts/prepare-dictionary.ts",
  "build": "tsx scripts/build-extension.ts",
  "check:package": "tsx scripts/check-package.ts",
  "qa:serve": "tsx scripts/serve-fixture.ts"
}
```

`tsconfig.json` 使用 `strict: true`、`target: "ES2022"`、`module: "ESNext"`、`moduleResolution: "Bundler"`、`resolveJsonModule: true`、`noEmit: true`，类型库包含 DOM、Node 和 Chrome。Vitest 默认使用 Node 环境，卡片相关测试用文件名规则切换 jsdom；不启动测试服务或浏览器 UI。

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['scripts/**/*.test.ts', 'src/**/*.test.ts'],
          exclude: ['src/content/**/*.test.ts', 'src/popup/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/content/**/*.test.ts', 'src/popup/**/*.test.ts'],
        },
      },
    ],
  },
});
```

所有测试文件显式从 `vitest` 导入用到的 `test`、`expect`、`vi`，从对应生产模块导入函数和共享类型，不依赖未声明的全局测试函数。每个 DOM 测试结束后销毁卡片并清空挂载点，避免测试间污染。

- [ ] **步骤 2：写入规范化测试，再执行以确认缺少实现时失败。**

```typescript
import { expect, test } from 'vitest';
import { canonicalWord, normalizeSelection } from './normalize';
import { shardId } from './shard-id';

test('清理选区外围标点但保留词内撇号和连字符', () => {
  expect(normalizeSelection(' “Don’t!” ')).toBe("don't");
  expect(normalizeSelection('mother-in-law')).toBe('mother-in-law');
  expect(normalizeSelection('hello world')).toBeNull();
  expect(normalizeSelection('中文')).toBeNull();
  expect(normalizeSelection('123')).toBeNull();
});

test('构建词库时不把后缀词条改造成另一个单词', () => {
  expect(canonicalWord('-ability')).toBeNull();
  expect(canonicalWord('Bank')).toBe('bank');
  expect(shardId('bank')).toMatch(/^[a-f0-9]{2}$/);
  expect(shardId('bank')).toBe(shardId('bank'));
});
```

运行 `npm test -- src/core/normalize.test.ts`，预期先因缺少模块失败。

- [ ] **步骤 3：实现纯函数和共享数据类型。**

```typescript
export function canonicalWord(value: string): string | null {
  const normalized = value.trim().replace(/[‘’]/gu, "'").toLowerCase();
  return /^[a-z]+(?:[-'][a-z]+)*$/u.test(normalized) ? normalized : null;
}

export function normalizeSelection(value: string): string | null {
  const unwrapped = value.trim().replace(
    /^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu,
    '',
  );
  return canonicalWord(unwrapped);
}

export function shardId(word: string): string {
  let hash = 2166136261;
  for (const character of word) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  }
  return (hash & 255).toString(16).padStart(2, '0');
}
```

`types.ts` 使用以下字段作为固定协议；`translation` 和 `pos` 保留词库原文，界面不将词频分布推断成释义词性。

```typescript
export interface WordEntry {
  word: string;
  phonetic: string | null;
  translation: string;
  pos: string | null;
}

export interface SourceProvenance {
  revision: string;
  csvGitBlob: string;
  csvSha256: string;
  csvBytes: number;
}

export interface DictionaryShard {
  schemaVersion: 1;
  entries: Record<string, WordEntry[]>;
  lemmas: Record<string, string[]>;
}

export interface DictionaryIndex {
  schemaVersion: 1;
  source: SourceProvenance;
  stats: Record<string, number>;
  shards: Record<string, { bytes: number; sha256: string }>;
}

export type LookupResult =
  | { kind: 'found'; query: string; matchedBy: 'exact' | 'lemma'; entries: WordEntry[] }
  | { kind: 'not-found'; query: string }
  | { kind: 'error'; query: string; code: 'dictionary-read' | 'background-unavailable' | 'invalid-request' };

export interface Preferences {
  schemaVersion: 1;
  enabled: boolean;
  disabledHosts: string[];
}

export interface VoiceChoice {
  name: string;
  lang: 'en-GB' | 'en-US';
  label: '英式发音' | '美式发音';
}

export type VoiceState =
  | { status: 'ready'; voice: VoiceChoice }
  | { status: 'loading' | 'unavailable' | 'error' };

export type SpeechStart =
  | { status: 'accepted'; voice: VoiceChoice }
  | { status: 'cancelled' }
  | { status: 'error'; code: 'no-voice' | 'playback-failed' };

export interface SpeechEvent {
  type: 'end' | 'interrupted' | 'error';
  message?: string;
}
```

- [ ] **步骤 4：固定消息类型与测试配置并复验。**

```typescript
export type ExtensionRequest =
  | { type: 'LOOKUP'; requestId: number; word: string }
  | { type: 'GET_PREFERENCES' }
  | { type: 'SET_GLOBAL'; enabled: boolean }
  | { type: 'SET_SITE'; hostname: string; enabled: boolean }
  | { type: 'GET_VOICE' }
  | { type: 'SPEAK'; speechId: number; word: string }
  | { type: 'PING' };

export type ExtensionResponse =
  | { type: 'LOOKUP_RESULT'; requestId: number; result: LookupResult }
  | { type: 'PREFERENCES'; value: Preferences }
  | { type: 'VOICE'; state: VoiceState }
  | { type: 'SPEECH_STARTED'; speechId: number; result: SpeechStart }
  | { type: 'AVAILABLE' }
  | { type: 'REQUEST_ERROR'; code: 'invalid-request' | 'storage-failed' | 'disabled' };

export interface SpeechNotification {
  type: 'SPEECH_EVENT';
  speechId: number;
  event: SpeechEvent;
}
```

配置 Vitest 的 Node 项目包含非 `content`、非 `popup` 测试；jsdom 项目只包含 `src/content/**/*.test.ts` 和 `src/popup/**/*.test.ts`。运行 `npm test -- src/core/normalize.test.ts` 和 `npm run typecheck`，两者应通过。

**独立交付：** 可测试的输入规则及所有模块共用的协议，不含扩展占位入口。

### 任务 2：生成固定来源的完整分片词库

**文件：**

- 新增 `/Users/bytedance/Documents/code/test/word-lookup-extension/data/ecdict-source.json`。
- 新增 `/Users/bytedance/Documents/code/test/word-lookup-extension/scripts/dictionary/compiler.ts`、`/Users/bytedance/Documents/code/test/word-lookup-extension/scripts/prepare-dictionary.ts` 及各自的同目录测试。
- 新增 `/Users/bytedance/Documents/code/test/word-lookup-extension/tests/fixtures/ecdict.csv`、`/Users/bytedance/Documents/code/test/word-lookup-extension/tests/fixtures/provenance.ts`。
- 生成 `/Users/bytedance/Documents/code/test/word-lookup-extension/.generated/dictionary/`、`/Users/bytedance/Documents/code/test/word-lookup-extension/third-party/ECDICT.LICENSE`。

**接口：**

```typescript
export interface RawWordRow {
  word: string;
  phonetic: string;
  translation: string;
  pos: string;
  exchange: string;
}

export interface CompiledDictionary {
  index: DictionaryIndex;
  resources: Map<string, Uint8Array>;
}

export interface SourceExpectation {
  revision: string;
  csvGitBlob: string;
  csvBytes: number;
}

export function exchangePairs(row: RawWordRow): Array<[string, string]>;
export function compileDictionary(
  rows: AsyncIterable<RawWordRow>,
  source: SourceProvenance,
): Promise<CompiledDictionary>;
export function verifySource(bytes: Uint8Array, expected: SourceExpectation): SourceProvenance;
```

`resources` 的键为 `dictionary/index.json` 及 `dictionary/00.json` 至 `dictionary/ff.json`。测试夹具中的来源校验值与生产来源区分；只有 `prepare-dictionary.ts` 可以下载文件。

- [ ] **步骤 1：创建固定来源配置和最小 CSV 测试夹具。**

```json
{
  "repository": "https://github.com/skywind3000/ECDICT",
  "revision": "bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b",
  "csvGitBlob": "c4ade63ea08cf39d9c3475e96929036d64d94c94",
  "csvBytes": 65933428,
  "files": ["ecdict.csv", "LICENSE"]
}
```

```csv
word,phonetic,translation,pos,exchange
bank,bæŋk,"n. 银行\nn. 河岸",n:100,s:banks
go,ɡəʊ,v. 去,v:100,p:went/d:gone/i:going/3:goes
run,rʌn,v. 跑,v:100,p:ran/i:running
mother-in-law,,n. 岳母；婆婆,n:100,
-ability,,后缀,,
```

`tests/fixtures/provenance.ts` 从夹具实际字节计算来源信息，不使用生产文件校验值或伪造哈希：

```typescript
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { SourceProvenance } from '../../src/core/types';

const bytes = readFileSync(new URL('./ecdict.csv', import.meta.url));
export const fixtureProvenance: SourceProvenance = {
  revision: 'test-fixture',
  csvBytes: bytes.byteLength,
  csvGitBlob: createHash('sha1').update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex'),
  csvSha256: createHash('sha256').update(bytes).digest('hex'),
};
```

- [ ] **步骤 2：编写编译测试并先运行失败用例。**

```typescript
import { readFile } from 'node:fs/promises';
import { parse } from 'csv-parse';
import { expect, test } from 'vitest';
import { compileDictionary } from './compiler';
import { shardId } from '../../src/core/shard-id';
import { fixtureProvenance } from '../../tests/fixtures/provenance';

test('生成完整分片并用词库关系回查不规则变形', async () => {
  const input = await readFile(new URL('../../tests/fixtures/ecdict.csv', import.meta.url));
  const result = await compileDictionary(parse(input, { columns: true }), fixtureProvenance);
  const bytes = result.resources.get(`dictionary/${shardId('went')}.json`);
  expect(bytes).toBeDefined();
  const shard = JSON.parse(new TextDecoder().decode(bytes));
  expect(shard.lemmas.went).toEqual(['go']);
  expect(Object.keys(result.index.shards)).toHaveLength(256);
  expect(result.index.stats.excludedInvalidWord).toBe(1);
});
```

运行 `npm test -- scripts/dictionary/compiler.test.ts scripts/prepare-dictionary.test.ts`，预期先因接口尚未实现而失败。

- [ ] **步骤 3：实现词形关联和 CSV 编译。**

```typescript
export function exchangePairs(row: RawWordRow): Array<[string, string]> {
  const base = canonicalWord(row.word);
  if (!base) return [];
  const pairs: Array<[string, string]> = [];
  const inflections = new Set(['p', 'd', 'i', '3', 'r', 't', 's']);
  for (const token of row.exchange.split('/')) {
    const separator = token.indexOf(':');
    if (separator < 0) continue;
    const kind = token.slice(0, separator);
    for (const rawValue of token.slice(separator + 1).split(',')) {
      const value = canonicalWord(rawValue);
      if (!value || value === base) continue;
      if (kind === '0') pairs.push([base, value]);
      if (inflections.has(kind)) pairs.push([value, base]);
    }
  }
  return pairs;
}
```

CSV 使用 `csv-parse` 的流式读取和 `columns: true, bom: true`，不按逗号手动拆行。编译器对每行执行：

1. 使用 `canonicalWord` 校验词条，非法词条计入 `excludedInvalidWord`，不能用选区清洗函数改变原始词义。
2. 保存有中文释义的词条；词条缺少释义则计入 `missingTranslationRows`，但仍可贡献明确词形关联。
3. 相同规范化词键下保存去重后的全部不同词条，不后写覆盖前写。
4. 从 `exchangePairs` 汇总原形关系，只保留最终确实存在的原形，排序去重，不递归追逐关联环。
5. 根据共享 `shardId` 写入 256 个分片，包括空片；分片内键、原形列表和重复词条使用固定顺序。
6. 对实际序列化字节计算每片 SHA-256 和长度，再写 `index.json`；索引记录 `sourceRows`、`entryCount`、`lemmaCount`、`excludedInvalidWord`、`missingTranslationRows`、`duplicateRows`。

- [ ] **步骤 4：实现来源下载、校验及可重复构建。**

```typescript
const gitBlob = createHash('sha1')
  .update(`blob ${bytes.byteLength}\0`)
  .update(bytes)
  .digest('hex');

if (bytes.byteLength !== expected.csvBytes || gitBlob !== expected.csvGitBlob) {
  throw new Error('词库原始文件校验失败，停止构建');
}

const csvSha256 = createHash('sha256').update(bytes).digest('hex');
```

`verifySource` 由上述逻辑返回 `SourceProvenance`，生产入口传入固定配置，单元测试传入夹具对应的 `SourceExpectation`。下载 URL 只用配置中的固定提交拼接，不使用 `master`；缓存文件重复使用前仍校验。下载超时设为 120 秒，失败时只移除本次临时文件，不破坏已验证缓存。许可文件原样保留，下载失败不生成“完整”产物。

为不触网测试，将网络请求与纯校验函数分开；测试确认夹具原始字节通过校验，随后改变一个字节确认拒绝，并确认生产配置仍是已核验固定版本。`prepare-dictionary.ts` 通过脚本直接执行检测避免在测试导入时下载。

- [ ] **步骤 5：运行测试和一次真实构建，输出统计。**

```bash
npm test -- scripts/dictionary/compiler.test.ts scripts/prepare-dictionary.test.ts
npm run typecheck
npm run prepare:dictionary
```

首次需要联网下载词库。再次运行可复用验证后的缓存；相同输入应产生字节一致的分片。统计输出应明确区分源词条数和符合单词范围的打包词条数，不宣传源库全部短语也可查询。

**独立交付：** 包含真实中文词条、音标、明确原形关系和来源校验信息的静态分片，不使用受不同用途条件约束的额外词形文件。

### 任务 3：实现后台词库读取与有限缓存

**文件：**

- 新增 `/Users/bytedance/Documents/code/test/word-lookup-extension/src/dictionary/lru.ts`、`/Users/bytedance/Documents/code/test/word-lookup-extension/src/dictionary/repository.ts` 及同目录测试。
- 新增 `/Users/bytedance/Documents/code/test/word-lookup-extension/tests/fixtures/reader.ts`。

**接口：**

```typescript
export type ResourceReader = (path: string) => Promise<Uint8Array>;
export interface DictionaryRepository {
  lookup(word: string): Promise<LookupResult>;
}
export function createRepository(read: ResourceReader): DictionaryRepository;
export class LruCache<Key, Value> {
  constructor(capacity: number);
  get(key: Key): Value | undefined;
  set(key: Key, value: Value): void;
  get size(): number;
}
```

测试辅助函数 `createFixtureReader(): Promise<{ read: ResourceReader; requests: string[] }>` 调用任务 2 编译器构建内存资源，记录读取路径，不访问网络。

- [ ] **步骤 1：写入原词优先、回查、未收录和错误测试。**

```typescript
test('原词优先且缺词时回查明确原形', async () => {
  const fixture = await createFixtureReader();
  const repository = createRepository(fixture.read);
  expect(await repository.lookup('bank')).toMatchObject({ kind: 'found', matchedBy: 'exact' });
  expect(await repository.lookup('went')).toMatchObject({
    kind: 'found',
    matchedBy: 'lemma',
    entries: [{ word: 'go' }],
  });
  expect(await repository.lookup('zznonexistentword')).toEqual({
    kind: 'not-found',
    query: 'zznonexistentword',
  });
});

test('读取失败不得当成未收录', async () => {
  const repository = createRepository(async () => {
    throw new Error('资源读取中断');
  });
  expect(await repository.lookup('bank')).toMatchObject({
    kind: 'error',
    code: 'dictionary-read',
  });
});
```

运行 `npm test -- src/dictionary`，确认先失败；补充同片并发读取一次、8 片淘汰、256 条结果淘汰、失败可重试、多原形及直接词条优先于关联词条用例。

- [ ] **步骤 2：实现 LRU、分片加载和读取校验。**

```typescript
get(key: Key): Value | undefined {
  const value = this.entries.get(key);
  if (value !== undefined) {
    this.entries.delete(key);
    this.entries.set(key, value);
  }
  return value;
}

set(key: Key, value: Value): void {
  this.entries.delete(key);
  this.entries.set(key, value);
  while (this.entries.size > this.capacity) {
    const oldest = this.entries.keys().next();
    if (oldest.done) break;
    this.entries.delete(oldest.value);
  }
}
```

`entries` 为实例私有 `Map<Key, Value>`。仓库内创建 `LruCache<string, DictionaryShard>(8)`、`LruCache<string, LookupResult>(256)` 和分片在途 Promise 表。

索引按需初始化，校验 `schemaVersion`、来源字段结构及 256 个合法分片标识；索引加载失败清除失败 Promise。生产来源是否匹配固定版本由任务 8 的产物检查负责，仓库单元测试允许独立夹具来源。每片读取必须验证长度、SHA-256、`schemaVersion`、词条数组字段和原形列表；结构错误统一返回 `dictionary-read`，不得缓存失败结果。在途表在 `finally` 中清理，完成读取后再次受 8 片上限约束。

- [ ] **步骤 3：按固定顺序实现查询并复验。**

```typescript
const originalShard = await loadShard(shardId(word));
const exactEntries = originalShard.entries[word];
if (exactEntries?.length) {
  return { kind: 'found', query: word, matchedBy: 'exact', entries: exactEntries };
}

const entries: WordEntry[] = [];
for (const lemma of originalShard.lemmas[word] ?? []) {
  const lemmaShard = await loadShard(shardId(lemma));
  entries.push(...(lemmaShard.entries[lemma] ?? []));
}
return entries.length
  ? { kind: 'found', query: word, matchedBy: 'lemma', entries }
  : { kind: 'not-found', query: word };
```

`loadShard` 为仓库工厂内部函数，路径只能是 `dictionary/${id}.json`。多个原形之一读取失败时返回读取错误，不伪装成完整的部分结果。运行 `npm test -- src/dictionary` 和 `npm run typecheck`。

**独立交付：** 不依赖 Chrome 全局对象的词库查询服务，可在后台重启后直接重建，不依赖缓存持久化。

### 任务 4：实现本地启停设置

**文件：**

- 新增 `/Users/bytedance/Documents/code/test/word-lookup-extension/src/preferences/model.ts`、`/Users/bytedance/Documents/code/test/word-lookup-extension/src/preferences/store.ts` 及同目录测试。

**接口：**

```typescript
export function isEnabled(preferences: Preferences, hostname: string): boolean;
export function setSite(preferences: Preferences, hostname: string, enabled: boolean): Preferences;
export interface PreferencesStorage {
  read(): Promise<unknown>;
  write(value: Preferences): Promise<void>;
}
export interface PreferencesStore {
  read(): Promise<Preferences>;
  setGlobal(enabled: boolean): Promise<Preferences>;
  setSite(hostname: string, enabled: boolean): Promise<Preferences>;
}
export function createPreferencesStore(storage: PreferencesStorage): PreferencesStore;
```

- [ ] **步骤 1：编写完整域名匹配及全局优先测试。**

```typescript
test('网站停用不影响相邻子域名', () => {
  const initial: Preferences = { schemaVersion: 1, enabled: true, disabledHosts: [] };
  const disabled = setSite(initial, 'docs.example.com', false);
  expect(isEnabled(disabled, 'docs.example.com')).toBe(false);
  expect(isEnabled(disabled, 'www.example.com')).toBe(true);
  expect(isEnabled({ ...disabled, enabled: false }, 'www.example.com')).toBe(false);
  expect(setSite(disabled, 'docs.example.com', true).disabledHosts).toEqual([]);
});
```

运行 `npm test -- src/preferences` 确认先失败，补充新安装默认值、存储格式损坏、写入失败和并发设置变更不丢失的测试。

- [ ] **步骤 2：实现纯模型和串行写入。**

```typescript
export function isEnabled(preferences: Preferences, hostname: string): boolean {
  return preferences.enabled && !preferences.disabledHosts.includes(hostname.toLowerCase());
}

export function setSite(preferences: Preferences, hostname: string, enabled: boolean): Preferences {
  const disabledHosts = new Set(preferences.disabledHosts);
  if (enabled) disabledHosts.delete(hostname.toLowerCase());
  else disabledHosts.add(hostname.toLowerCase());
  return { ...preferences, disabledHosts: [...disabledHosts].sort() };
}
```

设置仅写入 `chrome.storage.local` 的 `preferences` 键。正常未设置时返回默认值；存储读取错误抛出错误，不能假设插件已开启。后台所有更新通过同一 Promise 队列串行执行，每次变更基于最新已成功写入状态；失败不得让后续队列永久拒绝。

- [ ] **步骤 3：验证状态传播约定。**

内容脚本监听 `chrome.storage.onChanged`，关闭时立即隐藏卡片并使当前查询失效；首次异步读取不得覆盖较新的变更事件。菜单在写入成功后才显示成功状态；失败保留旧值并提示“设置保存失败”。

运行 `npm test -- src/preferences` 和 `npm run typecheck`。

**独立交付：** 不记录访问历史的本地设置模型，完整域名与全局开关语义可独立验证。

### 任务 5：实现只使用本地系统语音的发音服务

**文件：**

- 新增 `/Users/bytedance/Documents/code/test/word-lookup-extension/src/speech/voices.ts`、`/Users/bytedance/Documents/code/test/word-lookup-extension/src/speech/service.ts` 及同目录测试。

**接口：**

```typescript
export function selectVoice(voices: chrome.tts.TtsVoice[]): VoiceChoice | null;
export interface SpeechService {
  getVoiceState(): Promise<VoiceState>;
  speak(word: string, emit: (event: SpeechEvent) => void): Promise<SpeechStart>;
}
export function createSpeechService(
  tts: Pick<typeof chrome.tts, 'getVoices' | 'speak' | 'onVoicesChanged'> | undefined,
  getLastError: () => string | undefined,
): SpeechService;
```

- [ ] **步骤 1：写入远程、未知来源和口音筛选测试。**

```typescript
test('只选明确本地的系统语音并优先英式', () => {
  const voices: chrome.tts.TtsVoice[] = [
    { voiceName: '远程英式', lang: 'en-GB', remote: true },
    { voiceName: '未知英式', lang: 'en-GB' },
    { voiceName: '系统美式', lang: 'en-US', remote: false },
    { voiceName: '系统英式', lang: 'en-GB', remote: false },
    { voiceName: '扩展英式', lang: 'en-GB', remote: false, extensionId: 'other-extension' },
  ];
  expect(selectVoice(voices)).toEqual({
    name: '系统英式',
    lang: 'en-GB',
    label: '英式发音',
  });
  expect(selectVoice(voices.slice(0, 2))).toBeNull();
});
```

运行 `npm test -- src/speech` 确认先失败；增加美式兜底、无 API、语音列表延迟出现、播放错误、重复点击和旧播放事件失效的测试。

- [ ] **步骤 2：实现严格语音筛选。**

```typescript
export function selectVoice(voices: chrome.tts.TtsVoice[]): VoiceChoice | null {
  const local = voices.filter(voice =>
    voice.remote === false && !voice.extensionId && Boolean(voice.voiceName?.trim()),
  );
  for (const lang of ['en-GB', 'en-US'] as const) {
    const voice = local.find(candidate => candidate.lang?.toLowerCase() === lang.toLowerCase());
    if (voice?.voiceName) {
      return { name: voice.voiceName, lang, label: lang === 'en-GB' ? '英式发音' : '美式发音' };
    }
  }
  return null;
}
```

不将 `remote` 缺失解释为本地，也不使用第三方扩展提供的语音。不能确认本地属性时选择降级提示，不为了播放成功放宽规则。

- [ ] **步骤 3：实现可取消的播放请求与事件反馈。**

```typescript
return new Promise<SpeechStart>(resolve => {
  try {
    tts.speak(word, {
      voiceName: voice.name,
      lang: voice.lang,
      enqueue: false,
      onEvent(event) {
        if (event.type === 'error') emit({ type: 'error', message: '发音播放失败' });
        if (event.type === 'end') emit({ type: 'end' });
        if (event.type === 'interrupted' || event.type === 'cancelled') {
          emit({ type: 'interrupted' });
        }
      },
    }, () => {
      resolve(getLastError()
        ? { status: 'error', code: 'playback-failed' }
        : { status: 'accepted', voice });
    });
  } catch {
    resolve({ status: 'error', code: 'playback-failed' });
  }
});
```

每次点击先重新获取并验证语音，使用请求序号防止慢返回的旧点击覆盖新播放。回调中的 `getLastError` 同步读取 `chrome.runtime.lastError`，没有错误只返回 `accepted`，不把回调成功解释成完整播放结束。

首次空列表时，若支持 `onVoicesChanged` 则等待变化，最长 1500 毫秒；超时显示无可用语音，并在下一次请求时重新枚举。等待器必须移除监听器和定时器。发音事件绑定当前 `speechId`，旧事件不得修改新卡片。

- [ ] **步骤 4：复验降级与禁止联网约束。**

运行 `npm test -- src/speech` 和 `npm run typecheck`。断言没有候选时从不调用 `tts.speak`，发音参数中 `voiceName` 永不为空。

**独立交付：** 不调用网页 `speechSynthesis` 的独立发音模块；减少与网页自身语音互相干扰，但实际设备播放效果仍需任务 9 验收。

### 任务 6：实现选区识别、卡片呈现与关闭规则

**文件：**

- 新增 `/Users/bytedance/Documents/code/test/word-lookup-extension/src/content/selection.ts`、`/Users/bytedance/Documents/code/test/word-lookup-extension/src/content/position.ts`、`/Users/bytedance/Documents/code/test/word-lookup-extension/src/content/card.ts`。
- 新增上述文件的同目录测试，以及 `/Users/bytedance/Documents/code/test/word-lookup-extension/src/content/card.css`。

**接口：**

```typescript
export interface WordSelection {
  selectedText: string;
  word: string;
  rect: { left: number; right: number; top: number; bottom: number };
}
export function readSelection(document: Document, cardHost: HTMLElement): WordSelection | null;
export function placeCard(
  rect: WordSelection['rect'],
  cardSize: { width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; top: number };
export interface WordCard {
  host: HTMLElement;
  showLoading(selection: WordSelection): void;
  showResult(selection: WordSelection, result: LookupResult, voice: VoiceState): void;
  setSpeechMessage(message: string | null): void;
  hide(): void;
  destroy(): void;
}
export function createCard(document: Document, onSpeak: (word: string) => void): WordCard;
```

- [ ] **步骤 1：编写卡片不执行词库内容、原形标记和选区排除测试。**

```typescript
test('词库内容按文本渲染且发音对应原形', () => {
  const speak = vi.fn();
  const card = createCard(document, speak);
  const selection: WordSelection = {
    selectedText: 'went',
    word: 'went',
    rect: { left: 10, right: 60, top: 10, bottom: 30 },
  };
  card.showResult(selection, {
    kind: 'found',
    query: 'went',
    matchedBy: 'lemma',
    entries: [{ word: 'go', phonetic: 'ɡəʊ', translation: 'v. 去 <img src=x>', pos: 'v:100' }],
  }, { status: 'ready', voice: { name: '系统英式', lang: 'en-GB', label: '英式发音' } });
  expect(card.host.shadowRoot?.textContent).toContain('went → go');
  expect(card.host.shadowRoot?.querySelector('img')).toBeNull();
  card.host.shadowRoot?.querySelector('button')?.click();
  expect(speak).toHaveBeenCalledWith('go');
});
```

运行 `npm test -- src/content/selection.test.ts src/content/position.test.ts src/content/card.test.ts` 确认先失败。

- [ ] **步骤 2：实现选区读取和排除规则。**

检查 `Selection.rangeCount`、`isCollapsed`、选区两端及公共祖先；通过 `normalizeSelection` 得到词键。排除 `input`、`textarea`、`select`、`[contenteditable]`、`[role="textbox"]`、`.monaco-editor`、`.cm-editor`、`.CodeMirror` 及卡片内部，遍历 ShadowRoot 的 host 祖先。`contenteditable="false"` 不一律当成可编辑；以实际 `isContentEditable` 及编辑器容器判定。

```typescript
const range = selection.getRangeAt(0);
const word = normalizeSelection(selection.toString());
if (!word || range.collapsed) return null;
const rect = range.getBoundingClientRect();
if (rect.width === 0 && rect.height === 0) return null;
return {
  selectedText: selection.toString().trim(),
  word,
  rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
};
```

上段位于完成编辑区和卡片排除后的分支。测试中仅替换几何测量返回值，不模拟浏览器扩展已安装。

- [ ] **步骤 3：实现纯定位算法和安全渲染。**

```typescript
const margin = 8;
const left = Math.max(margin, Math.min(rect.left, viewport.width - cardSize.width - margin));
const below = rect.bottom + margin;
const above = rect.top - cardSize.height - margin;
const preferredTop = below + cardSize.height <= viewport.height - margin ? below : above;
const top = Math.max(margin, Math.min(preferredTop, viewport.height - cardSize.height - margin));
return { left, top };
```

卡片初始最大宽度 340 像素，并限制为视口减 16 像素；最大高度 320 像素且不超过视口。使用固定定位、隔离字体和盒模型、内部 `overflow: auto` 与 `overscroll-behavior: contain`，不影响正文布局。

词条用 `createElement`、`textContent` 组装，不使用 `innerHTML`。中文释义按真实换行及字面量 `\n` 拆行，只解析明确的 `n.`、`v.`、`vt.`、`vi.`、`adj.`、`adv.`、`prep.`、`pron.`、`conj.`、`num.`、`art.`、`int.`、`interj.`、`aux.`、`abbr.` 等前缀；无法解析则原文展示，不利用 `pos` 的比例数字推断。

- [ ] **步骤 4：验证状态和可访问性。**

加载、未收录、读取失败、后台失败、缺音标、缺语音分别使用设计中的中文文案。多个原形分别标记并提供对应发音按钮；只改变状态区域，不夺取键盘焦点。状态区域设置 `aria-live="polite"`，发音按钮具有对应单词及口音的可访问名称。

复验本任务三个测试文件和 `npm run typecheck`；几何测试覆盖右下边缘、小视口和长释义。

**独立交付：** 能在 DOM 测试中呈现全部状态的组件，不直接访问词库或 Chrome API。

### 任务 7：接通后台路由与页面生命周期

**文件：**

- 新增 `/Users/bytedance/Documents/code/test/word-lookup-extension/src/background/router.ts`、`/Users/bytedance/Documents/code/test/word-lookup-extension/src/background/index.ts` 及路由测试。
- 新增 `/Users/bytedance/Documents/code/test/word-lookup-extension/src/platform/client.ts`、`/Users/bytedance/Documents/code/test/word-lookup-extension/src/platform/client.test.ts`。
- 新增 `/Users/bytedance/Documents/code/test/word-lookup-extension/src/content/controller.ts`、`/Users/bytedance/Documents/code/test/word-lookup-extension/src/content/controller.test.ts`、`/Users/bytedance/Documents/code/test/word-lookup-extension/src/content/index.ts`。

**接口：**

```typescript
export interface LookupClient {
  lookup(word: string, requestId: number): Promise<LookupResult>;
  getVoice(): Promise<VoiceState>;
  speak(word: string, speechId: number): Promise<SpeechStart>;
}
export function createClient(): LookupClient;
export interface WordController {
  select(selection: WordSelection): Promise<void>;
  close(): void;
  setEnabled(enabled: boolean): void;
  destroy(): void;
}
export function createController(card: WordCard, client: LookupClient): WordController;
export function createRouter(dependencies: {
  repository: DictionaryRepository;
  preferences: PreferencesStore;
  speech: SpeechService;
  notify: (sender: chrome.runtime.MessageSender, notification: SpeechNotification) => Promise<void>;
}): (message: unknown, sender: chrome.runtime.MessageSender) => Promise<ExtensionResponse>;
```

- [ ] **步骤 1：编写过期响应和关闭后不得重开测试。**

```typescript
test('关闭后到达的结果不能重新显示卡片', async () => {
  let resolveLookup: (result: LookupResult) => void = () => {};
  const pending = new Promise<LookupResult>(resolve => { resolveLookup = resolve; });
  const client: LookupClient = {
    lookup: vi.fn(() => pending),
    getVoice: vi.fn(async () => ({ status: 'unavailable' })),
    speak: vi.fn(async () => ({ status: 'error', code: 'no-voice' })),
  };
  const card = createCard(document, vi.fn());
  const showResult = vi.spyOn(card, 'showResult');
  const controller = createController(card, client);
  const selection: WordSelection = {
    selectedText: 'bank', word: 'bank',
    rect: { left: 10, right: 60, top: 10, bottom: 30 },
  };
  const action = controller.select(selection);
  controller.close();
  resolveLookup({ kind: 'not-found', query: 'bank' });
  await action;
  expect(showResult).not.toHaveBeenCalled();
});
```

运行 `npm test -- src/content/controller.test.ts src/background/router.test.ts src/platform/client.test.ts` 确认先失败。增加连续两词逆序返回、停用后返回、查词失败、语音慢于释义、菜单非法消息、页面消息不能修改设置和非法路径输入测试。

- [ ] **步骤 2：实现独立的查询代际控制。**

```typescript
let generation = 0;
let enabled = true;

async function select(selection: WordSelection): Promise<void> {
  if (!enabled) return;
  const requestId = ++generation;
  card.showLoading(selection);
  const result = await client.lookup(selection.word, requestId);
  if (!enabled || requestId !== generation) return;
  card.showResult(selection, result, { status: 'loading' });
  const voice = await client.getVoice();
  if (!enabled || requestId !== generation) return;
  card.showResult(selection, result, voice);
}

function close(): void {
  generation += 1;
  card.hide();
}
```

正式实现同时捕获拒绝并转换为明确状态；重新渲染语音状态不重置释义滚动位置。查询完成无需等待语音列表。独立 `speechId` 用于忽略旧播放通知。

- [ ] **步骤 3：建立受控的后台资源读取与消息边界。**

```typescript
const read: ResourceReader = async path => {
  if (!/^dictionary\/(?:index|[a-f0-9]{2})\.json$/u.test(path)) {
    throw new Error('不允许的词库资源路径');
  }
  const response = await fetch(chrome.runtime.getURL(path), {
    credentials: 'omit',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('词库资源读取失败');
  return new Uint8Array(await response.arrayBuffer());
};
```

路由先验证消息是普通对象及已声明类型。`requestId`、`speechId` 为非负安全整数；词键必须等于 `canonicalWord` 结果；不接受 URL 或资源路径。`SET_GLOBAL`、`SET_SITE` 只允许来自本扩展的实际 popup 页面，不允许内容脚本修改设置。

内容脚本查询和发音前后台也检查全局及来源网站是否停用；网站来源采用浏览器提供的 `sender.tab.url` 或 `sender.url`，不相信消息自报的网址。发音通知只发送到原始 `tabId` 与 `frameId`；页面关闭导致发送失败时结束通知，不创建页面或重新播放。

```typescript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void route(message, sender).then(sendResponse).catch(() => {
    sendResponse({ type: 'REQUEST_ERROR', code: 'invalid-request' });
  });
  return true;
});
```

存储失败由路由内部单独映射为 `storage-failed`，词库失败保留 `dictionary-read`。后台启动时同步注册监听器，不能等待词库加载后才注册。

- [ ] **步骤 4：绑定页面事件、设置更新及加载失败恢复。**

`content/index.ts` 只创建一张卡片；页面最终鼠标选区完成后读取结果。`pointerdown` 在外部时关闭，`mouseup` 的主键选词完成后重新查询；无效选区关闭旧卡片。`Esc`、页面滚动和窗口大小变化时关闭。用 `event.composedPath()` 排除卡片内部点击和滚动，不阻止网页自身事件。

设置未初始化前不触发查词；监听设置变更后立即更新 `setEnabled`。卡片内部复制引起的 `selectionchange` 不关卡也不查询；网页选区被清空时关闭旧结果。消息超时设为 5 秒，超时结果显示后台不可用；保留晚到回调的安全忽略处理。

- [ ] **步骤 5：复验并检查模块依赖。**

运行本任务三个测试文件及 `npm run typecheck`。测试记录全部资源路径，断言每个请求都指向包内固定资源且没有正文或网址进入查询消息；用户域名设置不得混入查词结果缓存。

**独立交付：** 可用受控 mock 验证的完整查词链路，旧查询和旧语音事件不会污染新状态。

### 任务 8：生成可加载扩展、工具栏菜单与本地验收页

**文件：**

- 新增 `/Users/bytedance/Documents/code/test/word-lookup-extension/src/manifest.ts`、`/Users/bytedance/Documents/code/test/word-lookup-extension/src/styles.d.ts`。
- 新增 `/Users/bytedance/Documents/code/test/word-lookup-extension/src/popup/index.ts`、`/Users/bytedance/Documents/code/test/word-lookup-extension/src/popup/popup.html`、`/Users/bytedance/Documents/code/test/word-lookup-extension/src/popup/popup.css`、`/Users/bytedance/Documents/code/test/word-lookup-extension/src/popup/popup.test.ts`。
- 新增 `/Users/bytedance/Documents/code/test/word-lookup-extension/scripts/build-extension.ts`、`/Users/bytedance/Documents/code/test/word-lookup-extension/scripts/check-package.ts`、`/Users/bytedance/Documents/code/test/word-lookup-extension/scripts/package.test.ts`、`/Users/bytedance/Documents/code/test/word-lookup-extension/scripts/serve-fixture.ts`。
- 新增 `/Users/bytedance/Documents/code/test/word-lookup-extension/tests/fixtures/page.html`、`/Users/bytedance/Documents/code/test/word-lookup-extension/.gitignore`。

**接口：**

```typescript
export const manifest: chrome.runtime.ManifestV3;
export function buildExtension(options: { dictionaryRoot: string; outputDir: string }): Promise<void>;
export function checkPackage(outputDir: string): Promise<{ fileCount: number; bytes: number; entryCount: number }>;
```

构建器默认使用 `.generated` 和 `dist`；测试传入临时目录，不能覆盖真实词库或用户文件。

- [ ] **步骤 1：写入菜单及产物约束测试。**

```typescript
test('只声明普通网页、本地设置和发音所需能力', () => {
  expect(manifest.manifest_version).toBe(3);
  expect(manifest.permissions).toEqual(['storage', 'tts']);
  expect(manifest.host_permissions).toEqual(['http://*/*', 'https://*/*']);
  expect(manifest.background).toEqual({ service_worker: 'background.js', type: 'module' });
  expect(manifest.action?.default_popup).toBe('popup.html');
  expect(manifest.web_accessible_resources).toBeUndefined();
});
```

运行 `npm test -- scripts/package.test.ts src/popup/popup.test.ts` 确认先失败。菜单测试覆盖全局关闭、子域名隔离、当前页探测失败、保存失败和失去活动标签页。

- [ ] **步骤 2：实现 Manifest 和打包逻辑。**

```typescript
export const manifest: chrome.runtime.ManifestV3 = {
  manifest_version: 3,
  name: '离线划词查词',
  version: '0.1.0',
  description: '选中英文单词，离线查看中文释义、音标并播放本地发音。',
  permissions: ['storage', 'tts'],
  host_permissions: ['http://*/*', 'https://*/*'],
  background: { service_worker: 'background.js', type: 'module' },
  content_scripts: [{
    matches: ['http://*/*', 'https://*/*'],
    js: ['content.js'],
    run_at: 'document_idle',
  }],
  action: { default_popup: 'popup.html' },
  content_security_policy: {
    extension_pages: "default-src 'self'; script-src 'self'; object-src 'none'; connect-src 'self'",
  },
};
```

以 esbuild 分别输出内容脚本 IIFE 和后台、popup ESM；内容脚本 CSS 作为文本内联进 Shadow DOM，popup 使用本地外链 CSS。声明 `*.css` 的文本模块类型，不把样式导入误当运行时远程资源。

```typescript
await build({
  entryPoints: ['src/content/index.ts'],
  outfile: `${outputDir}/content.js`,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
  loader: { '.css': 'text' },
});
await build({
  entryPoints: { background: 'src/background/index.ts', popup: 'src/popup/index.ts' },
  outdir: outputDir,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'chrome120',
});
```

复制 `popup.html`、`popup.css`、词库资源、许可文件和来源说明；Manifest 写为 JSON。输出清理仅作用于经过路径验证的项目 `dist` 或测试临时目录。词库、许可或入口缺失就停止，不产出可被误认为完整的包。

- [ ] **步骤 3：实现菜单状态与当前页面探测。**

```typescript
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
let available = false;
if (typeof tab?.id === 'number' && tab.url && /^https?:\/\//u.test(tab.url)) {
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
    available = response?.type === 'AVAILABLE';
  } catch {
    available = false;
  }
}
```

不额外申请 `tabs`、浏览历史、剪贴板或 `scripting` 权限。页面 URL 不可读、协议不支持或无法探测到内容脚本时，显示“当前页面不可用；普通网页可刷新后重试”，禁用网站开关但保留全局开关。

工具栏菜单通过任务 7 路由读写设置，不直接持有第二套持久化模型。安装后已打开页面需要刷新才能加载声明式内容脚本，此限制写入安装说明。

- [ ] **步骤 4：构建无外部资源的验收页和仅回环地址监听的静态服务。**

```html
<!doctype html>
<html lang="zh-CN">
  <meta charset="utf-8">
  <title>离线查词验收页</title>
  <body>
    <p id="bank">bank</p>
    <p id="went">went</p>
    <p id="unknown">zznonexistentword</p>
    <p id="invalid">hello world 中文 123</p>
    <p id="punctuation">“Don’t!” mother-in-law</p>
    <input aria-label="输入框排除测试" value="bank">
    <div contenteditable="true" aria-label="编辑器排除测试">bank</div>
    <div style="height: 1200px"></div>
    <p id="bottom">dictionary</p>
  </body>
</html>
```

`serve-fixture.ts` 用 Node.js `http.createServer`，仅监听 `127.0.0.1:4173`，只返回这个 HTML，其他路径返回 404；不托管仓库、词库缓存或家目录。此页面仅用于让真实扩展操作，页面不注入模拟插件。

- [ ] **步骤 5：执行构建门槛。**

```bash
npm test
npm run typecheck
npm run build
npm run check:package
```

`checkPackage` 验证 256 个分片的索引、长度、校验值、来源固定版本、必要许可和所有入口存在，检查未将测试夹具、下载缓存、Node.js 代码、远程脚本或远程字体打包。输出整个扩展目录字节数、文件数和实际词条数。

**独立交付：** `/Users/bytedance/Documents/code/test/word-lookup-extension/dist` 是真实可加载目录，不只是演示网页；真实浏览器结果由下一任务确认。

### 任务 9：在 `ego lite` 验收并交付安装说明

**文件：**

- 新增 `/Users/bytedance/Documents/code/test/word-lookup-extension/README.md`。
- 新增 `/Users/bytedance/Documents/code/test/word-lookup-extension/THIRD_PARTY_NOTICES.md`。
- 新增 `/Users/bytedance/Documents/code/test/word-lookup-extension/docs/qa/ego-lite-acceptance.md`。

**接口：** 消费任务 8 的真实 `dist`；不改变生产代码以绕过权限或制造通过结果。

- [ ] **步骤 1：请用户完成扩展加载所需的浏览器操作。**

读取当时可用的 `ego-browser` 技能；整个验收复用一个 TaskSpace。此前规划探查已正常结束，不把探查结果当成安装成功。

```bash
ego-browser nodejs <<'NODE'
const task = await taskSpace('离线划词扩展验收');
const page = task.page('p1');
console.log({ taskSpaceId: task.spaceId, page: page.label });
await page.goto('chrome://extensions/');
console.log(await page.snapshot());
await task.handOff();
NODE
```

向用户明确提示开发者模式可能影响已有未打包扩展，请用户开启并加载 `/Users/bytedance/Documents/code/test/word-lookup-extension/dist`，处理浏览器原生权限提示。只在用户确认后接管同一空间；不点击已有扩展的移除、启停或升级按钮。

恢复时使用实际返回的空间 ID 调用 `takeOverTaskSpace`，不得照抄文档中的历史 ID。检查扩展无启动错误，再开始功能验收。

- [ ] **步骤 2：执行真实选词与卡片交互。**

运行 `npm run qa:serve`，在空间中访问 `http://127.0.0.1:4173`，先观察页面快照，使用 `page.dblclick('loc=css:#bank')` 或真实鼠标拖动完成选词。不能仅调用页面函数伪造用户手势。

逐项记录：

| 编号 | 操作 | 预期 |
| --- | --- | --- |
| A01 | 本地加载后刷新验收页 | 扩展正常启动，菜单可打开 |
| A02 | 双击 `bank` | 出现中文多义释义、词库音标及发音状态 |
| A03 | 拖动选中单词 | 与双击一致，只有一张卡片 |
| A04 | 多词、中文、数字、输入框、编辑器内选择 | 不弹卡片，旧结果按规则关闭 |
| A05 | 页面边缘与底部选择 | 卡片不超出视口、不推挤正文 |
| A06 | 点击外部、按 `Esc`、滚动页面 | 卡片关闭 |
| A07 | 卡片内部滚动、复制、点击发音 | 卡片不关闭，不递归查词 |
| A08 | 快速选择两个词 | 最终只呈现第二个词 |
| A09 | 无匹配词条 | 明确显示“本地词库未收录” |
| A10 | 缺音标、读取失败、后台不可用 | 各自文案与未收录区分 |
| A11 | 全局及当前网站停用后重新开启 | 立即生效，设置保持且互不覆盖 |
| A12 | 英式优先、美式兜底、无本地语音 | 标注准确；没有候选时不播放 |
| A13 | 受限页面打开工具栏 | 提示当前页面不可用，全局开关仍可使用 |

不假定真实 ECDICT 的 `went` 一定缺少独立词条：若独立词条存在，应验证原词优先。原形回查用构建分片中确实“无原词、有关联原形”的词进行实测，测试报告记录所用词；不得为了演示回查删除真实词条。

需要复现故障状态时，仅使用独立测试包或测试夹具，标明故障注入范围；生产扩展中的成功查词与测试包的降级验证分别记录。没有可靠复现条件的项目标“未测试”，不伪造。

- [ ] **步骤 3：验证发音与断网首查，不误用局部离线模拟。**

1. 在真实扩展上下文记录可用语音的 `voiceName`、`lang`、`remote` 和是否系统来源，不记录无关用户信息。
2. 点击真实发音按钮，检查显式语音选择及错误事件；需要用户听音确认的部分与程序事件结果分开。
3. 请求用户临时断开网络或在明确覆盖扩展进程的受控方式下阻断外网；不要直接修改系统网络配置。
4. 关闭旧卡片并让后台从冷状态启动，选择当前会话没有查询过的词；确认无需远端资源仍能查询。
5. 有可用本地英语语音时验证断网播放；否则只能报告缺失语音的降级验证通过。

`Network.emulateNetworkConditions` 对单个网页的效果不代表 Service Worker 或系统 TTS 也已离线。只进行了页面级模拟时，不能写“整扩展断网验收通过”。

- [ ] **步骤 4：检查外部请求与后台冷启动。**

在页面和扩展后台各自的网络观察范围内操作首次查词、连续查词、发音及设置；区分宿主网页流量，确认扩展只读取 `chrome-extension://` 包内资源。结合任务 7 的读取入口测试和 Manifest CSP，记录可观察范围。

若当前 `ego-browser` 无法观察扩展后台请求，由用户在后台 DevTools 协助确认并保留证据；不能以页面“没有请求”推断后台也没有。无法确认就标“未测试”，保持代码静态检查与运行证据分列。

后台重新加载或休眠后查词应恢复；不通过清空用户浏览器全局缓存、禁用其他扩展或修改浏览器配置来制造冷启动。

- [ ] **步骤 5：整理文档、产物统计与最终验证。**

`README.md` 写明安装目录、首次加载后刷新网页、启停位置、普通网页范围、离线词库、发音前提和开发命令。`THIRD_PARTY_NOTICES.md` 记录 ECDICT 固定版本、实际 SHA-256、上游许可位置以及未独立核验全部历史资料权利来源的边界。

验收报告对 A01 至 A13、断网首查、后台流量和听音确认分别填写“通过”“未通过”或“未测试”，附证据及原因。记录浏览器版本、安装方式、数据版本、源数据和最终包大小、语音环境。Chrome、Edge 明确标注“未执行独立实机验证”。

最终重新运行：

```bash
npm test
npm run typecheck
npm run build
npm run check:package
```

成功后停止本任务启动的本地服务，按 `ego-browser` 规则结束空间；用户接管、权限等待或错误未解决时不擅自结束或新建空间。最终报告只陈述真实完成的验证，不把测试示例、预期值或受限降级写成完整成功。

**独立交付：** 可加载扩展、简明安装说明、来源与许可说明，以及包含未验证边界的真实验收记录。

## 计划自查映射

| 设计要求 | 实施任务 |
| --- | --- |
| 普通网页单词范围、选区过滤及词形语义 | 1、2、3、6 |
| 内置分片、后台共享、缓存容量及后台重启 | 2、3、7、9 |
| 多义释义、音标缺失、原形对应关系 | 2、3、6 |
| 卡片定位、内部滚动、外部关闭、过期响应 | 6、7 |
| 全局开关、完整域名、当前页受限提示 | 4、7、8 |
| 本地语音、英式优先、无候选及播放失败 | 5、7、9 |
| 最小权限、没有上传、无远程运行依赖 | 7、8、9 |
| 词库版本、校验、许可、没有联网兜底 | 2、3、8、9 |
| 自动化测试、类型检查、真实扩展构建 | 1 至 8 |
| 仅 `ego lite` 验收、断网首查、结果三分类 | 9 |

## 执行与变更边界

- 实施按复选框逐项推进，每个任务完成后记录真实测试结果，不提前勾选。
- 不因已有规划自动开启开发者模式、升级浏览器、断开系统网络或操作其他扩展。
- 技术限制导致必须改变已确认范围时，先说明影响再请求用户确认，不静默改用在线服务、真人音频或其他浏览器。
- 子代理分工仅在用户明确授权后启用；无需为顺序执行再创建新任务。
- 不执行 Git 初始化、提交或推送。若用户另行要求提交，再使用对应技能和要求的共同作者尾注。
