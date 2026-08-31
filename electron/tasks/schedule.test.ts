import assert from 'node:assert/strict'
import test from 'node:test'
import { nextCronOccurrence, parseCron } from './schedule'

test('parses weekday business-hours cron', () => {
  const cron = parseCron('0 9 * * 1-5')
  assert.deepEqual([...cron.minutes], [0])
  assert.deepEqual([...cron.hours], [9])
  assert.equal(cron.daysOfWeek.has(1), true)
  assert.equal(cron.daysOfWeek.has(5), true)
  assert.equal(cron.daysOfWeek.has(0), false)
  assert.equal(cron.dayOfMonthStar, true)
})

test('maps Sunday from 7 to 0', () => {
  const cron = parseCron('30 21 * * 7')
  assert.equal(cron.daysOfWeek.has(0), true)
  assert.equal(cron.daysOfWeek.has(7), false)
})

test('finds the next weekday 9:00 in Asia/Tehran', () => {
  // Thursday 27 Aug 2026 10:00 Tehran is already past 09:00, so next is Friday.
  const from = Date.parse('2026-08-27T06:30:00.000Z')
  const next = nextCronOccurrence('0 9 * * 1-5', 'Asia/Tehran', from)
  assert.equal(next, Date.parse('2026-08-28T05:30:00.000Z'))
})

test('stays on the same local day when the hour is still ahead', () => {
  const from = Date.parse('2026-08-27T05:00:00.000Z') // 08:30 Tehran
  const next = nextCronOccurrence('0 9 * * 1-5', 'Asia/Tehran', from)
  assert.equal(next, Date.parse('2026-08-27T05:30:00.000Z'))
})

test('skips the current minute so a just-fired job advances', () => {
  const from = Date.parse('2026-08-27T05:30:00.000Z') // 09:00 Tehran Thursday
  const next = nextCronOccurrence('0 9 * * 1-5', 'Asia/Tehran', from)
  assert.equal(next, Date.parse('2026-08-28T05:30:00.000Z'))
})

test('uses UTC when asked', () => {
  const from = Date.parse('2026-08-26T20:00:00.000Z')
  const next = nextCronOccurrence('0 21 * * *', 'UTC', from)
  assert.equal(next, Date.parse('2026-08-26T21:00:00.000Z'))
})

test('rejects malformed cron', () => {
  assert.throws(() => parseCron('0 9 * *'), /5 fields/)
  assert.throws(() => parseCron('60 9 * * *'), /Invalid cron field/)
  assert.throws(
    () => nextCronOccurrence('0 9 * * 1-5', 'Not/AZone', Date.now()),
    /Unknown timezone/
  )
})
