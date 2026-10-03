/**
 * 运行时适配器 — 同一份工具代码在两个运行时复用:
 *   1. 沙箱 (动态插件): 全局存在 harness, 走 harness.defineTool / harness.registerTool
 *   2. Loader (持久化插件): 无 harness, 用真实 ctx.tools.register 注册手写 ToolDefinition
 * 注意: typeof 对未声明标识符是安全的, 两种运行时都不会抛 ReferenceError。
 * @module src/lib/runtime
 */
import { jsonSafe } from './utils.js'

/**
 * 包一层输出收敛: 工具返回值必须是无损 JSON (undefined / 非有限数 / -0 会让 DSH 丢弃整个
 * 结果, 见 utils.jsonSafe)。两个运行时都套用, 保证行为一致。
 */
function withJsonSafe(execute) {
  return async (args, exec) => jsonSafe(await execute(args, exec))
}

/** 构造工具定义: 沙箱走官方 DSL 编译, Loader 下直接透传 (schema 由调用方给出原始 JSON Schema) */
export function defineTool(options) {
  const execute = withJsonSafe(options.execute)
  if (typeof harness !== 'undefined') return harness.defineTool({ ...options, execute })
  return {
    name: options.name,
    description: options.description,
    parameters: options.parameters,
    output: options.output,
    ...(typeof options.isConcurrencySafe === 'function'
      ? { isConcurrencySafe: options.isConcurrencySafe }
      : {}),
    execute,
  }
}

/** 注册工具并返回 disposer: 沙箱走 harness.registerTool, Loader 走 ctx.tools.register */
export function registerTool(ctx, tool) {
  if (typeof harness !== 'undefined') return harness.registerTool(ctx, tool)
  return ctx.tools.register(tool)
}
