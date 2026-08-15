# MapScan DSH

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![version](https://img.shields.io/badge/version-1.0.0-brightgreen)](CHANGELOG.md)
[![node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js)](package.json)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

> DeepSeek Harness 动态 Cordis 插件：**FOFA / Shodan / 鹰图 Hunter / ZoomEye / Quake** 五平台网络空间测绘综合查询。
> 统一搜索、归一化输出、API Key 持久化管理，面向渗透测试与资产测绘工作流。

<!-- 推送到 GitHub 后, 可在此处添加 CI 徽章:
[![CI](https://github.com/<owner>/mapscan-dsh/actions/workflows/ci.yml/badge.svg)](https://github.com/<owner>/mapscan-dsh/actions/workflows/ci.yml)
-->

## 功能

| 工具            | 说明                                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `map_search`    | 五平台统一搜索，输出归一化字段（ip/端口/协议/域名/标题/banner/证书/地理/组件/风险…），支持分页、`save` 落盘、平台专属过滤参数 |
| `map_ip_detail` | 单 IP 测绘详情：FOFA 端口+历史记录、Shodan 服务列表+SSL 证书+CVE vulns                                                        |
| `map_stats`     | 聚合统计：FOFA 字段分布、Shodan 总数+facets                                                                                   |
| `map_account`   | 各平台账户与配额（fcoin/F点/query_credits/剩余积分/credit）                                                                   |
| `map_set_keys`  | API Key 持久化管理（凭证库 / 环境变量，支持查看与删除）                                                                       |

- **零运行时依赖**：插件本体只使用 DSH 沙箱能力（`ctx.shell` 驱动的 curl + `web.fetch` 回退），无任何 npm 包
- **沙箱友好**：支持自定义 Header（ZoomEye `API-KEY`）与 POST（Quake `X-QuakeToken`）
- **可测试**：纯函数模块化 + node:test 单元/集成测试 + 构建流水线

## 快速开始（DSH 内安装）

1. 构建产物位于 [`dist/mapscan-host.js`](dist/mapscan-host.js)，将其整体作为 `code.host` 提交：

   ```
   cordis_define { kind: new, idPrefix: mscan, code: { host: <dist 内容> } }
   cordis_run   { pluginId: ..., packageId: ..., mode: run }
   ```

2. 配置 API Key（持久化到凭证库，或使用环境变量）：

   ```
   map_set_keys { "fofa": "你的Key", "shodan": "你的Key" }
   ```

3. 使用：

   ```
   map_search { "platform": "fofa", "query": "app=\"nginx\" && country=\"CN\"", "size": 20 }
   map_search { "platform": "shodan", "query": "nginx port:443 country:CN" }
   map_ip_detail { "platform": "shodan", "ip": "1.1.1.1" }
   map_account { "platform": "fofa" }
   ```

## 目录结构

```
mapscan-dsh/
├── .github/                # CI、Issue/PR 模板
├── src/                    # 模块化源码 (ESM)
│   ├── lib/                #   utils / http / credentials
│   ├── platforms/          #   五平台适配 (fofa/shodan/hunter/zoomeye/quake)
│   ├── tools/              #   5 个工具定义
│   └── index.js            #   插件入口
├── scripts/build.mjs       # 零依赖构建: ESM -> 单文件 DSH 函数体
├── dist/mapscan-host.js    # 构建产物 (已提交, 可直接部署)
├── test/                   # node:test 单元 + 集成测试
├── docs/                   # 查询语法 / API 契约 / 开发指南
└── examples/               # 查询示例
```

## 开发

```bash
npm install        # 仅安装 eslint / prettier 开发依赖
npm run check      # lint + format + build + test 全量检查
npm test           # 构建并运行全部测试
npm run build      # 重新生成 dist/mapscan-host.js
```

详细约定见 [CONTRIBUTING.md](CONTRIBUTING.md) 与 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。

## 文档

- [docs/QUERY-SYNTAX.md](docs/QUERY-SYNTAX.md) — 各平台检索语法速查
- [docs/API.md](docs/API.md) — 已核实的各平台 API 契约
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — 架构、沙箱约束、新增平台清单、发布流程
- [examples/queries.md](examples/queries.md) — 常用查询示例

## 免责声明

本工具仅用于**授权测试、安全研究与资产梳理**。使用者须遵守目标平台的服务条款与当地法律法规，并对自身行为负责。

## License

[MIT](LICENSE) © 2026 MapScan contributors
