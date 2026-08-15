/**
 * map_ip_detail — 单 IP 测绘详情 (fofa / shodan)。
 * @module src/tools/map_ip_detail
 */
import { PRIMARY_REFS, resolveKey } from '../lib/credentials.js'
import { DETAILERS } from '../platforms/index.js'
import { JSON_OUTPUT, toolError } from './common.js'

export function makeMapIpDetailTool(ctx) {
  return harness.defineTool({
    name: 'map_ip_detail',
    description:
      '查询单个 IP 的主机测绘详情。platform 支持 fofa、shodan。' +
      '返回端口/协议列表、服务 banner、SSL 证书、历史记录(fofa)、CVE 漏洞(shodan vulns)等。',
    parameters: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['fofa', 'shodan'], description: '测绘平台' },
        ip: { type: 'string', description: '目标 IP，如 1.1.1.1' },
        key: { type: 'string', description: '可选: 临时覆盖该平台的 API Key' },
      },
      required: ['platform', 'ip'],
    },
    output: JSON_OUTPUT,
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
        res.ok = true
        return res
      } catch (error) {
        return toolError('map_ip_detail 失败', error)
      }
    },
  })
}
