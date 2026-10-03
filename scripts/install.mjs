#!/usr/bin/env node
/**
 * MapScan 一键安装 (DSH 0.2 的 bundle 机制)。
 *
 * 为什么不用「node_modules 链接 + 手写 cordis.patch.yml 的 insert 行」:
 *   DSH 的插件清单只把**声明了 `dsh.bundle.patch` 的包**当作插件层
 *   (见 @deepseek-ai/dsh-package-manifest 的 DshManifest / DshBundleManifest)。
 *   手写 insert 行虽然也能被 loader 加载, 但插件清单读不到, 表现就是
 *   「装了却在插件列表里检测不到」—— 这正是 1.5.0 之前安装方式的缺陷。
 *
 * 本脚本做的事与插件市场/设置页的「安装」一致, 因此结果可被
 * `dsh plugin` / 插件清单 / 设置页正确识别:
 *   1. 在 profile 目录执行 `pnpm add link:<本仓库>` —— 以链接方式登记依赖
 *      (link: 不复制 devDependencies, 且仓库改动即时生效, 无需重装)
 *   2. 把 `mapscan-dsh` 追加进 profile 的 `dsh.profile.bundles` 层列表
 *   3. 清理旧版安装遗留的手工 insert 行 (避免与 bundle 注册重复)
 *
 * 用法:
 *   node scripts/install.mjs                 # 默认 profile=desktop
 *   DSH_PROFILE=web node scripts/install.mjs
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PKG = 'mapscan-dsh'
const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const PROFILE = process.env.DSH_PROFILE || 'desktop'
const profileDir = join(DSH_HOME, 'profiles', PROFILE)
const profilePkg = join(profileDir, 'package.json')
const patchPath = join(profileDir, 'cordis.patch.yml')

if (!existsSync(profilePkg)) {
  console.error(`✗ 未找到 profile: ${profileDir}`)
  console.error('  若你的 profile 名不是 "desktop", 请用环境变量指定后重试:')
  console.error('  $env:DSH_PROFILE="你的profile"; node scripts/install.mjs')
  process.exit(1)
}

// ---- 1. 以 link: 登记依赖 (等同插件市场的安装动作) ----
const pnpm = resolvePnpm()
console.log(`→ 在 ${profileDir} 执行 pnpm add link:${ROOT}`)
try {
  execFileSync(pnpm.node, [pnpm.cli, 'add', `link:${ROOT}`, '--dir', profileDir], {
    stdio: 'inherit',
  })
} catch (error) {
  console.error(`✗ pnpm add 失败: ${error.message}`)
  console.error('  可改用图形界面: 设置 → 插件 → 安装, 填本仓库绝对路径或 GitHub 地址。')
  process.exit(1)
}

// ---- 2. 追加 bundle 层 (幂等) ----
const manifest = JSON.parse(readFileSync(profilePkg, 'utf8'))
manifest.dsh ??= {}
manifest.dsh.profile ??= {}
const bundles = Array.isArray(manifest.dsh.profile.bundles) ? manifest.dsh.profile.bundles : []
if (!bundles.includes(PKG)) {
  manifest.dsh.profile.bundles = [...bundles, PKG]
  writeFileSync(profilePkg, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  console.log(`✔ 已加入 bundle 层: ${PKG}`)
} else {
  console.log(`✔ bundle 层已包含 ${PKG} (无需改动)`)
}

// ---- 3. 清理旧版安装遗留的手工 insert 行 ----
if (existsSync(patchPath)) {
  const before = readFileSync(patchPath, 'utf8')
  const after = stripLegacyRow(before)
  if (after !== before) {
    writeFileSync(patchPath, after, 'utf8')
    console.log('✔ 已清理旧版遗留的手工 insert 行 (改由 bundle 补丁提供)')
  }
}

console.log('')
console.log(`✔ MapScan 已安装到 profile "${PROFILE}" (显示名: ${PKG})`)
console.log('  生效方式: 重启 DSH 进程 (bundle 层在启动时应用)。')
console.log(`  卸载: DSH_PROFILE=${PROFILE} node scripts/uninstall.mjs`)

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
