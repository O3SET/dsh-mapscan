// ============================================================
// MapScan — 网络空间测绘综合插件 (FOFA / Shodan / Hunter / ZoomEye / Quake)
// 本文件由 scripts/build.mjs 自动生成, 请勿手工编辑; 修改请编辑 src/** 后重新构建。
// 用法: 将本文件整体作为 Dynamic Cordis Plugin 的 code.host (函数体) 使用。
// ============================================================
// ---- src/lib/utils.js ----
/**
 * 通用工具函数 — 纯函数, 无副作用, 可在单元测试中直接导入。
 * @module src/lib/utils
 */

/** 支持的测绘平台 */
const PLATFORMS = ['fofa', 'shodan', 'hunter', 'zoomeye', 'quake']

/** banner 等长文本在结果中的截断上限 */
const MAX_BANNER = 500

/** 去掉值为 undefined / null 的字段 (JSON 序列化时也会被丢弃, 这里提前收敛输出形状) */
function clean(object) {
  const out = {}
  for (const key of Object.keys(object)) {
    const value = object[key]
    if (value !== undefined && value !== null) out[key] = value
  }
  return out
}

/** 长文本截断, 保留前 limit 个字符并标注原长 */
function trunc(text, limit) {
  if (typeof text !== 'string') return text
  return text.length > limit ? `${text.slice(0, limit)} …(已截断, 原长 ${text.length})` : text
}

/** 整数收敛: 非法输入回落默认值, 合法输入夹在 [lo, hi] */
function clampInt(value, lo, hi, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(hi, Math.max(lo, Math.floor(n)))
}

/** 剔除注入值中的换行与 NUL 控制字符 (无正则实现, 规避 no-control-regex) */
function stripControls(value) {
  return String(value).split('\n').join('').split('\r').join('').split('\u0000').join('')
}

/**
 * pwsh 单引号安全包装。
 * 单引号内一切字面量 (pwsh 语义), 仅需转义 ' -> ''; 换行等控制字符直接剔除。
 */
function pq(value) {
  return `'${stripControls(value).replace(/'/g, "''")}'`
}

/** CollectedOutput (dsh-subprocess) -> 文本 */
function textOf(collect) {
  return collect && typeof collect.text === 'string' ? collect.text : ''
}


// ---- src/lib/http.js ----
/**
 * HTTP 层。
 * 沙箱约束: 动态插件没有全局 fetch (被运行时显式拦截), 且 ctx.web.fetch 仅支持纯 GET URL
 * (无自定义 Header / 无 POST)。因此以 curl.exe 经 ctx.shell (win32 下为 pwsh 执行器) 为主通道,
 * 纯 GET 失败时回退 ctx.web.fetch。
 * @module src/lib/http
 */

/** curl -w 附加的 HTTP 状态码标记 */
const HTTP_MARKER = '__MAPSCAN_HTTP__:'

/**
 * 通过 curl.exe 发起 HTTP 请求, 响应体必须是 JSON。
 * @param {object} ctx - 插件 ctx (至少含 ctx.shell)
 * @param {string} url - 目标 URL
 * @param {object} [options] - { method, headers, body, timeoutSec }
 * @returns {Promise<{status: number, data: unknown}>}
 */
async function curlJson(ctx, url, options = {}) {
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
async function fetchJson(ctx, url, options = {}) {
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


// ---- src/lib/credentials.js ----
/**
 * API Key 解析与持久化 (凭证库 / 环境变量)。
 * 凭证引用即 POSIX 风格环境变量名: 同名环境变量优先于凭证库, 见 dsh-credentials seam。
 * @module src/lib/credentials
 */

/** 各平台 Key 的持久化引用名 (map_set_keys 写入凭证库时使用) */
const PRIMARY_REFS = {
  fofa: 'MAPSCAN_FOFA_API_KEY',
  shodan: 'MAPSCAN_SHODAN_API_KEY',
  hunter: 'MAPSCAN_HUNTER_API_KEY',
  zoomeye: 'MAPSCAN_ZOOMEYE_API_KEY',
  quake: 'MAPSCAN_QUAKE_API_KEY',
}

/** 平台社区惯用环境变量名 (次优先, 便于复用既有环境配置) */
const FALLBACK_REFS = {
  fofa: ['FOFA_API_KEY'],
  shodan: ['SHODAN_API_KEY'],
  hunter: ['HUNTER_API_KEY'],
  zoomeye: ['ZOOMEYE_API_KEY'],
  quake: ['QUAKE_API_KEY'],
}

/**
 * 解析平台 Key, 优先级: 显式参数 > PRIMARY 引用 > FALLBACK 引用。
 * @returns {Promise<string | undefined>}
 */
async function resolveKey(ctx, platform, explicit) {
  if (explicit && String(explicit).length > 0) return String(explicit)
  const creds = ctx.get('credentials')
  const refs = [PRIMARY_REFS[platform]].concat(FALLBACK_REFS[platform] || [])
  if (creds) {
    for (const ref of refs) {
      try {
        const resolved = await creds.resolve(ref)
        if (resolved && resolved.value) return resolved.value
      } catch (_error) {
        // 尝试下一个引用名
      }
    }
  }
  return undefined
}

/**
 * map_set_keys 业务逻辑: 保存 / 删除 / 查看各平台 Key 配置状态。
 */
async function setKeys(ctx, args) {
  const creds = ctx.get('credentials')
  if (!creds) {
    return {
      ok: false,
      error:
        '当前环境未挂载凭证服务(credentials)，无法持久化 Key。可改用环境变量: ' +
        PLATFORMS.map((p) => PRIMARY_REFS[p]).join(' / '),
    }
  }

  const removeList = Array.isArray(args.remove) ? args.remove : []
  const report = {}

  for (const p of removeList) {
    if (!PRIMARY_REFS[p]) continue
    try {
      await creds.unset(PRIMARY_REFS[p])
      report[p] = '已删除存储的 Key'
    } catch (_error) {
      report[p] =
        `删除失败: ${trunc(_error && _error.message ? _error.message : String(_error), 200)}`
    }
  }

  for (const p of PLATFORMS) {
    const value = args[p]
    if (typeof value === 'string' && value.length > 0) {
      try {
        await creds.set(PRIMARY_REFS[p], value)
        report[p] = '已保存 (来源: 凭证库)'
      } catch (_error) {
        report[p] =
          `保存失败: ${trunc(_error && _error.message ? _error.message : String(_error), 200)}`
      }
    } else if (report[p] === undefined) {
      try {
        const info = await creds.describe(PRIMARY_REFS[p])
        if (info && info.configured) {
          let viaEnv = false
          for (const ref of FALLBACK_REFS[p] || []) {
            try {
              const resolved = await creds.resolve(ref)
              if (resolved && resolved.value) viaEnv = true
            } catch (_error) {
              // 忽略
            }
          }
          report[p] =
            `已配置 (来源: ${info.source || '未知'})` + (viaEnv ? '; 另有环境变量生效' : '')
        } else {
          report[p] = '未配置'
        }
      } catch (_error) {
        report[p] =
          `状态未知: ${trunc(_error && _error.message ? _error.message : String(_error), 200)}`
      }
    }
  }

  return {
    ok: true,
    hint:
      `Key 引用名: ${JSON.stringify(PRIMARY_REFS)}; ` +
      '同名环境变量(或 FOFA_API_KEY / SHODAN_API_KEY / HUNTER_API_KEY / ZOOMEYE_API_KEY / QUAKE_API_KEY)会优先于凭证库生效',
    status: report,
  }
}


// ---- src/lib/errors.js ----
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
function fofaErrMsg(data) {
  const msg = (data && data.errmsg) || '未知错误'
  const code = /\[(-?\d+)\]/.exec(msg)
  const hint = code && FOFA_HINTS[code[1]] ? ` — ${FOFA_HINTS[code[1]]}` : ''
  return `FOFA 返回错误: ${msg}${hint}`
}

/** Hunter 响应 -> 带提示的错误信息 */
function hunterErrMsg(data) {
  const code = data && data.code
  const msg = (data && (data.message || data.msg)) || '未知错误'
  const hint = code !== undefined && HUNTER_HINTS[code] ? ` — ${HUNTER_HINTS[code]}` : ''
  return `Hunter 返回错误 code=${code}: ${msg}${hint}`
}


// ---- src/lib/summary.js ----
/**
 * 搜索结果聚合摘要 — 供模型快速解读大批量结果 (唯一 IP / Top 端口 / Top 产品 / Top 国家)。
 * @module src/lib/summary
 */

function topN(map, n) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, n)
    .map(([name, count]) => ({ name, count }))
}

