/**
 * map_dns — Shodan DNS: 批量解析 (hostnames) / 子域枚举 (domain)。
 * @module src/tools/map_dns
 */
import { PRIMARY_REFS, resolveKey } from '../lib/credentials.js'
import { dnsDomainShodan, dnsResolveShodan } from '../platforms/shodan.js'
import { JSON_OUTPUT, toolError } from './common.js'

export function makeMapDnsTool(ctx) {
  return harness.defineTool({
    name: 'map_dns',
    description:
      'Shodan DNS 查询, hostnames 与 domain 二选一: ' +
      '(1) hostnames 批量解析 — 逗号分隔域名(最多 20 个)解析为 {域名: IP} 映射, 不消耗查询额度; ' +
      '(2) domain 子域枚举 — 返回该域名下 Shodan 已知的子域及 DNS 记录(A/CNAME, 最多 300 条)。',
    parameters: {
      type: 'object',
      properties: {
        hostnames: {
          type: 'string',
          description: '批量解析: 逗号分隔的域名列表, 最多 20 个, 如 example.com,api.example.com',
        },
        domain: {
          type: 'string',
          description: '子域枚举: 目标主域名, 如 example.com (返回子域与 DNS 记录)',
        },
        key: { type: 'string', description: '可选: 临时覆盖 Shodan API Key' },
      },
      required: [],
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
        if (!args.hostnames && !args.domain) {
          return { ok: false, error: 'hostnames 与 domain 必须提供一个 (批量解析/子域枚举)' }
        }
        const res = args.domain
          ? await dnsDomainShodan(ctx, String(args.domain), key)
          : await dnsResolveShodan(ctx, String(args.hostnames), key)
        res.ok = true
        return res
      } catch (error) {
        return toolError('map_dns 失败', error)
      }
    },
  })
}
