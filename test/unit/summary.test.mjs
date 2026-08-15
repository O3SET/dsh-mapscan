/**
 * summarize 聚合摘要单元测试。
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { summarize } from '../../src/lib/summary.js'

test('summarize 统计唯一 IP 与 Top 端口/产品/国家', () => {
  const results = [
    { ip: '1.1.1.1', port: 443, product: 'nginx', country: 'China' },
    { ip: '1.1.1.1', port: 80, product: 'nginx', country: 'China' },
    { ip: '2.2.2.2', port: 443, product: 'Apache', country: 'United States' },
    { ip: '3.3.3.3', port: 22, product: 'OpenSSH' },
  ]
  const s = summarize(results)
  assert.equal(s.unique_ips, 3)
  assert.deepEqual(s.top_ports[0], { name: '443', count: 2 })
  assert.deepEqual(s.top_products[0], { name: 'nginx', count: 2 })
  assert.deepEqual(s.top_countries[0], { name: 'China', count: 2 })
})

test('summarize 同计数按名称升序稳定排序', () => {
  const results = [
    { ip: '1.1.1.1', port: 80, product: 'b' },
    { ip: '2.2.2.2', port: 80, product: 'a' },
  ]
  const s = summarize(results)
  assert.deepEqual(s.top_ports, [{ name: '80', count: 2 }])
  assert.deepEqual(s.top_products, [
    { name: 'a', count: 1 },
    { name: 'b', count: 1 },
  ])
})

test('summarize 空结果返回零值结构', () => {
  const s = summarize([])
  assert.deepEqual(s, {
    unique_ips: 0,
    top_ports: [],
    top_products: [],
    top_countries: [],
  })
})

test('summarize 忽略缺字段条目', () => {
  const s = summarize([{ banner: 'x' }, { ip: '9.9.9.9' }])
  assert.equal(s.unique_ips, 1)
  assert.deepEqual(s.top_ports, [])
})
