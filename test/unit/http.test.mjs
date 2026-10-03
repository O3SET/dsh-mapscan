/**
 * HTTP 层单元测试。
 *
 * mock 严格照 DeepSeek Harness 0.2.0-rc.2 的 ctx.shell 契约构造:
 *   resolve(request) -> ShellExecSpec; execute(spec) -> ShellExecution; await handle.result()
 *   -> { exitCode, signal, timedOut, aborted, timeoutMs, stdout, stderr }
 * 只实现 resolve/execute 两个方法 (不再伪造已移除的 ctx.shell.run), 这样契约漂移会直接
 * 让测试失败, 而不是被自造 mock 掩盖。
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { assertShellContract, curlJson, fetchJson, withSignal } from '../../src/lib/http.js'

/** 一轮 shell 执行的记录 */
function makeHarness(outcomes) {
  const resolved = []
  const specs = []
  let index = 0
  const shell = {
    resolve(request) {
      resolved.push(request)
      // 真实 dsh-pwsh-sandbox 在 resolve 内为请求盖上 sandboxPolicy; 执行器随后解构它
      const current = outcomes[Math.min(index, outcomes.length - 1)]
      return {
        command: request.command,
        workdir: request.workdir ?? 'D:\\ws',
        timeoutMs: request.timeoutMs ?? 120000,
        onExpiry: request.onExpiry ?? 'kill',
        stdoutMaxBytes: request.stdoutMaxBytes ?? 1048576,
        sandboxPolicy: request.sandboxPolicy ?? {
          mode: 'workspace-write',
          workspaceRoot: 'D:\\ws',
        },
        ...(current?.specOverride ?? {}),
      }
    },
    async execute(spec) {
      const current = outcomes[Math.min(index, outcomes.length - 1)]
      index += 1
      specs.push(spec)
      if (current && 'throwOnExecute' in current) throw current.throwOnExecute
      return {
        status: 'completed',
        exitCode: current?.exitCode ?? 0,
        signal: null,
        async result() {
          if (current && 'throwOnResult' in current) throw current.throwOnResult
          return {
            exitCode: current?.exitCode ?? 0,
            signal: null,
            timedOut: current?.timedOut ?? false,
            aborted: current?.aborted ?? false,
            timeoutMs: spec.timeoutMs,
            stdout: { text: current?.stdout ?? '', truncated: false },
            stderr: { text: current?.stderr ?? '', truncated: false },
          }
        },
      }
    },
  }
  return { shell, resolved, specs }
}

/** 便捷构造: 单次成功执行 */
function okShell(stdout, stderr = '', exitCode = 0) {
  return makeHarness([{ stdout, stderr, exitCode }])
}

test('curlJson 解析 JSON 与 HTTP 状态标记', async () => {
  const h = okShell('{"total":2,"matches":[]}\n__MAPSCAN_HTTP__:200')
  const res = await curlJson({ shell: h.shell }, 'https://example.test/api', {})
  assert.equal(res.status, 200)
  assert.deepEqual(res.data, { total: 2, matches: [] })
  const cmd = h.resolved[0].command
  assert.match(cmd, /curl\.exe -s -S/)
  assert.match(cmd, /--retry 1 --retry-delay 1 --retry-connrefused/)
  assert.match(cmd, /-H 'Accept: application\/json'/)
  assert.match(cmd, /-w '\\n__MAPSCAN_HTTP__:%\{http_code\}' 'https:\/\/example\.test\/api'/)
  assert.equal(h.resolved[0].timeoutMs, 40000)
})

test('curlJson 走 resolve -> execute -> result 三步 (0.1.7 契约)', async () => {
  const h = okShell('{"a":1}\n__MAPSCAN_HTTP__:200')
  await curlJson({ shell: h.shell }, 'https://x.test/', {})
  assert.equal(h.resolved.length, 1, 'resolve 必须被调用一次')
  assert.equal(h.specs.length, 1, 'execute 必须收到 resolve 产出的 spec')
  // execute 收到的是 resolve 的返回值本身, 不是原始 request
  assert.equal(h.specs[0].workdir, 'D:\\ws')
})

test('curlJson 不自造 sandboxPolicy, 交由宿主 resolve 决定', async () => {
  const h = okShell('{"a":1}\n__MAPSCAN_HTTP__:200')
  await curlJson({ shell: h.shell }, 'https://x.test/', {})
  assert.equal(
    'sandboxPolicy' in h.resolved[0],
    false,
    '插件不得覆盖部署沙箱策略; 缺失时由 dsh-pwsh-sandbox 在 resolve 内补齐',
  )
  assert.equal(h.specs[0].sandboxPolicy.mode, 'workspace-write')
})

