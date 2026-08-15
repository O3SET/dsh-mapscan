/**
 * 平台实现聚合索引 — 工具层只依赖本模块, 新增平台时在此登记。
 * @module src/platforms
 */
import { accountFofa, detailFofa, searchFofa, statsFofa } from './fofa.js'
import { accountHunter, searchHunter } from './hunter.js'
import { accountQuake, searchQuake } from './quake.js'
import { accountShodan, detailShodan, searchShodan, statsShodan } from './shodan.js'
import { accountZoomEye, searchZoomEye } from './zoomeye.js'

/** platform -> 搜索实现 */
export const SEARCHERS = {
  fofa: searchFofa,
  shodan: searchShodan,
  hunter: searchHunter,
  zoomeye: searchZoomEye,
  quake: searchQuake,
}

/** platform -> IP 详情实现 */
export const DETAILERS = {
  fofa: detailFofa,
  shodan: detailShodan,
}

/** platform -> 聚合统计实现 */
export const STATSERS = {
  fofa: statsFofa,
  shodan: statsShodan,
}

/** platform -> 账户配额实现 */
export const ACCOUNTERS = {
  fofa: accountFofa,
  shodan: accountShodan,
  hunter: accountHunter,
  zoomeye: accountZoomEye,
  quake: accountQuake,
}
