/**
 * map_ip_detail — 单 IP 测绘详情 (fofa / shodan), 可选 Shodan 蜜罐评分。
 * platform 可省略: 缺省(或 auto)时对所有已配置 Key 的平台并行查询, 未配置自动跳过。
 * @module src/tools/map_ip_detail
 */
import { configuredPlatforms, resolveKey } from '../lib/credentials.js'
import { trunc } from '../lib/utils.js'
import { DETAILERS } from '../platforms/index.js'
import { honeyscoreShodan } from '../platforms/shodan.js'
import { JSON_OUTPUT, defineTool, toolError } from './common.js'

/** 详情候选平台 */
const DETAIL_CANDIDATES = ['fofa', 'shodan']

/** 单平台详情 (含可选蜜罐评分) */
async function detailOne(ctx, platform, ip, key, honeyscore) {
  const res = await DETAILERS[platform](ctx, ip, key)
  if (platform === 'shodan' && honeyscore === true) {
    try {
      res.honeyscore = await honeyscoreShodan(ctx, ip, key)
    } catch (error) {
      res.honeyscore_error = trunc(error && error.message ? error.message : String(error), 200)
    }
  }
  return res
}

export function makeMapIpDetailTool(ctx) {
  return defineTool({
    name: 'map_ip_detail',
    description:
      '查询单个 IP 的主机测绘详情。platform 支持 fofa、shodan, 可省略: ' +
      '缺省(或 auto)时对所有已填写 API Key 的平台并行查询, 未配置 Key 的平台自动跳过并列入 skipped。' +
      '返回端口/协议列表、服务 banner、SSL 证书、历史记录(fofa)、CVE 漏洞(shodan vulns)等；' +
      'shodan 可加 honeyscore=true 附带蜜罐评分(需付费计划)。',
    parameters: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['fofa', 'shodan', 'auto'],
          description: '测绘平台, 可选; 缺省或 auto 时对所有已填 Key 的平台执行, 未配置自动跳过',
        },
        ip: { type: 'string', description: '目标 IP，如 1.1.1.1' },
        honeyscore: {
          type: 'boolean',
          description: '仅 shodan: true 时额外查询蜜罐评分(/labs/honeyscore, 需付费计划)',
        },
        key: {
          type: 'string',
          description: '可选: 临时覆盖指定平台的 API Key(仅显式单平台时生效)',
        },
      },
      required: ['ip'],
    },
    output: JSON_OUTPUT,
    // 只读操作, 可与其他 map_* 工具并行
    isConcurrencySafe: () => true,
    async execute(args) {
      try {
        const ip = String(args.ip)
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
          const res = await detailOne(ctx, platform, ip, key, args.honeyscore)
          res.ok = true
          return res
        }

        // 自动模式: 只使用已填写 Key 的平台, 未配置自动跳过
        const entries = await configuredPlatforms(ctx, DETAIL_CANDIDATES)
        if (entries.length === 0) {
          return {
            ok: false,
            error: 'fofa 与 shodan 都未配置 API Key。请先调用 map_set_keys 或设置环境变量',
          }
        }
        const settled = await Promise.all(
          entries.map(async ([p, key]) => {
            try {
              return {
                platform: p,
                ok: true,
                result: await detailOne(ctx, p, ip, key, args.honeyscore),
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
        const platforms = {}
        for (const s of settled) platforms[s.platform] = s.ok ? s.result : { error: s.error }
        const skipped = DETAIL_CANDIDATES.filter((p) => !platforms[p])
        return { ok: true, platform: 'auto', ip, platforms, skipped }
      } catch (error) {
        return toolError('map_ip_detail 失败', error)
      }
    },
  })
}
