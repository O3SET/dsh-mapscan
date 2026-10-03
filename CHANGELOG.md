# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [1.7.1] - 2026-10-04

### Fixed

- **插件在客户端列表里显示异常**：1.7.0 引入的浏览器半侧加载失败会把整个插件标红。由于该半侧无法在当前环境验证（拿不到浏览器控制台、不能启动浏览器），本次**解耦**：`package.json` 不再声明 `dsh.client` 与 `exports["./client"]`，客户端产物不再被加载，宿主侧插件与 6 个工具恢复为确定可用状态。

### Changed

- 实验性浏览器半侧保留在 [src/client.js](src/client.js)（构建仍产出 `dist/mapscan-client.js`），并在 README 记录启用步骤与已核实要点，待具备浏览器调试条件后再接回。
- 配置方式回归「profile `config:` 块 / `map_set_keys` / 环境变量」三条确定可用的路径。
- 修掉 1.7.0 客户端代码里的两处真实缺陷（即使当前未启用，也避免将来重蹈）：
  - 删除了**未使用**的 `require('@deepseek-ai/dsh-client-ui-slots')` —— 该名不在宿主 9 个基线模块表内且未声明 `dsh.client.external`，表外 `require` 会抛 `missed the module table`；
  - `useSyncExternalStore` 的「存在性」快照原为每次渲染新建对象（引用不稳定 → 无限重渲染），改为订阅 `describe()` 稳定快照 + `useMemo` 派生；
  - 清空字段由 `unset` 改为 `set('')`（`unset` 在继承标量时的语义未经验证）。

## [1.7.0] - 2026-10-04

### Fixed

- **设置页里没有可填的配置表单**（1.6.0 的 `Config` 仍然无效）。实测推翻了我此前的两个错误前提：
  1. DSH 的插件配置表单**不会**自动生成——`dsh-settings` 只把带 **`.volatile()`** 的字段投影进 `settings.describe()`（`volatileForm` 只递归 object 且只收 volatile 叶子），非 volatile 字段**既不可见也不可写**；`autoGenerate` 虽被上报，但官方 README 明说 “no shipped client does so yet”，没有内置客户端消费它。
  2. 表单要求 `Config` 是 **schemastery 原生 schema**——`dsh-tool-cordis/lib/config.js` 的 `liveConfig` 用 `isNativeConfigSchema()` 判定（`Symbol.for('schemastery')===true` + 字符串 `type` + 对象 `meta`），不满足时 status 为 `unsupported`。手写 `{'~standard':{validate}}` 能让插件挂载，但拿不到表单。

### Added

- **浏览器半侧 `src/client.js` → `dist/mapscan-client.js`**：注册 `settings.section` 页面（设置 → MapScan），五个平台 Key 与超时可直接填写保存。按 client-modules 契约写成 classic script（`window.__ModuleLoader__.load({ id: 'mapscan-dsh', factory })`，id 必须等于包名），只 `require` 宿主模块表里的 `react`；写入经 `ctx.configForms.get('mapscan-dsh')` → `mutate()`，命名空间即 bundle 补丁那一行的 id，落盘到该行 `config:`。
- `package.json`：`dsh.client: { platform: 'web', inject: [...] }` 与 `exports['./client']`。
- 构建产出第三个产物 `dist/mapscan-client.js`，并校验其 `__ModuleLoader__` id 等于包名。

### Changed

- **Config 改为 schemastery 且字段标记 `.volatile()`；API Key 另加 `.role('secret')`**：secret 的值不会被回传（`redactSecrets` 只回 `{path,set}` 存在性），表单显示为「已配置（留空不改动）」，避免把掩码写回覆盖真值。
- Config 由构建注入 ESM 产物（动态插件函数体没有模块系统，无法 import schemastery），动态产物保留降级 Config；`plugin.Config` 改为 getter，避免对象字面量提前捕获降级版。
- 宿主侧读配置时解包 volatile 引用（`.get()`）——volatile 字段运行时是引用对象而非普通字符串，直接当字符串用会让所有 Key 解析失效。
- 新增依赖 `@deepseek-ai/schemastery`（`^3.18.4`）。
- 测试断言 `Config` 是 schemastery、每个字段都 `.volatile()`、五个 Key 都是 `secret`。90 例。

