/**
 * 集成测试: 用与 DSH 运行时相同的 vm 包装方式加载 dist/mapscan-host.js,
 * mock 沙箱全局 (harness/ctx.shell/credentials/fs), 端到端调用 5 个工具。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const DIST = fileURLToPath(new URL('../../dist/mapscan-host.js', import.meta.url))

/** mock harness: 记录 defineTool / registerTool 调用 */
function makeHarness() {
  const tools = new Map()
  return {
    tools,
    defineTool(options) {
      return {
        name: options.name,
        description: options.description,
        // 真实运行时会把 parameters 归一化并宿主化 (JSON round-trip), 此处保持一致
        parameters: JSON.parse(JSON.stringify(options.parameters)),
        isConcurrencySafe: options.isConcurrencySafe,
        execute: async (args) => JSON.parse(JSON.stringify(await options.execute(args))),
      }
    },
    registerTool(_ctx, tool) {
      tools.set(tool.name, tool)
      return () => tools.delete(tool.name)
    },
  }
}

/** mock credentials 凭证库 */
function makeCredentials(seed = {}) {
  const store = new Map(Object.entries(seed))
  return {
    store,
    async resolve(ref) {
      const v = store.get(ref)
      return v ? { value: v, source: 'credential-store' } : undefined
    },
    async describe(ref) {
      const v = store.get(ref)
      return v
        ? { configured: true, source: 'credential-store', writable: true }
        : { configured: false, writable: true }
    },
    async set(ref, value) {
      store.set(ref, value)
    },
    async unset(ref) {
      store.delete(ref)
    },
  }
}

/** mock fs (仅用于 save 参数) */
function makeFs() {
  return {
    writes: [],
    async resolve(path) {
      return { key: `t:${path}` }
    },
    processPath(target) {
      return `D:\\ws\\${target.key.slice(2)}`
    },
    async writeText(target, content) {
      this.writes.push({ key: target.key, content })
      return { ok: true }
    },
  }
}

/**
 * mock ctx.shell: 按调用顺序弹出预置响应。
 * 每个响应 { exitCode, stdout, stderr }
 */
function makeShell(responses) {
  const calls = []
  const queue = [...responses]
  return {
    calls,
    run: async (req) => {
      calls.push(req)
      const next = queue.shift()
      if (!next) throw new Error('mock shell 响应队列耗尽')
      return {
        exitCode: next.exitCode ?? 0,
        stdout: { text: next.stdout },
        stderr: { text: next.stderr ?? '' },
      }
    },
  }
}

function makeCtx({ shell, credentials, fs, web } = {}) {
  return {
    get(name) {
      if (name === 'credentials') return credentials
      if (name === 'fs') return fs
      if (name === 'web') return web
      return undefined
    },
    effect(fn) {
      fn()
    },
    shell,
  }
}

async function loadPlugin() {
  const harness = makeHarness()
  const sandbox = {
    console,
    harness,
    btoa: (s) => Buffer.from(s, 'utf8').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
    TextEncoder,
    TextDecoder,
  }
  vm.createContext(sandbox)
  const source = readFileSync(DIST, 'utf8')
  const plugin = await vm.runInContext(`(async () => {\n${source}\n})()`, sandbox)
  return { plugin, harness }
}

// ---------- 预置平台响应样本 ----------

const FOFA_SEARCH_RES = JSON.stringify({
  error: false,
  size: 2,
  page: 1,
  results: [
    [
      '1.2.3.4',
      '443',
      'https',
      'a.example.com',
      'Example Title',
      'example.com',
      'nginx/1.18.0',
      'CN',
      'Beijing',
      'Example Org',
      'Example ISP',
      '12345',
      'Linux',
      'HTTP/1.1 200 OK',
    ],
    [
      '5.6.7.8',
      '80',
      'http',
      'b.example.com',
      '',
      'example.org',
      'nginx',
      'US',
      '',
      '',
      '',
      '',
      '',
      '',
    ],
  ],
  consumed_fpoint: 1,
  rest_fpoint: 99,
})

