/**
 * API Key 解析与持久化 (凭证库 / 环境变量)。
 * 凭证引用即 POSIX 风格环境变量名: 同名环境变量优先于凭证库, 见 dsh-credentials seam。
 * @module src/lib/credentials
 */
import { PLATFORMS, trunc } from './utils.js'

/** 各平台 Key 的持久化引用名 (map_set_keys 写入凭证库时使用) */
export const PRIMARY_REFS = {
  fofa: 'MAPSCAN_FOFA_API_KEY',
  shodan: 'MAPSCAN_SHODAN_API_KEY',
  hunter: 'MAPSCAN_HUNTER_API_KEY',
  zoomeye: 'MAPSCAN_ZOOMEYE_API_KEY',
  quake: 'MAPSCAN_QUAKE_API_KEY',
}

/** 平台社区惯用环境变量名 (次优先, 便于复用既有环境配置) */
export const FALLBACK_REFS = {
  fofa: ['FOFA_API_KEY'],
  shodan: ['SHODAN_API_KEY'],
  hunter: ['HUNTER_API_KEY'],
  zoomeye: ['ZOOMEYE_API_KEY'],
  quake: ['QUAKE_API_KEY'],
}

/**
 * 解析平台 Key, 优先级: 显式参数 > PRIMARY 引用 > FALLBACK 引用。
 * @returns {Promise<string | undefined>}
 */
export async function resolveKey(ctx, platform, explicit) {
  if (explicit && String(explicit).length > 0) return String(explicit)
  const creds = ctx.get('credentials')
  const refs = [PRIMARY_REFS[platform]].concat(FALLBACK_REFS[platform] || [])
  if (creds) {
    for (const ref of refs) {
      try {
        const resolved = await creds.resolve(ref)
        if (resolved && resolved.value) return resolved.value
      } catch (_error) {
        // 尝试下一个引用名
      }
    }
  }
  return undefined
}

/**
 * map_set_keys 业务逻辑: 保存 / 删除 / 查看各平台 Key 配置状态。
 */
export async function setKeys(ctx, args) {
  const creds = ctx.get('credentials')
  if (!creds) {
    return {
      ok: false,
      error:
        '当前环境未挂载凭证服务(credentials)，无法持久化 Key。可改用环境变量: ' +
        PLATFORMS.map((p) => PRIMARY_REFS[p]).join(' / '),
    }
  }

  const removeList = Array.isArray(args.remove) ? args.remove : []
  const report = {}

  for (const p of removeList) {
    if (!PRIMARY_REFS[p]) continue
    try {
      await creds.unset(PRIMARY_REFS[p])
      report[p] = '已删除存储的 Key'
    } catch (_error) {
      report[p] =
        `删除失败: ${trunc(_error && _error.message ? _error.message : String(_error), 200)}`
    }
  }

  for (const p of PLATFORMS) {
    const value = args[p]
    if (typeof value === 'string' && value.length > 0) {
      try {
        await creds.set(PRIMARY_REFS[p], value)
        report[p] = '已保存 (来源: 凭证库)'
      } catch (_error) {
        report[p] =
          `保存失败: ${trunc(_error && _error.message ? _error.message : String(_error), 200)}`
      }
    } else if (report[p] === undefined) {
      try {
        const info = await creds.describe(PRIMARY_REFS[p])
        if (info && info.configured) {
          let viaEnv = false
          for (const ref of FALLBACK_REFS[p] || []) {
            try {
              const resolved = await creds.resolve(ref)
              if (resolved && resolved.value) viaEnv = true
            } catch (_error) {
              // 忽略
            }
          }
          report[p] =
            `已配置 (来源: ${info.source || '未知'})` + (viaEnv ? '; 另有环境变量生效' : '')
        } else {
          report[p] = '未配置'
        }
      } catch (_error) {
        report[p] =
          `状态未知: ${trunc(_error && _error.message ? _error.message : String(_error), 200)}`
      }
    }
  }

  return {
    ok: true,
    hint:
      `Key 引用名: ${JSON.stringify(PRIMARY_REFS)}; ` +
      '同名环境变量(或 FOFA_API_KEY / SHODAN_API_KEY / HUNTER_API_KEY / ZOOMEYE_API_KEY / QUAKE_API_KEY)会优先于凭证库生效',
    status: report,
  }
}
