/**
 * map_search — 五平台统一搜索 + 全平台联合搜索 (platform='all') + 自动翻页。
 * @module src/tools/map_search
 */
import { PRIMARY_REFS, resolveKey } from '../lib/credentials.js'
import { summarize } from '../lib/summary.js'
import { clampInt, trunc } from '../lib/utils.js'
import { SEARCHERS } from '../platforms/index.js'
import { searchUnion } from '../platforms/union.js'
import { JSON_OUTPUT, toolError } from './common.js'

/**
 * 单平台翻页: 从 args.page 起顺序拉取 pages 页并合并, 空页提前停止。
 * @returns 单页结果结构 + { results(合并), returned, pages_fetched, summary }
 */
async function searchPaged(ctx, platform, args, key, pages) {
  const all = []
  let last
  let fetched = 0
  for (let i = 0; i < pages; i++) {
    const res = await SEARCHERS[platform](ctx, { ...args, page: (args.page || 1) + i }, key)
    fetched += 1
    all.push(...res.results)
    last = res
    if (res.returned === 0) break
  }
  return {
    ...last,
    page: args.page || 1,
    results: all,
    returned: all.length,
    pages_fetched: fetched,
    summary: summarize(all),
  }
}

export function makeMapSearchTool(ctx) {
  return harness.defineTool({
    name: 'map_search',
    description:
      '综合查询网络空间测绘平台 FOFA / Shodan / 鹰图Hunter / ZoomEye / Quake。' +
      'query 使用各平台原生语法，示例——fofa: app="nginx" && country="CN"; ' +
      'shodan: nginx port:443 country:CN; hunter: ip="1.1.1.1" || web.title="后台"; ' +
      'zoomeye: app:"nginx" +country:"CN"(+为与, 空格为或); quake: port:"80" AND country:"CN"。' +
      'platform 传 "all" 时对所有已配置 Key 的平台并行联合搜索并按 ip:port 去重(消耗各平台配额)。' +
      'pages 参数可自动翻页合并(1~5, 仅单平台生效); 结果附带 summary 聚合摘要(唯一IP/Top端口/Top产品/Top国家)。' +
      '可用 save 参数把完整结果另存为 JSON 文件。',
    parameters: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['fofa', 'shodan', 'hunter', 'zoomeye', 'quake', 'all'],
          description: '测绘平台，必填; all=所有已配置平台联合搜索',
        },
        query: { type: 'string', description: '检索语句，使用该平台原生语法，必填' },
        page: { type: 'integer', description: '页码，从 1 开始，默认 1' },
        size: { type: 'integer', description: '每页数量，默认 20，最大 100' },
        pages: {
          type: 'integer',
          description: '可选: 自动翻页数(1~5, 默认 1), 逐页合并结果; 仅单平台生效',
        },
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
        key: {
          type: 'string',
          description: '可选: 临时覆盖该平台的 API Key(不保存); 联合搜索(all)时忽略',
        },
        save: { type: 'string', description: '可选: 把完整结果 JSON 写入该文件路径' },
      },
      required: ['platform', 'query'],
    },
    output: JSON_OUTPUT,
    // 只读操作, 可与其他 map_* 工具并行 (多平台联合测绘)
    isConcurrencySafe: () => true,
    async execute(args) {
      const platform = args.platform
      try {
        let res
        if (platform === 'all') {
          res = await searchUnion(ctx, args)
        } else {
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
          const pages = clampInt(args.pages, 1, 5, 1)
          res = await searchPaged(ctx, platform, args, key, pages)
        }
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
