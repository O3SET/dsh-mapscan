<!--
发布提示（粘贴到 CSDN 前删除本段）：
- 推荐分类：人工智能 / 网络安全
- 推荐标签：DeepSeek、网络空间测绘、FOFA、Shodan、渗透测试、开源插件、AI工具
- 封面建议：Shodan/FOFA 搜索界面截图 + 插件工具列表截图
-->

# 让 AI 帮你查资产：DeepSeek Harness 五平台网络测绘插件 MapScan 详解

> 一条命令安装，一句自然语言查询，AI 自动帮你查遍 FOFA / Shodan / 鹰图 Hunter / ZoomEye / Quake 五大网络空间测绘平台——未配置的平台自动跳过，结果归一化去重并附聚合摘要。

## 一、痛点：五个平台，五种语法，五把钥匙

做渗透测试或资产测绘的同学都懂这种痛：

| 平台        | 查询语法示例                         | 鉴权方式                         |
| ----------- | ------------------------------------ | -------------------------------- |
| FOFA        | `app="nginx" && country="CN"`        | `key` URL 参数                   |
| Shodan      | `nginx port:443 country:CN`          | `key` URL 参数                   |
| 鹰图 Hunter | `ip="1.1.1.1" \|\| web.title="后台"` | `api-key` URL 参数 + Base64 查询 |
| ZoomEye     | `app:"nginx" +country:"CN"`          | `API-KEY` 请求头                 |
| Quake       | `port:"80" AND country:"CN"`         | `X-QuakeToken` 请求头 + POST     |

语法记不住、鉴权方式各不相同、结果字段五花八门。有没有可能让 **AI 助手**（DeepSeek Harness，简称 DSH）把这些平台统一封装起来？

这就是本文要介绍的 **MapScan**：一个开源的 DSH 动态 Cordis 插件，把五大平台封装成 6 个统一工具，用自然语言驱动测绘。

## 二、MapScan 是什么

- 一句话：**DeepSeek Harness 的五大网络空间测绘平台综合查询插件**。
- 形态：模块化 ESM 源码 + 零依赖构建流水线，产出两个同源产物——沙箱函数体（动态插件）与自包含 ESM（持久化 Loader 插件）。
- 仓库：<https://github.com/O3SET/dsh-mapscan>（MIT 协议，欢迎 Star / PR）

它提供的 6 个工具：

| 工具            | 作用                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| `map_search`    | 五平台统一搜索；**platform 可省略**（自动联合所有已填 Key 的平台）、`pages` 翻页、`save` 落盘、结果附聚合摘要 |
| `map_ip_detail` | 单 IP 测绘详情（端口/服务/SSL 证书/历史记录/CVE 漏洞），可选 Shodan 蜜罐评分                                  |
| `map_stats`     | 聚合统计：FOFA 字段分布、Shodan 总数+facets                                                                   |
| `map_account`   | 各平台账户与配额（F点/查询积分/月度额度）                                                                     |
| `map_dns`       | Shodan DNS 批量解析 + 子域枚举                                                                                |
| `map_set_keys`  | API Key 持久化管理（凭证库 / 环境变量）                                                                       |

## 三、一键安装（两条命令）

```powershell
git clone https://github.com/O3SET/dsh-mapscan.git
node dsh-mapscan\scripts\install.mjs
# 重启 DSH 进程 → 插件清单中出现 mapscan-dsh，6 个工具全局可用
```

安装脚本只做两件事，**不依赖任何包管理器**：

1. 在 DSH profile 工作区创建 `node_modules/mapscan-dsh` 指向仓库的链接（Windows junction 跨盘符支持）；
2. 向补丁层 `~/.dsh/profiles/<profile>/cordis.patch.yml` 登记 Loader 行。

卸载 `node scripts/uninstall.mjs`；升级 `git pull` 后重启即可（链接指向仓库文件）。

## 四、实战：从配置到查询

**1. 配置 Key（只需一次，持久化保存）**

```text
map_set_keys { "fofa": "你的Key", "shodan": "你的Key" }
```

**2. 直接说人话查询**

```text
搜一下 nginx 资产                 # map_search { "query": "nginx", "size": 3 }
查一下 182.92.162.180 的详情     # map_ip_detail { "ip": "..." }
看看我的账户配额                 # map_account {}
枚举 example.com 的子域          # map_dns { "domain": "example.com" }
```

**3. 实际输出长这样**（联合搜索 `nginx`，FOFA + Shodan 并行）：

```json
{
  "platform": "all",
  "total": 687629647,
  "returned": 6,
  "deduped": 0,
  "platforms": { "fofa": { "total": 634910180 }, "shodan": { "total": 52719467 } },
  "skipped": ["hunter", "zoomeye", "quake"],
  "summary": {
    "unique_ips": 6,
    "top_ports": [{ "name": "80", "count": 3 }],
    "top_products": [{ "name": "nginx", "count": 3 }]
  }
}
```

两个平台的结果**归一化**到同一结构（ip/port/protocol/banner/org/asn/经纬度/来源），并按 `ip:port` 去重；`skipped` 告诉你哪些平台没配 Key 被自动跳过。

## 五、亮点：按 Key 自动路由

这是个人最喜欢的特性：**所有 `platform` 参数都可省略**。

- 只填了 FOFA 一个 Key？那所有缺省调用就只走 FOFA，其余平台自动跳过；
- 填了两个平台？`map_search` 自动并行联合搜索并去重；
- 一个都没填？返回明确的配置指引，绝不报一堆难懂的鉴权错误。

对 AI 助手来说这意味着什么？你不需要教它「用哪个平台、别碰哪个平台」——它会自己根据凭证路由。

## 六、技术实现速览

对插件开发感兴趣的同学，几个值得复用的点：

- **双产物构建**：同一份 ESM 源码经零依赖脚本（`scripts/build.mjs`，去 import/export 后拼接）产出沙箱函数体与 Loader ESM，两者 22 个模块共用核心逻辑；
- **运行时适配器**：沙箱走 `harness.defineTool`，真实运行时走 `ctx.tools.register`，一份代码两处可用；
- **HTTP 层**：curl 主通道（支持自定义 Header/POST，覆盖 ZoomEye/Quake），`web.fetch` 兜底，瞬错重试 + 超时/中止/退出码正交上报；
- **工程化**：node:test **77 例**单元+集成测试、ESLint/Prettier、husky 提交钩子、GitHub Actions 矩阵（Node 22/24/26）、Release 自动化、Dependabot；
- **生态合规**：按 dsh-plugin 生态收录规范补齐入口字段/README 九章节/依赖声明，已挂 `dsh-plugin` topic 供社区目录自动索引。

## 七、写在最后

MapScan 还在快速迭代：从 1.0 的五个基础工具，到联合搜索、自动翻页、聚合摘要、子域枚举、蜜罐评分，再到「按 Key 自动路由」——每个特性都来自真实测绘场景的痛点。

**免责声明**：本工具仅用于授权测试、安全研究与资产梳理，请遵守目标平台服务条款与当地法律法规。

欢迎访问仓库体验：<https://github.com/O3SET/dsh-mapscan>。如果对你有帮助，顺手点个 Star ⭐，让更多人看到这个「让 AI 查资产」的小工具。
