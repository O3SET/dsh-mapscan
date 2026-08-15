#!/usr/bin/env node
/**
 * 从 CHANGELOG.md 提取指定版本的发布说明 (供 release 工作流使用)。
 * 用法: node scripts/extract-changelog.mjs <version>   # version 形如 v1.1.0 或 1.1.0
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const version = (process.argv[2] || '').replace(/^v/, '')
const changelog = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8')
const section = new RegExp(`## \\[${version}\\] - [^\\n]*\\n\\n([\\s\\S]*?)(?=\\n## \\[|$)`).exec(
  changelog,
)

if (!section) {
  console.error(`CHANGELOG.md 中未找到版本 ${version} 的章节`)
  process.exit(1)
}

process.stdout.write(section[1].trim() + '\n')
