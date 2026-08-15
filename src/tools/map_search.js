/**
 * map_search — 五平台统一搜索。
 * @module src/tools/map_search
 */
import { PRIMARY_REFS, resolveKey } from '../lib/credentials.js'
import { trunc } from '../lib/utils.js'
import { SEARCHERS } from '../platforms/index.js'
import { JSON_OUTPUT, toolError } from './common.js'

export function makeMapSearchTool(ctx) {
  return harness.defineTool({
    name: 'map_search',
    description:
      '综合查询网络空间测绘平台 FOFA / Shodan / 鹰图Hunter / ZoomEye / Quake。' +
      'query 使用各平台原生语法，示例——fofa: app="nginx" && country="CN"; ' +
      'shodan: nginx port:443 country:CN; hunter: ip="1.1.1.1" || web.title="后台"; ' +
      'zoomeye: app:"nginx" +country:"CN"(+为与, 空格为或); quake: port:"80" AND country:"CN"。' +
      '返回统一格式的 ip/端口/协议/域名/标题/banner/证书/地理/组件/风险等字段；' +
      '可用 save 参数把完整结果另存为 JSON 文件。',
    parameters: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['fofa', 'shodan', 'hunter', 'zoomeye', 'quake'],
          description: '测绘平台，必填',
        },
        query: { type: 'string', description: '检索语句，使用该平台原生语法，必填' },
        page: { type: 'integer', description: '页码，从 1 开始，默认 1' },
        size: { type: 'integer', description: '每页数量，默认 20，最大 100' },
        fields: {
          type: 'string',
          description:
            '仅 fofa: 逗号分隔的字段列表，默认 ip,port,protocol,host,title,domain,server,country,city,org,isp,as_number,os,banner',
        },
        full: {
          type: 'boolean',
          description: '仅 fofa: true 时查询一年外的历史数据(消耗更多 F 点)',
        },
        type: {
          type: 'string',
          enum: ['web', 'nonweb', 'all'],
          description: '仅 hunter: 资产类型过滤(web=Web资产, nonweb=非Web, all=全部)',
        },
        status_code: { type: 'string', description: '仅 hunter: HTTP 状态码过滤，如 200' },
        start_time: { type: 'string', description: '仅 hunter: 开始时间，如 2024-01-01' },
        end_time: { type: 'string', description: '仅 hunter: 结束时间，如 2024-12-31' },
        key: { type: 'string', description: '可选: 临时覆盖该平台的 API Key(不保存)' },
        save: { type: 'string', description: '可选: 把完整结果 JSON 写入该文件路径' },
      },
      required: ['platform', 'query'],
    },
    output: JSON_OUTPUT,
    async execute(args) {
      const platform = args.platform
      try {
        const key = await resolveKey(ctx, platform, args.key)
        if (!key) {
          return {
            ok: false,
            platform,
            error:
              `未配置 ${platform} 的 API Key。请先调用 map_set_keys 保存(参数 ${platform})，` +
              `或设置环境变量 ${PRIMARY_REFS[platform]}`,
          }
        }
        const res = await SEARCHERS[platform](ctx, args, key)
        if (args.save) {
          const fs = ctx.get('fs')
          if (fs) {
            try {
              const target = await fs.resolve(String(args.save))
              await fs.writeText(target, JSON.stringify(res, null, 2))
              res.saved = fs.processPath(target)
            } catch (error) {
              res.save_error = trunc(error && error.message ? error.message : String(error), 200)
            }
          } else {
            res.save_error = '当前环境无 fs 服务，跳过保存'
          }
        }
        res.ok = true
        return res
      } catch (error) {
        const base = toolError('map_search 失败', error)
        base.platform = platform
        base.query = args.query
        return base
      }
    },
  })
}
