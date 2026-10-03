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

import { resolveKey } from '../../src/lib/credentials.js'

const PKG_PATH = fileURLToPath(new URL('../../package.json', import.meta.url))

async function loadLoaderPlugin() {
  const url = new URL('../../dist/mapscan-plugin.mjs', import.meta.url)
  const mod = await import(`${url.href}?t=${Date.now()}`)
  return mod.default
}

/** mock 凭证库: 只实现插件用到的 resolve */
function makeCreds(values) {
  return {
    async resolve(ref) {
      return values[ref] === undefined ? undefined : { value: values[ref], source: 'file' }
    },
  }
}

/** mock 真实运行时 ctx (只含插件用到的能力) */
function makeRealCtx({ credentials } = {}) {
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
    get(name) {
      if (name === 'credentials') return credentials
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

test('Config 契约: 必须是 schemastery 原生 schema (否则设置页不出表单)', async () => {
  // DSH 的配置发现 (dsh-tool-cordis/lib/config.js → liveConfig) 用
  // isNativeConfigSchema(config) 判定; 不满足时 status='unsupported', 设置页不生成表单。
  // 该判定要求 Symbol.for('schemastery')===true + 字符串 type + 对象 meta。
  const plugin = await loadLoaderPlugin()
  const config = plugin.Config
  assert.notEqual(config, undefined, '必须导出 Config')

  assert.equal(
    Reflect.get(config, Symbol.for('schemastery')),
    true,
    '必须是 schemastery schema (手写 Standard Schema 能挂载但拿不到表单)',
  )
  assert.equal(typeof config.type, 'string')
  assert.equal(config.meta !== null && typeof config.meta === 'object', true)

  // Cordis 的 resolveConfig 走 Config['~standard'].validate
  const schema = config['~standard']
  assert.equal(typeof schema?.validate, 'function')
  assert.equal(schema.version, 1)
  assert.equal('then' in schema.validate({}), false, 'validate 不能是异步的')

  // 合法输入通过 (schemastery 会把所有字段解析为可变引用, 这里断言取值正确且无 issues)
  const parsed = schema.validate({ fofa: 'K-FOFA', timeoutSec: 45 })
  assert.equal(parsed.issues, undefined)
  const read = (v) => (v && typeof v.get === 'function' ? v.get() : v)
  assert.equal(read(parsed.value.fofa), 'K-FOFA')
  assert.equal(read(parsed.value.timeoutSec), 45)
  assert.equal(read(parsed.value.shodan), undefined, '未填写的 Key 不应有值')
  // 非法输入 -> issues (阻止插件挂载)
  assert.ok(schema.validate({ fofa: 123 }).issues, 'Key 必须是字符串')
  assert.ok(schema.validate({ timeoutSec: 'x' }).issues)

  // 表单可见性: 每个字段都必须 volatile (dsh-settings 的 volatileForm 只投影 volatile 节点)
  const dict = config.dict ?? {}
  assert.deepEqual(Object.keys(dict).sort(), [
    'fofa',
    'hunter',
    'quake',
    'shodan',
    'timeoutSec',
    'zoomeye',
  ])
  for (const key of Object.keys(dict)) {
    assert.equal(dict[key].meta?.volatile, true, `${key} 必须 .volatile(), 否则设置页看不到`)
  }
  for (const key of ['fofa', 'shodan', 'hunter', 'zoomeye', 'quake']) {
    assert.equal(dict[key].meta?.role, 'secret', `${key} 应标记为 secret (读取时抹掉值)`)
  }
})

test('Config 生效: 设置页填的 Key 优先于凭证库, 空则回退', async () => {
  const plugin = await loadLoaderPlugin()

  // 凭证库里有 fofa, Config 也有 fofa -> Config 优先
  const ctx = makeRealCtx({ credentials: makeCreds({ MAPSCAN_FOFA_API_KEY: 'FROM-STORE' }) })
  await plugin.apply(ctx, { fofa: 'FROM-CONFIG' })
  assert.equal(await resolveKey(ctx, 'fofa', undefined), 'FROM-CONFIG')

  // Config 没填 shodan -> 回退凭证库
  assert.equal(await resolveKey(ctx, 'shodan', undefined), undefined)

  // 工具参数 key 仍最高优先
  assert.equal(await resolveKey(ctx, 'fofa', 'EXPLICIT'), 'EXPLICIT')

  // 未挂载 Config 时行为不变 (回退凭证库)
  const bare = makeRealCtx({ credentials: makeCreds({ MAPSCAN_FOFA_API_KEY: 'FROM-STORE' }) })
  await plugin.apply(bare)
  assert.equal(await resolveKey(bare, 'fofa', undefined), 'FROM-STORE')
})

test('Config 生效: timeoutSec 传导到 shell 请求超时', async () => {
  const plugin = await loadLoaderPlugin()
  const calls = []
  const shell = {
    resolve(request) {
      calls.push(request)
      return {
        command: request.command,
        workdir: 'D:\\ws',
        timeoutMs: request.timeoutMs ?? 120000,
        onExpiry: 'kill',
        stdoutMaxBytes: request.stdoutMaxBytes ?? 4194304,
        sandboxPolicy: { mode: 'workspace-write', workspaceRoot: 'D:\\ws' },
      }
    },
    async execute() {
      throw new Error('short-circuit')
    },
  }
  const ctx = {
    tools: { register: () => () => {} },
    effect: (fn) => fn(),
    get: () => undefined,
    shell,
  }
  await plugin.apply(ctx, { timeoutSec: 7 })

  const { curlJson } = await import('../../src/lib/http.js')
  await assert.rejects(curlJson(ctx, 'https://x.test/', {}), /short-circuit/)
  assert.equal(calls[0].timeoutMs, (7 + 10) * 1000, 'Config.timeoutSec 应参与请求超时')

  // 用户显式设定应覆盖平台适配器的默认调优 (平台传 45s, 配置却是 7s -> 用 7s)
  await assert.rejects(curlJson(ctx, 'https://x.test/', { timeoutSec: 45 }), /short-circuit/)
  assert.equal(calls[1].timeoutMs, (7 + 10) * 1000, 'Config 应优先于平台默认调优')

  // 未配置 Config 时回落到平台默认
  const bare = {
    tools: { register: () => () => {} },
    effect: (fn) => fn(),
    get: () => undefined,
    shell,
  }
  await plugin.apply(bare)
  await assert.rejects(curlJson(bare, 'https://x.test/', { timeoutSec: 45 }), /short-circuit/)
  assert.equal(calls[2].timeoutMs, (45 + 10) * 1000, '无 Config 时用平台默认')
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
  // 该行必须带 config 块, 设置页的配置表单才有可编辑的落点
  assert.match(patch, /config:/)
  for (const platform of ['fofa', 'shodan', 'hunter', 'zoomeye', 'quake']) {
    assert.match(patch, new RegExp(`^\\s+${platform}:`, 'm'), `config 应含 ${platform}`)
  }

  // 版本兼容声明走 engines.dsh (DshEnginesManifest)
  assert.match(manifest.engines.dsh, /0\.1\.7-rc\.2/)
  // 补丁文件必须随包发布, 否则装到 profile 后读不到
  assert.equal(manifest.files.includes('cordis.patch.yml'), true)
})
