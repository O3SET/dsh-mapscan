# MapScan DSH

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![version](https://img.shields.io/badge/version-1.2.0-brightgreen)](CHANGELOG.md)
[![node](https://img.shields.io/badge/node-%3E%3D22.19-339933?logo=node.js)](package.json)
[![CI](https://github.com/O3SET/dsh-mapscan/actions/workflows/ci.yml/badge.svg)](https://github.com/O3SET/dsh-mapscan/actions/workflows/ci.yml)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

> DeepSeek Harness 动态 Cordis 插件：**FOFA / Shodan / 鹰图 Hunter / ZoomEye / Quake** 五平台网络空间测绘综合查询。
> 统一搜索、归一化输出、API Key 持久化管理，面向渗透测试与资产测绘工作流。

<!-- 生态收录步骤 (详见 docs/COMPLIANCE.md 第六节)：
  1. 仓库 Settings → Topics 添加 dsh-plugin（radar 每 8 小时自动扫描收录）
  2. 被 awesome-dsh-plugin 精选收录后, 可挂 badge:
     [![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)
-->

## Overview

五个国内主流网络空间测绘平台（FOFA / Shodan / 鹰图Hunter / ZoomEye / Quake）语法各异、鉴权方式各异。
MapScan 把它们封装成 6 个统一的动态工具，输出**归一化结果**（ip/端口/协议/域名/标题/banner/证书/地理/组件/风险），
并内置 API Key 持久化管理，让渗透测试、SRC 资产梳理、攻击面测绘可以直接用自然语言驱动。

| 工具            | 说明                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| `map_search`    | 五平台统一搜索；`platform:'all'` 联合搜索(并行+去重+摘要)、`pages` 自动翻页、`save` 落盘、平台专属过滤 |
| `map_ip_detail` | 单 IP 测绘详情：FOFA 端口+历史记录、Shodan 服务列表+SSL 证书+CVE vulns；可选 `honeyscore` 蜜罐评分     |
| `map_stats`     | 聚合统计：FOFA 字段分布、Shodan 总数+facets                                                            |
| `map_account`   | 各平台账户与配额（fcoin/F点/query_credits/剩余积分/credit）                                            |
| `map_dns`       | Shodan DNS：`hostnames` 批量解析(域名→IP, 免额度) / `domain` 子域枚举(A/CNAME 记录)                    |
| `map_set_keys`  | API Key 持久化管理（凭证库 / 环境变量，支持查看与删除）                                                |

- **零运行时依赖**：插件本体只使用 DSH 沙箱能力（`ctx.shell` 驱动的 curl + `web.fetch` 回退），无任何 npm 运行时依赖
- **沙箱友好**：支持自定义 Header（ZoomEye `API-KEY`）与 POST（Quake `X-QuakeToken`）
- **可测试**：模块化 ESM 源码 + node:test 单元/集成测试（62 例）+ 零依赖构建流水线
- **可并行**：只读工具声明 `isConcurrencySafe`；`platform:'all'` 内部多平台并行、结果去重附摘要

## Compatibility

| 项目                       | 已验证版本                                                       | 验证日期   |
| -------------------------- | ---------------------------------------------------------------- | ---------- |
| DeepSeek Harness           | `@deepseek-ai/dsh` `0.1.0-rc.6`（DSH 动态 Cordis Plugin 运行时） | 2026-08-15 |
| Node.js（构建/测试工具链） | 24.9.0（engines `>=22.19`；CI 矩阵 22/24/26）                    | 2026-08-15 |
| 操作系统                   | Windows 11（curl 8.21；`ctx.shell`=pwsh 执行器）                 | 2026-08-15 |

平台 API 契约以各平台官方文档及 [projectdiscovery/uncover](https://github.com/projectdiscovery/uncover) 核对，见 [docs/API.md](docs/API.md)。
兼容性结论只覆盖上述记录环境；生态收录目录的判定口径见 [docs/COMPLIANCE.md](docs/COMPLIANCE.md)。

## Install / Uninstall

**安装（DSH 会话内）**

1. 构建产物 [`dist/mapscan-host.js`](dist/mapscan-host.js) 即 DSH 函数体，将其整体作为 `code.host` 提交：

   ```
   cordis_define { kind: new, idPrefix: mscan, code: { host: <dist 内容> } }
   cordis_run   { pluginId: ..., packageId: ..., mode: run }
   ```

   也可以直接让 Agent 执行：「读取 `dist/mapscan-host.js` 并通过 cordis_define/cordis_run 安装」。

2. **升级**：改 `src/**` → `npm run check` → 用新 dist 走 `cordis_define`(existing `mscan-1`) + `cordis_run`(update)；
   旧包保留可回滚（`cordis_run` mode `run` + 旧 packageId）。

3. **禁用 / 卸载**：

   - 临时停用（保留版本与授权）：`cordis_stop { pluginId: "mscan-1" }`
   - 彻底删除：`cordis_stop` 后 `cordis_undefine { pluginId: "mscan-1" }`
   - 清除已存 Key：`map_set_keys { "remove": ["fofa","shodan","hunter","zoomeye","quake"] }`

## Quick start

```text
# 1. 配置 API Key（持久化到凭证库）
map_set_keys { "fofa": "你的Key", "shodan": "你的Key" }

# 2. 搜索
map_search { "platform": "fofa",   "query": "app=\"nginx\" && country=\"CN\"", "size": 20 }
map_search { "platform": "shodan", "query": "nginx port:443 country:CN" }

# 3. 详情 / 统计 / 配额
map_ip_detail { "platform": "shodan", "ip": "1.1.1.1" }
map_stats     { "platform": "fofa", "query": "app=\"nginx\"", "fields": "title,port" }
map_account   { "platform": "fofa" }
```

更多示例见 [examples/queries.md](examples/queries.md)，检索语法见 [docs/QUERY-SYNTAX.md](docs/QUERY-SYNTAX.md)。

## Configuration

| 配置项                                                                                              | 默认           | 说明                                        |
| --------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------- |
| `fofa` / `shodan` / `hunter` / `zoomeye` / `quake` Key                                              | 未配置         | 经 `map_set_keys` 写入 DSH 凭证库（持久化） |
| 环境变量 `MAPSCAN_*_API_KEY`                                                                        | —              | 与凭证库同名引用，环境变量优先              |
| 环境变量 `FOFA_API_KEY` / `SHODAN_API_KEY` / `HUNTER_API_KEY` / `ZOOMEYE_API_KEY` / `QUAKE_API_KEY` | —              | 社区惯用名，次优先                          |
| 工具参数 `key`                                                                                      | —              | 单次调用临时覆盖，不落盘                    |
| `size`（每页条数）                                                                                  | 20（最大 100） | 各工具统一夹取                              |

敏感项只经凭证库/环境变量/单次参数注入，**不写任何配置文件**；Key 获取地址：fofa.info 个人中心、account.shodan.io、hunter.qianxin.com 个人中心、zoomeye.org/profile、quake.360.net 个人中心。

## Permissions & data

- **文件系统**：仅在 `map_search` 使用 `save` 参数时写入你指定的 JSON 文件路径（默认不写任何文件）
- **网络**：仅访问五个平台官方 API 域名（fofa.info / api.shodan.io / hunter.qianxin.com / api.zoomeye.org / quake.360.net）
- **凭据**：读取 `MAPSCAN_*` 与平台惯用名环境变量/凭证库条目；API Key 出现在子进程（curl）命令行中，属平台 API 的鉴权要求，注意本机进程列表可见性
- **数据**：查询结果仅返回给模型与会话，除 `save` 外不落盘
- 插件为 Host-only 代码，在 DSH 沙箱内运行；安装第三方插件即代表信任其代码，请审阅 [源码](src/)（安全报告见 [SECURITY.md](SECURITY.md)）

## Troubleshooting

| 现象                                 | 处理                                                                             |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| `未配置 xxx 的 API Key`              | 先 `map_set_keys` 或设置环境变量；`map_set_keys` 无参查看状态                    |
| `FOFA 返回错误: [-700] 账号无效`     | Key 错误/过期，到 fofa.info 个人中心核对                                         |
| `响应不是 JSON (HTTP 401)`           | Shodan/ZoomEye/Quake 的 401 响应非 JSON，Key 无效时属正常提示，核对 Key          |
| `Hunter 返回错误 code=401: 令牌过期` | 鹰图 Key 过期，重新生成；hunter 根域名 403 是 WAF 正常现象，仅 `/openApi/*` 可用 |
| `HTTP 请求失败 (无响应体)`           | 目标平台不可达或超时；插件会附上 curl stderr 详情，检查网络/代理                 |
| `未挂载凭证服务(credentials)`        | 当前 DSH 组合缺凭证提供方，改用环境变量注入 Key                                  |

## Development

```bash
npm install        # devDeps: eslint / prettier / husky / lint-staged
npm run check      # lint + format:check + build + test 全量检查 (pre-commit 也会跑增量检查)
npm test           # 构建并运行全部测试
npm run build      # 重新生成 dist/mapscan-host.js
```

目录结构、沙箱约束、新增平台清单、发布流程见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)；
贡献约定见 [CONTRIBUTING.md](CONTRIBUTING.md)；生态收录规范对照见 [docs/COMPLIANCE.md](docs/COMPLIANCE.md)。

## License & security

[MIT](LICENSE) © 2026 MapScan contributors。安全漏洞请**私下**报告（见 [SECURITY.md](SECURITY.md)），勿公开提交 Issue。

## 免责声明

本工具仅用于**授权测试、安全研究与资产梳理**。使用者须遵守目标平台的服务条款与当地法律法规，并对自身行为负责。
