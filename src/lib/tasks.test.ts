import assert from 'node:assert/strict'
import test from 'node:test'
import { formatTaskWhen, taskKindLabel, taskStatusLabel, excerptTaskResult } from './tasks'

test('formats the next run in the task timezone', () => {
  assert.equal(
    formatTaskWhen('2026-08-26T17:30:00.000Z', 'Asia/Tehran'),
    new Intl.DateTimeFormat('fa-IR', {
      timeZone: 'Asia/Tehran',
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date('2026-08-26T17:30:00.000Z'))
  )
  assert.equal(formatTaskWhen(null, 'UTC'), 'زمان بعدی ندارد')
})

test('uses short Persian labels for task kind and status', () => {
  assert.equal(taskKindLabel('remind'), 'یادآوری')
  assert.equal(taskKindLabel('run'), 'کار')
  assert.equal(taskStatusLabel('active'), 'فعال')
  assert.equal(taskStatusLabel('paused'), 'متوقف')
})

test('excerpts a run result for notifications', () => {
  assert.equal(excerptTaskResult('## خلاصه\n\nهوا خوب است'), 'خلاصه هوا خوب است')
  assert.equal(excerptTaskResult('کوتاه'), 'کوتاه')
})
