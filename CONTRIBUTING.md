# 贡献指南

感谢你考虑为 MapScan DSH 做贡献！本文件说明协作约定，请先通读再提交 PR。

## 行为准则

请遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。

## 开发环境

- Node.js ≥ 22.19（见 [.nvmrc](.nvmrc)，与官方 DSH 引擎下限对齐）
- 克隆后执行 `npm install`（eslint / prettier / husky / lint-staged 开发依赖，并自动安装 Git 钩子）

```bash
npm install
npm run check   # lint + format:check + build + test，PR 前必须全部通过
```

- pre-commit 钩子：对暂存文件跑 prettier/eslint 增量检查，并在改动 `src/**` 时重建 dist 保持同步；CI 负责全量门禁（Node 22/24/26 矩阵）

## 分支与提交规范

- 分支命名：`feat/xxx`、`fix/xxx`、`docs/xxx`、`chore/xxx`
- 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)：

  ```
  feat(map_search): 新增 Quake facets 支持
  fix(http): 修复 curl 超时未生效的问题
  docs(readme): 补充 hunter 语法示例
  ```

- 代码中的已知问题按官方三级标记（选与紧急程度匹配的标签）：
  - `FIXME`：阻塞发布的问题（发布版本不应包含未解决的 FIXME）
  - `TODO`：应尽快修复，等资源到位即处理
  - `XXX`：也许某天会修，优先级最低，不作承诺

## PR 流程

1. 从 `main` 切出功能分支
2. 修改 `src/**` 源码；纯函数请补充 `test/unit` 测试，工具行为请补充 `test/integration` 测试
3. 本地跑 `npm run check`，并在 CHANGELOG.md 的 `## [Unreleased]` 下登记变更
4. 提交 PR，按 [PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md) 填写

## 生态收录提交

dsh-plugin 生态（官方 + 精选目录 + radar）的规范与对照见 [docs/COMPLIANCE.md](docs/COMPLIANCE.md)：

1. 仓库公开并添加 `dsh-plugin` topic（radar 每 8 小时自动扫描收录）
2. 精选目录（awesome-dsh-plugin）PR：`README.md` 与 `README.zh.md` 各加一行 `- [mapscan-dsh](链接) — 一句话说明`
3. radar 人工目录 PR：附「测试环境与结果」材料（模板见 docs/COMPLIANCE.md 第四节）

## 重要约定

- **`dist/mapscan-host.js` 是构建产物**：修改源码后必须 `npm run build` 并一并提交，保持 dist 与 src 同步（DSH 直接消费 dist）
- **插件本体零运行时依赖**：`src/**` 只能使用 DSH 沙箱能力与 ECMAScript 内建对象，不得引入 npm 包（原因见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#沙箱约束)）
- **模块写法**：只使用单行 named import/export，模块顶层符号名全局唯一，否则 `scripts/build.mjs` 构建失败
- **安全**：严禁在代码、测试、示例、Issue 中提交真实 API Key；秘密只通过凭证库或环境变量注入（见 [SECURITY.md](SECURITY.md)）

## 新增平台

按 [docs/DEVELOPMENT.md#新增平台清单](docs/DEVELOPMENT.md) 逐步完成，并附上 API 文档链接与响应样本。
