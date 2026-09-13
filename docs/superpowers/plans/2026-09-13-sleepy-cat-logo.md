# 蜷睡猫标识替换实施计划

> 执行约定：在当前任务中顺序实施，不派发子代理、不创建分支、不提交 Git。以用户最后选择的第三款为准。

**目标：** 将第三款「蜷睡猫」接入扩展工具栏、管理页与菜单，不改变查词功能。

**架构：** 单一 SVG 保存已确认图形；构建期生成不同尺寸 PNG，菜单通过 SVG 遮罩继承现有主题色；Manifest 声明包内静态图标。

**技术栈：** TypeScript、SVG、固定版本 `@resvg/resvg-js@2.6.2`、Vitest、现有 esbuild 构建。

**设计依据：** `/Users/bytedance/Documents/code/test/word-lookup-extension/docs/superpowers/specs/2026-09-13-sleepy-cat-logo-design.md`。

**执行结果：** 源码接入及构建已完成，54 项测试、类型检查、图标与词库产物检查通过。原预览空间 4 已不存在，未新建替代空间；实际浏览器重载显示仍待用户确认，详见 `docs/qa/sleepy-cat-logo.md`。

## 全局约束

- 图形采用已展示的第三款闭眼、蜷卧、卷尾小猫。
- 不改扩展名称、版本、权限、查词卡片、词库、语音和设置逻辑。
- PNG 使用 `#287a56`；菜单遮罩使用现有浅色 `#287a56`、深色 `#8bd7ae`。
- 生成 16、32、48、128 像素 PNG，16 像素适度加粗轮廓与眼睛。
- 开发依赖只在构建期使用，不进入浏览器运行时代码，不增加联网入口。
- 历史设计预览与验收记录保留；新版验证单独记录。

## 任务一：图标资源与构建

涉及文件：`src/assets/cat-logo.svg`、`scripts/icons.ts`、`scripts/icons.test.ts`、`src/manifest.ts`、`scripts/package.test.ts`、`scripts/build-extension.ts`、`scripts/check-package.ts`、`package.json`、`package-lock.json`。

- [x] 增加失败测试：Manifest 与工具栏使用同一图标集合。

  ```ts
  expect(manifest.icons).toEqual({
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  });
  expect(manifest.action?.default_icon).toEqual(manifest.icons);
  ```

- [x] 运行 `npm test -- scripts/package.test.ts`，确认新增断言在尚未声明图标时失败。
- [x] 将第三款 Canvas 曲线原样转为 SVG，外轮廓与卷尾线宽 6.5，眼睛线宽 5，画布为 `0 0 128 128`。
- [x] 添加固定开发依赖，读取本地安装包类型后实现 `renderIcon(source: string, size: number): Buffer` 和 `buildIcons(output: string): Promise<void>`。
- [x] 图标测试覆盖 PNG 签名、IHDR 宽高、生成文件清单、透明背景和重复生成一致性；使用临时目录并在测试后移除。

  ```ts
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(bytes.readUInt32BE(16)).toBe(size);
  expect(bytes.readUInt32BE(20)).toBe(size);
  ```

- [x] 构建调用 `buildIcons(resolve(output, 'icons'))`，生成 PNG 并复制 SVG；Manifest 声明同一尺寸集合。
- [x] 产物检查逐个读取 Manifest 对应 PNG，核对签名与实际宽高，并检查菜单 SVG 存在。

## 任务二：菜单替换与交付

涉及文件：`src/popup/popup.html`、`src/popup/popup.css`、`src/popup/popup.test.ts`、`README.md`、`docs/qa/sleepy-cat-logo.md`。

- [x] 为菜单增加结构测试，断言存在装饰性 `.brand-logo`，保留两个设置开关和全部已有文案。
- [x] 用下列结构替换“词”字标识：

  ```html
  <span class="brand" aria-hidden="true"><span class="brand-logo"></span></span>
  ```

- [x] 在现有主题底色中使用同一图形：

  ```css
  .brand-logo {
    width: 29px;
    height: 29px;
    background: currentColor;
    mask: url('icons/cat-logo.svg') center / contain no-repeat;
  }
  ```

- [x] 执行 `npm test`、`npm run typecheck`、`npm run build`、`npm run check:package`。
- [x] 核对 `dist/content.js`、`dist/background.js`、`dist/popup.js`、`dist/dictionary/index.json` 与替换前哈希相同，确认功能代码与词库未变。
- [x] 检查生成图形并核验原空间可用性；空间不存在，未新建替代空间，实际重载显示保留为未测试。
- [x] 更新 README 与独立图标验收记录，区分静态资源验证与真实扩展重新加载，并提供手动重载说明。

自审：以上任务覆盖设计范围，未扩展功能或改动权限；图标作为构建资源管理，不依赖截图或联网运行。
