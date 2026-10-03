/**
 * Loader 变体集成测试: 直接以 Node ESM 导入 dist/mapscan-plugin.mjs
 * (无 harness 全局 = 真实 Loader 运行时), 验证经 ctx.tools.register
 * 注册的手写 ToolDefinition 形状与工具行为。
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const PKG_PATH = fileURLToPath(new URL('../../package.json', import.meta.url))

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

test('bundle 契约: 声明 dsh.bundle.patch 且补丁文件存在并挂载本插件', async () => {
  // DSH 的插件清单只把声明了 dsh.bundle.patch 的包当作插件层; 缺了它就会出现
  // 「已安装但检测不到该插件」。这条断言锁死该契约, 防止回归。
  const manifest = JSON.parse(await readFile(PKG_PATH, 'utf8'))
  assert.equal(manifest.name, 'mapscan-dsh')
  assert.equal(typeof manifest.dsh?.bundle?.patch, 'string', '必须声明 dsh.bundle.patch')

  const patchPath = resolve(dirname(PKG_PATH), manifest.dsh.bundle.patch)
  assert.equal(existsSync(patchPath), true, `补丁文件必须存在: ${patchPath}`)

  const patch = await readFile(patchPath, 'utf8')
  // 补丁必须把本插件自己挂载成一行, 否则宿主侧 index 永远不会被 import
  assert.match(patch, /- insert:/)
  assert.match(patch, /id:\s*mapscan-dsh/)
  assert.match(patch, /name:\s*'?mapscan-dsh'?/)

  // 版本兼容声明走 engines.dsh (DshEnginesManifest)
  assert.match(manifest.engines.dsh, /0\.1\.7-rc\.2/)
  // 补丁文件必须随包发布, 否则装到 profile 后读不到
  assert.equal(manifest.files.includes('cordis.patch.yml'), true)
})
