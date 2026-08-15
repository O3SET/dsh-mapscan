#!/usr/bin/env node
/**
 * pre-commit 辅助: 重建 dist 并保证其与 src 同步进入本次提交。
 * 规则: 修改 src/** 时, dist/mapscan-host.js 必须随之重建并一起提交 (DSH 直接消费 dist)。
 */
import { execSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

execSync('node scripts/build.mjs', { cwd: ROOT, stdio: 'inherit' })

const diff = execSync('git diff --name-only -- dist/', { cwd: ROOT, encoding: 'utf8' }).trim()
if (diff) {
  execSync('git add dist/mapscan-host.js', { cwd: ROOT })
  console.log('✔ dist/mapscan-host.js 已随源码变更重新构建并加入本次提交')
} else {
  console.log('✔ dist/mapscan-host.js 与 src 同步, 无需更新')
}
