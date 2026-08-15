# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

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
