/**
 * FOFA (fofa.info) 适配: 搜索 / IP 详情 / 聚合统计 / 账户配额。
 * API 契约: https://fofa.info/api (search/all, search/stats, host/{ip}, info/my)
 * @module src/platforms/fofa
 */
import { fofaErrMsg } from '../lib/errors.js'
import { MAX_BANNER, clampInt, clean, trunc } from '../lib/utils.js'
import { fetchJson } from '../lib/http.js'

const FOFA_BASE = 'https://fofa.info/api/v1'

/** map_search 默认返回字段 */
export const DEFAULT_FOFA_FIELDS =
  'ip,port,protocol,host,title,domain,server,country,city,org,isp,as_number,os,banner'

/** search/all — 返回 { total, results[], credit } */
export async function searchFofa(ctx, args, key) {
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
export function normalizeFofa(fields, row) {
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
export async function detailFofa(ctx, ip, key) {
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
export async function statsFofa(ctx, args, key) {
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
export async function accountFofa(ctx, key) {
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
