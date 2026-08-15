#!/usr/bin/env node
/**
 * 构建脚本: 将 src/** 的 ESM 模块拼接为单文件 DSH 函数体 (dist/mapscan-host.js)。
 *
 * 策略 (零依赖 mini-bundler):
 *  1. 按固定顺序读取 MODULES 中的源文件;
 *  2. 丢弃所有 `import` 行, 剥掉 `export ` 前缀 (模块顶层符号因此进入同一作用域);
 *  3. 拼接后在末尾追加 `return plugin`;
 *  4. 用与 DSH 运行时相同的包装方式 `(async () => { ... })()` 做语法校验;
 *  5. 校验产物中无残留 import/export 语法。
 *
 * 约定 (违反将导致构建失败):
 *  - 模块间顶层符号名不得重复;
 *  - 只使用单行 named import / export, 不使用 export default / export *。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 拼接顺序 = 依赖顺序 (utils 在前, 入口最后) */
const MODULES = [
  'src/lib/utils.js',
  'src/lib/http.js',
  'src/lib/credentials.js',
  'src/platforms/fofa.js',
  'src/platforms/shodan.js',
  'src/platforms/hunter.js',
  'src/platforms/zoomeye.js',
  'src/platforms/quake.js',
  'src/platforms/index.js',
  'src/tools/common.js',
  'src/tools/map_search.js',
  'src/tools/map_ip_detail.js',
  'src/tools/map_stats.js',
  'src/tools/map_account.js',
  'src/tools/map_dns.js',
  'src/tools/map_set_keys.js',
  'src/tools/index.js',
  'src/index.js',
]

const BANNER = [
  '// ============================================================',
  '// MapScan — 网络空间测绘综合插件 (FOFA / Shodan / Hunter / ZoomEye / Quake)',
  '// 本文件由 scripts/build.mjs 自动生成, 请勿手工编辑; 修改请编辑 src/** 后重新构建。',
  '// 用法: 将本文件整体作为 Dynamic Cordis Plugin 的 code.host (函数体) 使用。',
  '// ============================================================',
  '',
].join('\n')

/** 剥掉单文件的 import / export 语法 */
function stripModule(source) {
  const lines = source.split('\n')
  const out = []
  for (const line of lines) {
    if (/^\s*import\s/.test(line)) continue
    if (/^\s*export\s/.test(line)) {
      out.push(line.replace(/^\s*export\s+/, ''))
      continue
    }
    out.push(line)
  }
  return out.join('\n')
}

function main() {
  const parts = MODULES.map((rel) => {
    const source = readFileSync(join(ROOT, rel), 'utf8')
    return `// ---- ${rel} ----\n${stripModule(source)}`
  })
  const dist = `${BANNER}${parts.join('\n\n')}\n\nreturn plugin\n`

  // 与 DSH 运行时一致的语法校验 (同一包装字符串)
  try {
    new vm.Script(`(async () => {\n${dist}\n})()`, { filename: 'mapscan-host.js' })
  } catch (error) {
    throw new Error(`dist 语法校验失败: ${error.message}`)
  }

  // 残留检测: 函数体中不允许 import/export 语句
  if (/^\s*(import|export)\s/m.test(dist)) {
    throw new Error('dist 中残留 import/export 语句, 请检查 src 中的多行 import/export 写法')
  }

  mkdirSync(join(ROOT, 'dist'), { recursive: true })
  const outPath = join(ROOT, 'dist', 'mapscan-host.js')
  writeFileSync(outPath, dist, 'utf8')
  console.log(`✔ 构建成功: ${outPath} (${dist.length} bytes, ${MODULES.length} 个模块)`)
}

main()