function bump(map, key) {
  map.set(key, (map.get(key) || 0) + 1)
}

/** 归一化结果数组 -> 摘要统计 */
function summarize(results) {
  const ips = new Set()
  const ports = new Map()
  const products = new Map()
  const countries = new Map()
  for (const r of results) {
    if (r.ip) ips.add(String(r.ip))
    if (r.port !== undefined && r.port !== null) bump(ports, String(r.port))
    if (r.product) bump(products, String(r.product))
    if (r.country) bump(countries, String(r.country))
  }
  return {
    unique_ips: ips.size,
    top_ports: topN(ports, 10),
    top_products: topN(products, 10),
    top_countries: topN(countries, 10),
  }
}


// ---- src/platforms/fofa.js ----
/**
 * FOFA (fofa.info) 适配: 搜索 / IP 详情 / 聚合统计 / 账户配额。
 * API 契约: https://fofa.info/api (search/all, search/stats, host/{ip}, info/my)
 * @module src/platforms/fofa
 */

const FOFA_BASE = 'https://fofa.info/api/v1'

/** map_search 默认返回字段 */
const DEFAULT_FOFA_FIELDS =
  'ip,port,protocol,host,title,domain,server,country,city,org,isp,as_number,os,banner'

/** search/all — 返回 { total, results[], credit } */
async function searchFofa(ctx, args, key) {
  const fields = String(args.fields || DEFAULT_FOFA_FIELDS).slice(0, 400)
  const page = clampInt(args.page, 1, 10000, 1)
  const size = clampInt(args.size, 1, 100, 20)
  const qbase64 = btoa(String(args.query || ''))
  let url =
    `${FOFA_BASE}/search/all?key=${encodeURIComponent(key)}` +
    `&qbase64=${encodeURIComponent(qbase64)}` +
    `&fields=${encodeURIComponent(fields)}` +
    `&page=${page}&size=${size}`
  if (args.full === true) url += '&full=true'
  const { data } = await fetchJson(ctx, url, { timeoutSec: 45 })
  if (!data || data.error) {
    throw new Error(fofaErrMsg(data))
  }
  const fl = fields.split(',').map((s) => s.trim())
  const rows = Array.isArray(data.results) ? data.results : []
  const results = rows.map((row) => normalizeFofa(fl, row))
  return {
    platform: 'fofa',
    query: args.query,
    page,
    size,
    total: data.size || results.length,
    returned: results.length,
    credit: { consumed_fpoint: data.consumed_fpoint, rest_fpoint: data.rest_fpoint },
    results,
  }
}

/** FOFA 行数组 -> 归一化对象 */
function normalizeFofa(fields, row) {
  const o = {}
  for (let i = 0; i < fields.length; i++) {
    const v = row[i]
    if (v !== undefined && v !== null && v !== '') o[fields[i]] = v
  }
  return clean({
    ip: o.ip,
    port: o.port,
    protocol: o.protocol,
    transport: o.base_protocol,
    host: o.host,
    domain: o.domain,
    cname: o.cname,
    title: trunc(o.title, 200),
    url: o.url,
    server: o.server,
    banner: trunc(o.banner, MAX_BANNER),
    os: o.os,
    org: o.org || o.as_organization,
    isp: o.isp,
    asn: o.as_number,
    country: o.country || o.country_name,
    city: o.city,
    longitude: o.longitude,
    latitude: o.latitude,
    cert: trunc(o.cert_issuer || o.cert_subject, 200),
    icp: o.icp,
    jarm: o.jarm,
    icon_hash: o.icon_hash,
    time: o.lastupdatetime,
    source: 'fofa',
  })
}

/** host/{ip} — 单 IP 详情 (端口 / 历史记录) */
async function detailFofa(ctx, ip, key) {
  const url = `${FOFA_BASE}/host/${encodeURIComponent(ip)}?key=${encodeURIComponent(key)}&detail=true`
  const { data } = await fetchJson(ctx, url, { timeoutSec: 30 })
  if (!data || data.error) {
    throw new Error(fofaErrMsg(data))
  }
  return clean({
    platform: 'fofa',
    ip: data.ip,
    host: data.host,
    asn: data.asn,
    org: data.org,
    country: data.country_name,
    country_code: data.country_code,
    protocols: Array.isArray(data.protocol) ? data.protocol : undefined,
    ports: Array.isArray(data.ports) ? data.ports.slice(0, 200) : undefined,
    ports_count: Array.isArray(data.ports) ? data.ports.length : undefined,
    updated: data.lastupdatetime,
  })
}

