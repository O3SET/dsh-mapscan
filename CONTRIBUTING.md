# 贡献指南

感谢你考虑为 MapScan DSH 做贡献！本文件说明协作约定，请先通读再提交 PR。

## 行为准则

请遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。

## 开发环境

- Node.js ≥ 18（建议 20，见 [.nvmrc](.nvmrc)）
- 克隆后执行 `npm install`（仅安装 eslint / prettier 开发依赖）

```bash
npm install
npm run check   # lint + format:check + build + test，PR 前必须全部通过
```

## 分支与提交规范

- 分支命名：`feat/xxx`、`fix/xxx`、`docs/xxx`、`chore/xxx`
- 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)：

  ```
  feat(map_search): 新增 Quake facets 支持
  fix(http): 修复 curl 超时未生效的问题
  docs(readme): 补充 hunter 语法示例
  ```

## PR 流程

1. 从 `main` 切出功能分支
2. 修改 `src/**` 源码；纯函数请补充 `test/unit` 测试，工具行为请补充 `test/integration` 测试
3. 本地跑 `npm run check`，并在 CHANGELOG.md 的 `## [Unreleased]` 下登记变更
4. 提交 PR，按 [PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md) 填写

## 重要约定

- **`dist/mapscan-host.js` 是构建产物**：修改源码后必须 `npm run build` 并一并提交，保持 dist 与 src 同步（DSH 直接消费 dist）
- **插件本体零运行时依赖**：`src/**` 只能使用 DSH 沙箱能力与 ECMAScript 内建对象，不得引入 npm 包（原因见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#沙箱约束)）
- **模块写法**：只使用单行 named import/export，模块顶层符号名全局唯一，否则 `scripts/build.mjs` 构建失败
- **安全**：严禁在代码、测试、示例、Issue 中提交真实 API Key；秘密只通过凭证库或环境变量注入（见 [SECURITY.md](SECURITY.md)）

## 新增平台

按 [docs/DEVELOPMENT.md#新增平台清单](docs/DEVELOPMENT.md) 逐步完成，并附上 API 文档链接与响应样本。
