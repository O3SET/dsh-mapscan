# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

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
