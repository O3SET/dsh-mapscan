#!/usr/bin/env node
/**
 * MapScan 卸载: 从 profile 移除 bundle 层登记、pnpm 依赖与旧版遗留的手工补丁行。
 * 与 scripts/install.mjs 对称, 保证安装/卸载后 profile 状态一致。
 * 用法:
 *   node scripts/uninstall.mjs                 # 默认 profile=desktop
 *   DSH_PROFILE=web node scripts/uninstall.mjs
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const PKG = 'mapscan-dsh'
const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const PROFILE = process.env.DSH_PROFILE || 'desktop'
const profileDir = join(DSH_HOME, 'profiles', PROFILE)
const profilePkg = join(profileDir, 'package.json')
const patchPath = join(profileDir, 'cordis.patch.yml')

// ---- 1. 从 bundle 层移除 (幂等) ----
if (existsSync(profilePkg)) {
  const manifest = JSON.parse(readFileSync(profilePkg, 'utf8'))
  const bundles = manifest.dsh?.profile?.bundles
  if (Array.isArray(bundles) && bundles.includes(PKG)) {
    manifest.dsh.profile.bundles = bundles.filter((name) => name !== PKG)
    writeFileSync(profilePkg, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    console.log(`✔ 已从 bundle 层移除: ${PKG}`)
  } else {
    console.log(`✔ bundle 层未包含 ${PKG} (无需改动)`)
  }
}

// ---- 2. 移除 pnpm 依赖 ----
if (existsSync(profilePkg)) {
  const pnpm = resolvePnpm()
  try {
    execFileSync(pnpm.node, [pnpm.cli, 'remove', PKG, '--dir', profileDir], { stdio: 'inherit' })
  } catch {
    console.log('· pnpm remove 未完成 (依赖可能已不存在), 继续。')
  }
}

// ---- 3. 清理旧版安装遗留的手工 insert 行 ----
if (existsSync(patchPath)) {
  const before = readFileSync(patchPath, 'utf8')
  const after = stripLegacyRow(before)
  if (after !== before) {
    writeFileSync(patchPath, after.trim().length === 0 ? '[]\n' : after, 'utf8')
    console.log('✔ 已移除旧版遗留的手工补丁行')
  }
}

console.log('✔ MapScan 已卸载。生效方式: 重启 DSH 进程。')

/** 定位 pnpm: 优先 DSH 自带运行时, 其次 PATH */
function resolvePnpm() {
  const deps = join(DSH_HOME, 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies')
  const node = join(deps, 'node', 'bin', 'node.exe')
  const cli = join(deps, 'pnpm', 'bin', 'pnpm.mjs')
  if (existsSync(node) && existsSync(cli)) return { node, cli }
  return { node: process.execPath, cli: 'pnpm' }
}

/** 移除 `- insert:` 块中 id/mapscan 的旧行; 绝不触碰其它条目 (defensive-patterns) */
function stripLegacyRow(text) {
  const lines = text.split('\n')
  const kept = []
  let skipping = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const isBlockHead = /^\s*- insert:\s*$/.test(line)
    const isTopEntry = /^-\s/.test(line) && !isBlockHead
    if (skipping) {
      if (isTopEntry) skipping = false
      else continue
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
  return `${kept.join('\n').trimEnd()}\n`
}
