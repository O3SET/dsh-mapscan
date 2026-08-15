/**
 * 平台常见错误码 -> 中文提示 (只收录已核实/公开文档确认的码)。
 * @module src/lib/errors
 */

const FOFA_HINTS = {
  '-2': '账号无权限或会员过期, 请到 fofa.info 个人中心核对',
  '-12': '账号扣费异常/欠费, 请检查余额',
  '-15': '查询语句解析失败, 请检查语法',
  '-700': '账号无效或 Key 错误, 请到 fofa.info 个人中心核对',
}

const HUNTER_HINTS = {
  400: '查询参数错误, 请检查语法与参数',
  401: '令牌过期或无效, 请到 hunter.qianxin.com 个人中心重新生成',
  403: '无权访问该接口, 请检查账户权限',
}

/** FOFA errmsg -> 带提示的错误信息 (errmsg 形如 "[-700] 账号无效") */
export function fofaErrMsg(data) {
  const msg = (data && data.errmsg) || '未知错误'
  const code = /\[(-?\d+)\]/.exec(msg)
  const hint = code && FOFA_HINTS[code[1]] ? ` — ${FOFA_HINTS[code[1]]}` : ''
  return `FOFA 返回错误: ${msg}${hint}`
}

/** Hunter 响应 -> 带提示的错误信息 */
export function hunterErrMsg(data) {
  const code = data && data.code
  const msg = (data && (data.message || data.msg)) || '未知错误'
  const hint = code !== undefined && HUNTER_HINTS[code] ? ` — ${HUNTER_HINTS[code]}` : ''
  return `Hunter 返回错误 code=${code}: ${msg}${hint}`
}
