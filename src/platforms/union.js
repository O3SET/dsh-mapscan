/**
 * 联合搜索 (map_search platform='all'): 对所有已配置 Key 的平台并行发起同一查询,
 * 合并归一化结果并按 ip:port 去重, 附各平台报告与聚合摘要。
 * 注意: 会消耗所有已配置平台的配额, 请谨慎使用。
 * @module src/platforms/union
 */
import { resolveKey } from '../lib/credentials.js'
import { summarize } from '../lib/summary.js'
import { PLATFORMS, clampInt, trunc } from '../lib/utils.js'
import { SEARCHERS } from './index.js'

/** 全平台联合搜索; args.key 不适用 (各平台 Key 独立配置) */
export async function searchUnion(ctx, args) {
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