/** search/stats — 字段聚合统计 (fields <= 5) */
async function statsFofa(ctx, args, key) {
  const fields = String(args.fields || 'title').slice(0, 200)
  const size = clampInt(args.size, 1, 5, 5)
  const qbase64 = btoa(String(args.query || ''))
  const url =
    `${FOFA_BASE}/search/stats?key=${encodeURIComponent(key)}` +
    `&qbase64=${encodeURIComponent(qbase64)}` +
    `&fields=${encodeURIComponent(fields)}&size=${size}`
  const { data } = await fetchJson(ctx, url, { timeoutSec: 45 })
  if (!data || data.error) {
    throw new Error(fofaErrMsg(data))
  }
  return {
    platform: 'fofa',
    query: args.query,
    fields,
    aggregations: data.aggs || {},
  }
}

/** info/my — 账户与配额 */
async function accountFofa(ctx, key) {
  const { data } = await fetchJson(ctx, `${FOFA_BASE}/info/my?key=${encodeURIComponent(key)}`, {
    timeoutSec: 30,
  })
  if (!data || data.error) {
    throw new Error(fofaErrMsg(data))
  }
  return clean({
    platform: 'fofa',
    email: data.email,
    username: data.username,
    fcoin: data.fcoin,
    fofa_point: data.fofa_point,
    isvip: data.isvip,
    vip_level: data.vip_level,
  })
}


// ---- src/platforms/shodan.js ----
/**
 * Shodan (shodan.io) 适配: 搜索 / IP 详情 / 总数统计 / 账户配额。
 * API 契约: https://developer.shodan.io/api (host/search, host/{ip}, host/count, api-info)
 * @module src/platforms/shodan
 */

const SHODAN_BASE = 'https://api.shodan.io'

/** host/search — 返回 { total, results[] } */
async function searchShodan(ctx, args, key) {
  const page = clampInt(args.page, 1, 10000, 1)
  const size = clampInt(args.size, 1, 100, 20)
  const url =
    `${SHODAN_BASE}/shodan/host/search?key=${encodeURIComponent(key)}` +
    `&query=${encodeURIComponent(String(args.query || ''))}` +
    `&page=${page}&minify=false`
  const { data } = await fetchJson(ctx, url, { timeoutSec: 45 })
  if (!data || typeof data.total !== 'number') {
    throw new Error(`Shodan 返回异常: ${trunc(JSON.stringify(data), 300)}`)
  }
  const matches = (Array.isArray(data.matches) ? data.matches : []).slice(0, size)
  const results = matches.map(normalizeShodan)
  return {
    platform: 'shodan',
    query: args.query,
    page,
    size,
    total: data.total,
    returned: results.length,
    results,
  }
}

/** Shodan match -> 归一化对象 */
function normalizeShodan(m) {
  const loc = m.location || {}
  const http = m.http || {}
  const ssl = m.ssl || {}
  const cert = ssl.cert || {}
  const subject = cert.subject || {}
  const issuer = cert.issuer || {}
  const shodan = m._shodan || {}
  const hostnames = Array.isArray(m.hostnames) ? m.hostnames : []
  const certText = (subject.CN || subject.commonName || '') + (issuer.O ? ` / ${issuer.O}` : '')
  return clean({
    ip: m.ip_str,
    port: m.port,
    transport: m.transport,
    protocol: m.transport || (http ? 'http' : undefined),
    host: hostnames[0],
    hostnames: hostnames.slice(0, 5),
    title: trunc(http.title, 200),
    server: http.server,
    product: m.product,
    version: m.version,
    os: m.os,
    org: m.org,
    isp: m.isp,
    asn: m.asn,
    country: loc.country_name,
    city: loc.city,
    longitude: loc.longitude,
    latitude: loc.latitude,
    banner: trunc(m.data, MAX_BANNER),
    cert: certText.length > 0 ? trunc(certText, 200) : undefined,
    cname: http.host,
    source: shodan.module ? `shodan:${shodan.module}` : 'shodan',
    time: m.timestamp,
  })
}

/** host/{ip} — 单 IP 详情 (服务列表 / SSL / CVE vulns) */
async function detailShodan(ctx, ip, key) {
  const url = `${SHODAN_BASE}/shodan/host/${encodeURIComponent(ip)}?key=${encodeURIComponent(key)}&minify=false`
  const { data } = await fetchJson(ctx, url, { timeoutSec: 30 })
  if (!data || typeof data.ip_str !== 'string') {
    throw new Error(`Shodan 返回异常: ${trunc(JSON.stringify(data), 300)}`)
  }
  const services = (Array.isArray(data.data) ? data.data : []).slice(0, 100).map((s) =>
    clean({
      port: s.port,
      transport: s.transport,
      product: s.product,
      version: s.version,
      banner: trunc(s.data, 400),
      title: s.http ? trunc(s.http.title, 150) : undefined,
      cert:
        s.ssl && s.ssl.cert && s.ssl.cert.subject
          ? trunc(s.ssl.cert.subject.CN || s.ssl.cert.subject.commonName, 150)
          : undefined,
      source: s._shodan && s._shodan.module,
    }),
  )
  return clean({
    platform: 'shodan',
    ip: data.ip_str,
    hostnames: Array.isArray(data.hostnames) ? data.hostnames.slice(0, 20) : undefined,
    ports: Array.isArray(data.ports) ? data.ports.slice(0, 200) : undefined,
    os: data.os,
    org: data.org,
    isp: data.isp,
    asn: data.asn,
    country: data.country_name,
    city: data.city,
    vulns: Array.isArray(data.vulns) ? data.vulns.slice(0, 50) : undefined,
    services_count: Array.isArray(data.data) ? data.data.length : undefined,
    services,
  })
}

/** host/count — 总数统计 (可选 facets) */
async function statsShodan(ctx, args, key) {
  let url =
    `${SHODAN_BASE}/shodan/host/count?key=${encodeURIComponent(key)}` +
    `&query=${encodeURIComponent(String(args.query || ''))}`
  if (args.facets) url += `&facets=${encodeURIComponent(String(args.facets))}`
  const { data } = await fetchJson(ctx, url, { timeoutSec: 45 })
  if (!data || typeof data.total !== 'number') {
    throw new Error(`Shodan 返回异常: ${trunc(JSON.stringify(data), 300)}`)
  }
  return {
    platform: 'shodan',
    query: args.query,
    total: data.total,
    facets: data.facets || {},
  }
}

