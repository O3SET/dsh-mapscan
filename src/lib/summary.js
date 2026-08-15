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
export function summarize(results) {
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
