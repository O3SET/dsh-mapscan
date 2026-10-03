/**
 * 通用工具函数 — 纯函数, 无副作用, 可在单元测试中直接导入。
 * @module src/lib/utils
 */

/** 支持的测绘平台 */
export const PLATFORMS = ['fofa', 'shodan', 'hunter', 'zoomeye', 'quake']

/** banner 等长文本在结果中的截断上限 */
export const MAX_BANNER = 500

/** 去掉值为 undefined / null 的字段 (JSON 序列化时也会被丢弃, 这里提前收敛输出形状) */
export function clean(object) {
  const out = {}
  for (const key of Object.keys(object)) {
    const value = object[key]
    if (value !== undefined && value !== null) out[key] = value
  }
  return out
}

/** 长文本截断, 保留前 limit 个字符并标注原长 */
export function trunc(text, limit) {
  if (typeof text !== 'string') return text
  return text.length > limit ? `${text.slice(0, limit)} …(已截断, 原长 ${text.length})` : text
}

/** 整数收敛: 非法输入回落默认值, 合法输入夹在 [lo, hi] */
export function clampInt(value, lo, hi, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(hi, Math.max(lo, Math.floor(n)))
}

/** 剔除注入值中的换行与 NUL 控制字符 (无正则实现, 规避 no-control-regex) */
export function stripControls(value) {
  return String(value).split('\n').join('').split('\r').join('').split('\u0000').join('')
}

/**
 * pwsh 单引号安全包装。
 * 单引号内一切字面量 (pwsh 语义), 仅需转义 ' -> ''; 换行等控制字符直接剔除。
 */
export function pq(value) {
  return `'${stripControls(value).replace(/'/g, "''")}'`
}

/** CollectedOutput (dsh-subprocess) -> 文本 */
export function textOf(collect) {
  return collect && typeof collect.text === 'string' ? collect.text : ''
}

/**
 * 把任意值收敛为「无损 JSON」(lossless JSON)。
 *
 * DSH 的 dsh-tools 会以 snapshotJsonValue 校验工具返回值 (见 dsh-util-values):
 * 出现 undefined / 函数 / symbol / bigint、非有限数字, 或 -0, 都会判定为
 * "value is not lossless JSON" 并丢弃**整个**结果 (ToolOutputError)。
 * 平台 API 常省略可选字段 (例如 FOFA 不返回 rest_fpoint), 直接透出就会踩中该规则,
 * 故在工具输出边界统一收敛, 而不是逐个平台打补丁。
 *
 * 语义: undefined/函数/symbol -> 丢弃该字段(数组元素按 JSON 规则转 null); 非有限数字与 -0 -> 0;
 * 其余原始值原样保留 (含 false/0/'')。以 JSON 往返实现, 天然消除循环引用的风险面。
 */
export function jsonSafe(value) {
  if (value === undefined) return null
  return JSON.parse(JSON.stringify(value))
}
