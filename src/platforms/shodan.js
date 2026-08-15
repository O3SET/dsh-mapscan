/**
 * Shodan (shodan.io) 适配: 搜索 / IP 详情 / 总数统计 / 账户配额。
 * API 契约: https://developer.shodan.io/api (host/search, host/{ip}, host/count, api-info)
 * @module src/platforms/shodan
 */
import { MAX_BANNER, clampInt, clean, trunc } from '../lib/utils.js'
import { fetchJson } from '../lib/http.js'

const SHODAN_BASE = 'https://api.shodan.io'

/** host/search — 返回 { total, results[] } */
export async function searchShodan(ctx, args, key) {
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
export function normalizeShodan(m) {
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
export async function detailShodan(ctx, ip, key) {
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
export async function statsShodan(ctx, args, key) {
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
export async function accountShodan(ctx, key) {
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
export async function dnsResolveShodan(ctx, hostnames, key) {
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
export async function honeyscoreShodan(ctx, ip, key) {
  const url = `${SHODAN_BASE}/labs/honeyscore/${encodeURIComponent(ip)}?key=${encodeURIComponent(key)}`
  const { data } = await fetchJson(ctx, url, { timeoutSec: 30 })
  if (typeof data !== 'number') {
    throw new Error(`Shodan honeyscore 返回异常: ${trunc(JSON.stringify(data), 300)}`)
  }
  return data
}

/** dns/domain/{domain} — 子域枚举 (A/CNAME 记录, 最多取 300 条) */
export async function dnsDomainShodan(ctx, domain, key) {
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
