# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

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