/** api-info — 账户与配额 */
async function accountShodan(ctx, key) {
  const { data } = await fetchJson(ctx, `${SHODAN_BASE}/api-info?key=${encodeURIComponent(key)}`, {
    timeoutSec: 30,
  })
  if (!data || typeof data.query_credits !== 'number') {
    throw new Error(`Shodan 返回异常: ${trunc(JSON.stringify(data), 300)}`)
  }
  return clean({
    platform: 'shodan',
    plan: data.plan,
    query_credits: data.query_credits,
    scan_credits: data.scan_credits,
    monitored_ips: data.monitored_ips,
    unlocked: data.unlocked,
    usage_limits: data.usage_limits,
  })
}

/** dns/resolve — 批量域名解析, 返回 { 域名: IP } 映射 */
async function dnsResolveShodan(ctx, hostnames, key) {
  const list = String(hostnames)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20)
  if (list.length === 0) throw new Error('hostnames 参数为空或格式错误')
  const url =
    `${SHODAN_BASE}/dns/resolve?hostnames=${encodeURIComponent(list.join(','))}` +
    `&key=${encodeURIComponent(key)}`
  const { data } = await fetchJson(ctx, url, { timeoutSec: 30 })
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`Shodan 返回异常: ${trunc(JSON.stringify(data), 300)}`)
  }
  return clean({ platform: 'shodan', hostnames: list, resolved: data })
}

/** labs/honeyscore/{ip} — 蜜罐评分 (0.0~1.0, 需 Shodan 会员计划) */
async function honeyscoreShodan(ctx, ip, key) {
  const url = `${SHODAN_BASE}/labs/honeyscore/${encodeURIComponent(ip)}?key=${encodeURIComponent(key)}`
  const { data } = await fetchJson(ctx, url, { timeoutSec: 30 })
  if (typeof data !== 'number') {
    throw new Error(`Shodan honeyscore 返回异常: ${trunc(JSON.stringify(data), 300)}`)
  }
  return data
}

/** dns/domain/{domain} — 子域枚举 (A/CNAME 记录, 最多取 300 条) */
async function dnsDomainShodan(ctx, domain, key) {
  const url = `${SHODAN_BASE}/dns/domain/${encodeURIComponent(domain)}?key=${encodeURIComponent(key)}`
  const { data } = await fetchJson(ctx, url, { timeoutSec: 30 })
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`Shodan 返回异常: ${trunc(JSON.stringify(data), 300)}`)
  }
  const items = Array.isArray(data.data) ? data.data : []
  const subdomains = items.slice(0, 300).map((s) =>
    clean({
      subdomain: s.subdomain,
      type: s.type,
      value: s.value,
      last_seen: s.last_seen,
    }),
  )
  return clean({
    platform: 'shodan',
    domain: data.domain || domain,
    tags: Array.isArray(data.tags) ? data.tags : undefined,
    count: items.length,
    returned: subdomains.length,
    subdomains,
  })
}


// ---- src/platforms/hunter.js ----
/**
 * 鹰图 Hunter (hunter.qianxin.com) 适配: 搜索 / 账户配额。
 * API 契约: https://hunter.qianxin.com/home/helpCenter (openApi/search)
 * 要点: query 需 URL-safe Base64 编码后放 search 参数; 无独立账户端点, 配额由一次最小搜索读取。
 * @module src/platforms/hunter
 */

const HUNTER_BASE = 'https://hunter.qianxin.com/openApi'

/** openApi/search — 返回 { total, results[], credit } */
async function searchHunter(ctx, args, key) {
  const page = clampInt(args.page, 1, 10000, 1)
  const size = clampInt(args.size, 1, 100, 20)
  // 与 Go base64.URLEncoding 一致: URL-safe 字母表, 保留 = 填充
  const b64 = btoa(String(args.query || ''))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  let url =
    `${HUNTER_BASE}/search?api-key=${encodeURIComponent(key)}` +
    `&search=${encodeURIComponent(b64)}` +
    `&page=${page}&page_size=${size}`
  const typeMap = { web: 1, nonweb: 2, all: 3 }
  if (args.type && typeMap[args.type]) url += `&is_web=${typeMap[args.type]}`
  if (args.status_code) url += `&status_code=${encodeURIComponent(String(args.status_code))}`
  if (args.start_time) url += `&start_time=${encodeURIComponent(String(args.start_time))}`
  if (args.end_time) url += `&end_time=${encodeURIComponent(String(args.end_time))}`
  const { data } = await fetchJson(ctx, url, { timeoutSec: 45 })
  if (!data || data.code !== 200) {
    throw new Error(hunterErrMsg(data))
  }
  const d = data.data || {}
  const arr = Array.isArray(d.arr) ? d.arr : []
  const results = arr.map(normalizeHunter)
  return {
    platform: 'hunter',
    query: args.query,
    page,
    size,
    total: d.total || results.length,
    returned: results.length,
    credit: {
      account_type: d.account_type,
      consume_quota: d.consume_quota,
      rest_quota: d.rest_quota,
    },
    results,
  }
}

/** Hunter arr 元素 -> 归一化对象 */
function normalizeHunter(a) {
  let comps
  if (Array.isArray(a.component)) {
    comps = a.component
      .map((c) => {
        const name = c && (c.name || c.product_name_en)
        if (!name) return undefined
        return String(name) + (c.version ? ` ${c.version}` : '')
      })
      .filter(Boolean)
      .slice(0, 12)
  }
  return clean({
    ip: a.ip,
    port: a.port,
    protocol: a.protocol,
    transport: a.base_protocol,
    domain: a.domain,
    host: a.domain,
    url: a.url,
    status_code: a.status_code,
    title: trunc(a.web_title, 200),
    components: comps,
    os: a.os,
    country: a.country,
    city: a.city,
    org: a.company,
    asn: a.as_number,
    banner: trunc(a.banner, MAX_BANNER),
    icp: a.icp,
    risk: a.is_risk,
    risk_protocol: a.is_risk_protocol,
    is_web: a.is_web,
    time: a.updated_at,
    source: 'hunter',
  })
}

