#!/usr/bin/env node
/**
 * MapScan 一键安装 (持久化, 插件清单显示名为包名 mapscan-dsh):
 *   1. 在 profile 目录创建 node_modules/mapscan-dsh → 本仓库的链接
 *      (Windows 用 junction 支持跨盘符, 无需管理员权限, 不依赖任何包管理器)
 *   2. 向补丁层 cordis.patch.yml 登记 Loader 行 `name: mapscan-dsh`
 * 重启 DSH 后生效。
 *
 * 用法:
 *   node scripts/install.mjs            # 默认 profile=web, DSH_HOME=~/.dsh
 *   DSH_PROFILE=xxx node scripts/install.mjs
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const PROFILE = process.env.DSH_PROFILE || 'web'
const profileDir = join(DSH_HOME, 'profiles', PROFILE)
const patchPath = join(profileDir, 'cordis.patch.yml')
const linkPath = join(profileDir, 'node_modules', 'mapscan-dsh')

if (!existsSync(patchPath)) {
  console.error(`✗ 未找到 profile 补丁层: ${patchPath}`)
  console.error('  若你的 DSH profile 名不是 "web", 请用环境变量指定后重试:')
  console.error('  $env:DSH_PROFILE="你的profile"; node scripts/install.mjs')
  process.exit(1)
}

// ---- 1. 链接 (junction 支持跨盘; 已存在则按链接形态安全移除后重建) ----
if (existsSync(linkPath) || isLink(linkPath)) {
  removeLinkSafe(linkPath)
}
mkdirSync(dirname(linkPath), { recursive: true })
symlinkSync(ROOT, linkPath, 'junction')
console.log(`✔ 已创建链接: ${linkPath} -> ${ROOT}`)

// ---- 2. 补丁层行 (显示名为包名; 幂等升级, 旧 file:// 行一并替换) ----
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
const block = ['- insert:', '    - id: mapscan', '      name: mapscan-dsh', ''].join('\n')
let next = kept.join('\n').trimEnd()
if (next.endsWith('[]')) next = next.replace(/\[\s*\]\s*$/, block.trimEnd())
else next = `${next}\n${block}`
writeFileSync(patchPath, `${next.trimEnd()}\n`, 'utf8')

console.log('✔ MapScan 已安装 (显示名: mapscan-dsh)')
console.log(`  row:  - id: mapscan  name: mapscan-dsh  (${patchPath})`)
console.log('  生效方式: 重启 DSH 进程 (或等待长驻界面 HMR 自动重载)。')
console.log('  卸载: node scripts/uninstall.mjs')

/** 是否为链接形态 (junction/symlink), 修复 pnpm 残留的坏 junction 场景 */
function isLink(p) {
  try {
    return lstatSync(p).isSymbolicLink()
  } catch {
    return false
  }
}

/** 只删除链接本身, 绝不跟随进入真实目录 (defensive-patterns) */
function removeLinkSafe(p) {
  try {
    if (isLink(p)) {
      unlinkSync(p)
      console.log(`✔ 已替换旧链接: ${p}`)
    }
  } catch (error) {
    console.error(`✗ 无法移除旧链接 ${p}: ${error.message}`)
    process.exit(1)
  }
}
