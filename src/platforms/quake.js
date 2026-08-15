/**
 * Quake (quake.360.net) 适配: 搜索 / 账户配额。
 * API 契约: https://quake.360.net/quake/#/help?id=5.3.1 (api/v3/search/quake_service)
 * 要点: POST JSON body + X-QuakeToken 请求头, 因此只能走 curl 通道。
 * @module src/platforms/quake
 */
import { MAX_BANNER, clampInt, clean, trunc } from '../lib/utils.js'
import { fetchJson } from '../lib/http.js'

const QUAKE_BASE = 'https://quake.360.net/api/v3'

/** search/quake_service — 返回 { total, results[] } */
export async function searchQuake(ctx, args, key) {
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
export function normalizeQuake(item) {
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
export async function accountQuake(ctx, key) {
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
