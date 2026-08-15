/**
 * map_stats — 聚合统计 (fofa 字段分布 / shodan 总数+facets)。
 * platform 可省略: 缺省(或 auto)时对所有已配置 Key 的平台并行统计, 未配置自动跳过。
 * @module src/tools/map_stats
 */
import { configuredPlatforms, resolveKey } from '../lib/credentials.js'
import { trunc } from '../lib/utils.js'
import { STATSERS } from '../platforms/index.js'
import { JSON_OUTPUT, defineTool, toolError } from './common.js'

/** 统计候选平台 */
const STATS_CANDIDATES = ['fofa', 'shodan']

export function makeMapStatsTool(ctx) {
  return defineTool({
    name: 'map_stats',
    description:
      '聚合统计。fofa: 按 fields(逗号分隔, 最多 5 个, 默认 title)统计命中数量分布; ' +
      'shodan: 返回 query 的总命中数，可选 facets(如 org,country,port)。' +
      'platform 可省略: 缺省(或 auto)时对所有已填写 API Key 的平台并行统计, 未配置自动跳过并列入 skipped。',
    parameters: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['fofa', 'shodan', 'auto'],
          description: '测绘平台, 可选; 缺省或 auto 时对所有已填 Key 的平台执行, 未配置自动跳过',
        },
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
        key: {
          type: 'string',
          description: '可选: 临时覆盖指定平台的 API Key(仅显式单平台时生效)',
        },
      },
      required: ['query'],
    },
    output: JSON_OUTPUT,
    // 只读操作, 可与其他 map_* 工具并行
    isConcurrencySafe: () => true,
    async execute(args) {
      try {
        const platform = args.platform || 'auto'

        if (platform !== 'auto') {
          const key = await resolveKey(ctx, platform, args.key)
          if (!key) {
            return {
              ok: false,
              platform,
              error: `未配置 ${platform} 的 API Key。请先调用 map_set_keys 或设置环境变量`,
            }
          }
          const res = await STATSERS[platform](ctx, args, key)
          res.ok = true
          return res
        }

        // 自动模式: 只使用已填写 Key 的平台, 未配置自动跳过
        const entries = await configuredPlatforms(ctx, STATS_CANDIDATES)
        if (entries.length === 0) {
          return {
            ok: false,
            error: 'fofa 与 shodan 都未配置 API Key。请先调用 map_set_keys 或设置环境变量',
          }
        }
        const settled = await Promise.all(
          entries.map(async ([p, key]) => {
            try {
              return { platform: p, ok: true, result: await STATSERS[p](ctx, args, key) }
            } catch (error) {
              return {
                platform: p,
                ok: false,
                error: trunc(error && error.message ? error.message : String(error), 200),
              }
            }
          }),
        )
        const platforms = {}
        for (const s of settled) platforms[s.platform] = s.ok ? s.result : { error: s.error }
        const skipped = STATS_CANDIDATES.filter((p) => !platforms[p])
        return { ok: true, platform: 'auto', query: args.query, platforms, skipped }
      } catch (error) {
        return toolError('map_stats 失败', error)
      }
    },
  })
}
