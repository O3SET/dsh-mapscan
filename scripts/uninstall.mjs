#!/usr/bin/env node
/**
 * MapScan 卸载: 移除补丁层 mapscan 行与 node_modules 链接。
 * 用法:
 *   node scripts/uninstall.mjs
 *   DSH_PROFILE=xxx node scripts/uninstall.mjs
 */
import { existsSync, lstatSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const PROFILE = process.env.DSH_PROFILE || 'web'
const profileDir = join(DSH_HOME, 'profiles', PROFILE)
const patchPath = join(profileDir, 'cordis.patch.yml')
const linkPath = join(profileDir, 'node_modules', 'mapscan-dsh')

// ---- 1. 移除补丁行 ----
if (existsSync(patchPath)) {
  const doc = readFileSync(patchPath, 'utf8')
  const lines = doc.split('\n')
  const kept = []
  let skipping = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const isBlockHead = /^\s*- insert:\s*$/.test(line)
    const isTopEntry = /^-\s/.test(line) && !isBlockHead
    if (skipping) {
      if (isTopEntry) {
        skipping = false
      } else {
        continue
      }
    }
    if (isBlockHead) {
      const slice = lines.slice(i, i + 6).join('\n')
      if (/^\s*-?\s*id:\s*mapscan\s*$/m.test(slice)) {
        skipping = true
        continue
      }
    }
    kept.push(line)
  }
  let next = kept.join('\n').trimEnd()
  if (next.trim().length === 0) next = '[]'
  writeFileSync(patchPath, `${next.trimEnd()}\n`, 'utf8')
  console.log(`✔ 已移除补丁行: ${patchPath}`)
}

// ---- 2. 移除链接 (只删链接本身) ----
try {
  if (lstatSync(linkPath).isSymbolicLink()) {
    unlinkSync(linkPath)
    console.log(`✔ 已移除链接: ${linkPath}`)
  }
} catch {
  // 不存在或已非链接, 忽略
}

console.log('✔ MapScan 已卸载。生效方式: 重启 DSH 进程。')