/** 配额读取: 一次最小搜索 (ip="8.8.8.8", page_size=1) */
async function accountHunter(ctx, key) {
  const b64 = btoa('ip="8.8.8.8"').replace(/\+/g, '-').replace(/\//g, '_')
  const url =
    `${HUNTER_BASE}/search?api-key=${encodeURIComponent(key)}` +
    `&search=${encodeURIComponent(b64)}&page=1&page_size=1`
  const { data } = await fetchJson(ctx, url, { timeoutSec: 30 })
  if (!data || data.code !== 200) {
    throw new Error(hunterErrMsg(data))
  }
  const d = data.data || {}
  return clean({
    platform: 'hunter',
    account_type: d.account_type,
    consume_quota: d.consume_quota,
    rest_quota: d.rest_quota,
  })
}


// ---- src/platforms/zoomeye.js ----
/**
 * ZoomEye (zoomeye.org) 适配: 搜索 / 账户配额。
 * API 契约: https://www.zoomeye.org/doc (host/search, resources-info)
 * 要点: 鉴权走 API-KEY 请求头 (非 URL 参数), 因此只能走 curl 通道。
 * @module src/platforms/zoomeye
 */

const ZOOMEYE_BASE = 'https://api.zoomeye.org'

/** host/search — 返回 { total, results[] } */
async function searchZoomEye(ctx, args, key) {
  const page = clampInt(args.page, 1, 10000, 1)
  const size = clampInt(args.size, 1, 100, 20)
  const url =
    `${ZOOMEYE_BASE}/host/search?query=${encodeURIComponent(String(args.query || ''))}` +
    `&page=${page}`
  const { data } = await fetchJson(ctx, url, {
    headers: { 'API-KEY': key },
    timeoutSec: 45,
  })
  if (!data || typeof data.total !== 'number') {
    throw new Error(`ZoomEye 返回异常: ${trunc(JSON.stringify(data), 300)}`)
  }
  const matches = (Array.isArray(data.matches) ? data.matches : []).slice(0, size)
  const results = matches.map(normalizeZoomEye)
  return {
    platform: 'zoomeye',
    query: args.query,
    page,
    size,
    total: data.total,
    returned: results.length,
    results,
  }
}

/** ZoomEye match -> 归一化对象 */
function normalizeZoomEye(m) {
  const p = m.portinfo || {}
  const g = m.geoinfo || {}
  const country = g.country && g.country.names ? g.country.names : {}
  const city = g.city && g.city.names ? g.city.names : {}
  return clean({
    ip: m.ip,
    port: p.port,
    protocol: p.service,
    transport: p.transport,
    product: p.app,
    device: p.device,
    os: p.os,
    host: p.hostname,
    banner: trunc(p.banner, MAX_BANNER),
    title: trunc(Array.isArray(p.title) ? p.title.join(' ') : p.title, 200),
    org: g.organization,
    isp: g.isp,
    asn: g.asn,
    country: country.en || country['zh-CN'],
    city: city.en || city['zh-CN'],
    time: m.timestamp,
    source: 'zoomeye',
  })
}

/** resources-info — 账户与配额 */
async function accountZoomEye(ctx, key) {
  const { data } = await fetchJson(ctx, `${ZOOMEYE_BASE}/resources-info`, {
    headers: { 'API-KEY': key },
    timeoutSec: 30,
  })
  if (!data || !data.resources) {
    throw new Error(`ZoomEye 返回异常: ${trunc(JSON.stringify(data), 300)}`)
  }
  return clean({
    platform: 'zoomeye',
    plan: data.plan,
    resources: data.resources,
    quota_info: data.quota_info,
  })
}


// ---- src/platforms/quake.js ----
/**
 * Quake (quake.360.net) 适配: 搜索 / 账户配额。
 * API 契约: https://quake.360.net/quake/#/help?id=5.3.1 (api/v3/search/quake_service)
 * 要点: POST JSON body + X-QuakeToken 请求头, 因此只能走 curl 通道。
 * @module src/platforms/quake
 */

const QUAKE_BASE = 'https://quake.360.net/api/v3'

/** search/quake_service — 返回 { total, results[] } */
async function searchQuake(ctx, args, key) {
  const page = clampInt(args.page, 1, 10000, 1)
  const size = clampInt(args.size, 1, 100, 20)
  const body = JSON.stringify({
    query: String(args.query || ''),
    start: (page - 1) * size,
    size,
    ignore_cache: true,
    latest: true,
  })
  const { data } = await fetchJson(ctx, `${QUAKE_BASE}/search/quake_service`, {
    method: 'POST',
    headers: { 'X-QuakeToken': key },
    body,
    timeoutSec: 45,
  })
  if (!data || data.code !== 0) {
    throw new Error(
      `Quake 返回错误 code=${data && data.code}: ${trunc((data && data.message) || '未知错误', 300)}`,
    )
  }
  const items = Array.isArray(data.data) ? data.data : []
  const pag = data.meta && data.meta.pagination ? data.meta.pagination : {}
  const results = items.map(normalizeQuake)
  return {
    platform: 'quake',
    query: args.query,
    page,
    size,
    total: pag.total || results.length,
    returned: results.length,
    results,
  }
}

/** Quake 结果项 -> 归一化对象 */
function normalizeQuake(item) {
  const svc = item.service || {}
  const loc = item.location || {}
  let comps
  if (Array.isArray(item.components)) {
    comps = item.components
      .map((c) => {
        const name = c && (c.product_name_en || c.product_name_cn || c.product_name)
        if (!name) return undefined
        return String(name) + (c.version ? ` ${c.version}` : '')
      })
      .filter(Boolean)
      .slice(0, 12)
  }
  return clean({
    ip: item.ip,
    port: item.port,
    protocol: svc.name,
    transport: svc.transport,
    product: svc.product,
    version: svc.version,
    host: item.hostname,
    domain: item.domain,
    banner: trunc(svc.banner, MAX_BANNER),
    os: item.os_name,
    components: comps,
    country: loc.country_cn || loc.country_en,
    province: loc.province_cn,
    city: loc.city_cn,
    org: item.org,
    isp: item.isp,
    asn: item.asn,
    time: item.time,
    source: 'quake',
  })
}

/** user/info — 账户与配额 */
async function accountQuake(ctx, key) {
  const { data } = await fetchJson(ctx, `${QUAKE_BASE}/user/info`, {
    headers: { 'X-QuakeToken': key },
    timeoutSec: 30,
  })
  if (!data || data.code !== 0) {
    throw new Error(
      `Quake 返回错误 code=${data && data.code}: ${trunc((data && data.message) || '未知错误', 300)}`,
    )
  }
  const d = data.data || {}
  const u = d.user || {}
  return clean({
    platform: 'quake',
    user: u.username || u.fullname,
    credit: d.credit,
    persistent_credit: d.persistent_credit,
    month_remaining_credit: d.month_remaining_credit,
    ban_status: d.ban_status,
  })
}


// ---- src/platforms/index.js ----
/**
 * 平台实现聚合索引 — 工具层只依赖本模块, 新增平台时在此登记。
 * @module src/platforms
 */

/** platform -> 搜索实现 */
const SEARCHERS = {
  fofa: searchFofa,
  shodan: searchShodan,
  hunter: searchHunter,
  zoomeye: searchZoomEye,
  quake: searchQuake,
}

/** platform -> IP 详情实现 */
const DETAILERS = {
  fofa: detailFofa,
  shodan: detailShodan,
}

/** platform -> 聚合统计实现 */
const STATSERS = {
  fofa: statsFofa,
  shodan: statsShodan,
}

/** platform -> 账户配额实现 */
const ACCOUNTERS = {
  fofa: accountFofa,
  shodan: accountShodan,
  hunter: accountHunter,
  zoomeye: accountZoomEye,
  quake: accountQuake,
}


// ---- src/platforms/union.js ----
/**
 * 联合搜索 (map_search platform='all'): 对所有已配置 Key 的平台并行发起同一查询,
 * 合并归一化结果并按 ip:port 去重, 附各平台报告与聚合摘要。
 * 注意: 会消耗所有已配置平台的配额, 请谨慎使用。
 * @module src/platforms/union
 */

/** 全平台联合搜索; args.key 不适用 (各平台 Key 独立配置) */
async function searchUnion(ctx, args) {
  const entries = []
  for (const p of PLATFORMS) {
    const key = await resolveKey(ctx, p, undefined)
    if (key) entries.push([p, key])
  }
  if (entries.length === 0) {
    throw new Error('所有平台都未配置 API Key, 无法联合搜索。请先 map_set_keys 或设置环境变量')
  }

  const page = clampInt(args.page, 1, 10000, 1)
  const size = clampInt(args.size, 1, 100, 20)
  const settled = await Promise.all(
    entries.map(async ([p, key]) => {
      try {
        const res = await SEARCHERS[p](ctx, { ...args, page, size }, key)
        return {
          platform: p,
          ok: true,
          total: res.total,
          returned: res.returned,
          results: res.results,
        }
      } catch (error) {
        return {
          platform: p,
          ok: false,
          error: trunc(error && error.message ? error.message : String(error), 200),
        }
      }
    }),
  )

  const merged = []
  const seen = new Set()
  let deduped = 0
  const report = {}
  let total = 0
  for (const r of settled) {
    if (r.ok) {
      report[r.platform] = { total: r.total, returned: r.returned }
      total += r.total || 0
      for (const item of r.results) {
        const key = `${item.ip || item.host || item.domain || ''}:${
          item.port === undefined || item.port === null ? '' : item.port
        }`
        if (seen.has(key)) {
          deduped += 1
          continue
        }
        seen.add(key)
        merged.push(item)
      }
    } else {
      report[r.platform] = { error: r.error }
    }
  }

  const skipped = PLATFORMS.filter((p) => !report[p])
  return {
    platform: 'all',
    query: args.query,
    page,
    size,
    total,
    returned: merged.length,
    deduped,
    platforms: report,
    skipped,
    summary: summarize(merged),
    results: merged,
  }
}


// ---- src/tools/common.js ----
/**
 * 工具定义公共件: output.render / 错误对象 / 输出 schema。
 * 说明: DSH 动态工具要求 output.schema 强制执行, 这里使用注解型 { type: 'json' } 接受任意可序列化值;
 * render 必须返回 ContentBlock 数组。
 * @module src/tools/common
 */

/** output.render: 业务错误或结果 -> 纯文本块 */
function textRender(_args, value) {
  const text =
    value && value.ok === false ? `✗ MapScan 错误: ${value.error}` : JSON.stringify(value, null, 2)
  return [{ type: 'text', text }]
}

/** 构造 { ok:false, error } 业务错误对象 */
function toolError(prefix, error) {
  const message = error && error.message ? error.message : String(error)
  return { ok: false, error: `${prefix}: ${trunc(message, 800)}` }
}

/** 各工具复用的输出定义 */
const JSON_OUTPUT = { schema: { type: 'json' }, render: textRender }


// ---- src/tools/map_search.js ----
/**
 * map_search — 五平台统一搜索 + 全平台联合搜索 (platform='all') + 自动翻页。
 * @module src/tools/map_search
 */

/**
 * 单平台翻页: 从 args.page 起顺序拉取 pages 页并合并, 空页提前停止。
 * @returns 单页结果结构 + { results(合并), returned, pages_fetched, summary }
 */
async function searchPaged(ctx, platform, args, key, pages) {
  const all = []
  let last
  let fetched = 0
  for (let i = 0; i < pages; i++) {
    const res = await SEARCHERS[platform](ctx, { ...args, page: (args.page || 1) + i }, key)
    fetched += 1
    all.push(...res.results)
    last = res
    if (res.returned === 0) break
  }
  return {
    ...last,
    page: args.page || 1,
    results: all,
    returned: all.length,
    pages_fetched: fetched,
    summary: summarize(all),
  }
}

function makeMapSearchTool(ctx) {
  return harness.defineTool({
    name: 'map_search',
    description:
      '综合查询网络空间测绘平台 FOFA / Shodan / 鹰图Hunter / ZoomEye / Quake。' +
      'query 使用各平台原生语法，示例——fofa: app="nginx" && country="CN"; ' +
      'shodan: nginx port:443 country:CN; hunter: ip="1.1.1.1" || web.title="后台"; ' +
      'zoomeye: app:"nginx" +country:"CN"(+为与, 空格为或); quake: port:"80" AND country:"CN"。' +
      'platform 传 "all" 时对所有已配置 Key 的平台并行联合搜索并按 ip:port 去重(消耗各平台配额)。' +
      'pages 参数可自动翻页合并(1~5, 仅单平台生效); 结果附带 summary 聚合摘要(唯一IP/Top端口/Top产品/Top国家)。' +
      '可用 save 参数把完整结果另存为 JSON 文件。',
    parameters: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['fofa', 'shodan', 'hunter', 'zoomeye', 'quake', 'all'],
          description: '测绘平台，必填; all=所有已配置平台联合搜索',
        },
        query: { type: 'string', description: '检索语句，使用该平台原生语法，必填' },
        page: { type: 'integer', description: '页码，从 1 开始，默认 1' },
        size: { type: 'integer', description: '每页数量，默认 20，最大 100' },
        pages: {
          type: 'integer',
          description: '可选: 自动翻页数(1~5, 默认 1), 逐页合并结果; 仅单平台生效',
        },
        fields: {
          type: 'string',
          description:
            '仅 fofa: 逗号分隔的字段列表，默认 ip,port,protocol,host,title,domain,server,country,city,org,isp,as_number,os,banner',
        },
        full: {
          type: 'boolean',
          description: '仅 fofa: true 时查询一年外的历史数据(消耗更多 F 点)',
        },
        type: {
          type: 'string',
          enum: ['web', 'nonweb', 'all'],
          description: '仅 hunter: 资产类型过滤(web=Web资产, nonweb=非Web, all=全部)',
        },
        status_code: { type: 'string', description: '仅 hunter: HTTP 状态码过滤，如 200' },
        start_time: { type: 'string', description: '仅 hunter: 开始时间，如 2024-01-01' },
        end_time: { type: 'string', description: '仅 hunter: 结束时间，如 2024-12-31' },
        key: {
          type: 'string',
          description: '可选: 临时覆盖该平台的 API Key(不保存); 联合搜索(all)时忽略',
        },
        save: { type: 'string', description: '可选: 把完整结果 JSON 写入该文件路径' },
      },
      required: ['platform', 'query'],
    },
    output: JSON_OUTPUT,
    // 只读操作, 可与其他 map_* 工具并行 (多平台联合测绘)
    isConcurrencySafe: () => true,
    async execute(args) {
      const platform = args.platform
      try {
        let res
        if (platform === 'all') {
          res = await searchUnion(ctx, args)
        } else {
          const key = await resolveKey(ctx, platform, args.key)
          if (!key) {
            return {
              ok: false,
              platform,
              error:
                `未配置 ${platform} 的 API Key。请先调用 map_set_keys 保存(参数 ${platform})，` +
                `或设置环境变量 ${PRIMARY_REFS[platform]}`,
            }
          }
          const pages = clampInt(args.pages, 1, 5, 1)
          res = await searchPaged(ctx, platform, args, key, pages)
        }
        if (args.save) {
          const fs = ctx.get('fs')
          if (fs) {
            try {
              const target = await fs.resolve(String(args.save))
              await fs.writeText(target, JSON.stringify(res, null, 2))
              res.saved = fs.processPath(target)
            } catch (error) {
              res.save_error = trunc(error && error.message ? error.message : String(error), 200)
            }
          } else {
            res.save_error = '当前环境无 fs 服务，跳过保存'
          }
        }
        res.ok = true
        return res
      } catch (error) {
        const base = toolError('map_search 失败', error)
        base.platform = platform
        base.query = args.query
        return base
      }
    },
  })
}


