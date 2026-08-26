import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { TaskStore } from './store'

async function createStore(t: test.TestContext): Promise<{ root: string; store: TaskStore }> {
  const root = await mkdtemp(join(tmpdir(), 'micky-tasks-'))
  const store = new TaskStore(root)
  t.after(async () => {
    store.close()
    await rm(root, { recursive: true, force: true })
  })
  return { root, store }
}

test('persists a one-shot remind and restores it', async (t) => {
  const { root, store } = await createStore(t)
  const runAt = Date.parse('2026-08-26T18:00:00.000Z')
  const created = store.create({
    name: 'hello',
    kind: 'remind',
    prompt: 'hello',
    scheduleType: 'once',
    runAt,
    timezone: 'Asia/Tehran'
  })
  assert.equal(created.nextRun, runAt)
  assert.equal(created.status, 'active')
  store.close()

  const reopened = new TaskStore(root)
  t.after(() => reopened.close())
  const loaded = reopened.get(created.id)
  assert.equal(loaded?.prompt, 'hello')
  assert.equal(loaded?.nextRun, runAt)
  assert.equal(loaded?.running, false)
  assert.equal(reopened.getSnapshot().tasks.length, 1)
  assert.equal(reopened.getSnapshot().tasks[0]?.name, 'hello')
})

test('lists due tasks and skips paused or future ones', async (t) => {
  const { store } = await createStore(t)
  const now = Date.parse('2026-08-26T18:00:00.000Z')
  const due = store.create({
    name: 'due',
    kind: 'remind',
    prompt: 'now',
    scheduleType: 'once',
    runAt: now,
    timezone: 'UTC',
    createdAt: now
  })
  store.create({
    name: 'later',
    kind: 'remind',
    prompt: 'later',
    scheduleType: 'once',
    runAt: now + 60_000,
    timezone: 'UTC',
    createdAt: now
  })
  store.create({
    name: 'paused',
    kind: 'remind',
    prompt: 'paused',
    scheduleType: 'once',
    runAt: now,
    timezone: 'UTC',
    status: 'paused',
    createdAt: now
  })

  const found = store.due(now)
  assert.deepEqual(
    found.map((task) => task.id),
    [due.id]
  )
})

test('finishRun marks a one-shot done and advances a recurring job', async (t) => {
  const { store } = await createStore(t)
  const thursdayMorning = Date.parse('2026-08-27T05:30:00.000Z')
  const once = store.create({
    name: 'once',
    kind: 'remind',
    prompt: 'hello',
    scheduleType: 'once',
    runAt: thursdayMorning,
    timezone: 'Asia/Tehran',
    createdAt: thursdayMorning
  })
  const recurring = store.create(
    {
      name: 'weekday 9',
      kind: 'remind',
      prompt: 'stretch',
      scheduleType: 'recurring',
      cron: '0 9 * * 1-5',
      timezone: 'Asia/Tehran',
      createdAt: thursdayMorning
    },
    thursdayMorning - 60_000
  )

  store.setRunning(once.id, true)
  const finishedOnce = store.finishRun(once.id, thursdayMorning)
  assert.equal(finishedOnce?.status, 'done')
  assert.equal(finishedOnce?.running, false)
  assert.equal(finishedOnce?.nextRun, null)
  assert.equal(finishedOnce?.lastRun, thursdayMorning)
  assert.deepEqual(
    store.due(thursdayMorning).map((task) => task.id),
    [recurring.id]
  )

  assert.equal(recurring.nextRun, thursdayMorning)
  const finishedRecurring = store.finishRun(recurring.id, thursdayMorning)
  assert.equal(finishedRecurring?.status, 'active')
  assert.equal(finishedRecurring?.nextRun, Date.parse('2026-08-28T05:30:00.000Z'))
})

