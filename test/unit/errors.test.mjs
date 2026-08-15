/**
 * 错误提示表单元测试。
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { fofaErrMsg, hunterErrMsg } from '../../src/lib/errors.js'

test('fofaErrMsg 识别已知错误码并附加中文提示', () => {
  assert.equal(
    fofaErrMsg({ errmsg: '[-700] 账号无效' }),
    'FOFA 返回错误: [-700] 账号无效 — 账号无效或 Key 错误, 请到 fofa.info 个人中心核对',
  )
  assert.equal(
    fofaErrMsg({ errmsg: '[-2] 无权限' }),
    'FOFA 返回错误: [-2] 无权限 — 账号无权限或会员过期, 请到 fofa.info 个人中心核对',
  )
})

test('fofaErrMsg 未知错误码原样透出', () => {
  assert.equal(fofaErrMsg({ errmsg: '[-999] 未知' }), 'FOFA 返回错误: [-999] 未知')
  assert.equal(fofaErrMsg({}), 'FOFA 返回错误: 未知错误')
})

test('hunterErrMsg 识别已知错误码并附加中文提示', () => {
  assert.equal(
    hunterErrMsg({ code: 401, message: '令牌过期' }),
    'Hunter 返回错误 code=401: 令牌过期 — 令牌过期或无效, 请到 hunter.qianxin.com 个人中心重新生成',
  )
  assert.equal(
    hunterErrMsg({ code: 403, msg: 'forbidden' }),
    'Hunter 返回错误 code=403: forbidden — 无权访问该接口, 请检查账户权限',
  )
})

test('hunterErrMsg 未知错误码原样透出', () => {
  assert.equal(hunterErrMsg({ code: 500, message: 'boom' }), 'Hunter 返回错误 code=500: boom')
})
