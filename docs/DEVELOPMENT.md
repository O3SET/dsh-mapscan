# 开发指南

## 架构总览

```
src/ (ESM 模块, 可单测)         scripts/build.mjs (零依赖)      dist/mapscan-host.js (DSH 函数体)
┌─────────────────────┐         ┌─────────────────────┐        ┌──────────────────────────┐
│ lib/   utils/http/  │ ──────► │ 去 import/export     │ ─────► │ (async () => {           │
│        credentials  │         │ 按依赖序拼接          │        │   <拼接源码>             │
│ platforms/ 5 平台    │         │ 追加 return plugin   │        │   return plugin         │
│ tools/   5 工具      │         │ vm 语法校验          │        │ })()                    │
│ index.js 插件入口    │         └─────────────────────┘        └──────────────────────────┘
└─────────────────────┘
```

DSH 动态插件的 `code.host` 是**函数体**（不是模块），因此：

- `src/**` 使用真实 ESM（Node 可直接 import，可单元测试）
- 构建脚本剥掉 import/export、按固定顺序拼接成单文件函数体
- 模块顶层符号必须全局唯一；只允许单行 named import/export

## 沙箱约束（务必遵守）

DSH 动态插件运行在受限 VM 中（详见运行时源码）：

| 能力                             | 是否可用    | 替代方案                                           |
| -------------------------------- | ----------- | -------------------------------------------------- |
| 全局 `fetch`                     | ❌ 显式拦截 | `ctx.web.fetch`（仅纯 GET，无自定义头）            |
| `require` / `import`             | ❌          | 构建期拼接                                         |
| `process` / `Buffer` 等 Node API | ❌          | 沙箱提供的 `btoa/atob/TextEncoder/TextDecoder`     |
| 全局定时器                       | ❌          | `ctx.timer`（需 `inject: ['timer']`）              |
| 任意 HTTP（Header/POST）         | 部分        | `ctx.shell`（win32 为 pwsh 执行器）驱动 `curl.exe` |
| 工具注册                         | ✅          | `harness.defineTool` + `harness.registerTool`      |

插件返回对象需声明 `inject`（本插件硬依赖 `shell`）；`credentials`/`web`/`fs` 以 `ctx.get()` 可选读取。

## 分层职责

| 模块                 | 职责                                                 | 依赖          |
| -------------------- | ---------------------------------------------------- | ------------- |
| `lib/utils.js`       | 纯函数（截断/收敛/引号转义…）                        | 无            |
| `lib/http.js`        | curl 通道 + `web.fetch` 回退 + 响应解析              | utils         |
| `lib/credentials.js` | Key 解析优先级 / `map_set_keys` 业务                 | utils         |
| `platforms/*.js`     | 单平台适配：URL 构造、归一化、账户                   | utils/http    |
| `platforms/index.js` | `SEARCHERS`/`DETAILERS`/`STATSERS`/`ACCOUNTERS` 索引 | platforms     |
| `tools/*.js`         | 工具定义（schema/描述/execute）                      | lib/platforms |
| `index.js`           | 插件对象 + Fiber 生命周期                            | tools         |

## 新增平台清单

以接入平台 X 为例：

1. `src/platforms/x.js`：实现 `searchX / normalizeX / (detailX|statsX|accountX 按需)`，响应样本先经官方文档核对
2. `src/platforms/index.js`：登记到对应索引
3. `src/tools/`：如新增工具则建工厂并加入 `src/tools/index.js`；平台专属参数记入对应工具 schema
4. `src/lib/credentials.js`：登记 `PRIMARY_REFS` / `FALLBACK_REFS`
5. 测试：`test/unit/normalize.test.mjs` 加响应样本映射断言；`test/integration/tools.test.mjs` 加端到端用例（mock shell 队列）
6. 文档：`docs/API.md`、`docs/QUERY-SYNTAX.md`、CHANGELOG
7. `npm run check` 全部通过后提交 PR

## 发布流程（维护者）

1. 更新 CHANGELOG（`## [Unreleased]` → 新版本节）
2. `npm version <patch|minor|major>`（自动打 tag）
3. `npm run check && npm run build`，提交 dist
4. GitHub Release 说明引用 CHANGELOG
5. DSH 侧：以新 dist 内容 `cordis_define`(existing) + `cordis_run`(update) 升级运行中的插件

## 常见坑

- **pwsh 引号**：命令经 `pwsh -Command <one argv>` 执行；所有变量值必须经 `pq()` 单引号包装（仅 `'`→`''` 需转义），否则 `$`、空格、中文会被错误解释
- **curl 状态码**：响应体后附加 `-w '\n__MAPSCAN_HTTP__:%{http_code}'` 标记，`lastIndexOf` 解析，避免 JSON 尾随换行干扰
- **Hunter Base64**：URL-safe 字母表（`-_`）且保留 `=` 填充，与 Go `base64.URLEncoding` 一致；`btoa` 产出的 `+/` 必须替换
- **空字段归一化**：`clean()` 剔除 `undefined/null`，空串字段按平台语义保留或剔除（测试覆盖）
- **`output.schema` 必填**：使用注解型 `{ type: 'json' }`；`output.render` 必须返回 ContentBlock 数组
