// ============================================================
// MapScan DSH — 浏览器半侧 (client half)
//
// 契约 (照 DSH 0.2.0-rc.2 的 client-modules):
//   * 这是一个 **classic script** (由宿主 document.createElement('script') 加载), 不是 ESM;
//     它只注册一个惰性 CJS 工厂, 模块 id 必须等于包名。
//   * factory 返回 { inject, apply }; 可用 require() 取的只有宿主模块表里的种子模块
//     (react / react-dom / @deepseek-ai/dsh-client-ui-slots 等), 不要 require 其它 Harness 包。
//
// 为什么需要它: DSH 的插件配置表单**不会**自动生成 —— dsh-settings 只把
// `volatile()` 字段投影进 settings.describe(), 而没有任何内置客户端消费 autoGenerate
// (dsh-settings/README.md: "no shipped client does so yet")。
// 所以要在设置页填 API Key, 必须自己注册一个 `settings.section` 页面,
// 并通过 ctx.configForms.get('<loader 行 id>') 读写该行的 config 块。
//
// 这里用到的 id 'mapscan-dsh' 必须与 cordis.patch.yml 里那一行的 id 一致 (命名空间即行 id)。
// ============================================================
window.__ModuleLoader__.load({
  id: 'mapscan-dsh',
  factory: (require) => {
    const React = require('react')
    const slots = require('@deepseek-ai/dsh-client-ui-slots')

    /** 必须与 bundle 补丁里那一行的 id 一致 —— 它就是 settings 命名空间 */
    const NS = 'mapscan-dsh'
    const h = React.createElement

    /** 五个平台字段 + 超时; 字段名必须与 host 侧 Config 的键一致 */
    const FIELDS = [
      { key: 'fofa', label: 'FOFA API Key', hint: 'fofa.info 个人中心' },
      { key: 'shodan', label: 'Shodan API Key', hint: 'account.shodan.io' },
      { key: 'hunter', label: '鹰图 Hunter API Key', hint: 'hunter.qianxin.com 个人中心' },
      { key: 'zoomeye', label: 'ZoomEye API-KEY', hint: 'zoomeye.org/profile' },
      { key: 'quake', label: 'Quake Token', hint: 'quake.360.net 个人中心' },
      {
        key: 'timeoutSec',
        label: '单请求超时（秒）',
        hint: '留空用默认 30，范围 5~300',
        plain: true,
      },
    ]

    const style = {
      section: { maxWidth: '760px', display: 'flex', flexDirection: 'column', gap: '12px' },
      heading: { margin: 0, fontSize: '18px', fontWeight: 600 },
      intro: { margin: 0, fontSize: '13px', color: 'var(--dsw-alias-label-tertiary)' },
      row: { display: 'flex', flexDirection: 'column', gap: '4px' },
      label: { fontSize: '13px', fontWeight: 500 },
      hint: { fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)' },
      input: {
        font: 'inherit',
        fontSize: '13px',
        padding: '6px 8px',
        color: 'var(--dsw-alias-label-primary)',
        background: 'var(--dsw-alias-bg-base, transparent)',
        border: '0.5px solid var(--dsw-alias-border-l2, #ccc)',
        borderRadius: '6px',
      },
      actions: { display: 'flex', alignItems: 'center', gap: '10px' },
      button: {
        font: 'inherit',
        fontSize: '13px',
        padding: '6px 14px',
        cursor: 'pointer',
        borderRadius: '6px',
        border: '0.5px solid var(--dsw-alias-border-l2, #ccc)',
        background: 'var(--dsw-alias-bg-base, transparent)',
        color: 'var(--dsw-alias-label-primary)',
      },
      status: { fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)' },
      warn: { fontSize: '12px', color: 'var(--dsw-alias-state-error-primary, #c0392b)' },
    }

    /** 取值: 表单快照里没有该字段时视为「不修改」 */
    function currentSecret({ snapshot, presence, field }) {
      const live = snapshot?.value?.[field]
      if (typeof live === 'string' && live.length > 0) return live
      return presence[field] === true ? '••••••••' : ''
    }

    /** MapScan 设置页: 五个平台的 Key + 超时, 写回本插件那一行的 config */
    function MapScanSection() {
      const form = React.useMemo(() => configFormsRef.get(NS), [])
      const snapshot = React.useSyncExternalStore(
        React.useCallback((notify) => form.subscribe(notify), [form]),
        React.useCallback(() => form.getSnapshot(), [form]),
      )
      // secret 字段的值不回传, 只有存在性 sidecar
      const presence = React.useSyncExternalStore(
        React.useCallback((notify) => configFormsRef.describe().subscribe(notify), []),
        React.useCallback(() => {
          const rows = configFormsRef.describe().getSnapshot()?.view?.namespaces ?? []
          const row = rows.find((candidate) => candidate.ns === NS)
          const map = {}
          for (const item of row?.secrets ?? []) map[item.path?.[0]] = item.set === true
          return map
        }, []),
      )

      const [draft, setDraft] = React.useState({})
      const [status, setStatus] = React.useState('')
      const [error, setError] = React.useState('')

      const onChange = (key) => (event) =>
        setDraft((prev) => ({ ...prev, [key]: event.target.value }))

      const onSave = async () => {
        setError('')
        // 只提交真正改动过的字段: 未触碰的 secret 读取时是掩码, 原样写回会覆盖成掩码
        const touched = Object.keys(draft).filter(
          (key) =>
            draft[key] !==
            currentSecret({
              snapshot,
              presence,
              field: key,
            }),
        )
        if (touched.length === 0) {
          setStatus('没有改动')
          return
        }
        setStatus('保存中…')
        try {
          const ops = []
          for (const key of touched) {
            const raw = draft[key].trim()
            // 清空 = unset, 恢复继承 (回退到凭证库 / 环境变量)
            if (raw.length === 0) ops.push({ op: 'unset', path: [key] })
            else if (key === 'timeoutSec') ops.push({ op: 'set', path: [key], value: Number(raw) })
            else ops.push({ op: 'set', path: [key], value: raw })
          }
          const accepted = await form.mutate(ops)
          if (accepted) {
            setDraft({})
            setStatus('已保存')
          } else {
            setStatus('')
            setError('保存被宿主拒绝（配置可能被上层补丁或命令行覆盖）')
          }
        } catch (cause) {
          setStatus('')
          setError(`保存失败: ${cause && cause.message ? cause.message : String(cause)}`)
        }
      }

      const mode = snapshot?.mode
      const writable = snapshot?.writable === true
      return h(
        'div',
        { style: style.section },
        h('h2', { style: style.heading, key: 'h' }, 'MapScan 网络空间测绘'),
        h(
          'p',
          { style: style.intro, key: 'i' },
          'API Key 以明文保存在本插件的配置里。若不想落盘，请留空并改用 map_set_keys（凭证库）或环境变量。',
        ),
        ...FIELDS.map((field) =>
          h(
            'div',
            { style: style.row, key: field.key },
            h('label', { style: style.label }, field.label),
            h('input', {
              style: style.input,
              type: field.plain ? 'text' : 'password',
              autoComplete: 'off',
              spellCheck: false,
              value: draft[field.key] ?? currentSecret({ snapshot, presence, field: field.key }),
              placeholder: presence[field.key] === true ? '已配置（留空不改动）' : '未配置',
              onChange: onChange(field.key),
            }),
            h('span', { style: style.hint }, field.hint),
          ),
        ),
        h(
          'div',
          { style: style.actions, key: 'a' },
          h('button', { style: style.button, onClick: onSave, disabled: !writable }, '保存'),
          status ? h('span', { style: style.status }, status) : null,
          error ? h('span', { style: style.warn }, error) : null,
        ),
        mode === 'memory'
          ? h(
              'span',
              { style: style.warn },
              '当前页面不是本机回环地址，配置只能临时生效，无法持久化。',
            )
          : null,
        writable ? null : h('span', { style: style.warn }, '当前 profile 不接受配置写入。'),
      )
    }

    /** 由 apply 注入的 configForms; 组件通过它取表单 (避免每处都传 props) */
    let configFormsRef

    const inject = ['slots', 'configForms']

    function apply(ctx) {
      configFormsRef = ctx.configForms
      ctx.effect(
        () =>
          ctx.slots.inject('settings.section', () =>
            ctx.slots.register(
              {
                name: 'settings.section',
                id: 'mapscan',
                order: 40,
                label: 'MapScan',
              },
              MapScanSection,
            ),
          ),
        'mapscan-dsh: settings section',
      )
    }

    // 保持 slots 引用, 便于将来注册嵌套 slot; 同时避免未使用告警
    void slots

    return { inject, apply }
  },
})
