# dsh-plugin 生态规范对照与收录材料

本文档汇总 `github.com/topics/dsh-plugin` 生态的开发/提交规范（2026-08-15 调研），
并给出本仓库的合规对照与收录提交材料。调研来源：

- 官方仓库 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)（`CONTRIBUTING.md`、`docs/development.md`、`docs/testing.md`、`docs/defensive-patterns.md`）
- 精选目录 [awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
- 收录雷达 [AdamPlatin123/awesome-dsh-plugins](https://github.com/AdamPlatin123/awesome-dsh-plugins)（自动扫描 + 运行级实测）
- 生态索引 [0xsline/awesome-deepseek-harness](https://github.com/0xsline/awesome-deepseek-harness)

## 一、官方生态参与方式（提交规范的总入口）

官方仓库当前**不接受外部 PR**（早期阶段，见官方 CONTRIBUTING）。生态参与的标准路径是：

1. 把插件做成独立 GitHub 仓库；
2. **给仓库添加 `dsh-plugin` topic** —— 这是生态收录的发现信号（radar 每 8 小时自动扫描一次）；
3. 在精选目录提交 PR 完成人工收录（见下）。

> 官方立场：社区包与官方包同等重要，官方仓库是「理念、官方示例与灵感来源」，不是强制方向。

## 二、radar 最低收录条件（本仓库对照）

| #   | 条件                                                      | 本仓库状态                                                                 |
| --- | --------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | 仓库公开可访问 + 添加 `dsh-plugin` topic                  | ⏳ 推送后手动添加（发布清单第 1 步）                                       |
| 2   | 根目录合法 `package.json` + 非空 `name`                   | ✅ `name: mapscan-dsh`                                                     |
| 3   | 提供 `main` / `exports` 或明确的 `dsh` 集成入口           | ✅ `main`/`exports` → `src/index.js`；`dsh.entry` → `dist/mapscan-host.js` |
| 4   | README 说明做什么、如何安装、如何卸载、最小使用示例       | ✅ 按 9 章节表重构（Overview→License & security）                          |
| 5   | 运行时依赖在 `dependencies` / `peerDependencies` 显式声明 | ✅ `dependencies: {}`（显式声明零 npm 运行时依赖；宿主为 DSH 0.1.0-rc.6）  |
| 6   | 声明支持的 DSH 版本、快照或已验证 commit                  | ✅ README Compatibility 表（DSH 0.1.0-rc.6 / 2026-08-15）                  |
| 7   | 提供许可证；不提交密钥/个人信息/私有内容                  | ✅ MIT + SECURITY.md 约定                                                  |
| 8   | 包名命名空间归自己控制，不占用 `@dsh-external/*`          | ✅ unscoped `mapscan-dsh`                                                  |

radar 判定层级：**L0 发现（topic）→ L1 清单（package.json/入口）→ L2 静态兼容 → L3 编译实验 → L4 运行实测（k8s agent 实测最小任务）**。
「收录 ≠ 兼容 ≠ 可用 ≠ 安全审计」，四个结论都须同时看：插件 commit、mainline commit、测试日期、测试层级。

## 三、人工精选目录提交规范

**awesome-dsh-plugin（精选列表）**：

1. fork → 在 `README.md` 与 `README.zh.md` 的对应分类各加一行：
   `- [mapscan-dsh](https://github.com/O3SET/dsh-mapscan) — one-line description`
2. 仓库添加 `dsh-plugin` topic（便于他人发现）；
3. 收录后可挂官方 badge：`[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)`。

**awesome-dsh-plugins（radar）**：

1. 给仓库添加 `dsh-plugin` topic，等待下一次自动扫描（约 8 小时）；
2. 在 `PLUGINS.md` 合适分类追加条目（仓库名 + 链接 + 一句话说明）；
3. 对照最低收录条件自检；
4. 按该仓库 PR 模板提交变更，**附上测试环境与结果**（见下节材料）；
5. 不要向目录 PR 复制私有 issue、密钥、成员信息或大段第三方内容。

## 四、收录提交材料（PR 时随附）

> 按实际发布时的环境与结果更新后使用。

```text
## 测试环境
- 插件: mapscan-dsh v1.3.0 (commit <发布 commit>)
- DSH: @deepseek-ai/dsh 0.1.0-rc.6 (2026-08-15 官方快照)
- OS: Windows 11; Node: v24.9.0; curl: 8.21

## 测试层级与结果
- L1 清单: package.json name/main/exports/dsh.entry 齐全 (npm pack --dry-run 通过)
- L2/L3: npm run check 全绿 (ESLint + Prettier + 构建 + node:test 全量通过)
- L4 运行级: DSH 会话内 cordis_define/cordis_run 成功; 6 个工具注册可见 (map_search/
  map_ip_detail/map_stats/map_account/map_dns/map_set_keys); 五平台 API 域名连通性冒烟通过
  (无密钥路径: 各平台返回预期鉴权错误码, 插件正确转译为中文错误信息)
```

## 五、官方开发规范中适用于本仓库的条目

来源：官方 `docs/development.md` / `docs/testing.md` / `docs/defensive-patterns.md`。
本仓库为第三方插件（非核心仓库贡献者），仅吸收适用部分：

| 官方规范                                                      | 本仓库落实                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Node 引擎下限与 CI 矩阵（官方 22.19/24/26）                   | ✅ engines `>=22.19`，CI 矩阵 22.x/24.x/26.x                                   |
| 本地 Git 钩子做快速检查点，CI 负责全量门禁                    | ✅ husky pre-commit（prettier/eslint 增量 + dist 同步），CI 跑 `npm run check` |
| TODO 标记三级：`FIXME`(阻塞发布)/`TODO`(尽快)/`XXX`(有空再说) | ✅ 写入 CONTRIBUTING.md，见下                                                  |
| 测试：真实入口路径而非手工组装                                | ✅ 集成测试以 VM 加载 `dist/mapscan-host.js` 产物（与 DSH 同款包装求值）       |
| 测试：优先真实实现，只 mock 高成本边界（网络/LLM）            | ✅ 纯函数真测；仅 mock ctx.shell/credentials/fs（网络边界）                    |
| 防御：正交结果独立上报                                        | ✅ `curlJson` 分别上报 HTTP status、退出码、stderr，不嵌套推断                 |
| 防御：凭据不进入日志/可预测路径                               | ✅ Key 不落盘不打印；`map_set_keys` 状态只报「已配置」不回显值                 |
| 带密钥 e2e 缺密钥自动跳过                                     | ✅ 无密钥 CI 保持绿色（本仓库无真实密钥测试，连通性冒烟在 DSH 会话内人工执行） |

## 六、发布清单（维护者，推送后执行）

1. `git push` 后到仓库 **Settings → Topics 添加 `dsh-plugin`**（可同时加 `deepseek-harness`、`cyber-mapping`）
2. 确认 CI 徽章生效，取消 README 顶部注释中的徽章行注释
3. 按第四节材料在 radar 提交 PR（或仅等待 8h 自动收录）
4. 按第三节在 awesome-dsh-plugin 提交精选 PR，收录后挂 badge
