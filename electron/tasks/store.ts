import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  isTaskKind,
  isTaskReportMode,
  isTaskRunStatus,
  isTaskScheduleType,
  isTaskStatus,
  isTaskAttachmentKind,
  normalizeTaskAttachmentName,
  toTaskRunView,
  toTaskView,
  TASK_ATTACHMENT_MAX,
  TASK_ATTACHMENTS_PER_RUN,
  TASK_INTERRUPTED_RESULT,
  TASK_RUN_RESULT_MAX,
  TASK_RUNS_PER_TASK,
  TASK_RUNS_SNAPSHOT_LIMIT,
  type CreateTaskInput,
  type ScheduledTask,
  type TaskKind,
  type TaskReportMode,
  type TaskRun,
  type TaskRunStatus,
  type TaskScheduleType,
  type TaskStatus,
  type TaskAttachment,
  type TaskAttachmentKind,
  type TaskAttachmentMeta,
  type TasksSnapshot,
  type UpdateTaskInput
} from '@/lib/tasks'
import { computeNextRun } from './schedule'

type TaskRow = {
  id: string
  name: string
  kind: string
  prompt: string
  schedule_type: string
  run_at: number | null
  cron: string | null
  timezone: string
  status: string
  running: number
  last_run: number | null
  next_run: number | null
  created_at: number
  report_mode: string
}

type TaskRunRow = {
  id: string
  task_id: string
  task_name: string
  started_at: number
  finished_at: number | null
  status: string
  result: string
}

type TaskAttachmentRow = {
  id: string
  run_id: string
  name: string
  kind: string
  content: string
  bytes: number
}

export class TaskStore {
  #db: DatabaseSync
  #onChange?: () => void

  constructor(userDataPath: string, options: { onChange?: () => void } = {}) {
    const root = join(userDataPath, 'tasks')
    mkdirSync(root, { recursive: true })
    this.#db = new DatabaseSync(join(root, 'tasks.sqlite'))
    this.#onChange = options.onChange
    this.#initialize()
  }

