/**
 * utils 纯函数单元测试。
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { clean, clampInt, pq, textOf, trunc } from '../../src/lib/utils.js'

test('trunc 截断长文本并标注原长', () => {
  assert.equal(trunc('hello', 3), 'hel …(已截断, 原长 5)')
  assert.equal(trunc('hi', 3), 'hi')
  assert.equal(trunc(undefined, 3), undefined)
  assert.equal(trunc(42, 3), 42)
})

test('clampInt 夹取整数并回落默认值', () => {
  assert.equal(clampInt('3', 1, 100, 20), 3)
  assert.equal(clampInt(500, 1, 100, 20), 100)
  assert.equal(clampInt(0, 1, 100, 20), 1)
  assert.equal(clampInt('x', 1, 100, 20), 20)
  assert.equal(clampInt(undefined, 1, 100, 20), 20)
  assert.equal(clampInt(3.9, 1, 100, 20), 3)
})

test('pq 单引号转义与换行剔除', () => {
  assert.equal(pq('abc'), "'abc'")
  assert.equal(pq("a'b"), "'a''b'")
  assert.equal(pq('a\nb\r'), "'ab'")
})

test('clean 去除 undefined / null 字段但保留假值', () => {
  assert.deepEqual(clean({ a: 1, b: undefined, c: null, d: 0, e: false, f: '' }), {
    a: 1,
    d: 0,
    e: false,
    f: '',
  })
})

test('textOf 读取 CollectedOutput', () => {
  assert.equal(textOf({ text: 'ok' }), 'ok')
  assert.equal(textOf(undefined), '')
  assert.equal(textOf({ text: 42 }), '')
})
