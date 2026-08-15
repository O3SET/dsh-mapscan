/**
 * credentials 层单元测试 (resolveKey 优先级 / setKeys 状态)。
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { PRIMARY_REFS, resolveKey, setKeys } from '../../src/lib/credentials.js'

function mockCreds(store) {
  return {
    async resolve(ref) {
      const v = store.get(ref)
      return v ? { value: v, source: 'credential-store' } : undefined
    },
    async describe(ref) {
      const v = store.get(ref)
      return v
        ? { configured: true, source: 'credential-store', writable: true }
        : { configured: false, writable: true }
    },
    async set(ref, value) {
      if (!value) throw new Error('empty')
      store.set(ref, value)
    },
    async unset(ref) {
      store.delete(ref)
    },
  }
}

function mockCtx(store) {
  return { get: (name) => (name === 'credentials' ? mockCreds(store) : undefined) }
}

test('resolveKey 优先级: 显式 > PRIMARY > FALLBACK', async () => {
  const store = new Map([
    ['MAPSCAN_FOFA_API_KEY', 'primary-key'],
    ['FOFA_API_KEY', 'fallback-key'],
  ])
  const ctx = mockCtx(store)
  assert.equal(await resolveKey(ctx, 'fofa', 'explicit-key'), 'explicit-key')
  assert.equal(await resolveKey(ctx, 'fofa', undefined), 'primary-key')
  store.delete('MAPSCAN_FOFA_API_KEY')
  assert.equal(await resolveKey(ctx, 'fofa', undefined), 'fallback-key')
  store.clear()
  assert.equal(await resolveKey(ctx, 'fofa', undefined), undefined)
})

test('resolveKey 无 credentials 服务时仅认显式参数', async () => {
  const ctx = { get: () => undefined }
  assert.equal(await resolveKey(ctx, 'shodan', 'k'), 'k')
  assert.equal(await resolveKey(ctx, 'shodan', undefined), undefined)
})

test('setKeys 保存后状态报告', async () => {
  const store = new Map()
  const ctx = mockCtx(store)
  const res = await setKeys(ctx, { fofa: 'K123' })
  assert.equal(res.ok, true)
  assert.match(res.status.fofa, /已保存/)
  assert.equal(store.get('MAPSCAN_FOFA_API_KEY'), 'K123')
  assert.equal(res.status.shodan, '未配置')
})

test('setKeys remove 删除已存 Key', async () => {
  const store = new Map([['MAPSCAN_FOFA_API_KEY', 'K123']])
  const ctx = mockCtx(store)
  const res = await setKeys(ctx, { remove: ['fofa'] })
  assert.match(res.status.fofa, /已删除/)
  assert.equal(store.has('MAPSCAN_FOFA_API_KEY'), false)
})

test('setKeys 无 credentials 服务时返回明确错误', async () => {
  const ctx = { get: () => undefined }
  const res = await setKeys(ctx, { fofa: 'K' })
  assert.equal(res.ok, false)
  assert.match(res.error, new RegExp(PRIMARY_REFS.fofa))
})