  close(): void {
    if (this.#db.isOpen) this.#db.close()
  }

  create(input: CreateTaskInput, now = Date.now()): ScheduledTask {
    const name = input.name.trim()
    const prompt = input.prompt.trim()
    const timezone = input.timezone.trim()
    if (!name) throw new Error('Task name cannot be empty.')
    if (!prompt) throw new Error('Task prompt cannot be empty.')
    if (!timezone) throw new Error('Task timezone cannot be empty.')
    if (input.scheduleType === 'once' && input.runAt == null) {
      throw new Error('One-shot tasks need a runAt time.')
    }
    if (input.scheduleType === 'recurring' && !input.cron?.trim()) {
      throw new Error('Recurring tasks need a cron expression.')
    }

    const record: ScheduledTask = {
      id: input.id ?? randomUUID(),
      name,
      kind: input.kind,
      prompt,
      scheduleType: input.scheduleType,
      runAt: input.scheduleType === 'once' ? (input.runAt ?? null) : null,
      cron: input.scheduleType === 'recurring' ? (input.cron?.trim() ?? null) : null,
      timezone,
      status: input.status ?? 'active',
      running: false,
      lastRun: null,
      nextRun: null,
      createdAt: input.createdAt ?? now,
      reportMode: input.reportMode ?? 'notify'
    }
    record.nextRun = computeNextRun({
      scheduleType: record.scheduleType,
      status: record.status,
      runAt: record.runAt,
      cron: record.cron,
      timezone: record.timezone,
      from: now
    })

    this.#db
      .prepare(
        `INSERT INTO tasks (
           id, name, kind, prompt, schedule_type, run_at, cron, timezone,
           status, running, last_run, next_run, created_at, report_mode
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?)`
      )
      .run(
        record.id,
        record.name,
        record.kind,
        record.prompt,
        record.scheduleType,
        record.runAt,
        record.cron,
        record.timezone,
        record.status,
        record.nextRun,
        record.createdAt,
        record.reportMode
      )
    this.#emitChange()
    return record
  }

  get(id: string): ScheduledTask | null {
    const row = this.#db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined
    return row ? toTask(row) : null
  }

  getSnapshot(): TasksSnapshot {
    return {
      tasks: this.list().map(toTaskView),
      runs: this.listRuns().slice(0, TASK_RUNS_SNAPSHOT_LIMIT).map(toTaskRunView)
    }
  }

  list(): ScheduledTask[] {
    const rows = this.#db
      .prepare(
        `SELECT * FROM tasks
         ORDER BY (next_run IS NULL), next_run ASC, created_at ASC`
      )
      .all() as unknown as TaskRow[]
    return rows.map(toTask)
  }

  due(now = Date.now()): ScheduledTask[] {
    const rows = this.#db
      .prepare(
        `SELECT * FROM tasks
         WHERE status = 'active'
           AND running = 0
           AND next_run IS NOT NULL
           AND next_run <= ?
         ORDER BY next_run ASC, created_at ASC`
      )
      .all(now) as unknown as TaskRow[]
    return rows.map(toTask)
  }

  nextRunAt(kind?: TaskKind): number | null {
    const row = (
      kind
        ? this.#db
            .prepare(
              `SELECT next_run FROM tasks
               WHERE status = 'active' AND running = 0 AND next_run IS NOT NULL AND kind = ?
               ORDER BY next_run ASC LIMIT 1`
            )
            .get(kind)
        : this.#db
            .prepare(
              `SELECT next_run FROM tasks
               WHERE status = 'active' AND running = 0 AND next_run IS NOT NULL
               ORDER BY next_run ASC LIMIT 1`
            )
            .get()
    ) as { next_run?: number } | undefined
    return row?.next_run == null ? null : Number(row.next_run)
  }

  update(id: string, patch: UpdateTaskInput, now = Date.now()): ScheduledTask | null {
    const current = this.get(id)
    if (!current) return null
    const next: ScheduledTask = {
      ...current,
      name: patch.name?.trim() ?? current.name,
      kind: patch.kind ?? current.kind,
      prompt: patch.prompt?.trim() ?? current.prompt,
      scheduleType: patch.scheduleType ?? current.scheduleType,
      runAt:
        patch.scheduleType === 'recurring'
          ? null
          : patch.runAt !== undefined
            ? patch.runAt
            : current.runAt,
      cron:
        patch.scheduleType === 'once'
          ? null
          : patch.cron !== undefined
            ? (patch.cron?.trim() ?? null)
            : current.cron,
      timezone: patch.timezone?.trim() ?? current.timezone,
      status: patch.status ?? current.status,
      reportMode: patch.reportMode ?? current.reportMode
    }
    if (!next.name) throw new Error('Task name cannot be empty.')
    if (!next.prompt) throw new Error('Task prompt cannot be empty.')
    if (!next.timezone) throw new Error('Task timezone cannot be empty.')
    if (next.scheduleType === 'once' && next.runAt == null) {
      throw new Error('One-shot tasks need a runAt time.')
    }
    if (next.scheduleType === 'recurring' && !next.cron) {
      throw new Error('Recurring tasks need a cron expression.')
    }
    next.nextRun = computeNextRun({
      scheduleType: next.scheduleType,
      status: next.status,
      runAt: next.runAt,
      cron: next.cron,
      timezone: next.timezone,
      from: now
    })
    this.#db
      .prepare(
        `UPDATE tasks SET
           name = ?, kind = ?, prompt = ?, schedule_type = ?, run_at = ?, cron = ?,
           timezone = ?, status = ?, next_run = ?, report_mode = ?
         WHERE id = ?`
      )
      .run(
        next.name,
        next.kind,
        next.prompt,
        next.scheduleType,
        next.runAt,
        next.cron,
        next.timezone,
        next.status,
        next.nextRun,
        next.reportMode,
        id
      )
    this.#emitChange()
    return this.get(id)
  }

  delete(id: string): boolean {
    const result = this.#db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
    if (result.changes > 0) this.#emitChange()
    return result.changes > 0
  }

  startRun(taskId: string, now = Date.now()): TaskRun | null {
    const task = this.get(taskId)
    if (!task) return null
    const record: TaskRun = {
      id: randomUUID(),
      taskId,
      taskName: task.name,
      startedAt: now,
      finishedAt: null,
      status: 'running',
      result: '',
      attachments: []
    }
    this.#db
      .prepare(
        `INSERT INTO task_runs (id, task_id, started_at, finished_at, status, result)
         VALUES (?, ?, ?, NULL, 'running', '')`
      )
      .run(record.id, record.taskId, record.startedAt)
    this.#emitChange()
    return record
  }

  finishTaskRun(
    runId: string,
    input: { status: Exclude<TaskRunStatus, 'running'>; result: string; now?: number }
  ): TaskRun | null {
    const now = input.now ?? Date.now()
    const result = capRunResult(input.result)
    this.#db
      .prepare(
        `UPDATE task_runs SET status = ?, result = ?, finished_at = ? WHERE id = ? AND status = 'running'`
      )
      .run(input.status, result, now, runId)
    const current = this.getRun(runId)
    if (current) this.#pruneRuns(current.taskId)
    this.#emitChange()
    return current
  }

  getRun(id: string): TaskRun | null {
    const row = this.#db
      .prepare(
        `SELECT r.id, r.task_id, t.name AS task_name, r.started_at, r.finished_at, r.status, r.result
         FROM task_runs r
         JOIN tasks t ON t.id = r.task_id
         WHERE r.id = ?`
      )
      .get(id) as TaskRunRow | undefined
    return row ? this.#hydrateRun(toRun(row)) : null
  }

  listRuns(taskId?: string): TaskRun[] {
    const rows = (
      taskId
        ? this.#db
            .prepare(
              `SELECT r.id, r.task_id, t.name AS task_name, r.started_at, r.finished_at, r.status, r.result
               FROM task_runs r
               JOIN tasks t ON t.id = r.task_id
               WHERE r.task_id = ?
               ORDER BY r.started_at DESC`
            )
            .all(taskId)
        : this.#db
            .prepare(
              `SELECT r.id, r.task_id, t.name AS task_name, r.started_at, r.finished_at, r.status, r.result
               FROM task_runs r
               JOIN tasks t ON t.id = r.task_id
               ORDER BY r.started_at DESC`
            )
            .all()
    ) as unknown as TaskRunRow[]
    return this.#hydrateRuns(rows.map(toRun))
  }

  addAttachment(
    runId: string,
    input: { name: string; kind: TaskAttachmentKind; content: string }
  ): TaskAttachment {
    if (!this.getRun(runId)) throw new Error('اجرا پیدا نشد.')
    if (!isTaskAttachmentKind(input.kind)) throw new Error('این نوع فایل پیوست نمی‌شود.')
    const content = input.content
    if (!content.trim() || content.includes('\0')) {
      throw new Error('محتوای پیوست خالی یا نامعتبر است.')
    }
    if (content.length > TASK_ATTACHMENT_MAX) {
      throw new Error('این پیوست بزرگ‌تر از حد مجاز است.')
    }
    const name = normalizeTaskAttachmentName(input.name, input.kind)
    const bytes = Buffer.byteLength(content, 'utf8')
    const existing = this.#db
      .prepare('SELECT id FROM task_run_attachments WHERE run_id = ? AND name = ?')
      .get(runId, name) as { id?: string } | undefined
    if (existing?.id) {
      this.#db
        .prepare(
          `UPDATE task_run_attachments SET kind = ?, content = ?, bytes = ? WHERE id = ?`
        )
        .run(input.kind, content, bytes, existing.id)
      this.#emitChange()
      const updated = this.getAttachment(existing.id)
      if (!updated) throw new Error('ذخیره پیوست ناموفق بود.')
      return updated
    }
    const count = this.#db
      .prepare('SELECT COUNT(*) AS count FROM task_run_attachments WHERE run_id = ?')
      .get(runId) as { count?: number } | undefined
    if (Number(count?.count ?? 0) >= TASK_ATTACHMENTS_PER_RUN) {
      throw new Error('برای هر اجرا حداکثر ۴ پیوست می‌شود.')
    }
    const id = randomUUID()
    this.#db
      .prepare(
        `INSERT INTO task_run_attachments (id, run_id, name, kind, content, bytes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, runId, name, input.kind, content, bytes, Date.now())
    this.#emitChange()
    const created = this.getAttachment(id)
    if (!created) throw new Error('ذخیره پیوست ناموفق بود.')
    return created
  }

  getAttachment(id: string): TaskAttachment | null {
    const row = this.#db
      .prepare('SELECT * FROM task_run_attachments WHERE id = ?')
      .get(id) as TaskAttachmentRow | undefined
    return row ? toAttachment(row) : null
  }

  setRunning(id: string, running: boolean): ScheduledTask | null {
    const result = this.#db
      .prepare('UPDATE tasks SET running = ? WHERE id = ?')
      .run(running ? 1 : 0, id)
    if (result.changes === 0) return null
    return this.get(id)
  }

  /**
   * A crash or quit mid-run leaves `running` set and a run row open, which would
   * block the task forever. Clearing both at boot is safe: nothing can still be
   * executing in a fresh process.
   */
  recoverInterrupted(now = Date.now()): { tasks: number; runs: number } {
    const runs = this.#db
      .prepare(
        `UPDATE task_runs SET status = 'error', result = ?, finished_at = ?
         WHERE status = 'running'`
      )
      .run(TASK_INTERRUPTED_RESULT, now)
    const tasks = this.#db.prepare('UPDATE tasks SET running = 0 WHERE running = 1').run()
    const recovered = { tasks: Number(tasks.changes), runs: Number(runs.changes) }
    if (recovered.tasks > 0 || recovered.runs > 0) this.#emitChange()
    return recovered
  }

  /**
   * Retires an occurrence that is too late to be useful: a one-shot becomes
   * `missed`, a recurring task simply moves on to its next slot.
   */
  skipMissed(id: string, now = Date.now()): ScheduledTask | null {
    const current = this.get(id)
    if (!current) return null
    if (current.scheduleType === 'once') {
      this.#db
        .prepare(`UPDATE tasks SET running = 0, status = 'missed', next_run = NULL WHERE id = ?`)
        .run(id)
    } else {
      const nextRun = computeNextRun({
        scheduleType: current.scheduleType,
        status: current.status,
        runAt: current.runAt,
        cron: current.cron,
        timezone: current.timezone,
        from: now
      })
      this.#db.prepare('UPDATE tasks SET running = 0, next_run = ? WHERE id = ?').run(nextRun, id)
    }
    this.#emitChange()
    return this.get(id)
  }

  finishRun(id: string, now = Date.now()): ScheduledTask | null {
    const current = this.get(id)
    if (!current) return null
    const status: TaskStatus = current.scheduleType === 'once' ? 'done' : current.status
    const nextRun =
      current.scheduleType === 'once'
        ? null
        : computeNextRun({
            scheduleType: current.scheduleType,
            status,
            runAt: current.runAt,
            cron: current.cron,
            timezone: current.timezone,
            from: now
          })
    this.#db
      .prepare(`UPDATE tasks SET running = 0, last_run = ?, status = ?, next_run = ? WHERE id = ?`)
      .run(now, status, nextRun, id)
    this.#emitChange()
    return this.get(id)
  }

  #initialize(): void {
    this.#db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;
    `)
    this.#ensureSchedulerTable()
    this.#ensureRunTable()
    this.#ensureAttachmentTable()
  }

  #ensureSchedulerTable(): void {
    if (this.#tableExists('tasks') && !this.#hasSchedulerSchema()) {
      const row = this.#db.prepare('SELECT COUNT(*) AS count FROM tasks').get() as
        { count?: number } | undefined
      if (Number(row?.count ?? 0) > 0) {
        this.#db.exec(
          'DROP TABLE IF EXISTS tasks_legacy; ALTER TABLE tasks RENAME TO tasks_legacy;'
        )
      } else {
        this.#db.exec('DROP TABLE tasks;')
      }
    }

    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('remind', 'run')),
        prompt TEXT NOT NULL,
        schedule_type TEXT NOT NULL CHECK (schedule_type IN ('once', 'recurring')),
        run_at INTEGER,
        cron TEXT,
        timezone TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'done', 'missed')),
        running INTEGER NOT NULL CHECK (running IN (0, 1)) DEFAULT 0,
        last_run INTEGER,
        next_run INTEGER,
        created_at INTEGER NOT NULL,
        report_mode TEXT NOT NULL CHECK (report_mode IN ('notify', 'silent'))
      );

      CREATE INDEX IF NOT EXISTS tasks_due
        ON tasks(status, running, next_run);
    `)
  }

  #ensureRunTable(): void {
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS task_runs (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        finished_at INTEGER,
        status TEXT NOT NULL CHECK (status IN ('running', 'ok', 'error')),
        result TEXT NOT NULL DEFAULT '',
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS task_runs_task
        ON task_runs(task_id, started_at DESC);
    `)
  }

  #ensureAttachmentTable(): void {
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS task_run_attachments (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('md', 'csv', 'txt')),
        content TEXT NOT NULL,
        bytes INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE (run_id, name),
        FOREIGN KEY (run_id) REFERENCES task_runs(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS task_run_attachments_run
        ON task_run_attachments(run_id, created_at ASC);
    `)
  }

  #hydrateRun(run: TaskRun): TaskRun {
    return this.#hydrateRuns([run])[0]!
  }

  #hydrateRuns(runs: TaskRun[]): TaskRun[] {
    if (runs.length === 0) return runs
    const grouped = this.#attachmentsByRunIds(runs.map((run) => run.id))
    return runs.map((run) => ({ ...run, attachments: grouped.get(run.id) ?? [] }))
  }

  #attachmentsByRunIds(runIds: string[]): Map<string, TaskAttachmentMeta[]> {
    const grouped = new Map<string, TaskAttachmentMeta[]>()
    if (runIds.length === 0) return grouped
    const placeholders = runIds.map(() => '?').join(', ')
    const rows = this.#db
      .prepare(
        `SELECT id, run_id, name, kind, bytes FROM task_run_attachments
         WHERE run_id IN (${placeholders})
         ORDER BY created_at ASC`
      )
      .all(...runIds) as unknown as Array<{
      id: string
      run_id: string
      name: string
      kind: string
      bytes: number
    }>
    for (const row of rows) {
      if (!isTaskAttachmentKind(row.kind)) continue
      const list = grouped.get(row.run_id) ?? []
      list.push({
        id: row.id,
        name: row.name,
        kind: row.kind,
        bytes: Number(row.bytes)
      })
      grouped.set(row.run_id, list)
    }
    return grouped
  }

  #pruneRuns(taskId: string): void {
    this.#db
      .prepare(
        `DELETE FROM task_runs
         WHERE task_id = ?
           AND id IN (
             SELECT id FROM task_runs
             WHERE task_id = ?
             ORDER BY started_at DESC
             LIMIT -1 OFFSET ?
           )`
      )
      .run(taskId, taskId, TASK_RUNS_PER_TASK)
  }

  #tableExists(name: string): boolean {
    const row = this.#db
      .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?`)
      .get(name) as { ok?: number } | undefined
    return row?.ok === 1
  }

  #hasSchedulerSchema(): boolean {
    const columns = this.#db.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string }>
    const names = new Set(columns.map((column) => column.name))
    return SCHEDULER_COLUMNS.every((column) => names.has(column))
  }

  #emitChange(): void {
    this.#onChange?.()
  }
}

