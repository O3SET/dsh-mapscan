/**
 * map_dns — Shodan DNS 批量解析 (域名 -> IP)。
 * @module src/tools/map_dns
 */
import { PRIMARY_REFS, resolveKey } from '../lib/credentials.js'
import { dnsResolveShodan } from '../platforms/shodan.js'
import { JSON_OUTPUT, toolError } from './common.js'

export function makeMapDnsTool(ctx) {
  return harness.defineTool({
    name: 'map_dns',
    description:
      'Shodan DNS 批量解析: 把域名解析为 IP (GET /dns/resolve)。' +
      'hostnames 传逗号分隔的域名列表(最多 20 个), 如 example.com,api.example.com。' +
      '返回 {域名: IP} 映射; 无法解析的域名会缺失, 不消耗查询额度。',
    parameters: {
      type: 'object',
      properties: {
        hostnames: {
          type: 'string',
          description: '逗号分隔的域名列表, 最多 20 个, 如 example.com,api.example.com',
        },
        key: { type: 'string', description: '可选: 临时覆盖 Shodan API Key' },
      },
      required: ['hostnames'],
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
        const res = await dnsResolveShodan(ctx, String(args.hostnames), key)
        res.ok = true
        return res
      } catch (error) {
        return toolError('map_dns 失败', error)
      }
    },
  })
}
