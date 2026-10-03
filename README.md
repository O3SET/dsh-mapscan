# MapScan DSH

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![version](https://img.shields.io/badge/version-1.5.0-brightgreen)](CHANGELOG.md)
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

| 工具            | 说明                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| `map_search`    | 五平台统一搜索；**platform 可省略**(自动联合所有已填 Key 的平台, 未配置自动跳过)、`pages` 翻页、`save` 落盘 |
| `map_ip_detail` | 单 IP 测绘详情；**platform 可省略**(自动并行查询已填 Key 的平台)；可选 `honeyscore` 蜜罐评分                |
| `map_stats`     | 聚合统计；**platform 可省略**(自动统计已填 Key 的平台)：FOFA 字段分布、Shodan 总数+facets                   |
| `map_account`   | 账户与配额；**platform 可省略**(自动查询所有已填 Key 的平台)：fcoin/F点/query_credits/剩余积分/credit       |
| `map_dns`       | Shodan DNS：`hostnames` 批量解析(域名→IP, 免额度) / `domain` 子域枚举(A/CNAME 记录)                         |
| `map_set_keys`  | API Key 持久化管理（凭证库 / 环境变量，支持查看与删除）                                                     |

- **按 Key 自动路由**：所有 platform 参数均可省略——只对**已填写 API Key 的平台**执行，未填写的自动跳过并列入 `skipped`
- **零运行时依赖**：插件本体只使用 DSH 沙箱能力（`ctx.shell` 驱动的 curl + `web.fetch` 回退），无任何 npm 运行时依赖
- **沙箱友好**：支持自定义 Header（ZoomEye `API-KEY`）与 POST（Quake `X-QuakeToken`）
- **可测试**：模块化 ESM 源码 + node:test 单元/集成测试（85 例）+ 零依赖构建流水线
- **可并行**：只读工具声明 `isConcurrencySafe`；多平台场景内部并行、结果去重附摘要
- **可取消**：转发调用方 `exec.signal` 到 shell 请求，用户中断可终止 curl 子进程

## Compatibility

| 项目                         | 已验证版本                                                           | 验证日期   |
| ---------------------------- | -------------------------------------------------------------------- | ---------- |
| DeepSeek Harness             | `@deepseek-ai/dsh` **`0.2.0-rc.2`**（DSH 桌面版 V0.2.0-rc.2 运行时） | 2026-10-04 |
| DeepSeek Harness（本地实测） | `@deepseek-ai/dsh-base` `0.1.7-rc.2`（脚本与端点端到端实测环境）     | 2026-10-04 |
| Node.js（构建/测试工具链）   | 24.9.0（engines `>=22.19`；CI 矩阵 22/24/26）                        | 2026-10-04 |
| 操作系统                     | Windows 11（curl 8.21；`ctx.shell`=pwsh 执行器）                     | 2026-10-04 |

> **最低运行时要求：DSH ≥ `0.1.7-rc.2`。** DSH 在 `0.1.7-rc.2` 将 shell 执行从单步
> `ctx.shell.run(request)` 改为两步 `resolve(request)` + `execute(spec)`，本插件 1.5.0 起按两步契约实现；
> 在 `0.1.0-rc.6` 等旧版本上会因缺少 `execute` 抛出可读的契约错误而无法工作。

平台 API 契约以各平台官方文档及 [projectdiscovery/uncover](https://github.com/projectdiscovery/uncover) 核对，见 [docs/API.md](docs/API.md)。
兼容性结论只覆盖上述记录环境；生态收录目录的判定口径见 [docs/COMPLIANCE.md](docs/COMPLIANCE.md)。

## Install / Uninstall

MapScan 是一个 **DSH bundle 插件**：`package.json` 声明 `dsh.bundle.patch` → 根目录 [`cordis.patch.yml`](cordis.patch.yml)，
补丁把 `mapscan-dsh` 作为一行挂载进装配树。这是被 `dsh plugin` / 插件市场 / 设置页插件清单识别的**唯一**声明方式。

**✨ 方式一：插件市场 / 设置页安装（推荐）**

设置 → 插件 → 安装，填入以下任一：

```text
O3SET/dsh-mapscan                                  # GitHub 仓库（topic: dsh-plugin）
github:O3SET/dsh-mapscan                           # 显式 git 源
file:D:/path/to/dsh-mapscan                        # 本地克隆（绝对路径）
```

**方式二：一键脚本（本地克隆，等价动作）**

```powershell
git clone https://github.com/O3SET/dsh-mapscan.git
node dsh-mapscan\scripts\install.mjs
# 重启 DSH 进程 → 6 个 map_* 工具全局可用
```

`install.mjs` 做三件事，与插件市场的安装动作一致：

1. 在 profile 目录执行 `pnpm add link:<本仓库>`（`link:` 不复制 devDependencies，且**仓库改动即时生效**，升级无需重装）；
2. 把 `mapscan-dsh` 追加进 profile `package.json` 的 `dsh.profile.bundles` 层列表；
3. 清理 1.5.0 之前旧装法遗留的手工 `insert:` 行（避免重复注册）。

- 非默认 profile：`$env:DSH_PROFILE="你的profile"; node scripts/install.mjs`（本仓库默认 `desktop`）
- 卸载：`node scripts/uninstall.mjs`（移除 bundle 层登记 + pnpm 依赖后重启）
- 幂等：重复执行安全
- **排错**：装完在插件列表里看不到 → 确认 `package.json` 有 `dsh.bundle.patch` 且 `cordis.patch.yml` 随包发布；
  旧版「junction + 手写补丁行」的装法**能被 loader 加载但插件清单读不到**，会表现为「已安装却检测不到」

**开发/预览安装（动态插件，会话级，可选）**

构建产物 [`dist/mapscan-host.js`](dist/mapscan-host.js) 是 DSH 函数体，可在会话内临时安装：

```
cordis_define { kind: new, idPrefix: mscan, code: { host: <dist 内容> } }
cordis_run   { pluginId: ..., packageId: ..., mode: run }
```

动态插件与持久化插件共存时作用域版本优先；正式使用建议走方式一或方式二。
清除已存 Key：`map_set_keys { "remove": ["fofa","shodan","hunter","zoomeye","quake"] }`

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

**方式一：配置文件 / 插件 Config（当前可用）**

直接编辑 profile 里 `mapscan-dsh` 那一行的 `config:` 块，或让插件市场/插件管理把它写进去：

```yaml
- insert:
    - id: mapscan-dsh
      name: 'mapscan-dsh'
      config:
        fofa: '你的 FOFA Key'
        shodan: '你的 Shodan Key'
        timeoutSec: 45
```

`Config` 是 schemastery schema（见 [src/index.js](src/index.js)），插件挂载时由 Cordis 校验后注入 `apply`。

**方式二：对话里配置 / 环境变量**

| 配置项                                                                                              | 默认   | 说明                                    |
| --------------------------------------------------------------------------------------------------- | ------ | --------------------------------------- |
| Config `fofa` / `shodan` / `hunter` / `zoomeye` / `quake`                                           | 未配置 | 插件 Config，明文保存在 profile 配置里  |
| Config `timeoutSec`                                                                                 | 30     | 单请求超时（秒），夹取 5~300            |
| `map_set_keys` 参数                                                                                 | 未配置 | 写入 DSH 凭证库（持久化，不落配置文件） |
| 环境变量 `MAPSCAN_*_API_KEY`                                                                        | —      | 与凭证库同名引用，环境变量优先          |
| 环境变量 `FOFA_API_KEY` / `SHODAN_API_KEY` / `HUNTER_API_KEY` / `ZOOMEYE_API_KEY` / `QUAKE_API_KEY` | —      | 社区惯用名，次优先                      |

> **关于设置页图形表单（暂未启用）**
>
> 本仓库带有实验性的浏览器半侧 [src/client.js](src/client.js)（注册 `settings.section` 页面），
> 但**尚未在真机验证通过**，且它的加载失败会让插件在客户端列表里显示异常，
> 因此 `package.json` **刻意不声明** `dsh.client` / `exports["./client"]`，该产物不会被加载。
>
> 若要启用，需把它接回 `package.json` 的 `dsh.client`（`platform: 'web'`）与 `exports["./client"]`，
> 并具备浏览器控制台以便调试。已确认的实现要点：
>
> 1. DSH **不会**从插件 `Config` 自动生成表单——`autoGenerate` 目前没有任何客户端消费
>    （`dsh-settings` README: “no shipped client does so yet”）；
> 2. `Config` 必须是 **schemastery** schema（`isNativeConfigSchema` 判定），否则配置 status 为 `unsupported`；
> 3. 字段要在表单里可见且可写，必须加 **`.volatile()`**；API Key 另加 `.role('secret')`
>    （读取时值被抹掉，只回传 `{path,set}` 存在性）；
> 4. 写入只在**本机回环**地址下持久化；
> 5. 客户端 bundle 是 classic script，模块 id 必须等于包名，且只能 `require` 宿主模块表里的
>    `react` / `react-dom` / `@deepseek-ai/cordis` / `dsh-client-store` / `dsh-client-ui-slots` /
>    `dsh-client-ui-primitives` / `dsh-client-ui-dockkit` —— 表外 `require` 会抛
>    “missed the module table”。
>    | 工具参数 `key` | — | 单次调用临时覆盖，不落盘 |
>    | `size`（每页条数） | 20（最大 100） | 各工具统一夹取 |

**Key 解析优先级**：工具参数 `key` > 插件 Config（设置页）> 环境变量 / 凭证库 > 社区惯用环境变量名。
即**设置页填过的值会掩盖凭证库条目**；想回到凭证库，请把设置页对应字段清空。

> ⚠️ **落盘提示**：设置页填写方式会把 Key 以**明文**写入 profile 的 `cordis.patch.yml`。
> 若不希望 Key 落盘，请改用 `map_set_keys`（凭证库）或环境变量，并保持设置页表单为空。
> 其余敏感项不写任何配置文件。

Key 获取地址：fofa.info 个人中心、account.shodan.io、hunter.qianxin.com 个人中心、zoomeye.org/profile、quake.360.net 个人中心。

## Permissions & data

- **文件系统**：仅在 `map_search` 使用 `save` 参数时写入你指定的 JSON 文件路径（默认不写任何文件）
- **网络**：仅访问五个平台官方 API 域名（fofa.info / api.shodan.io / hunter.qianxin.com / api.zoomeye.org / quake.360.net）
- **凭据**：读取设置页 Config、`MAPSCAN_*` 与平台惯用名环境变量/凭证库条目；API Key 出现在子进程（curl）命令行中，属平台 API 的鉴权要求，注意本机进程列表可见性
- **数据**：查询结果仅返回给模型与会话，除 `save` 外不落盘
- 插件为 Host-only 代码，在 DSH 沙箱内运行；安装第三方插件即代表信任其代码，请审阅 [源码](src/)（安全报告见 [SECURITY.md](SECURITY.md)）

## Troubleshooting

| 现象                                  | 处理                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| `未配置 xxx 的 API Key`               | 到设置页「插件 → MapScan」填 Key，或用 `map_set_keys`/环境变量；`map_set_keys` 无参查看状态 |
| 设置页填了 Key 却不生效               | 优先级为「工具参数 > 设置页 Config > 凭证库」；设置页留空后才会回退凭证库。改完需重启 DSH   |
| 设置页「插件」里没有 MapScan 的配置项 | 确认插件已装且被识别（见 Install 章节排错），并已**重启 DSH**——`Config` 在插件挂载时才注册  |
| `FOFA 返回错误: [-700] 账号无效`      | Key 错误/过期，到 fofa.info 个人中心核对                                                    |
| `响应不是 JSON (HTTP 401)`            | Shodan/ZoomEye/Quake 的 401 响应非 JSON，Key 无效时属正常提示，核对 Key                     |
| `Hunter 返回错误 code=401: 令牌过期`  | 鹰图 Key 过期，重新生成；hunter 根域名 403 是 WAF 正常现象，仅 `/openApi/*` 可用            |
| `HTTP 请求失败 (无响应体)`            | 目标平台不可达或超时；插件会附上 curl stderr 详情，检查网络/代理                            |
| `未挂载凭证服务(credentials)`         | 当前 DSH 组合缺凭证提供方，改用环境变量注入 Key                                             |

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
