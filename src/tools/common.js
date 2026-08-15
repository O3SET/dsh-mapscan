/**
 * 工具定义公共件: output.render / 错误对象 / 输出 schema。
 * 说明: DSH 动态工具要求 output.schema 强制执行, 这里使用注解型 { type: 'json' } 接受任意可序列化值;
 * render 必须返回 ContentBlock 数组。
 * @module src/tools/common
 */
import { trunc } from '../lib/utils.js'
export { defineTool, registerTool } from '../lib/runtime.js'

/** output.render: 业务错误或结果 -> 纯文本块 */
export function textRender(_args, value) {
  const text =
    value && value.ok === false ? `✗ MapScan 错误: ${value.error}` : JSON.stringify(value, null, 2)
  return [{ type: 'text', text }]
}

/** 构造 { ok:false, error } 业务错误对象 */
export function toolError(prefix, error) {
  const message = error && error.message ? error.message : String(error)
  return { ok: false, error: `${prefix}: ${trunc(message, 800)}` }
}

/**
 * 各工具复用的输出定义。
 * 沙箱下用注解型 { type: 'json' }; Loader(真实运行时)下用原始 JSON Schema 空对象(接受任意值)。
 */
export const JSON_OUTPUT = {
  schema: typeof harness !== 'undefined' ? { type: 'json' } : {},
  render: textRender,
}