const SCHEDULER_COLUMNS = [
  'id',
  'name',
  'kind',
  'prompt',
  'schedule_type',
  'run_at',
  'cron',
  'timezone',
  'status',
  'running',
  'last_run',
  'next_run',
  'created_at',
  'report_mode'
] as const

function toTask(row: TaskRow): ScheduledTask {
  if (!isTaskKind(row.kind)) throw new Error(`Invalid task kind "${row.kind}".`)
  if (!isTaskScheduleType(row.schedule_type)) {
    throw new Error(`Invalid task schedule "${row.schedule_type}".`)
  }
  if (!isTaskStatus(row.status)) throw new Error(`Invalid task status "${row.status}".`)
  if (!isTaskReportMode(row.report_mode)) {
    throw new Error(`Invalid task report mode "${row.report_mode}".`)
  }
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as TaskKind,
    prompt: row.prompt,
    scheduleType: row.schedule_type as TaskScheduleType,
    runAt: row.run_at == null ? null : Number(row.run_at),
    cron: row.cron,
    timezone: row.timezone,
    status: row.status as TaskStatus,
    running: row.running === 1,
    lastRun: row.last_run == null ? null : Number(row.last_run),
    nextRun: row.next_run == null ? null : Number(row.next_run),
    createdAt: Number(row.created_at),
    reportMode: row.report_mode as TaskReportMode
  }
}

function toRun(row: TaskRunRow): TaskRun {
  if (!isTaskRunStatus(row.status)) throw new Error(`Invalid task run status "${row.status}".`)
  return {
    id: row.id,
    taskId: row.task_id,
    taskName: row.task_name,
    startedAt: Number(row.started_at),
    finishedAt: row.finished_at == null ? null : Number(row.finished_at),
    status: row.status,
    result: row.result,
    attachments: []
  }
}

function toAttachment(row: TaskAttachmentRow): TaskAttachment {
  if (!isTaskAttachmentKind(row.kind)) throw new Error(`Invalid attachment kind "${row.kind}".`)
  return {
    id: row.id,
    runId: row.run_id,
    name: row.name,
    kind: row.kind,
    bytes: Number(row.bytes),
    content: row.content
  }
}

function capRunResult(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length <= TASK_RUN_RESULT_MAX) return trimmed
  return `${trimmed.slice(0, TASK_RUN_RESULT_MAX).trimEnd()}\n…`
}