// ---- src/tools/map_ip_detail.js ----
/**
 * map_ip_detail — 单 IP 测绘详情 (fofa / shodan), 可选 Shodan 蜜罐评分。
 * @module src/tools/map_ip_detail
 */

function makeMapIpDetailTool(ctx) {
  return harness.defineTool({
    name: 'map_ip_detail',
    description:
      '查询单个 IP 的主机测绘详情。platform 支持 fofa、shodan。' +
      '返回端口/协议列表、服务 banner、SSL 证书、历史记录(fofa)、CVE 漏洞(shodan vulns)等；' +
      'shodan 可加 honeyscore=true 附带蜜罐评分(需付费计划)。',
    parameters: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['fofa', 'shodan'], description: '测绘平台' },
        ip: { type: 'string', description: '目标 IP，如 1.1.1.1' },
        honeyscore: {
          type: 'boolean',
          description: '仅 shodan: true 时额外查询蜜罐评分(/labs/honeyscore, 需付费计划)',
        },
        key: { type: 'string', description: '可选: 临时覆盖该平台的 API Key' },
      },
      required: ['platform', 'ip'],
    },
    output: JSON_OUTPUT,
    // 只读操作, 可与其他 map_* 工具并行
    isConcurrencySafe: () => true,
    async execute(args) {
      try {
        const key = await resolveKey(ctx, args.platform, args.key)
        if (!key) {
          return {
            ok: false,
            error:
              `未配置 ${args.platform} 的 API Key。请先调用 map_set_keys 或设置环境变量 ` +
              PRIMARY_REFS[args.platform],
          }
        }
        const res = await DETAILERS[args.platform](ctx, String(args.ip), key)
        if (args.platform === 'shodan' && args.honeyscore === true) {
          try {
            res.honeyscore = await honeyscoreShodan(ctx, String(args.ip), key)
          } catch (error) {
            res.honeyscore_error = trunc(
              error && error.message ? error.message : String(error),
              200,
            )
          }
        }
        res.ok = true
        return res
      } catch (error) {
        return toolError('map_ip_detail 失败', error)
      }
    },
  })
}


