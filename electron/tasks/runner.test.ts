import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { TASK_SEED_DELAY_MS, TASK_SEED_ID } from '@/lib/tasks'
import { seedSmokeTask, TaskRunner } from './runner'
import { TaskStore } from './store'

async function createStore(t: test.TestContext): Promise<TaskStore> {
  const root = await mkdtemp(join(tmpdir(), 'micky-task-runner-'))
  const store = new TaskStore(root)
  t.after(async () => {
    store.close()
    await rm(root, { recursive: true, force: true })
  })
  return store
}

function createClock(start: number) {
  let now = start
  const timers = new Map<number, { when: number; fn: () => void }>()
  let seq = 0
  return {
    now: () => now,
    delay(fn: () => void, ms: number) {
      const id = ++seq
      timers.set(id, { when: now + ms, fn })
      return id
    },
    cancel(id: unknown) {
      timers.delete(id as number)
    },
    advance(ms: number) {
      const target = now + ms
      while (true) {
        let next: { id: number; when: number; fn: () => void } | null = null
        for (const [id, timer] of timers) {
          if (timer.when <= target && (!next || timer.when < next.when)) {
            next = { id, when: timer.when, fn: timer.fn }
          }
        }
        if (!next) {
          now = target
          return
        }
        timers.delete(next.id)
        now = next.when
        next.fn()
      }
    }
  }
}

test('fires a due remind, notifies, and marks it done', async (t) => {
  const store = await createStore(t)
  const start = Date.parse('2026-08-26T18:00:00.000Z')
  store.create({
    name: 'hello',
    kind: 'remind',
    prompt: 'hello',
    scheduleType: 'once',
    runAt: start + 15_000,
    timezone: 'UTC',
    createdAt: start
  })
  const clock = createClock(start)
  const notified: string[] = []
  const logs: string[] = []
  const runner = new TaskRunner(store, {
    now: clock.now,
    delay: clock.delay,
    cancel: clock.cancel,
    notify: (body) => notified.push(body),
    log: (message) => logs.push(message),
    checkIntervalMs: 60_000
  })
  t.after(() => runner.stop())
  runner.start()
  clock.advance(14_000)
  assert.deepEqual(notified, [])
  clock.advance(1_000)
  assert.deepEqual(notified, ['hello'])
  assert.match(logs[0] ?? '', /fired hello: hello/)
  assert.equal(store.list()[0]?.status, 'done')
  assert.equal(store.list()[0]?.nextRun, null)
})

test('does not start a second run while the task is already running', async (t) => {
  const store = await createStore(t)
  const now = Date.parse('2026-08-26T18:00:00.000Z')
  const task = store.create({
    name: 'busy',
    kind: 'remind',
    prompt: 'hello',
    scheduleType: 'once',
    runAt: now,
    timezone: 'UTC',
    createdAt: now
  })
  store.setRunning(task.id, true)
  const clock = createClock(now)
  const notified: string[] = []
  const runner = new TaskRunner(store, {
    now: clock.now,
    delay: clock.delay,
    cancel: clock.cancel,
    notify: (body) => notified.push(body),
    log: () => {},
    checkIntervalMs: 60_000
  })
  t.after(() => runner.stop())
  runner.start()
  clock.advance(0)
  assert.deepEqual(notified, [])
  assert.equal(store.get(task.id)?.status, 'active')
  assert.equal(store.get(task.id)?.running, true)
})

test('runs a due job, stores the result, and notifies an excerpt', async (t) => {
  const store = await createStore(t)
  const now = Date.parse('2026-08-26T18:00:00.000Z')
  store.create({
    name: 'digest',
    kind: 'run',
    prompt: 'summarize today',
    scheduleType: 'once',
    runAt: now,
    timezone: 'UTC',
    createdAt: now
  })
  store.create({
    name: 'quiet',
    kind: 'remind',
    prompt: 'quiet hello',
    scheduleType: 'once',
    runAt: now,
    timezone: 'UTC',
    reportMode: 'silent',
    createdAt: now
  })
  const clock = createClock(now)
  const notified: Array<{ body: string; runId?: string }> = []
  const prompts: string[] = []
  const runner = new TaskRunner(store, {
    now: clock.now,
    delay: clock.delay,
    cancel: clock.cancel,
    notify: (body, meta) => notified.push({ body, runId: meta?.runId }),
    log: () => {},
    checkIntervalMs: 1_000,
    runJob: async (task, runId) => {
      prompts.push(task.prompt)
      assert.equal(typeof runId, 'string')
      return '## خلاصه\nهوا خوب است'
    }
  })
  t.after(() => runner.stop())
  runner.start()
  clock.advance(0)
  for (let i = 0; i < 12; i += 1) await Promise.resolve()
  assert.deepEqual(prompts, ['summarize today'])
  assert.equal(store.list().find((task) => task.kind === 'run')?.status, 'done')
  assert.equal(store.list().find((task) => task.name === 'quiet')?.status, 'done')
  const run = store.listRuns()[0]
  assert.equal(run?.result, '## خلاصه\nهوا خوب است')
  assert.equal(run?.status, 'ok')
  assert.equal(notified.length, 1)
  assert.equal(notified[0]?.runId, run?.id)
  assert.match(notified[0]?.body ?? '', /خلاصه/)
})

