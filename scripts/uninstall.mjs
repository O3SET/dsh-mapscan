#!/usr/bin/env node
/**
 * MapScan 卸载: 从 DSH profile 补丁层移除 id=mapscan 的 insert 补丁块。
 * 用法:
 *   node scripts/uninstall.mjs
 *   DSH_PROFILE=xxx node scripts/uninstall.mjs
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const PROFILE = process.env.DSH_PROFILE || 'web'
const patchPath = join(DSH_HOME, 'profiles', PROFILE, 'cordis.patch.yml')

if (!existsSync(patchPath)) {
  console.error(`✗ 未找到 profile 补丁层: ${patchPath}`)
  process.exit(1)
}

const doc = readFileSync(patchPath, 'utf8')
if (!/^\s*-?\s*id:\s*mapscan\s*$/m.test(doc)) {
  console.log('✔ MapScan 未安装, 无需卸载')
  process.exit(0)
}

// 移除包含 id: mapscan 的 insert 补丁块 (从块首 "- insert:" 到下一个顶层 "- " 或文件尾)
const lines = doc.split('\n')
const out = []
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
    // 向后看 6 行内是否含 id: mapscan
    const slice = lines.slice(i, i + 6).join('\n')
    if (/^\s*-?\s*id:\s*mapscan\s*$/m.test(slice)) {
      skipping = true
      continue
    }
  }
  out.push(line)
}

let next = out.join('\n').trimEnd() + '\n'
if (next.trim().length === 0) next = '[]\n'
writeFileSync(patchPath, next, 'utf8')
console.log(`✔ MapScan 已卸载: ${patchPath}`)
console.log('  生效方式: HMR 自动重载, 或重启 DSH 进程。')