test('recoverInterrupted clears stuck tasks and closes open runs', async (t) => {
  const { root, store } = await createStore(t)
  const now = Date.parse('2026-08-26T18:00:00.000Z')
  const task = store.create({
    name: 'digest',
    kind: 'run',
    prompt: 'summarize today',
    scheduleType: 'recurring',
    cron: '25 23 * * *',
    timezone: 'Asia/Tehran',
    createdAt: now
  })
  store.setRunning(task.id, true)
  const run = store.startRun(task.id, now)
  store.close()

  const reopened = new TaskStore(root)
  t.after(() => reopened.close())
  assert.equal(reopened.get(task.id)?.running, true)

  const recovered = reopened.recoverInterrupted(now + 60_000)
  assert.deepEqual(recovered, { tasks: 1, runs: 1 })
  assert.equal(reopened.get(task.id)?.running, false)
  assert.equal(reopened.get(task.id)?.status, 'active')
  const stored = reopened.getRun(run!.id)
  assert.equal(stored?.status, 'error')
  assert.equal(stored?.finishedAt, now + 60_000)
  assert.match(stored?.result ?? '', /نیمه‌کاره/)
  assert.deepEqual(reopened.recoverInterrupted(now + 60_000), { tasks: 0, runs: 0 })
})

test('skipMissed retires a one-shot and advances a recurring task', async (t) => {
  const { store } = await createStore(t)
  const now = Date.parse('2026-08-26T18:00:00.000Z')
  const once = store.create({
    name: 'call mum',
    kind: 'remind',
    prompt: 'call mum',
    scheduleType: 'once',
    runAt: now,
    timezone: 'UTC',
    createdAt: now
  })
  const daily = store.create(
    {
      name: 'digest',
      kind: 'run',
      prompt: 'summarize today',
      scheduleType: 'recurring',
      cron: '0 9 * * *',
      timezone: 'UTC',
      createdAt: now
    },
    now
  )

  const retired = store.skipMissed(once.id, now + 4 * 3_600_000)
  assert.equal(retired?.status, 'missed')
  assert.equal(retired?.nextRun, null)
  assert.equal(retired?.lastRun, null)

  const advanced = store.skipMissed(daily.id, Date.parse('2026-08-27T10:00:00.000Z'))
  assert.equal(advanced?.status, 'active')
  assert.equal(advanced?.nextRun, Date.parse('2026-08-28T09:00:00.000Z'))
  assert.deepEqual(store.due(Date.parse('2026-08-27T10:00:00.000Z')), [])
})

test('update can pause and delete removes the row', async (t) => {
  const { store } = await createStore(t)
  const now = Date.parse('2026-08-26T18:00:00.000Z')
  const task = store.create({
    name: 'keep',
    kind: 'remind',
    prompt: 'hello',
    scheduleType: 'once',
    runAt: now,
    timezone: 'UTC'
  })
  const paused = store.update(task.id, { status: 'paused' }, now)
  assert.equal(paused?.status, 'paused')
  assert.equal(paused?.nextRun, null)
  assert.equal(store.delete(task.id), true)
  assert.equal(store.get(task.id), null)
})

test('stores job runs, prunes old ones, and deletes them with the task', async (t) => {
  const { store } = await createStore(t)
  const now = Date.parse('2026-08-26T18:00:00.000Z')
  const task = store.create({
    name: 'digest',
    kind: 'run',
    prompt: 'summarize today',
    scheduleType: 'recurring',
    cron: '0 9 * * *',
    timezone: 'UTC',
    createdAt: now
  })
  const first = store.startRun(task.id, now)
  assert.equal(first?.status, 'running')
  const finished = store.finishTaskRun(first!.id, { status: 'ok', result: 'خلاصه', now: now + 1 })
  assert.equal(finished?.status, 'ok')
  assert.equal(finished?.result, 'خلاصه')
  assert.equal(store.getSnapshot().runs[0]?.taskName, 'digest')

  for (let index = 0; index < 22; index += 1) {
    const run = store.startRun(task.id, now + index + 2)
    store.finishTaskRun(run!.id, { status: 'ok', result: `n${index}`, now: now + index + 3 })
  }
  assert.equal(store.listRuns(task.id).length, 20)
  assert.equal(store.delete(task.id), true)
  assert.equal(store.listRuns().length, 0)
})

