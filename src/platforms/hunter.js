/**
 * 鹰图 Hunter (hunter.qianxin.com) 适配: 搜索 / 账户配额。
 * API 契约: https://hunter.qianxin.com/home/helpCenter (openApi/search)
 * 要点: query 需 URL-safe Base64 编码后放 search 参数; 无独立账户端点, 配额由一次最小搜索读取。
 * @module src/platforms/hunter
 */
import { hunterErrMsg } from '../lib/errors.js'
import { MAX_BANNER, clampInt, clean, trunc } from '../lib/utils.js'
import { fetchJson } from '../lib/http.js'

const HUNTER_BASE = 'https://hunter.qianxin.com/openApi'

/** openApi/search — 返回 { total, results[], credit } */
export async function searchHunter(ctx, args, key) {
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
export function normalizeHunter(a) {
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
export async function accountHunter(ctx, key) {
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