const SHODAN_SEARCH_RES = JSON.stringify({
  total: 1,
  matches: [
    {
      ip_str: '8.8.8.8',
      port: 443,
      transport: 'tcp',
      hostnames: ['dns.google'],
      product: 'nginx',
      org: 'Google LLC',
      isp: 'Google',
      asn: 'AS15169',
      http: { title: 'Google', server: 'gws', host: 'dns.google' },
      ssl: { cert: { subject: { CN: 'dns.google' }, issuer: { O: 'Google Trust Services' } } },
      location: {
        country_name: 'United States',
        city: 'Mountain View',
        longitude: -122.1,
        latitude: 37.4,
      },
      data: 'HTTP/1.1 200 OK',
      _shodan: { module: 'https' },
      timestamp: '2026-08-01T00:00:00.000000',
    },
  ],
})

const HUNTER_SEARCH_RES = JSON.stringify({
  code: 200,
  message: 'success',
  data: {
    total: 1,
    time: 3,
    arr: [
      {
        ip: '1.1.1.1',
        port: 443,
        protocol: 'https',
        base_protocol: 'tcp',
        domain: 'a.com',
        url: 'https://a.com',
        web_title: '标题',
        status_code: 200,
        component: [{ name: 'nginx', version: '1.20' }],
        is_risk: '0',
        is_web: '1',
        country: '中国',
        city: '北京',
        company: 'ACME',
        updated_at: '2026-08-01',
      },
    ],
    consume_quota: '1',
    rest_quota: '99',
  },
})

const ZOOMEYE_SEARCH_RES = JSON.stringify({
  total: 1,
  matches: [
    {
      ip: '1.2.3.4',
      portinfo: {
        port: 80,
        service: 'http',
        app: 'nginx',
        hostname: 'a.com',
        banner: 'HTTP/1.1 200',
      },
      geoinfo: {
        country: { names: { en: 'China' } },
        city: { names: { en: 'Beijing' } },
        organization: 'Org',
        isp: 'ISP',
        asn: 1234,
      },
      timestamp: '2026-08-01',
    },
  ],
})

const QUAKE_SEARCH_RES = JSON.stringify({
  code: 0,
  message: 'success',
  data: [
    {
      ip: '1.2.3.4',
      port: 443,
      hostname: 'a.com',
      service: { name: 'http/ssl', product: 'nginx', banner: 'HTTP/1.1' },
      os_name: 'Linux',
      components: [{ product_name_en: 'nginx', version: '1.20' }],
      location: { country_cn: '中国', province_cn: '北京', city_cn: '北京' },
      asn: 123,
      org: 'Org',
      time: '2026-08-01',
    },
  ],
  meta: { pagination: { count: 1, page_index: 0, page_size: 20, total: 1 } },
})

const SHODAN_HOST_RES = JSON.stringify({
  ip_str: '8.8.8.8',
  hostnames: ['dns.google'],
  ports: [53, 443],
  os: 'Linux',
  org: 'Google LLC',
  isp: 'Google',
  asn: 'AS15169',
  country_name: 'United States',
  city: 'Mountain View',
  vulns: ['CVE-2016-1234'],
  data: [
    {
      port: 53,
      transport: 'udp',
      product: '',
      data: 'recursion available',
      _shodan: { module: 'dns-udp' },
    },
  ],
})

const FOFA_STATS_RES = JSON.stringify({
  error: false,
  size: 2,
  aggs: {
    title: [
      { name: '登录后台', count: 10 },
      { name: 'nginx', count: 5 },
    ],
  },
})

const QUAKE_USER_RES = JSON.stringify({
  code: 0,
  message: '',
  data: {
    user: { username: 'hunter01' },
    credit: 1000,
    persistent_credit: 500,
    month_remaining_credit: 800,
    ban_status: 'normal',
  },
})

// ---------- 测试 ----------

test('插件注册全部 5 个工具', async () => {
  const { plugin, harness } = await loadPlugin()
  plugin.apply(makeCtx({ shell: makeShell([]) }))
  assert.deepEqual([...harness.tools.keys()].sort(), [
    'map_account',
    'map_dns',
    'map_ip_detail',
    'map_search',
    'map_set_keys',
    'map_stats',
  ])
})

test('只读工具声明 isConcurrencySafe, map_set_keys 保持独占', async () => {
  const { plugin, harness } = await loadPlugin()
  plugin.apply(makeCtx({ shell: makeShell([]) }))
  for (const name of ['map_search', 'map_ip_detail', 'map_stats', 'map_account', 'map_dns']) {
    const tool = harness.tools.get(name)
    assert.equal(typeof tool.isConcurrencySafe, 'function', `${name} 应声明 isConcurrencySafe`)
    assert.equal(tool.isConcurrencySafe({}), true)
  }
  assert.equal(harness.tools.get('map_set_keys').isConcurrencySafe, undefined)
})