test('stores run attachments, overwrites the same name, and deletes them with the run', async (t) => {
  const { store } = await createStore(t)
  const now = Date.parse('2026-08-26T18:00:00.000Z')
  const task = store.create({
    name: 'هزینه',
    kind: 'run',
    prompt: 'csv بساز',
    scheduleType: 'once',
    runAt: now,
    timezone: 'UTC',
    createdAt: now
  })
  const run = store.startRun(task.id, now)
  const csv = store.addAttachment(run!.id, {
    name: '../هزینه‌ها.csv',
    kind: 'csv',
    content: 'item,amount\ntea,2'
  })
  assert.equal(csv.name, 'هزینه‌ها.csv')
  assert.equal(csv.kind, 'csv')
  assert.equal(store.getAttachment(csv.id)?.content, 'item,amount\ntea,2')
  assert.equal(store.getRun(run!.id)?.attachments.length, 1)

  const again = store.addAttachment(run!.id, {
    name: 'هزینه‌ها',
    kind: 'csv',
    content: 'item,amount\ncoffee,3'
  })
  assert.equal(again.id, csv.id)
  assert.equal(store.getAttachment(csv.id)?.content, 'item,amount\ncoffee,3')
  assert.equal(store.getRun(run!.id)?.attachments.length, 1)

  store.addAttachment(run!.id, { name: 'notes', kind: 'md', content: '# hi' })
  store.addAttachment(run!.id, { name: 'plain', kind: 'txt', content: 'ok' })
  store.addAttachment(run!.id, { name: 'extra', kind: 'txt', content: 'four' })
  assert.throws(
    () => store.addAttachment(run!.id, { name: 'too-many', kind: 'txt', content: 'nope' }),
    /۴ پیوست/
  )

  store.finishTaskRun(run!.id, { status: 'ok', result: 'آماده', now: now + 1 })
  assert.equal(store.getSnapshot().runs[0]?.attachments[0]?.name, 'هزینه‌ها.csv')
  assert.equal(store.delete(task.id), true)
  assert.equal(store.getAttachment(csv.id), null)
})

test('rejects incomplete schedules', async (t) => {
  const { store } = await createStore(t)
  assert.throws(
    () =>
      store.create({
        name: 'bad',
        kind: 'remind',
        prompt: 'x',
        scheduleType: 'once',
        timezone: 'UTC'
      }),
    /runAt/
  )
  assert.throws(
    () =>
      store.create({
        name: 'bad',
        kind: 'remind',
        prompt: 'x',
        scheduleType: 'recurring',
        timezone: 'UTC'
      }),
    /cron/
  )
})

test('replaces an empty leftover todo table from an older schema', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'micky-tasks-legacy-'))
  const dbPath = join(root, 'tasks', 'tasks.sqlite')
  mkdirSync(join(root, 'tasks'), { recursive: true })
  const legacy = new DatabaseSync(dbPath)
  legacy.exec(`
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('open', 'completed')),
      priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
      due_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      completed_at INTEGER
    );
    CREATE INDEX tasks_status_due ON tasks(status, due_at);
  `)
  legacy.close()

  const store = new TaskStore(root)
  t.after(async () => {
    store.close()
    await rm(root, { recursive: true, force: true })
  })
  const created = store.create({
    name: 'hello',
    kind: 'remind',
    prompt: 'hello',
    scheduleType: 'once',
    runAt: Date.parse('2026-08-26T18:00:00.000Z'),
    timezone: 'UTC'
  })
  assert.equal(created.prompt, 'hello')
  assert.equal(store.get(created.id)?.running, false)
})

test('renames a non-empty leftover todo table instead of dropping it', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'micky-tasks-legacy-data-'))
  mkdirSync(join(root, 'tasks'), { recursive: true })
  const legacy = new DatabaseSync(join(root, 'tasks', 'tasks.sqlite'))
  legacy.exec(`
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('open', 'completed')),
      priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
      due_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      completed_at INTEGER
    );
    INSERT INTO tasks (id, title, notes, status, priority, created_at, updated_at)
    VALUES ('old-1', 'buy milk', '', 'open', 'low', 1, 1);
  `)
  legacy.close()

  const store = new TaskStore(root)
  t.after(async () => {
    store.close()
    await rm(root, { recursive: true, force: true })
  })
  assert.equal(store.list().length, 0)
  store.close()

  const check = new DatabaseSync(join(root, 'tasks', 'tasks.sqlite'))
  t.after(() => check.close())
  const moved = check.prepare('SELECT title FROM tasks_legacy WHERE id = ?').get('old-1') as
    { title?: string } | undefined
  assert.equal(moved?.title, 'buy milk')
})
