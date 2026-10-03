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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import vm from 'node:vm'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 拼接顺序 = 依赖顺序 (utils 在前, 入口最后) */
const MODULES = [
  'src/lib/utils.js',
  'src/lib/http.js',
  'src/lib/credentials.js',
  'src/lib/errors.js',
  'src/lib/summary.js',
  'src/lib/runtime.js',
  'src/platforms/fofa.js',
  'src/platforms/shodan.js',
  'src/platforms/hunter.js',
  'src/platforms/zoomeye.js',
  'src/platforms/quake.js',
  'src/platforms/index.js',
  'src/platforms/union.js',
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

const ESM_BANNER = [
  '// ============================================================',
  '// MapScan — 网络空间测绘综合插件 (FOFA / Shodan / Hunter / ZoomEye / Quake)',
  '// 本文件由 scripts/build.mjs 自动生成, 请勿手工编辑; 修改请编辑 src/** 后重新构建。',
  '// 用法 (持久化安装): 运行 node scripts/install.mjs 一键安装 —— 把本仓库作为本地',
  '// link 包装进 DSH profile 工作区, 并在补丁层登记 name: mapscan-dsh 行, 重启 DSH 即生效。',
  '// ============================================================',
  '',
].join('\n')

/** 外部包 (非相对路径) 的 import 行 —— 拼接产物必须把它们提到文件顶部 */
function isExternalImport(line) {
  return /^\s*import\s/.test(line) && !/^\s*import\s[^'"]*from\s*['"]\./.test(line)
}

/** 剥掉单文件的 import / export 语法; 外部 import 收集到 externals */
function stripModule(source, externals) {
  const lines = source.split('\n')
  const out = []
  for (const line of lines) {
    if (/^\s*import\s/.test(line)) {
      // 外部依赖保留 (提到产物顶部); 相对 import 由拼接消除
      if (isExternalImport(line) && !/^\s*import\s+['"]/.test(line)) externals.add(line.trim())
      continue
    }
    // re-export 行 (`export { x } from '...'`) 整行丢弃
    if (/^\s*export\s*\{.*\}\s*from\s/.test(line)) continue
    if (/^\s*export\s/.test(line)) {
      out.push(line.replace(/^\s*export\s+/, ''))
      continue
    }
    out.push(line)
  }
  return out.join('\n')
}

/**
 * 构建期注入 schemastery 版 Config (只进 ESM/Loader 产物)。
 *
 * 两个硬约束, 缺一不可:
 *   1. 必须是 schemastery schema (isNativeConfigSchema 判定), 否则配置 status='unsupported';
 *   2. 想让设置页表单**看到并写入**某字段, 该字段必须 `.volatile()`
 *      (dsh-settings 的 volatileForm 只投影 volatile 节点, 非 volatile 字段既不可见也不可写);
 *      API Key 另加 `.role('secret')`, 读取时会被 redactSecrets 抹掉, 只回传 {path,set} 存在性。
 * 动态插件产物是函数体, 无模块系统, 因此只保留 src 里的降级 Config。
 */
const SCHEMASTERNY_CONFIG = [
  'let Config = Schema.object({',
  "  fofa: Schema.string().role('secret').volatile().description('FOFA API Key（fofa.info 个人中心）'),",
  "  shodan: Schema.string().role('secret').volatile().description('Shodan API Key（account.shodan.io）'),",
  "  hunter: Schema.string().role('secret').volatile().description('鹰图 Hunter API Key（hunter.qianxin.com 个人中心）'),",
  "  zoomeye: Schema.string().role('secret').volatile().description('ZoomEye API-KEY（zoomeye.org/profile）'),",
  "  quake: Schema.string().role('secret').volatile().description('Quake Token（quake.360.net 个人中心）'),",
  '  timeoutSec: Schema.number()',
  '    .default(30)',
  '    .volatile()',
  "    .description('单请求超时（秒，5~300；留空用 30）'),",
  '})',
].join('\n')

/** 降级赋值行 (动态产物用); ESM 产物把它整行换成 schemastery 版本 */
const CONFIG_FALLBACK_LINE = /^let Config = CONFIG_FALLBACK$/m

/** 把 ESM 产物里的降级 Config 换成 schemastery 版, 并补上 import */
function injectEsmConfig(esm) {
  if (!CONFIG_FALLBACK_LINE.test(esm)) {
    throw new Error('ESM 产物缺少降级 Config 赋值行 (let Config = CONFIG_FALLBACK)')
  }
  const head = "import Schema from '@deepseek-ai/schemastery'\n\n"
  return `${head}${esm.replace(CONFIG_FALLBACK_LINE, SCHEMASTERNY_CONFIG)}`
}

function main() {
  const externals = new Set()
  const parts = MODULES.map((rel) => {
    const source = readFileSync(join(ROOT, rel), 'utf8')
    return `// ---- ${rel} ----\n${stripModule(source, externals)}`
  })
  const core = parts.join('\n\n')
  // 动态插件函数体: 无模块系统, 保持无外部依赖
  const distHost = `${BANNER}${core}\n\nreturn plugin\n`
  // ESM/Loader 产物: 注入 schemastery Config, 供设置页生成表单
  const distEsm = injectEsmConfig(`${ESM_BANNER}${core}\n\nexport default plugin\n`)

  // 与 DSH 运行时一致的语法校验 (同一包装字符串)
  try {
    new vm.Script(`(async () => {\n${distHost}\n})()`, { filename: 'mapscan-host.js' })
  } catch (error) {
    throw new Error(`dist/mapscan-host.js 语法校验失败: ${error.message}`)
  }

  // 残留检测: 只允许核心区保留「外部包 import」; export 与相对 import 一律不允许
  if (/^\s*export\s/m.test(core)) {
    throw new Error('dist 核心模块中残留 export 语句, 请检查 src 中的 export 写法')
  }

  mkdirSync(join(ROOT, 'dist'), { recursive: true })
  const hostPath = join(ROOT, 'dist', 'mapscan-host.js')
  const esmPath = join(ROOT, 'dist', 'mapscan-plugin.mjs')
  writeFileSync(hostPath, distHost, 'utf8')
  writeFileSync(esmPath, distEsm, 'utf8')

  // 浏览器半侧: classic script, 原样拷贝 (无需打包 —— 它只 require 宿主模块表里的种子)
  const clientSrc = join(ROOT, 'src', 'client.js')
  const clientPath = join(ROOT, 'dist', 'mapscan-client.js')
  if (existsSync(clientSrc)) {
    const client = readFileSync(clientSrc, 'utf8')
    if (!client.includes("id: 'mapscan-dsh'")) {
      throw new Error("dist/mapscan-client.js 的 __ModuleLoader__ id 必须等于包名 'mapscan-dsh'")
    }
    writeFileSync(clientPath, client, 'utf8')
  }

  return {
    hostPath,
    hostLen: distHost.length,
    esmPath,
    esmLen: distEsm.length,
    clientPath: existsSync(clientSrc) ? clientPath : undefined,
  }
}

// ESM 产物校验: 动态导入 (仅执行顶层, 不触发 apply), 验证可被 Node 解析
const built = main()
const mod = await import(`${pathToFileURL(built.esmPath).href}?build=${Date.now()}`)
if (!mod.default || typeof mod.default.apply !== 'function') {
  throw new Error('dist/mapscan-plugin.mjs 默认导出不是合法插件对象')
}
const hostNote = built.hostPath === undefined ? ' (无动态插件产物)' : ` + ${built.hostPath}`
const clientNote = built.clientPath === undefined ? '' : ` + ${built.clientPath}`
console.log(
  `✔ 构建成功: ${built.esmPath} (${built.esmLen} bytes, ${MODULES.length} 个模块)${hostNote}${clientNote}`,
)
