import assert from 'node:assert/strict'
import test from 'node:test'
import { parseTaskId, parseTaskPatch } from './patch'

test('accepts compact task ids and rejects path-like values', () => {
  assert.equal(parseTaskId('m0-seed'), 'm0-seed')
  assert.equal(parseTaskId('  abc  '), 'abc')
  assert.equal(parseTaskId('../secret'), null)
  assert.equal(parseTaskId(''), null)
})

test('parses a task patch and turns ISO runAt into a timestamp', () => {
  const patch = parseTaskPatch({
    name: 'نرمش',
    status: 'paused',
    runAt: '2026-08-26T18:00:00.000Z'
  })
  assert.equal(patch?.name, 'نرمش')
  assert.equal(patch?.status, 'paused')
  assert.equal(patch?.runAt, Date.parse('2026-08-26T18:00:00.000Z'))
})

test('rejects empty or invalid patches', () => {
  assert.equal(parseTaskPatch({}), null)
  assert.equal(parseTaskPatch({ runAt: 'not-a-date' }), null)
  assert.equal(parseTaskPatch(null), null)
})
