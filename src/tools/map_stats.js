/**
 * map_stats — 聚合统计 (fofa 字段分布 / shodan 总数+facets)。
 * @module src/tools/map_stats
 */
import { PRIMARY_REFS, resolveKey } from '../lib/credentials.js'
import { STATSERS } from '../platforms/index.js'
import { JSON_OUTPUT, defineTool, toolError } from './common.js'

export function makeMapStatsTool(ctx) {
  return defineTool({
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