test('a wake catches up on schedule inside the grace window', async (t) => {
  const store = await createStore(t)
  const start = Date.parse('2026-08-26T18:00:00.000Z')
  store.create({
    name: 'hello',
    kind: 'remind',
    prompt: 'hello',
    scheduleType: 'once',
    runAt: start + 60_000,
    timezone: 'UTC',
    createdAt: start
  })
  const clock = createClock(start)
  const notified: string[] = []
  const runner = new TaskRunner(store, {
    now: clock.now,
    delay: clock.delay,
    cancel: clock.cancel,
    notify: (body) => notified.push(body),
    log: () => {},
    checkIntervalMs: 60_000
  })
  t.after(() => runner.stop())
  runner.start()

  // Sleep: timers never fire, so the due reminder is still pending on wake.
  clock.cancel(1)
  clock.advance(10 * 60_000)
  assert.deepEqual(notified, [])

  runner.resume()
  assert.deepEqual(notified, ['hello'])
  assert.equal(store.list()[0]?.status, 'done')
})

test('a reminder slept past its grace window is marked missed instead of firing', async (t) => {
  const store = await createStore(t)
  const start = Date.parse('2026-08-26T18:00:00.000Z')
  const task = store.create({
    name: 'stretch',
    kind: 'remind',
    prompt: 'stretch',
    scheduleType: 'once',
    runAt: start + 60_000,
    timezone: 'UTC',
    createdAt: start
  })
  const clock = createClock(start)
  const notified: string[] = []
  const runner = new TaskRunner(store, {
    now: clock.now,
    delay: clock.delay,
    cancel: clock.cancel,
    notify: (body) => notified.push(body),
    log: () => {},
    checkIntervalMs: 60_000,
    graceMs: 30 * 60_000
  })
  t.after(() => runner.stop())
  runner.start()

  clock.cancel(1)
  clock.advance(8 * 3_600_000)
  runner.resume()

  assert.deepEqual(notified, [])
  assert.equal(store.get(task.id)?.status, 'missed')
  assert.equal(store.get(task.id)?.nextRun, null)
})

test('a daily job slept past its grace window skips to the next occurrence', async (t) => {
  const store = await createStore(t)
  const start = Date.parse('2026-08-26T18:00:00.000Z')
  const task = store.create(
    {
      name: 'digest',
      kind: 'run',
      prompt: 'summarize today',
      scheduleType: 'recurring',
      cron: '0 19 * * *',
      timezone: 'UTC',
      createdAt: start
    },
    start
  )
  assert.equal(task.nextRun, Date.parse('2026-08-26T19:00:00.000Z'))

  const clock = createClock(start)
  const prompts: string[] = []
  const runner = new TaskRunner(store, {
    now: clock.now,
    delay: clock.delay,
    cancel: clock.cancel,
    notify: () => {},
    log: () => {},
    checkIntervalMs: 60_000,
    graceMs: 30 * 60_000,
    runJob: async (job) => {
      prompts.push(job.prompt)
      return 'خبرها'
    }
  })
  t.after(() => runner.stop())
  runner.start()

  clock.cancel(1)
  clock.advance(14 * 3_600_000)
  runner.resume()
  for (let i = 0; i < 12; i += 1) await Promise.resolve()

  assert.deepEqual(prompts, [])
  assert.deepEqual(store.listRuns(), [])
  const current = store.get(task.id)
  assert.equal(current?.status, 'active')
  assert.equal(current?.running, false)
  assert.equal(current?.nextRun, Date.parse('2026-08-27T19:00:00.000Z'))
})

test('seedSmokeTask inserts a 15s hello once', async (t) => {
  const store = await createStore(t)
  const now = Date.parse('2026-08-26T18:00:00.000Z')
  const first = seedSmokeTask(store, now)
  assert.equal(first?.id, TASK_SEED_ID)
  assert.equal(first?.prompt, 'hello')
  assert.equal(first?.nextRun, now + TASK_SEED_DELAY_MS)
  assert.equal(seedSmokeTask(store, now), null)
})