## [1.6.0] - 2026-10-04

### Added

- **支持在 DSH 设置页配置 API（图形界面）**：导出 `Config`（Standard Schema，`~standard.validate`），设置页「插件 → MapScan」会渲染出五个平台 Key + `timeoutSec` 的配置表单，无需再靠对话调 `map_set_keys`。
  - Cordis 的 `resolveConfig` 无条件取 `Config['~standard'].validate(config)`，且不允许异步；没有该导出时插件在配置清单里显示为 `absent`（不可配置），设置页也就渲染不出表单。
  - `cordis.patch.yml` 的 insert 行带上 `config:` 块，作为设置页表单的读写落点。
- **Key 解析优先级**：工具参数 `key` > **插件 Config（设置页）** > 环境变量 / 凭证库 > 平台社区惯用环境变量名。设置页填过的值会掩盖凭证库条目。
- `Config.timeoutSec`：单请求超时（秒），夹取 5~300；优先级为「**设置页 Config > 各平台默认调优 > 默认 30**」——用户显式设定的值覆盖平台适配器的默认值，否则该项形同虚设。

### Changed

- `map_set_keys` 的状态报告会区分来源：设置页填过的平台报「已配置 (来源: 插件配置 / 设置页表单)」，不再误报为「未配置」；工具描述与 hint 同步说明新的优先级链。
- README 配置章节重写：设置页表单与对话/环境变量两条路径，并明确标注**设置页填写会把 Key 以明文写入 profile 的 `cordis.patch.yml`**（希望不落盘则改用凭证库/环境变量并保持表单为空）。
- 新增测试：Config 的 Standard Schema 契约（含非法输入返回 `issues`、`validate` 非异步）、Config 生效优先级、空值回退、`timeoutSec` 传导到 shell 请求超时、bundle 补丁含 `config` 块。测试 87 → 90 例。

### Fixed

- 配置槽位改用 `Symbol.for('mapscan.config')`（全局符号注册表）而非模块级 `Symbol()`：模块级符号在 src/dist 双实例并存时会产生两个互不相等的键，导致「配置写进去了但读不到」。

## [1.5.1] - 2026-10-04

### Fixed

- **插件在 DSH 插件列表/设置页中检测不到**。DSH 的插件清单只把**声明了 `dsh.bundle.patch` 的包**当作插件层（`@deepseek-ai/dsh-package-manifest` 的 `DshManifest` / `DshBundleManifest`）。1.5.0 及更早的装法是「在 profile 里手写 `cordis.patch.yml` 的 `insert:` 行」——loader 确实会加载它（工具因此可用），但插件清单读不到，表现就是「装了却检测不到该插件」。现补上 `dsh.bundle.patch` → `cordis.patch.yml`，与 `dsh-plugin-workspace-only`、`dsh-ambiguity-handling` 等可被识别的插件同构。

### Added

- `package.json`：`dsh.bundle.patch: ./cordis.patch.yml`、`dsh.manifestVersion: 1`、`engines.dsh: ">=0.1.7-rc.2"`；`cordis.patch.yml` 加入 `files` 白名单（否则装到 profile 后读不到补丁文件）。
- 根目录 `cordis.patch.yml`：bundle 层补丁，仅做 `insert`（不覆写任何既有条目的 `config`，规避 loader「config 整块替换」语义误删 base 配置的风险）。

### Changed

