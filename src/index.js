/**
 * MapScan 插件入口。
 * 本文件是 DSH 函数体的最后一段: scripts/build.mjs 在拼接后的产物末尾追加 `return plugin`。
 * 沙箱内以 (async () => { <拼接源码> })() 求值, 返回值必须是 Cordis Plugin 对象。
 * @module src/index
 */
import { makeTools } from './tools/index.js'

/** MapScan 插件对象 */
export const plugin = {
  name: 'MapScan 网络空间测绘',
  inject: ['shell'],
  apply(ctx) {
    for (const tool of makeTools(ctx)) {
      // 每个注册 disposer 归属当前 Plugin Fiber, stop/update 时自动回收
      ctx.effect(() => harness.registerTool(ctx, tool))
    }
  },
}
