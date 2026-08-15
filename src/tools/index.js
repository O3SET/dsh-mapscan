/**
 * 工具注册表 — 插件 apply 时注册全部 6 个工具。
 * @module src/tools
 */
import { makeMapAccountTool } from './map_account.js'
import { makeMapDnsTool } from './map_dns.js'
import { makeMapIpDetailTool } from './map_ip_detail.js'
import { makeMapSearchTool } from './map_search.js'
import { makeMapSetKeysTool } from './map_set_keys.js'
import { makeMapStatsTool } from './map_stats.js'

/** 构造全部工具定义 (顺序即注册顺序) */
export function makeTools(ctx) {
  return [
    makeMapSearchTool(ctx),
    makeMapIpDetailTool(ctx),
    makeMapStatsTool(ctx),
    makeMapAccountTool(ctx),
    makeMapDnsTool(ctx),
    makeMapSetKeysTool(ctx),
  ]
}