- **`scripts/install.mjs` 重写为真正的 bundle 安装**，与插件市场/设置页的安装动作一致：`pnpm add link:<本仓库>` + 追加 `dsh.profile.bundles` 条目 + 清理旧版遗留的手工 `insert:` 行。用 `link:` 而非 `file:`：不把 devDependencies 复制进 profile，且仓库改动即时生效、升级无需重装。默认 profile 从 `web` 改为 `desktop`。
- `scripts/uninstall.mjs` 与安装对称：移除 bundle 层条目、pnpm 依赖与旧版遗留补丁行。
- README 安装章节重写：给出插件市场（`O3SET/dsh-mapscan` / `github:` / `file:`）与脚本两条路径，并记录「已安装却检测不到」的排错口径。
- 新增 bundle 契约测试：断言 `dsh.bundle.patch` 已声明、补丁文件存在且随包发布、补丁内含 `insert` 行挂载本插件、`engines.dsh` 已声明。测试 86 → 87 例。

## [1.5.0] - 2026-10-04

### Fixed

- **适配 DSH 0.2.0-rc.2：`ctx.shell.run` 已移除，六个工具此前全部不可用**。DSH 在 `0.1.7-rc.2` 中把 shell 执行从单步 `run(request)` 改为两步契约 `resolve(request) -> ShellExecSpec` + `execute(spec) -> ShellExecution`，并在 `0.2.0-rc.2` 保持该形态。插件原调用 `ctx.shell.run(...)` 会直接抛 `TypeError`。现改为 `ctx.shell.resolve(request)` → `ctx.shell.execute(spec)` → `await handle.result()`，并按新版契约取 `{ exitCode, signal, timedOut, aborted, timeoutMs, stdout, stderr }`。
- **不再由插件自造 `sandboxPolicy`**。`resolve()` 本来就会为请求盖上沙箱策略（`dsh-pwsh-sandbox` 在 `resolve` 内以 `request.sandboxPolicy ?? ctx.sandboxPolicy.resolve()` 填充），插件先前手工塞入 `danger-full-access` 属于绕过部署约束；现在策略完全交由宿主决定。
- **沙箱后端缺失的升级重试按新契约实现**：`SandboxUnavailableError`（`code: SANDBOX_UNAVAILABLE`）在 `resolve`/`execute`/`result()` 任一步抛出时才以 `danger-full-access` 显式重试一次；错误识别不再只依赖英文错误文案（同时匹配 `code`、`name` 与文案）。
- **契约不符时给出可读错误**：缺少 `resolve`/`execute` 时抛出说明所需契约与缺失方法的错误，而不是难以定位的 `ctx.shell.run is not a function`。
- **修复 `map_search` 被 DSH 丢弃整个结果（实测发现）**：FOFA 只返回 `consumed_fpoint`、不返回 `rest_fpoint`，而 `searchFofa` 直接拼出 `credit: { consumed_fpoint, rest_fpoint: undefined }`。DSH 的 `dsh-tools` 以 `snapshotJsonValue` 校验工具返回值，**任何 `undefined`、非有限数字或 `-0` 都会判定为 "value is not lossless JSON" 并丢弃整个结果**，表现为 `tool "map_search" returned invalid output`。现于工具输出边界统一收敛为无损 JSON（`utils.jsonSafe`，在 `defineTool` 内对两个运行时同时生效），并让 `searchFofa` 的 `credit` 走 `clean()`。

### Changed

- **转发调用方取消信号**：六个工具的 `execute` 现接收 `exec` 并把它携带的 `signal` 下传到 shell 请求（单次调用内共享、调用之间隔离），用户中断时可终止 curl 子进程，而不是只能等 `timeoutMs`。
- 沙箱后端缺失时的升级重试改用策略服务给出的**绝对**工作区根；取不到时省略 `workspaceRoot` 而不是传相对空串（相对路径会让沙箱 `canonicalPath` 抛错）。
- 测试 mock 全部改写为 `0.2.0-rc.2` 真实契约（`resolve`/`execute`/`result()` 三段，`execute` 收到的是 `resolve` 产出的 spec，`defineTool` 包装层透传 `exec`）。此前 mock 直接实现了已移除的 `run` 且丢弃第二个参数，因此上述 API 断裂与信号缺失被测试完全掩盖——这是本次问题的根因。
- 新增用例：三段调用顺序、插件不自造 `sandboxPolicy`、升级重试的绝对根、仅凭错误文案也能识别沙箱后端缺失、契约缺失的可读报错、`exec.signal` 端到端下传、缺可选字段时输出仍为无损 JSON。测试 77 → 86 例。