// ---- src/tools/map_stats.js ----
/**
 * map_stats — 聚合统计 (fofa 字段分布 / shodan 总数+facets)。
 * @module src/tools/map_stats
 */

function makeMapStatsTool(ctx) {
  return harness.defineTool({
    name: 'map_stats',
    description:
      '聚合统计。fofa: 按 fields(逗号分隔, 最多 5 个, 默认 title)统计命中数量分布; ' +
      'shodan: 返回 query 的总命中数，可选 facets(如 org,country,port)。',
    parameters: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['fofa', 'shodan'], description: '测绘平台' },
        query: { type: 'string', description: '检索语句，必填' },
        fields: {
          type: 'string',
          description: '仅 fofa: 聚合字段，如 title,port,protocol,server,country',
        },
        size: { type: 'integer', description: '仅 fofa: 每个字段返回的 top 数量，默认 5，最大 5' },
        facets: {
          type: 'string',
          description: '仅 shodan: 逗号分隔的聚合字段，如 org,country,port',
        },
        key: { type: 'string', description: '可选: 临时覆盖该平台的 API Key' },
      },
      required: ['platform', 'query'],
    },
    output: JSON_OUTPUT,
    // 只读操作, 可与其他 map_* 工具并行
    isConcurrencySafe: () => true,
    async execute(args) {
      try {
        const key = await resolveKey(ctx, args.platform, args.key)
        if (!key) {
          return {
            ok: false,
            error:
              `未配置 ${args.platform} 的 API Key。请先调用 map_set_keys 或设置环境变量 ` +
              PRIMARY_REFS[args.platform],
          }
        }
        const res = await STATSERS[args.platform](ctx, args, key)
        res.ok = true
        return res
      } catch (error) {
        return toolError('map_stats 失败', error)
      }
    },
  })
}


