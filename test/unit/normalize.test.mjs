/**
 * 各平台 normalize* 归一化映射单元测试 (真实平台响应样本)。
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { DEFAULT_FOFA_FIELDS, normalizeFofa } from '../../src/platforms/fofa.js'
import { normalizeHunter } from '../../src/platforms/hunter.js'
import { normalizeQuake } from '../../src/platforms/quake.js'
import { normalizeShodan } from '../../src/platforms/shodan.js'
import { normalizeZoomEye } from '../../src/platforms/zoomeye.js'

test('normalizeFofa 按 fields 顺序映射行数组', () => {
  const fields = DEFAULT_FOFA_FIELDS.split(',')
  const row = [
    '1.2.3.4',
    '443',
    'https',
    'a.example.com',
    'Example Title',
    'example.com',
    'nginx/1.18.0',
    'CN',
    'Beijing',
    'Example Org',
    'Example ISP',
    '12345',
    'Linux',
    'HTTP/1.1 200 OK',
  ]
  const r = normalizeFofa(fields, row)
  assert.equal(r.ip, '1.2.3.4')
  assert.equal(r.port, '443')
  assert.equal(r.protocol, 'https')
  assert.equal(r.host, 'a.example.com')
  assert.equal(r.title, 'Example Title')
  assert.equal(r.org, 'Example Org')
  assert.equal(r.asn, '12345')
  assert.equal(r.source, 'fofa')
  assert.equal('transport' in r, false) // 默认字段无 base_protocol, 应被剔除
})

test('normalizeFofa 空单元格被剔除', () => {
  const r = normalizeFofa(['ip', 'port', 'title'], ['9.9.9.9', '', undefined])
  assert.deepEqual(r, { ip: '9.9.9.9', source: 'fofa' })
})

test('normalizeShodan 映射 match 结构 (含证书/地理/来源)', () => {
  const match = {
    ip_str: '8.8.8.8',
    port: 443,
    transport: 'tcp',
    hostnames: ['dns.google'],
    product: 'nginx',
    org: 'Google LLC',
    isp: 'Google',
    asn: 'AS15169',
    os: null,
    http: { title: 'Google', server: 'gws', host: 'dns.google' },
    ssl: { cert: { subject: { CN: 'dns.google' }, issuer: { O: 'Google Trust Services' } } },
    location: {
      country_name: 'United States',
      city: 'Mountain View',
      longitude: -122.1,
      latitude: 37.4,
    },
    data: 'HTTP/1.1 200 OK',
    _shodan: { module: 'https' },
    timestamp: '2026-08-01T00:00:00.000000',
  }
  const r = normalizeShodan(match)
  assert.equal(r.ip, '8.8.8.8')
  assert.equal(r.host, 'dns.google')
  assert.equal(r.cert, 'dns.google / Google Trust Services')
  assert.equal(r.source, 'shodan:https')
  assert.equal(r.country, 'United States')
  assert.equal(r.longitude, -122.1)
  assert.equal('os' in r, false) // null 字段被剔除
})

test('normalizeHunter 映射 arr 元素 (含组件数组与风险)', () => {
  const a = {
    ip: '1.1.1.1',
    port: 443,
    protocol: 'https',
    base_protocol: 'tcp',
    domain: 'a.com',
    url: 'https://a.com',
    web_title: '标题',
    status_code: 200,
    component: [
      { name: 'nginx', version: '1.20' },
      { name: 'jQuery', version: '3.4.1' },
    ],
    is_risk: '0',
    is_web: '1',
    country: '中国',
    city: '北京',
    company: 'ACME',
    updated_at: '2026-08-01',
  }
  const r = normalizeHunter(a)
  assert.equal(r.title, '标题')
  assert.equal(r.transport, 'tcp')
  assert.deepEqual(r.components, ['nginx 1.20', 'jQuery 3.4.1'])
  assert.equal(r.risk, '0')
  assert.equal(r.org, 'ACME')
  assert.equal(r.source, 'hunter')
})

test('normalizeZoomEye 映射 portinfo/geoinfo 嵌套结构', () => {
  const m = {
    ip: '1.2.3.4',
    portinfo: {
      port: 80,
      service: 'http',
      app: 'nginx',
      hostname: 'a.com',
      banner: 'HTTP/1.1 200',
    },
    geoinfo: {
      country: { names: { en: 'China' } },
      city: { names: { en: 'Beijing' } },
      organization: 'Org',
      isp: 'ISP',
      asn: 1234,
    },
    timestamp: '2026-08-01',
  }
  const r = normalizeZoomEye(m)
  assert.equal(r.product, 'nginx')
  assert.equal(r.host, 'a.com')
  assert.equal(r.country, 'China')
  assert.equal(r.city, 'Beijing')
  assert.equal(r.asn, 1234)
  assert.equal(r.source, 'zoomeye')
})

test('normalizeQuake 映射 service/location/components 结构', () => {
  const item = {
    ip: '1.2.3.4',
    port: 443,
    hostname: 'a.com',
    service: { name: 'http/ssl', product: 'nginx', banner: 'HTTP/1.1' },
    os_name: 'Linux',
    components: [{ product_name_en: 'nginx', version: '1.20' }],
    location: { country_cn: '中国', province_cn: '北京', city_cn: '北京' },
    asn: 123,
    org: 'Org',
    time: '2026-08-01',
  }
  const r = normalizeQuake(item)
  assert.equal(r.protocol, 'http/ssl')
  assert.equal(r.os, 'Linux')
  assert.deepEqual(r.components, ['nginx 1.20'])
  assert.equal(r.country, '中国')
  assert.equal(r.source, 'quake')
})
