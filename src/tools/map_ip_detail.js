/**
 * map_ip_detail — 单 IP 测绘详情 (fofa / shodan), 可选 Shodan 蜜罐评分。
 * @module src/tools/map_ip_detail
 */
import { PRIMARY_REFS, resolveKey } from '../lib/credentials.js'
import { trunc } from '../lib/utils.js'
import { DETAILERS } from '../platforms/index.js'
import { honeyscoreShodan } from '../platforms/shodan.js'
import { JSON_OUTPUT, defineTool, toolError } from './common.js'

export function makeMapIpDetailTool(ctx) {
  return defineTool({
    name: 'map_ip_detail',
    description:
      '查询单个 IP 的主机测绘详情。platform 支持 fofa、shodan。' +
      '返回端口/协议列表、服务 banner、SSL 证书、历史记录(fofa)、CVE 漏洞(shodan vulns)等；' +
      'shodan 可加 honeyscore=true 附带蜜罐评分(需付费计划)。',
    parameters: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['fofa', 'shodan'], description: '测绘平台' },
        ip: { type: 'string', description: '目标 IP，如 1.1.1.1' },
        honeyscore: {
          type: 'boolean',
          description: '仅 shodan: true 时额外查询蜜罐评分(/labs/honeyscore, 需付费计划)',
        },
        key: { type: 'string', description: '可选: 临时覆盖该平台的 API Key' },
      },
      required: ['platform', 'ip'],
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
        const res = await DETAILERS[args.platform](ctx, String(args.ip), key)
        if (args.platform === 'shodan' && args.honeyscore === true) {
          try {
            res.honeyscore = await honeyscoreShodan(ctx, String(args.ip), key)
          } catch (error) {
            res.honeyscore_error = trunc(
              error && error.message ? error.message : String(error),
              200,
            )
          }
        }
        res.ok = true
        return res
      } catch (error) {
        return toolError('map_ip_detail 失败', error)
      }
    },
  })
}