test('curlJson 无可用沙箱后端时按全访问策略重试一次', async () => {
  const refusal = Object.assign(
    new Error(
      'sandbox mode "workspace-write" is requested but no sandbox backend is usable on this host; ' +
        'refusing to run the command unconfined.',
    ),
    { name: 'SandboxUnavailableError', code: 'SANDBOX_UNAVAILABLE' },
  )
  const h = makeHarness([{ throwOnExecute: refusal }, { stdout: '{"ok":1}\n__MAPSCAN_HTTP__:200' }])
  const res = await curlJson({ shell: h.shell }, 'https://x.test/', {})
  assert.deepEqual(res.data, { ok: 1 })
  assert.equal(h.resolved.length, 2)
  assert.equal('sandboxPolicy' in h.resolved[0], false)
  assert.deepEqual(h.resolved[1].sandboxPolicy, { mode: 'danger-full-access' })
})

test('curlJson 升级重试取策略服务的绝对工作区根', async () => {
  const refusal = Object.assign(new Error('no sandbox backend is usable on this host'), {
    code: 'SANDBOX_UNAVAILABLE',
  })
  const h = makeHarness([{ throwOnExecute: refusal }, { stdout: '{"ok":1}\n__MAPSCAN_HTTP__:200' }])
  const sp = { resolve: () => ({ mode: 'workspace-write', workspaceRoot: 'D:\\ws' }) }
  const ctx = { shell: h.shell, get: (name) => (name === 'sandboxPolicy' ? sp : undefined) }
  await curlJson(ctx, 'https://x.test/', {})
  assert.deepEqual(h.resolved[1].sandboxPolicy, {
    mode: 'danger-full-access',
    workspaceRoot: 'D:\\ws',
  })
})

test('curlJson 转发当前调用的取消信号', async () => {
  const controller = new AbortController()
  const h = okShell('{"a":1}\n__MAPSCAN_HTTP__:200')
  const ctx = { shell: h.shell }
  await withSignal(ctx, controller.signal, () => curlJson(ctx, 'https://x.test/', {}))
  assert.equal(h.resolved[0].signal, controller.signal)

  // 无信号时不传该字段 (而非传 undefined)
  const h2 = okShell('{"a":1}\n__MAPSCAN_HTTP__:200')
  await curlJson({ shell: h2.shell }, 'https://x.test/', {})
  assert.equal('signal' in h2.resolved[0], false)
})

test('withSignal 已中止的信号不下传, 且调用后归还槽位', async () => {
  const aborted = AbortSignal.abort()
  const h = okShell('{"a":1}\n__MAPSCAN_HTTP__:200')
  const ctx = { shell: h.shell }
  await withSignal(ctx, aborted, () => curlJson(ctx, 'https://x.test/', {}))
  assert.equal('signal' in h.resolved[0], false, '已中止的信号无需下传')

  // 归还后同一 ctx 的后续调用不受影响
  const h2 = makeHarness([{ stdout: '{"b":2}\n__MAPSCAN_HTTP__:200' }])
  ctx.shell = h2.shell
  await curlJson(ctx, 'https://x.test/', {})
  assert.equal('signal' in h2.resolved[0], false)
})

test('curlJson 仅凭错误消息也识别沙箱后端缺失', async () => {
  const h = makeHarness([
    {
      throwOnExecute: new Error(
        'sandbox mode "workspace-write" is requested but no sandbox backend is usable on this host',
      ),
    },
    { stdout: '{"ok":1}\n__MAPSCAN_HTTP__:200' },
  ])
  const res = await curlJson({ shell: h.shell }, 'https://x.test/', {})
  assert.deepEqual(res.data, { ok: 1 })
  assert.equal(h.resolved.length, 2)
})

test('curlJson 其它 shell 错误不重试', async () => {
  const h = makeHarness([{ throwOnExecute: new Error('some unrelated failure') }])
  await assert.rejects(
    curlJson({ shell: h.shell }, 'https://x.test/', {}),
    /some unrelated failure/,
  )
  assert.equal(h.resolved.length, 1, '非沙箱错误只执行一次')
})