test('map_search: 未配置 Key 返回可操作错误', async () => {
  const { plugin, harness } = await loadPlugin()
  plugin.apply(makeCtx({ shell: makeShell([]) }))
  const tool = harness.tools.get('map_search')
  const res = await tool.execute({ platform: 'fofa', query: 'app="nginx"' })
  assert.equal(res.ok, false)
  assert.match(res.error, /map_set_keys/)
  assert.match(res.error, /MAPSCAN_FOFA_API_KEY/)
})

test('map_search: fofa 端到端归一化 + 配额字段', async () => {
  const shell = makeShell([{ stdout: `${FOFA_SEARCH_RES}\n__MAPSCAN_HTTP__:200` }])
  const credentials = makeCredentials({ FOFA_API_KEY: 'K-FOFA' })
  const { plugin, harness } = await loadPlugin()
  plugin.apply(makeCtx({ shell, credentials }))
  const res = await harness.tools.get('map_search').execute({
    platform: 'fofa',
    query: 'app="nginx" && country="CN"',
    size: 20,
  })
  assert.equal(res.ok, true)
  assert.equal(res.total, 2)
  assert.equal(res.returned, 2)
  assert.equal(res.credit.rest_fpoint, 99)
  assert.equal(res.results[0].ip, '1.2.3.4')
  assert.equal(res.results[0].host, 'a.example.com')
  assert.equal(res.results[1].ip, '5.6.7.8')
  assert.equal('title' in res.results[1], false) // 空标题被剔除
  const cmd = shell.calls[0].command
  assert.match(cmd, /fofa\.info\/api\/v1\/search\/all/)
  assert.match(cmd, /&page=1&size=20/)
})

test('map_search: shodan 归一化 (证书/来源/地理)', async () => {
  const shell = makeShell([{ stdout: `${SHODAN_SEARCH_RES}\n__MAPSCAN_HTTP__:200` }])
  const credentials = makeCredentials({ SHODAN_API_KEY: 'K-SHODAN' })
  const { plugin, harness } = await loadPlugin()
  plugin.apply(makeCtx({ shell, credentials }))
  const res = await harness.tools.get('map_search').execute({
    platform: 'shodan',
    query: 'nginx port:443',
    size: 20,
  })
  assert.equal(res.ok, true)
  assert.equal(res.results[0].cert, 'dns.google / Google Trust Services')
  assert.equal(res.results[0].source, 'shodan:https')
  assert.equal(res.results[0].country, 'United States')
})