// ---- src/tools/map_account.js ----
/**
 * map_account — 各平台账户与配额查询。
 * @module src/tools/map_account
 */

function makeMapAccountTool(ctx) {
  return harness.defineTool({
    name: 'map_account',
    description:
      '查询平台账户信息与配额: fofa(fcoin/F点/vip)、shodan(plan/query_credits/scan_credits)、' +
      'hunter(消耗与剩余积分)、zoomeye(plan/resources)、quake(credit/月度剩余)。' +
      'hunter 通过一次最小搜索读取配额(消耗极少量积分)。',
    parameters: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['fofa', 'shodan', 'hunter', 'zoomeye', 'quake'],
          description: '测绘平台',
        },
        key: { type: 'string', description: '可选: 临时覆盖该平台的 API Key' },
      },
      required: ['platform'],
    },
    output: JSON_OUTPUT,
    // 只读操作, 可与其他 map_* 工具并行
    isConcurrencySafe: () => true,
    async execute(args) {
      try {
        const key = await resolveKey(ctx, args.platform, args.key)
        if (!key) {
          return {
            ok: false,
            error:
              `未配置 ${args.platform} 的 API Key。请先调用 map_set_keys 或设置环境变量 ` +
              PRIMARY_REFS[args.platform],
          }
        }
        const res = await ACCOUNTERS[args.platform](ctx, key)
        res.ok = true
        return res
      } catch (error) {
        return toolError('map_account 失败', error)
      }
    },
  })
}


// ---- src/tools/map_dns.js ----
/**
 * map_dns — Shodan DNS: 批量解析 (hostnames) / 子域枚举 (domain)。
 * @module src/tools/map_dns
 */

function makeMapDnsTool(ctx) {
  return harness.defineTool({
    name: 'map_dns',
    description:
      'Shodan DNS 查询, hostnames 与 domain 二选一: ' +
      '(1) hostnames 批量解析 — 逗号分隔域名(最多 20 个)解析为 {域名: IP} 映射, 不消耗查询额度; ' +
      '(2) domain 子域枚举 — 返回该域名下 Shodan 已知的子域及 DNS 记录(A/CNAME, 最多 300 条)。',
    parameters: {
      type: 'object',
      properties: {
        hostnames: {
          type: 'string',
          description: '批量解析: 逗号分隔的域名列表, 最多 20 个, 如 example.com,api.example.com',
        },
        domain: {
          type: 'string',
          description: '子域枚举: 目标主域名, 如 example.com (返回子域与 DNS 记录)',
        },
        key: { type: 'string', description: '可选: 临时覆盖 Shodan API Key' },
      },
      required: [],
    },
    output: JSON_OUTPUT,
    // 只读操作, 可与其他 map_* 工具并行
    isConcurrencySafe: () => true,
    async execute(args) {
      try {
        const key = await resolveKey(ctx, 'shodan', args.key)
        if (!key) {
          return {
            ok: false,
            error:
              `未配置 shodan 的 API Key。请先调用 map_set_keys 或设置环境变量 ` +
              PRIMARY_REFS.shodan,
          }
        }
        if (!args.hostnames && !args.domain) {
          return { ok: false, error: 'hostnames 与 domain 必须提供一个 (批量解析/子域枚举)' }
        }
        const res = args.domain
          ? await dnsDomainShodan(ctx, String(args.domain), key)
          : await dnsResolveShodan(ctx, String(args.hostnames), key)
        res.ok = true
        return res
      } catch (error) {
        return toolError('map_dns 失败', error)
      }
    },
  })
}


// ---- src/tools/map_set_keys.js ----
/**
 * map_set_keys — API Key 持久化管理 (保存 / 查看 / 删除)。
 * @module src/tools/map_set_keys
 */

function makeMapSetKeysTool(ctx) {
  return harness.defineTool({
    name: 'map_set_keys',
    description:
      '持久化保存或查看各测绘平台的 API Key(存入凭证库，可被同名环境变量覆盖)。' +
      '参数: fofa/shodan/hunter/zoomeye/quake 传对应 Key; remove 传平台名数组以删除已存 Key; ' +
      '不带任何参数时仅查看当前配置状态。' +
      'Key 获取地址: fofa.info 个人中心、account.shodan.io、hunter.qianxin.com 个人中心、' +
      'zoomeye.org/profile、quake.360.net 个人中心。',
    parameters: {
      type: 'object',
      properties: {
        fofa: { type: 'string', description: 'FOFA API Key' },
        shodan: { type: 'string', description: 'Shodan API Key' },
        hunter: { type: 'string', description: '鹰图 Hunter API Key' },
        zoomeye: { type: 'string', description: 'ZoomEye API-KEY' },
        quake: { type: 'string', description: 'Quake Token' },
        remove: {
          type: 'array',
          items: { type: 'string' },
          description: '要删除已存 Key 的平台名数组，如 ["fofa"]',
        },
      },
      required: [],
    },
    output: JSON_OUTPUT,
    async execute(args) {
      try {
        return await setKeys(ctx, args)
      } catch (error) {
        return toolError('map_set_keys 失败', error)
      }
    },
  })
}


// ---- src/tools/index.js ----
/**
 * 工具注册表 — 插件 apply 时注册全部 6 个工具。
 * @module src/tools
 */

/** 构造全部工具定义 (顺序即注册顺序) */
function makeTools(ctx) {
  return [
    makeMapSearchTool(ctx),
    makeMapIpDetailTool(ctx),
    makeMapStatsTool(ctx),
    makeMapAccountTool(ctx),
    makeMapDnsTool(ctx),
    makeMapSetKeysTool(ctx),
  ]
}


// ---- src/index.js ----
/**
 * MapScan 插件入口。
 * 本文件是 DSH 函数体的最后一段: scripts/build.mjs 在拼接后的产物末尾追加 `return plugin`。
 * 沙箱内以 (async () => { <拼接源码> })() 求值, 返回值必须是 Cordis Plugin 对象。
 * @module src/index
 */

/** MapScan 插件对象 */
const plugin = {
  name: 'MapScan 网络空间测绘',
  inject: ['shell'],
  apply(ctx) {
    for (const tool of makeTools(ctx)) {
      // 每个注册 disposer 归属当前 Plugin Fiber, stop/update 时自动回收
      ctx.effect(() => harness.registerTool(ctx, tool))
    }
  },
}


return plugin
