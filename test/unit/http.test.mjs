/**
 * HTTP 层单元测试 (mock ctx.shell)。
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { curlJson, fetchJson } from '../../src/lib/http.js'

/** 构造记录调用参数的 mock shell */
function mockShell(stdout, stderr = '', exitCode = 0) {
  const calls = []
  return {
    calls,
    run: async (req) => {
      calls.push(req)
      return { exitCode, stdout: { text: stdout }, stderr: { text: stderr } }
    },
  }
}

test('curlJson 解析 JSON 与 HTTP 状态标记', async () => {
  const shell = mockShell('{"total":2,"matches":[]}\n__MAPSCAN_HTTP__:200')
  const res = await curlJson({ shell }, 'https://example.test/api', {})
  assert.equal(res.status, 200)
  assert.deepEqual(res.data, { total: 2, matches: [] })
  assert.match(shell.calls[0].command, /curl\.exe -s -S/)
  assert.match(shell.calls[0].command, /-H 'Accept: application\/json'/)
  assert.match(
    shell.calls[0].command,
    /-w '\\n__MAPSCAN_HTTP__:%\{http_code\}' 'https:\/\/example\.test\/api'/,
  )
  assert.equal(shell.calls[0].timeoutMs, 40000)
})

test('curlJson POST 携带 --data-binary 与自定义头', async () => {
  const shell = mockShell('{"code":0}\n__MAPSCAN_HTTP__:200')
  await curlJson({ shell }, 'https://quake.test/api', {
    method: 'POST',
    headers: { 'X-QuakeToken': 'tok' },
    body: '{"query":"x"}',
  })
  const cmd = shell.calls[0].command
  assert.match(cmd, /-X POST/)
  assert.match(cmd, /-H 'Content-Type: application\/json'/)
  assert.match(cmd, /-H 'X-QuakeToken: tok'/)
  assert.match(cmd, /--data-binary '\{"query":"x"\}'/)
})

test('curlJson 单引号注入被转义', async () => {
  const shell = mockShell('{}\n__MAPSCAN_HTTP__:200')
  await curlJson({ shell }, "https://example.test/x'")
  assert.match(shell.calls[0].command, /'https:\/\/example\.test\/x'''/)
})

test('curlJson 非 JSON 响应抛出带状态码错误', async () => {
  const shell = mockShell('oops\n__MAPSCAN_HTTP__:401')
  await assert.rejects(curlJson({ shell }, 'https://x.test/', {}), /响应不是 JSON \(HTTP 401\)/)
})

test('curlJson 空响应携带 stderr 信息', async () => {
  const shell = mockShell('', 'connection refused')
  await assert.rejects(curlJson({ shell }, 'https://x.test/', {}), /connection refused/)
})

test('curlJson 无标记且退出码为 0 时视为 200', async () => {
  const shell = mockShell('{"a":1}')
  const res = await curlJson({ shell }, 'https://x.test/', {})
  assert.equal(res.status, 200)
})

test('fetchJson 纯 GET 失败时回退 web.fetch', async () => {
  const failing = {
    run: async () => {
      throw new Error('shell broken')
    },
  }
  const web = {
    fetch: async () => ({ statusCode: 200, body: { kind: 'text', content: '{"ok":1}' } }),
  }
  const ctx = {
    shell: failing,
    get: (name) => (name === 'web' ? web : undefined),
  }
  const res = await fetchJson(ctx, 'https://x.test/a', {})
  assert.deepEqual(res.data, { ok: 1 })
})

test('fetchJson 带自定义头时不回退 web.fetch', async () => {
  const failing = {
    run: async () => {
      throw new Error('shell broken')
    },
  }
  const ctx = {
    shell: failing,
    get: () => ({ fetch: async () => ({}) }),
  }
  await assert.rejects(
    fetchJson(ctx, 'https://x.test/a', { headers: { 'API-KEY': 'k' } }),
    /shell broken/,
  )
})

test('fetchJson POST 不回退 web.fetch', async () => {
  const failing = {
    run: async () => {
      throw new Error('shell broken')
    },
  }
  const ctx = {
    shell: failing,
    get: () => ({ fetch: async () => ({}) }),
  }
  await assert.rejects(fetchJson(ctx, 'https://x.test/a', { method: 'POST' }), /shell broken/)
})
