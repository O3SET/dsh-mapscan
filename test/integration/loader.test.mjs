/**
 * Loader 变体集成测试: 直接以 Node ESM 导入 dist/mapscan-plugin.mjs
 * (无 harness 全局 = 真实 Loader 运行时), 验证经 ctx.tools.register
 * 注册的手写 ToolDefinition 形状与工具行为。
 */
import assert from 'node:assert/strict'
import test from 'node:test'

async function loadLoaderPlugin() {
  const url = new URL('../../dist/mapscan-plugin.mjs', import.meta.url)
  const mod = await import(`${url.href}?t=${Date.now()}`)
  return mod.default
}

/** mock 真实运行时 ctx (只含插件用到的能力) */
function makeRealCtx() {
  const registered = []
  return {
    registered,
    tools: {
      register(def) {
        registered.push(def)
        return () => {}
      },
    },
    effect(fn) {
      const dispose = fn()
      if (typeof dispose === 'function') dispose()
    },
    get() {
      return undefined
    },
  }
}

test('Loader 变体: 默认导出插件对象且声明 shell 依赖', async () => {
  const plugin = await loadLoaderPlugin()
  assert.equal(typeof plugin.apply, 'function')
  assert.deepEqual(plugin.inject, ['shell', 'tools'])
})

test('Loader 变体: 经 ctx.tools.register 注册全部 6 个工具', async () => {
  const plugin = await loadLoaderPlugin()
  const ctx = makeRealCtx()
  await plugin.apply(ctx)
  assert.deepEqual(ctx.registered.map((t) => t.name).sort(), [
    'map_account',
    'map_dns',
    'map_ip_detail',
    'map_search',
    'map_set_keys',
    'map_stats',
  ])
})

test('Loader 变体: 手写 ToolDefinition 形状齐备', async () => {
  const plugin = await loadLoaderPlugin()
  const ctx = makeRealCtx()
  await plugin.apply(ctx)
  const search = ctx.registered.find((t) => t.name === 'map_search')
  assert.equal(typeof search.description, 'string')
  assert.equal(search.parameters.type, 'object')
  assert.deepEqual(search.parameters.required, ['query']) // platform 可选: 缺省自动联合已配置平台
  assert.deepEqual(search.parameters.properties.platform.enum, [
    'fofa',
    'shodan',
    'hunter',
    'zoomeye',
    'quake',
    'all',
    'auto',
  ])
  // Loader(真实运行时)下 output.schema 为原始空 JSON Schema (接受任意值)
  assert.deepEqual(search.output.schema, {})
  assert.equal(typeof search.output.render, 'function')
  assert.equal(typeof search.execute, 'function')
  assert.equal(search.isConcurrencySafe({}), true)
})

test('Loader 变体: execute 在无 Key 时返回可操作错误', async () => {
  const plugin = await loadLoaderPlugin()
  const ctx = makeRealCtx()
  await plugin.apply(ctx)
  const search = ctx.registered.find((t) => t.name === 'map_search')
  const res = await search.execute({ platform: 'fofa', query: 'app="nginx"' })
  assert.equal(res.ok, false)
  assert.match(res.error, /MAPSCAN_FOFA_API_KEY/)
})