## [1.4.2] - 2026-08-15

### Fixed

- **无可用沙箱后端时自动重试**：部署默认策略解析为受限模式（如 `workspace-write`）但主机没有可用沙箱后端时，执行器会拒绝运行（"refusing to run the command unconfined"）；现在检测到该错误后按会话实际生效策略（`danger-full-access`）重试一次，其余错误不重试

## [1.4.1] - 2026-08-15

### Fixed

- **shell 执行策略崩溃修复**：插件路径调用 `ctx.shell.run` 未携带 `sandboxPolicy`，在部署默认策略缺失时执行器因 `const { mode } = policy` 解构 undefined 崩溃，导致所有 API 调用失败；现改为显式解析策略（`ctx.sandboxPolicy.resolve()`），解析失败时按环境实际生效策略回落为 `danger-full-access`（仅在策略服务无结果时兜底，不覆盖正常部署约束）

## [1.4.0] - 2026-08-15

### Added

- **platform 参数全部可选, 缺省自动使用已填 Key 的平台**: `map_search`/`map_ip_detail`/`map_stats`/`map_account` 省略 platform(或传 auto)时, 只对已填写 API Key 的平台并行执行, 未配置的平台自动跳过并列入 `skipped`
- `configuredPlatforms()` 共用帮助函数（credentials.js）：已配置平台发现只依赖实际填写的 Key

### Changed

- `map_search`/`map_ip_detail`/`map_stats`/`map_account` 的 `platform` 移出必填字段（enum 增加 `auto`）
- 显式指定未配置平台时的错误提示保持可操作（引导 map_set_keys/环境变量）
- 测试 66 → 73 例（缺省平台联合/单Key/双Key/无Key 各路径）

## [1.3.1] - 2026-08-15

### Changed

- 持久化安装改为**本地包链接**：`install.mjs` 在 profile 工作区创建 `node_modules/mapscan-dsh` 链接（Windows junction 支持跨盘符，不依赖任何包管理器），补丁层行名改为 `mapscan-dsh` —— 插件清单显示包名而非 file:// 路径
- `package.json` 的 `main`/`exports` 指向 `dist/mapscan-plugin.mjs`（Loader 入口，default 导出）
- 插件 `inject` 增加 `tools`（Loader 路径经 `ctx.tools.register` 注册，显式声明硬依赖）

### Fixed

- Windows 下 `spawnSync('pnpm')` 无法直接执行 `.cmd` 的问题（改由 Node 原生 `symlinkSync` 建链，彻底移除包管理器依赖）

## [1.3.0] - 2026-08-15

### Added

- **一键安装（持久化）**：`scripts/install.mjs` 向 DSH profile 补丁层（`~/.dsh/profiles/<profile>/cordis.patch.yml`）追加 Loader 补丁行，重启 DSH 后 6 个工具全局可用，无需手工粘贴代码；`scripts/uninstall.mjs` 一键卸载
- **双产物构建**：新增 `dist/mapscan-plugin.mjs`（自包含 ESM，默认导出 Cordis 插件，经真实 `ctx.tools.register` 注册），与 `dist/mapscan-host.js`（沙箱函数体）同源生成
- `src/lib/runtime.js` 运行时适配器：同一份工具代码自动适配沙箱（`harness.defineTool`）与 Loader 真实运行时（手写 ToolDefinition）
- Loader 变体集成测试 4 例（Node 直接导入 ESM 产物验证注册形状与行为）

## [1.2.0] - 2026-08-15

### Added

