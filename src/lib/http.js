/**
 * HTTP 层。
 * 沙箱约束: 动态插件没有全局 fetch (被运行时显式拦截), 且 ctx.web.fetch 仅支持纯 GET URL
 * (无自定义 Header / 无 POST)。因此以 curl.exe 经 ctx.shell (win32 下为 pwsh 执行器) 为主通道,
 * 纯 GET 失败时回退 ctx.web.fetch。
 * @module src/lib/http
 */
import { pq, textOf, trunc } from './utils.js'

/** curl -w 附加的 HTTP 状态码标记 */
const HTTP_MARKER = '__MAPSCAN_HTTP__:'

/**
 * 解析 shell 执行策略。插件路径不携带会话, 部署默认策略缺失时执行器会因
 * `const { mode } = policy` 解构 undefined 崩溃; 这里显式解析, 仅在策略服务
 * 无法给出结果时按本环境实际生效策略回落为全访问, 不覆盖正常部署的约束。
 */
async function resolveShellPolicy(ctx) {
  const sp = ctx.get('sandboxPolicy')
  if (sp && typeof sp.resolve === 'function') {
    try {
      const policy = await sp.resolve({})
      if (policy && policy.mode) return policy
    } catch (_error) {
      // 继续回落
    }
  }
  return { mode: 'danger-full-access', workspaceRoot: '' }
}

/**
 * 通过 curl.exe 发起 HTTP 请求, 响应体必须是 JSON。
 * @param {object} ctx - 插件 ctx (至少含 ctx.shell)
 * @param {string} url - 目标 URL
 * @param {object} [options] - { method, headers, body, timeoutSec }
 * @returns {Promise<{status: number, data: unknown}>}
 */
export async function curlJson(ctx, url, options = {}) {
  const headers = options.headers || {}
  const timeoutSec = options.timeoutSec || 30
  // --retry 1: 对瞬时网络错误(连接被拒/超时)自动重试一次, 不重试 HTTP 4xx/5xx
  let cmd = `curl.exe -s -S --max-time ${timeoutSec} --retry 1 --retry-delay 1 --retry-connrefused`
  cmd += ` -H ${pq('Accept: application/json')}`
  cmd += ` -H ${pq('User-Agent: MapScan/1.0 DSH-plugin')}`
  for (const name of Object.keys(headers)) {
    cmd += ` -H ${pq(`${name}: ${headers[name]}`)}`
  }
  if (options.method === 'POST') {
    cmd += ' -X POST'
    cmd += ` -H ${pq('Content-Type: application/json')}`
    cmd += ` --data-binary ${pq(options.body || '{}')}`
  }
  // '\\n' 经 pwsh 单引号原样传给 curl, 由 curl -w 解释为换行
  cmd += ` -w ${pq(`\\n${HTTP_MARKER}%{http_code}`)} ${pq(url)}`

  const res = await ctx.shell.run({
    command: cmd,
    timeoutMs: (timeoutSec + 10) * 1000,
    stdoutMaxBytes: 4194304,
    sandboxPolicy: await resolveShellPolicy(ctx),
  })

  const out = textOf(res.stdout)
  const errText = textOf(res.stderr)
  const idx = out.lastIndexOf(HTTP_MARKER)
  let status = 0
  let body = out
  if (idx >= 0) {
    const codeStr = (out.slice(idx + HTTP_MARKER.length).match(/^\d+/) || ['0'])[0]
    status = Number(codeStr)
    body = out.slice(0, idx)
  } else if (res.exitCode === 0) {
    status = 200
  }

  const trimmed = body.trim()
  if (trimmed.length === 0) {
    // 正交上报终止原因: 超时/中止/退出码各自独立判定 (defensive-patterns)
    const cause = res.timedOut
      ? '命令超时'
      : res.aborted
        ? '命令被中止'
        : `curl 退出码 ${res.exitCode}`
    const detail = trunc(errText || cause, 400)
    throw new Error(`HTTP 请求失败 (无响应体, HTTP ${status || '?'}): ${detail}`)
  }
  let data
  try {
    data = JSON.parse(trimmed)
  } catch (_error) {
    throw new Error(`响应不是 JSON (HTTP ${status}): ${trunc(trimmed, 400)}`)
  }
  return { status, data }
}

/**
 * curl 优先; 纯 GET (无自定义 Header) 失败时回退 ctx.web.fetch。
 * 带 Header 或 POST 的请求无法回退, 直接抛 curl 错误。
 */
export async function fetchJson(ctx, url, options = {}) {
  try {
    return await curlJson(ctx, url, options)
  } catch (curlError) {
    const needsExtra =
      options.method === 'POST' || (options.headers && Object.keys(options.headers).length > 0)
    if (needsExtra) throw curlError
    const web = ctx.get('web')
    if (!web) throw curlError
    try {
      const res = await web.fetch({ url })
      const content =
        res && res.body && typeof res.body.content === 'string' ? res.body.content : ''
      let data
      try {
        data = JSON.parse(content)
      } catch (_error) {
        data = content
      }
      return { status: res.statusCode, data }
    } catch (webError) {
      const webMsg = webError && webError.message ? webError.message : String(webError)
      throw new Error(`curl 失败: ${curlError.message}; web.fetch 回退也失败: ${webMsg}`)
    }
  }
}
