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
 * 构建期注入 schemastery 的 Config (仅 Loader/ESM 产物)。
 *
 * 为什么是"注入"而不是 import:
 *   - 动态插件产物 dist/mapscan-host.js 是**函数体**, 没有模块系统, 任何 import 都解析不了;
 *   - 而 DSH 的配置发现 (dsh-tool-cordis/lib/config.js → liveConfig) 用
 *     `isNativeConfigSchema(config)` 判定, 要求对象带 `Symbol.for('schemastery') === true`
 *     + 字符串 `type` + 对象 `meta` (dsh-app-boot/lib/index.js:2162)。
 *     手写 `{ '~standard': { validate } }` 能通过 Cordis 的 resolveConfig 让插件正常挂载,
 *     但判定为 `unsupported`, 设置页就不会生成配置表单。
 * scripts/build.mjs 在产出 dist/mapscan-plugin.mjs 时, 把下面的降级赋值整行替换为真实的
 * schemastery 定义; 动态插件产物保留降级版 (工具与 Key 解析照常可用, 只是没有设置页表单)。
 */

/**
 * 无 schemastery 时的降级 Config (Standard Schema)。
 * 只保证插件能正常挂载与读取配置, 不产出设置页表单。
 */
export const CONFIG_FALLBACK = {
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
        if (typeof raw === 'string' && raw.trim().length > 0) out[platform] = raw.trim()
      }
      const seconds = Number(value.timeoutSec)
      if (Number.isFinite(seconds) && seconds > 0) {
        out.timeoutSec = Math.min(300, Math.max(5, Math.floor(seconds)))
      }
      return { value: out }
    },
  },
}

/** 生效的 Config: ESM 产物由构建换为 schemastery 版本, 其余情形用降级版 */
// eslint-disable-next-line prefer-const -- 构建脚本会在 ESM 产物里重新赋值 (见 scripts/build.mjs)
export let Config = CONFIG_FALLBACK

/** MapScan 插件对象 */
export const plugin = {
  name: 'MapScan 网络空间测绘',
  // shell: HTTP 主通道; tools: 注册工具 (Loader 持久化路径经 ctx.tools.register, 必须显式注入)
  inject: ['shell', 'tools'],
  // getter 而非取值: 构建期注入的 schemastery 版本在对象字面量之后才赋值,
  // 写成 `Config,` 会永久捕获降级版, 导致 DSH 判定 unsupported 而设置页无表单。
  get Config() {
    return Config
  },
  apply(ctx, config) {
    // 配置挂到 ctx 的 symbol 槽位 (不污染 ctx 命名空间), 供 resolveKey 读取
    setConfig(ctx, config)
    for (const tool of makeTools(ctx)) {
      // 每个注册 disposer 归属当前 Plugin Fiber, stop/update 时自动回收
      ctx.effect(() => registerTool(ctx, tool))
    }
  },
}
