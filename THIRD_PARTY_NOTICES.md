# 第三方数据说明

## ECDICT

- 来源：https://github.com/skywind3000/ECDICT
- 固定版本：`bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b`
- 原始 CSV 大小：65,933,428 字节。
- Git blob：`c4ade63ea08cf39d9c3475e96929036d64d94c94`
- SHA-256：`1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf`
- 上游许可：原样保留于 `third-party/ECDICT.LICENSE`；可加载扩展中的文件为 `ECDICT.LICENSE`。

仅使用 CSV 的单词、中文释义、音标、词性和 `exchange` 字段。未使用、下载或打包 `lemma.en.txt`，也未打包在线音频。

源文件包含 770,611 行数据。本次按单词查询范围生成 399,213 条词条和 56,954 组词形关联；短语、含数字等不符合首版单词规则的词条不包含在内。

项目声明 MIT 许可证，不代表本项目已对全部历史资料的权利来源进行独立核验。词典信息可能存在缺失、错误或旧义，不用于替代专业判断。

## 构建依赖

TypeScript、esbuild、Vitest、jsdom、tsx、csv-parse 和类型定义仅用于本地开发、测试与构建，不包含在扩展运行时中；依赖版本由 `package-lock.json` 固定。
