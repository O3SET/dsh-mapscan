/**
 * map_set_keys — API Key 持久化管理 (保存 / 查看 / 删除)。
 * @module src/tools/map_set_keys
 */
import { setKeys } from '../lib/credentials.js'
import { JSON_OUTPUT, defineTool, toolError } from './common.js'

export function makeMapSetKeysTool(ctx) {
  return defineTool({
    name: 'map_set_keys',
    description:
      '持久化保存或查看各测绘平台的 API Key(存入凭证库，可被同名环境变量覆盖)。' +
      '参数: fofa/shodan/hunter/zoomeye/quake 传对应 Key; remove 传平台名数组以删除已存 Key; ' +
      '不带任何参数时仅查看当前配置状态。' +
      'Key 获取地址: fofa.info 个人中心、account.shodan.io、hunter.qianxin.com 个人中心、' +
      'zoomeye.org/profile、quake.360.net 个人中心。',
    parameters: {
      type: 'object',
      properties: {
        fofa: { type: 'string', description: 'FOFA API Key' },
        shodan: { type: 'string', description: 'Shodan API Key' },
        hunter: { type: 'string', description: '鹰图 Hunter API Key' },
        zoomeye: { type: 'string', description: 'ZoomEye API-KEY' },
        quake: { type: 'string', description: 'Quake Token' },
        remove: {
          type: 'array',
          items: { type: 'string' },
          description: '要删除已存 Key 的平台名数组，如 ["fofa"]',
        },
      },
      required: [],
    },
    output: JSON_OUTPUT,
    async execute(args) {
      try {
        return await setKeys(ctx, args)
      } catch (error) {
        return toolError('map_set_keys 失败', error)
      }
    },
  })
}