test('map_search: hunter query 以 URL-safe Base64 传递', async () => {
  const shell = makeShell([{ stdout: `${HUNTER_SEARCH_RES}\n__MAPSCAN_HTTP__:200` }])
  const credentials = makeCredentials({ MAPSCAN_HUNTER_API_KEY: 'K-HUNTER' })
  const { plugin, harness } = await loadPlugin()
  plugin.apply(makeCtx({ shell, credentials }))
  const query = 'web.title="后台"'
  const res = await harness.tools
    .get('map_search')
    .execute({ platform: 'hunter', query, type: 'web' })
  assert.equal(res.ok, true)
  assert.equal(res.results[0].title, '标题')
  const expected = Buffer.from(query, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  assert.match(shell.calls[0].command, new RegExp(`search=${encodeURIComponent(expected)}`))
  assert.match(shell.calls[0].command, /is_web=1/)
})

test('map_search: zoomeye 携带 API-KEY 头', async () => {
  const shell = makeShell([{ stdout: `${ZOOMEYE_SEARCH_RES}\n__MAPSCAN_HTTP__:200` }])
  const credentials = makeCredentials({ MAPSCAN_ZOOMEYE_API_KEY: 'K-ZOOMEYE' })
  const { plugin, harness } = await loadPlugin()
  plugin.apply(makeCtx({ shell, credentials }))
  const res = await harness.tools.get('map_search').execute({
    platform: 'zoomeye',
    query: 'app:"nginx" +country:"CN"',
  })
  assert.equal(res.ok, true)
  assert.equal(res.results[0].product, 'nginx')
  assert.match(shell.calls[0].command, /-H 'API-KEY: K-ZOOMEYE'/)
})

test('map_search: quake POST body 含 start/size 分页', async () => {
  const shell = makeShell([{ stdout: `${QUAKE_SEARCH_RES}\n__MAPSCAN_HTTP__:200` }])
  const credentials = makeCredentials({ MAPSCAN_QUAKE_API_KEY: 'K-QUAKE' })
  const { plugin, harness } = await loadPlugin()
  plugin.apply(makeCtx({ shell, credentials }))
  const res = await harness.tools.get('map_search').execute({
    platform: 'quake',
    query: 'port:"80" AND country:"CN"',
    page: 2,
    size: 20,
  })
  assert.equal(res.ok, true)
  assert.equal(res.results[0].host, 'a.com')
  const cmd = shell.calls[0].command
  assert.match(cmd, /-X POST/)
  assert.match(cmd, /-H 'X-QuakeToken: K-QUAKE'/)
  assert.match(cmd, /"start":20/)
})

test('map_search: save 参数将结果写入文件', async () => {
  const shell = makeShell([{ stdout: `${FOFA_SEARCH_RES}\n__MAPSCAN_HTTP__:200` }])
  const credentials = makeCredentials({ FOFA_API_KEY: 'K-FOFA' })
  const fs = makeFs()
  const { plugin, harness } = await loadPlugin()
  plugin.apply(makeCtx({ shell, credentials, fs }))
  const res = await harness.tools.get('map_search').execute({
    platform: 'fofa',
    query: 'app="nginx"',
    save: 'out.json',
  })
  assert.equal(res.ok, true)
  assert.equal(res.saved, 'D:\\ws\\out.json')
  assert.equal(fs.writes.length, 1)
  assert.ok(fs.writes[0].content.includes('"platform": "fofa"'))
})

test('map_ip_detail: shodan 返回 vulns 与服务列表', async () => {
  const shell = makeShell([{ stdout: `${SHODAN_HOST_RES}\n__MAPSCAN_HTTP__:200` }])
  const credentials = makeCredentials({ SHODAN_API_KEY: 'K-SHODAN' })
  const { plugin, harness } = await loadPlugin()
  plugin.apply(makeCtx({ shell, credentials }))
  const res = await harness.tools
    .get('map_ip_detail')
    .execute({ platform: 'shodan', ip: '8.8.8.8' })
  assert.equal(res.ok, true)
  assert.deepEqual(res.vulns, ['CVE-2016-1234'])
  assert.equal(res.services[0].port, 53)
  assert.equal(res.services[0].source, 'dns-udp')
})

test('map_ip_detail: shodan honeyscore=true 附带蜜罐评分', async () => {
  const shell = makeShell([
    { stdout: `${SHODAN_HOST_RES}\n__MAPSCAN_HTTP__:200` },
    { stdout: `0.3\n__MAPSCAN_HTTP__:200` },
  ])
  const credentials = makeCredentials({ SHODAN_API_KEY: 'K-SHODAN' })
  const { plugin, harness } = await loadPlugin()
  plugin.apply(makeCtx({ shell, credentials }))
  const res = await harness.tools
    .get('map_ip_detail')
    .execute({ platform: 'shodan', ip: '8.8.8.8', honeyscore: true })
  assert.equal(res.ok, true)
  assert.equal(res.honeyscore, 0.3)
  assert.equal(shell.calls.length, 2)
  assert.match(shell.calls[1].command, /labs\/honeyscore\/8\.8\.8\.8/)
})

test('map_ip_detail: honeyscore 失败降级为 honeyscore_error', async () => {
  const shell = makeShell([
    { stdout: `${SHODAN_HOST_RES}\n__MAPSCAN_HTTP__:200` },
    { stdout: `Access denied\n__MAPSCAN_HTTP__:401` },
  ])
  const credentials = makeCredentials({ SHODAN_API_KEY: 'K-SHODAN' })
  const { plugin, harness } = await loadPlugin()
  plugin.apply(makeCtx({ shell, credentials }))
  const res = await harness.tools
    .get('map_ip_detail')
    .execute({ platform: 'shodan', ip: '8.8.8.8', honeyscore: true })
  assert.equal(res.ok, true) // 详情本身成功
  assert.equal('honeyscore' in res, false)
  assert.match(res.honeyscore_error, /响应不是 JSON/)
})

test('map_dns: 批量解析域名返回映射', async () => {
  const shell = makeShell([
    { stdout: `{"example.com":"1.2.3.4","api.example.com":"5.6.7.8"}\n__MAPSCAN_HTTP__:200` },
  ])
  const credentials = makeCredentials({ SHODAN_API_KEY: 'K-SHODAN' })
  const { plugin, harness } = await loadPlugin()
  plugin.apply(makeCtx({ shell, credentials }))
  const res = await harness.tools
    .get('map_dns')
    .execute({ hostnames: 'example.com, api.example.com' })
  assert.equal(res.ok, true)
  assert.deepEqual(res.resolved, { 'example.com': '1.2.3.4', 'api.example.com': '5.6.7.8' })
  assert.match(shell.calls[0].command, /dns\/resolve\?hostnames=example\.com%2Capi\.example\.com/)
})

test('map_dns: 未配置 shodan Key 返回可操作错误', async () => {
  const { plugin, harness } = await loadPlugin()
  plugin.apply(makeCtx({ shell: makeShell([]) }))
  const res = await harness.tools.get('map_dns').execute({ hostnames: 'example.com' })
  assert.equal(res.ok, false)
  assert.match(res.error, /map_set_keys/)
})

test('map_stats: fofa 聚合统计透传 aggs', async () => {
  const shell = makeShell([{ stdout: `${FOFA_STATS_RES}\n__MAPSCAN_HTTP__:200` }])
  const credentials = makeCredentials({ FOFA_API_KEY: 'K-FOFA' })
  const { plugin, harness } = await loadPlugin()
  plugin.apply(makeCtx({ shell, credentials }))
  const res = await harness.tools.get('map_stats').execute({
    platform: 'fofa',
    query: 'app="nginx"',
    fields: 'title,port',
  })
  assert.equal(res.ok, true)
  assert.equal(res.aggregations.title[0].name, '登录后台')
  assert.match(shell.calls[0].command, /fields=title%2Cport/)
})

test('map_account: quake 返回信用额度', async () => {
  const shell = makeShell([{ stdout: `${QUAKE_USER_RES}\n__MAPSCAN_HTTP__:200` }])
  const credentials = makeCredentials({ MAPSCAN_QUAKE_API_KEY: 'K-QUAKE' })
  const { plugin, harness } = await loadPlugin()
  plugin.apply(makeCtx({ shell, credentials }))
  const res = await harness.tools.get('map_account').execute({ platform: 'quake' })
  assert.equal(res.ok, true)
  assert.equal(res.credit, 1000)
  assert.equal(res.month_remaining_credit, 800)
})

test('map_set_keys: 保存后其它平台仍为未配置', async () => {
  const credentials = makeCredentials()
  const { plugin, harness } = await loadPlugin()
  plugin.apply(makeCtx({ shell: makeShell([]), credentials }))
  const tool = harness.tools.get('map_set_keys')
  const res = await tool.execute({ shodan: 'K-SHODAN' })
  assert.equal(res.ok, true)
  assert.match(res.status.shodan, /已保存/)
  assert.equal(credentials.store.get('MAPSCAN_SHODAN_API_KEY'), 'K-SHODAN')
  assert.equal(res.status.fofa, '未配置')
  const status = await tool.execute({})
  assert.match(status.status.shodan, /已配置/)
})

test('map_set_keys: 无 credentials 服务时返回环境变量指引', async () => {
  const { plugin, harness } = await loadPlugin()
  plugin.apply(makeCtx({ shell: makeShell([]) }))
  const res = await harness.tools.get('map_set_keys').execute({})
  assert.equal(res.ok, false)
  assert.match(res.error, /环境变量/)
})

test('工具参数 schema 必备字段齐备', async () => {
  const { plugin, harness } = await loadPlugin()
  plugin.apply(makeCtx({ shell: makeShell([]) }))
  const search = harness.tools.get('map_search')
  assert.deepEqual(search.parameters.required, ['platform', 'query'])
  assert.deepEqual(search.parameters.properties.platform.enum, [
    'fofa',
    'shodan',
    'hunter',
    'zoomeye',
    'quake',
  ])
})