test('curlJson 缺少 resolve/execute 时给出可读契约错误', async () => {
  const legacyRunOnly = { run: async () => ({ exitCode: 0 }) }
  await assert.rejects(
    curlJson({ shell: legacyRunOnly }, 'https://x.test/', {}),
    /DSH shell 服务契约不符: 需要 ctx\.shell\.resolve\(request\) 与 ctx\.shell\.execute\(spec\)/,
  )
})

test('assertShellContract 指出具体缺失的方法', () => {
  assert.throws(() => assertShellContract({ shell: { resolve: () => ({}) } }), /缺少 execute/)
  assert.throws(() => assertShellContract({ shell: { execute: async () => ({}) } }), /缺少 resolve/)
  assert.throws(() => assertShellContract({}), /不存在/)
  assert.throws(() => assertShellContract(undefined), /不存在/)
  // 契约齐备时不抛
  assert.doesNotThrow(() =>
    assertShellContract({ shell: { resolve: () => ({}), execute: async () => ({}) } }),
  )
})

test('curlJson POST 携带 --data-binary 与自定义头', async () => {
  const h = okShell('{"code":0}\n__MAPSCAN_HTTP__:200')
  await curlJson({ shell: h.shell }, 'https://quake.test/api', {
    method: 'POST',
    headers: { 'X-QuakeToken': 'tok' },
    body: '{"query":"x"}',
  })
  const cmd = h.resolved[0].command
  assert.match(cmd, /-X POST/)
  assert.match(cmd, /-H 'Content-Type: application\/json'/)
  assert.match(cmd, /-H 'X-QuakeToken: tok'/)
  assert.match(cmd, /--data-binary '\{"query":"x"\}'/)
})

test('curlJson 单引号注入被转义', async () => {
  const h = okShell('{}\n__MAPSCAN_HTTP__:200')
  await curlJson({ shell: h.shell }, "https://example.test/x'")
  assert.match(h.resolved[0].command, /'https:\/\/example\.test\/x'''/)
})

test('curlJson 非 JSON 响应抛出带状态码错误', async () => {
  const h = okShell('oops\n__MAPSCAN_HTTP__:401')
  await assert.rejects(
    curlJson({ shell: h.shell }, 'https://x.test/', {}),
    /响应不是 JSON \(HTTP 401\)/,
  )
})

test('curlJson 空响应携带 stderr 信息', async () => {
  const h = okShell('', 'connection refused')
  await assert.rejects(curlJson({ shell: h.shell }, 'https://x.test/', {}), /connection refused/)
})

test('curlJson 空响应且 shell 超时时正交上报 timedOut', async () => {
  const h = makeHarness([{ exitCode: null, timedOut: true, stdout: '', stderr: '' }])
  await assert.rejects(curlJson({ shell: h.shell }, 'https://x.test/', {}), /命令超时/)
})

test('curlJson 空响应且 shell 被中止时正交上报 aborted', async () => {
  const h = makeHarness([{ exitCode: null, aborted: true, stdout: '', stderr: '' }])
  await assert.rejects(curlJson({ shell: h.shell }, 'https://x.test/', {}), /命令被中止/)
})

test('curlJson 无标记且退出码为 0 时视为 200', async () => {
  const h = okShell('{"a":1}')
  const res = await curlJson({ shell: h.shell }, 'https://x.test/', {})
  assert.equal(res.status, 200)
})

test('fetchJson 纯 GET 失败时回退 web.fetch', async () => {
  const h = makeHarness([{ throwOnExecute: new Error('shell broken') }])
  const web = {
    fetch: async () => ({ statusCode: 200, body: { kind: 'text', content: '{"ok":1}' } }),
  }
  const ctx = { shell: h.shell, get: (name) => (name === 'web' ? web : undefined) }
  const res = await fetchJson(ctx, 'https://x.test/a', {})
  assert.deepEqual(res.data, { ok: 1 })
})

test('fetchJson 带自定义头时不回退 web.fetch', async () => {
  const h = makeHarness([{ throwOnExecute: new Error('shell broken') }])
  const ctx = { shell: h.shell, get: () => ({ fetch: async () => ({}) }) }
  await assert.rejects(
    fetchJson(ctx, 'https://x.test/a', { headers: { 'API-KEY': 'k' } }),
    /shell broken/,
  )
})

test('fetchJson POST 不回退 web.fetch', async () => {
  const h = makeHarness([{ throwOnExecute: new Error('shell broken') }])
  const ctx = { shell: h.shell, get: () => ({ fetch: async () => ({}) }) }
  await assert.rejects(fetchJson(ctx, 'https://x.test/a', { method: 'POST' }), /shell broken/)
})
