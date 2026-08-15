/**
 * map_account — 各平台账户与配额查询。
 * @module src/tools/map_account
 */
import { PRIMARY_REFS, resolveKey } from '../lib/credentials.js'
import { ACCOUNTERS } from '../platforms/index.js'
import { JSON_OUTPUT, toolError } from './common.js'

export function makeMapAccountTool(ctx) {
  return harness.defineTool({
    name: 'map_account',
    description:
      '查询平台账户信息与配额: fofa(fcoin/F点/vip)、shodan(plan/query_credits/scan_credits)、' +
      'hunter(消耗与剩余积分)、zoomeye(plan/resources)、quake(credit/月度剩余)。' +
      'hunter 通过一次最小搜索读取配额(消耗极少量积分)。',
    parameters: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['fofa', 'shodan', 'hunter', 'zoomeye', 'quake'],
          description: '测绘平台',
        },
        key: { type: 'string', description: '可选: 临时覆盖该平台的 API Key' },
      },
      required: ['platform'],
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
        const res = await ACCOUNTERS[args.platform](ctx, key)
        res.ok = true
        return res
      } catch (error) {
        return toolError('map_account 失败', error)
      }
    },
  })
}