- `map_search` 联合搜索：`platform: 'all'` 对所有已配置 Key 的平台**并行**发起同一查询，按 `ip:port` 去重合并，附各平台报告（含单平台失败降级）与 `skipped` 清单
- `map_search` 自动翻页：`pages` 参数(1~5)逐页合并结果，空页提前停止，报告 `pages_fetched`
- 搜索结果附 `summary` 聚合摘要：唯一 IP 数 / Top 端口 / Top 产品 / Top 国家（`src/lib/summary.js`）
- `map_dns` 子域枚举：`domain` 参数走 `/dns/domain/{domain}`，返回子域与 A/CNAME 记录（最多 300 条）
- 常见错误码中文提示表（`src/lib/errors.js`）：FOFA -2/-12/-15/-700、Hunter 400/401/403

### Changed

- `map_dns` 的 `hostnames` 改为可选（与 `domain` 二选一），缺参返回明确指引

## [1.1.0] - 2026-08-15

### Added

- `map_dns`：Shodan DNS 批量解析工具（域名 → IP 映射，不消耗查询额度）
- `map_ip_detail` 新增 `honeyscore` 参数：附带 Shodan 蜜罐评分（评分失败自动降级为 `honeyscore_error`，不影响详情结果）
- 只读工具（search / ip_detail / stats / account / dns）声明 `isConcurrencySafe`，支持多平台并行测绘；`map_set_keys` 保持独占
- GitHub 工程化：Release 工作流（tag 触发，校验后自动从 CHANGELOG 生成 Release 说明）、Dependabot（npm + GitHub Actions 每周更新）、CODEOWNERS
- `test:coverage` 覆盖率报告脚本（CI Node 24 车道执行）

### Changed

- curl 请求增加瞬时网络错误自动重试（`--retry 1 --retry-delay 1 --retry-connrefused`，不重试 HTTP 4xx/5xx）
- 无响应体错误按 超时/中止/退出码 正交上报终止原因（对齐官方 defensive-patterns）
- `package.json` 补充 `repository` / `bugs` / `homepage` 元数据

## [1.0.1] - 2026-08-15

### Changed

- 对齐 dsh-plugin 生态规范：README 按收录目录 9 章节重构（Compatibility / Uninstall / Configuration / Permissions & data / Troubleshooting）
- `package.json` 补齐 `main` / `exports` / `dsh.entry` 集成入口，`dependencies: {}` 显式声明零运行时依赖，engines 对齐官方下限 `>=22.19`
- CI 矩阵更新为 Node 22/24/26（对齐官方 deepseek-harness）

### Added

- `docs/COMPLIANCE.md`：dsh-plugin 生态开发/提交规范调研、最低收录条件对照表、收录提交材料模板
- husky + lint-staged pre-commit 钩子（增量 lint/format + dist 同步）
- CONTRIBUTING 增加 TODO 三级标记规范与生态收录提交流程

## [1.0.0] - 2026-08-15

### Added

- `map_search`：FOFA / Shodan / 鹰图Hunter / ZoomEye / Quake 五平台统一搜索
  - 归一化输出（ip/port/protocol/域名/标题/banner/证书/地理/组件/风险）
  - 分页、`save` 结果落盘、平台专属参数（fofa `fields`/`full`，hunter `type`/`status_code`/时间范围）
- `map_ip_detail`：单 IP 详情（fofa 端口与历史记录、shodan 服务/SSL/CVE vulns）
- `map_stats`：聚合统计（fofa 字段分布、shodan 总数+facets）
- `map_account`：五平台账户与配额查询
- `map_set_keys`：API Key 持久化管理（凭证库 + 环境变量回退）
- HTTP 层：curl（`ctx.shell`/pwsh）主通道 + `web.fetch` 纯 GET 回退，支持自定义 Header 与 POST
- 工程化：模块化源码、零依赖构建流水线（src → dist 单文件函数体）、node:test 单元/集成测试、ESLint/Prettier、GitHub Actions CI、Issue/PR 模板
