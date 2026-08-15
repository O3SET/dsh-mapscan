/**
 * map_account — 各平台账户与配额查询。
 * platform 可省略: 缺省(或 auto)时对所有已配置 Key 的平台并行查询, 未配置自动跳过。
 * @module src/tools/map_account
 */
import { configuredPlatforms, resolveKey } from '../lib/credentials.js'
import { PLATFORMS, trunc } from '../lib/utils.js'
import { ACCOUNTERS } from '../platforms/index.js'
import { JSON_OUTPUT, defineTool, toolError } from './common.js'

export function makeMapAccountTool(ctx) {
  return defineTool({
    name: 'map_account',
    description:
      '查询平台账户信息与配额: fofa(fcoin/F点/vip)、shodan(plan/query_credits/scan_credits)、' +
      'hunter(消耗与剩余积分)、zoomeye(plan/resources)、quake(credit/月度剩余)。' +
      'platform 可省略: 缺省(或 auto)时对所有已填写 API Key 的平台并行查询, 未配置自动跳过并列入 skipped; ' +
      'hunter 通过一次最小搜索读取配额(消耗极少量积分)。',
    parameters: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['fofa', 'shodan', 'hunter', 'zoomeye', 'quake', 'auto'],
          description: '测绘平台, 可选; 缺省或 auto 时对所有已填 Key 的平台执行, 未配置自动跳过',
        },
        key: {
          type: 'string',
          description: '可选: 临时覆盖指定平台的 API Key(仅显式单平台时生效)',
        },
      },
      required: [],
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
          const res = await ACCOUNTERS[platform](ctx, key)
          res.ok = true
          return res
        }

        // 自动模式: 只使用已填写 Key 的平台, 未配置自动跳过
        const entries = await configuredPlatforms(ctx, PLATFORMS)
        if (entries.length === 0) {
          return {
            ok: false,
            error: '所有平台都未配置 API Key。请先调用 map_set_keys 或设置环境变量',
          }
        }
        const settled = await Promise.all(
          entries.map(async ([p, key]) => {
            try {
              return { platform: p, ok: true, result: await ACCOUNTERS[p](ctx, key) }
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
        const skipped = PLATFORMS.filter((p) => !platforms[p])
        return { ok: true, platform: 'auto', platforms, skipped }
      } catch (error) {
        return toolError('map_account 失败', error)
      }
    },
  })
}
