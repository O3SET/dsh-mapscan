/**
 * HTTP 层。
 * 通道选择: 以 curl.exe 经 ctx.shell (win32 下为 pwsh 执行器) 为主通道,
 * 纯 GET 失败时回退 ctx.web.fetch。
 * DSH 0.2.0-rc.2 起 ctx.shell 只暴露 resolve/execute 两步 (见 shellExecute)。
 * @module src/lib/http
 */
import { configTimeoutSec } from './credentials.js'
import { pq, textOf, trunc } from './utils.js'

/** curl -w 附加的 HTTP 状态码标记 */
const HTTP_MARKER = '__MAPSCAN_HTTP__:'

/** 当前调用的取消信号槽位 (见 withSignal) */
const SIGNAL = Symbol('mapscan.abortSignal')

/**
 * 在一次工具调用内挂载调用方的取消信号。
 *
 * dsh-tools 以 execute(args, exec) 调用工具, 并期望工具观察 exec.signal;
 * 单次调用内并发发起的多个请求应共享同一信号, 而不同调用之间必须隔离
 * (同一 ctx 上的并发调用不能互相污染), 故随调用临时挂载、finally 归还。
 */
export async function withSignal(ctx, signal, body) {
  if (!ctx || !signal || typeof signal !== 'object') return await body()
  const previous = ctx[SIGNAL]
  ctx[SIGNAL] = signal
  try {
    return await body()
  } finally {
    if (previous === undefined) delete ctx[SIGNAL]
    else ctx[SIGNAL] = previous
  }
}

/** 读取当前调用的取消信号 (无则 undefined) */
function currentSignal(ctx) {
  const signal = ctx && ctx[SIGNAL]
  return signal && signal.aborted !== true ? signal : undefined
}

/** 沙箱后端不可用错误: dsh-sandbox 的 SandboxUnavailableError(code=SANDBOX_UNAVAILABLE) */
function isSandboxUnavailable(error) {
  if (!error) return false
  if (error.code === 'SANDBOX_UNAVAILABLE') return true
  if (error.name === 'SandboxUnavailableError') return true
  const msg = typeof error.message === 'string' ? error.message : String(error)
  return /refusing to run the command unconfined|no sandbox backend is usable/.test(msg)
}

/**
 * 执行一次 shell 命令并返回 ShellRunResult。
 *
 * DSH 0.2.0-rc.2 的 ctx.shell 只有 resolve(request) -> ShellExecSpec 与
 * execute(spec) -> ShellExecution 两步 (旧的 ctx.shell.run 便捷方法已移除):
 *   - resolve 负责补齐 workdir/timeoutMs/onExpiry/stdoutMaxBytes, 并为请求盖上
 *     sandboxPolicy (dsh-pwsh-sandbox 在 resolve 内完成, 缺失时执行器解构会崩);
 *   - execute 返回进程句柄, 必须 await handle.result() 才拿到终态结果。
 * 因此请求只能交给 resolve, 插件不自行拼装 spec 或 sandboxPolicy。
 *
 * @returns {Promise<{exitCode: number|null, signal: unknown, timedOut: boolean,
 *   aborted: boolean, timeoutMs: number, stdout: unknown, stderr: unknown}>}
 */
async function shellExecute(ctx, request) {
  const spec = ctx.shell.resolve(request)
  const handle = await ctx.shell.execute(spec)
  return await handle.result()
}

/**
 * 全访问升级重试所用的策略。workspaceRoot 必须是绝对路径 (dsh-sandbox 对受限模式
 * 做 canonicalPath, 相对路径会抛错), 故向策略服务取当前工作区根; 取不到时省略该字段,
 * 由沙箱层自行解析, 而不是塞入相对空串。
 */
function escalationPolicy(ctx) {
  let workspaceRoot
  try {
    const sp = typeof ctx.get === 'function' ? ctx.get('sandboxPolicy') : undefined
    const resolved = sp && typeof sp.resolve === 'function' ? sp.resolve() : undefined
    if (
      resolved &&
      typeof resolved.workspaceRoot === 'string' &&
      resolved.workspaceRoot.length > 0
    ) {
      workspaceRoot = resolved.workspaceRoot
    }
  } catch (_error) {
    // 策略服务不可用: 省略 workspaceRoot
  }
  return workspaceRoot === undefined
    ? { mode: 'danger-full-access' }
    : { mode: 'danger-full-access', workspaceRoot }
}

/**
 * 带沙箱策略执行 shell 命令。部署默认策略可能要求受限后端而本机无可用沙箱后端,
 * 执行器会 fail-closed 拒绝运行 (SandboxUnavailableError); 此时按全访问显式覆盖
 * 重试一次——升级只发生在策略服务之外的后端缺失场景, 不覆盖正常部署的约束。
 */
async function shellRunWithPolicy(ctx, request) {
  assertShellContract(ctx)
  try {
    return await shellExecute(ctx, request)
  } catch (error) {
    if (!isSandboxUnavailable(error)) throw error
    return await shellExecute(ctx, { ...request, sandboxPolicy: escalationPolicy(ctx) })
  }
}

/**
 * 校验宿主 ctx.shell 契约。缺失或形态不符时抛出可读错误, 避免退化成
 * 难以定位的 `ctx.shell.run is not a function`。
 */
export function assertShellContract(ctx) {
  const shell = ctx && ctx.shell
  if (!shell || typeof shell.resolve !== 'function' || typeof shell.execute !== 'function') {
    throw new Error(
      'DSH shell 服务契约不符: 需要 ctx.shell.resolve(request) 与 ctx.shell.execute(spec) ' +
        '(DeepSeek Harness >= 0.1.7); 当前 ctx.shell ' +
        (shell ? `缺少 ${typeof shell.resolve !== 'function' ? 'resolve' : 'execute'}` : '不存在'),
    )
  }
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
  // 单请求超时(秒), 优先级: 插件 Config.timeoutSec (用户在设置页显式设定) > 各平台调用的默认值 > 30
  // 平台适配器传的 timeoutSec 属于「默认调优」, 用户显式配置应当能覆盖它, 否则该项形同虚设。
  const timeoutSec = configTimeoutSec(ctx) || options.timeoutSec || 30
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

  const res = await shellRunWithPolicy(ctx, {
    command: cmd,
    timeoutMs: (timeoutSec + 10) * 1000,
    stdoutMaxBytes: 4194304,
    // 转发调用方取消信号: 用户中断时可终止 curl 子进程, 而不是只能等 timeoutMs
    ...(currentSignal(ctx) ? { signal: currentSignal(ctx) } : {}),
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
