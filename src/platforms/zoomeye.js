/**
 * ZoomEye (zoomeye.org) 适配: 搜索 / 账户配额。
 * API 契约: https://www.zoomeye.org/doc (host/search, resources-info)
 * 要点: 鉴权走 API-KEY 请求头 (非 URL 参数), 因此只能走 curl 通道。
 * @module src/platforms/zoomeye
 */
import { MAX_BANNER, clampInt, clean, trunc } from '../lib/utils.js'
import { fetchJson } from '../lib/http.js'

const ZOOMEYE_BASE = 'https://api.zoomeye.org'

/** host/search — 返回 { total, results[] } */
export async function searchZoomEye(ctx, args, key) {
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
export function normalizeZoomEye(m) {
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
export async function accountZoomEye(ctx, key) {
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
