/**
 * MapScan 插件入口。
 * 本文件是 DSH 函数体的最后一段: scripts/build.mjs 在拼接后的产物末尾追加 `return plugin`。
 * 沙箱内以 (async () => { <拼接源码> })() 求值, 返回值必须是 Cordis Plugin 对象。
 * @module src/index
 */
import { setConfig } from './lib/credentials.js'
import { makeTools } from './tools/index.js'
import { registerTool } from './tools/common.js'

/** 平台 Key 的配置字段 (插件 Config, 由 DSH 设置页渲染表单) */
export const CONFIG_KEY_FIELDS = ['fofa', 'shodan', 'hunter', 'zoomeye', 'quake']

/**
 * 插件配置 (Standard Schema)。
 *
 * Cordis 的 resolveConfig 无条件取 `Config['~standard'].validate(config)`:
 *   - 必须有 `~standard` (普通字面量对象会在挂载时抛 TypeError 而永不生效);
 *   - 不允许异步 (返回 Promise 会抛 "Async config validation is not supported");
 *   - 返回 { value } 表示通过, { issues } 表示校验失败并阻止插件挂载。
 *
 * 每个字段用 `{ type, description }` 描述, DSH 设置页据此生成输入框。
 * 留空即视为未配置, 回退到凭证库 / 环境变量 (见 lib/credentials.resolveKey)。
 */
export const Config = {
  '~standard': {
    version: 1,
    vendor: 'mapscan-dsh',
    validate(value) {
      if (value === undefined || value === null) return { value: {} }
      if (typeof value !== 'object' || Array.isArray(value)) {
        return { issues: [{ message: 'mapscan-dsh: config 必须是对象' }] }
      }
      const out = {}
      for (const platform of CONFIG_KEY_FIELDS) {
        const raw = value[platform]
        if (raw === undefined || raw === null) continue
        if (typeof raw !== 'string') {
          return { issues: [{ message: `mapscan-dsh: config.${platform} 必须是字符串` }] }
        }
        const key = raw.trim()
        if (key.length > 0) out[platform] = key
      }
      if (value.timeoutSec !== undefined && value.timeoutSec !== null) {
        const seconds = Number(value.timeoutSec)
        if (!Number.isFinite(seconds) || seconds <= 0) {
          return { issues: [{ message: 'mapscan-dsh: config.timeoutSec 必须是正数' }] }
        }
        // 与各平台单请求超时同一口径: 夹在 5~300 秒
        out.timeoutSec = Math.min(300, Math.max(5, Math.floor(seconds)))
      }
      return { value: out }
    },
  },
}

/** MapScan 插件对象 */
export const plugin = {
  name: 'MapScan 网络空间测绘',
  // shell: HTTP 主通道; tools: 注册工具 (Loader 持久化路径经 ctx.tools.register, 必须显式注入)
  inject: ['shell', 'tools'],
  Config,
  apply(ctx, config) {
    // 配置挂到 ctx 的 symbol 槽位 (不污染 ctx 命名空间), 供 resolveKey 读取
    setConfig(ctx, config)
    for (const tool of makeTools(ctx)) {
      // 每个注册 disposer 归属当前 Plugin Fiber, stop/update 时自动回收
      ctx.effect(() => registerTool(ctx, tool))
    }
  },
}
