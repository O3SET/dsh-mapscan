#!/usr/bin/env node
/**
 * MapScan 一键安装 (持久化):
 * 把一行 insert 补丁写入 DSH profile 的用户补丁层 cordis.patch.yml,
 * 指向本仓库 dist/mapscan-plugin.mjs (自包含 ESM, 无外部依赖)。
 * 编辑补丁层后 Cordis HMR 会在长驻界面自动重载; 未启用 HMR 时重启 DSH 即可。
 *
 * 用法:
 *   node scripts/install.mjs            # 默认 profile=web, DSH_HOME=~/.dsh
 *   DSH_PROFILE=xxx node scripts/install.mjs
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const PROFILE = process.env.DSH_PROFILE || 'web'
const patchPath = join(DSH_HOME, 'profiles', PROFILE, 'cordis.patch.yml')

if (!existsSync(patchPath)) {
  console.error(`✗ 未找到 profile 补丁层: ${patchPath}`)
  console.error('  若你的 DSH profile 名不是 "web", 请用环境变量指定后重试:')
  console.error('  $env:DSH_PROFILE="你的profile"; node scripts/install.mjs')
  process.exit(1)
}

const entryUrl = pathToFileURL(join(ROOT, 'dist', 'mapscan-plugin.mjs')).href
const doc = readFileSync(patchPath, 'utf8')

if (/^\s*-?\s*id:\s*mapscan\s*$/m.test(doc)) {
  console.log(`✔ MapScan 已安装 (${patchPath} 中已存在 id: mapscan)`)
  process.exit(0)
}

const block = ['- insert:', '    - id: mapscan', `      name: ${entryUrl}`, ''].join('\n')

let next
if (doc.trimEnd().endsWith('[]')) {
  // 模板文件: 用补丁列表替换末尾空数组
  next = doc.replace(/\[\s*\]\s*$/, block.trimEnd() + '\n')
} else {
  next = doc.trimEnd() + '\n' + block
}

writeFileSync(patchPath, next, 'utf8')
console.log(`✔ MapScan 已安装: ${patchPath}`)
console.log(`  row: - id: mapscan  name: ${entryUrl}`)
console.log('  生效方式: 长驻界面由 Cordis HMR 自动重载; 或重启 DSH 进程。')
console.log('  卸载: node scripts/uninstall.mjs')
