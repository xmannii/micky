export const TASK_KINDS = ['remind', 'run'] as const
export type TaskKind = (typeof TASK_KINDS)[number]

export const TASK_SCHEDULE_TYPES = ['once', 'recurring'] as const
export type TaskScheduleType = (typeof TASK_SCHEDULE_TYPES)[number]

export const TASK_STATUSES = ['active', 'paused', 'done', 'missed'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_REPORT_MODES = ['notify', 'silent'] as const
export type TaskReportMode = (typeof TASK_REPORT_MODES)[number]

export const TASK_RUN_STATUSES = ['running', 'ok', 'error'] as const
export type TaskRunStatus = (typeof TASK_RUN_STATUSES)[number]

export const TASK_CHECK_INTERVAL_MS = 60_000
export const TASK_MISSED_GRACE_MS = 30 * 60_000
export const TASK_INTERRUPTED_RESULT = 'میکی بسته شد و این کار نیمه‌کاره ماند.'
export const TASK_SEED_DELAY_MS = 15_000
export const TASK_SEED_ID = 'm0-seed'
export const TASK_RUN_RESULT_MAX = 12_000
export const TASK_RUNS_PER_TASK = 20
export const TASK_RUNS_SNAPSHOT_LIMIT = 40
export const TASK_ATTACHMENT_KINDS = ['md', 'csv', 'txt'] as const
export type TaskAttachmentKind = (typeof TASK_ATTACHMENT_KINDS)[number]
export const TASK_ATTACHMENT_MAX = 80_000
export const TASK_ATTACHMENTS_PER_RUN = 4
export const TASKS_SNAPSHOT_CHANNEL = 'tasks:snapshot'
export const TASKS_OPEN_RUN_CHANNEL = 'tasks:open-run'

export type ScheduledTask = {
  id: string
  name: string
  kind: TaskKind
  prompt: string
  scheduleType: TaskScheduleType
  runAt: number | null
  cron: string | null
  timezone: string
  status: TaskStatus
  running: boolean
  lastRun: number | null
  nextRun: number | null
  createdAt: number
  reportMode: TaskReportMode
}

export type CreateTaskInput = {
  id?: string
  name: string
  kind: TaskKind
  prompt: string
  scheduleType: TaskScheduleType
  runAt?: number | null
  cron?: string | null
  timezone: string
  status?: TaskStatus
  reportMode?: TaskReportMode
  createdAt?: number
}

export type UpdateTaskInput = {
  name?: string
  kind?: TaskKind
  prompt?: string
  scheduleType?: TaskScheduleType
  runAt?: number | null
  cron?: string | null
  timezone?: string
  status?: TaskStatus
  reportMode?: TaskReportMode
}

export type TaskPatchPayload = {
  name?: string
  kind?: TaskKind
  prompt?: string
  scheduleType?: TaskScheduleType
  runAt?: string | null
  cron?: string | null
  timezone?: string
  status?: TaskStatus
  reportMode?: TaskReportMode
}

export function isTaskKind(value: unknown): value is TaskKind {
  return typeof value === 'string' && (TASK_KINDS as readonly string[]).includes(value)
}

export function isTaskScheduleType(value: unknown): value is TaskScheduleType {
  return typeof value === 'string' && (TASK_SCHEDULE_TYPES as readonly string[]).includes(value)
}

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && (TASK_STATUSES as readonly string[]).includes(value)
}

export function isTaskReportMode(value: unknown): value is TaskReportMode {
  return typeof value === 'string' && (TASK_REPORT_MODES as readonly string[]).includes(value)
}

export function isTaskRunStatus(value: unknown): value is TaskRunStatus {
  return typeof value === 'string' && (TASK_RUN_STATUSES as readonly string[]).includes(value)
}

export function isTaskAttachmentKind(value: unknown): value is TaskAttachmentKind {
  return typeof value === 'string' && (TASK_ATTACHMENT_KINDS as readonly string[]).includes(value)
}

export function normalizeTaskAttachmentName(name: string, kind: TaskAttachmentKind): string {
  const trimmed = name
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 60)
  const base = (trimmed || 'file').replace(/\.(md|txt|csv)$/i, '')
  return `${base.trim() || 'file'}.${kind}`
}

export function systemTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

export type TaskView = {
  id: string
  name: string
  kind: TaskKind
  prompt: string
  scheduleType: TaskScheduleType
  cron: string | null
  runAt: string | null
  timezone: string
  status: TaskStatus
  nextRun: string | null
  reportMode: TaskReportMode
}

export function toTaskView(task: ScheduledTask): TaskView {
  return {
    id: task.id,
    name: task.name,
    kind: task.kind,
    prompt: task.prompt,
    scheduleType: task.scheduleType,
    cron: task.cron,
    runAt: toIso(task.runAt),
    timezone: task.timezone,
    status: task.status,
    nextRun: toIso(task.nextRun),
    reportMode: task.reportMode
  }
}

function toIso(value: number | null): string | null {
  return value == null ? null : new Date(value).toISOString()
}

export type TaskAttachmentMeta = {
  id: string
  name: string
  kind: TaskAttachmentKind
  bytes: number
}

export type TaskAttachment = TaskAttachmentMeta & {
  runId: string
  content: string
}

export type TaskRun = {
  id: string
  taskId: string
  taskName: string
  startedAt: number
  finishedAt: number | null
  status: TaskRunStatus
  result: string
  attachments: TaskAttachmentMeta[]
}

export type TaskRunView = {
  id: string
  taskId: string
  taskName: string
  startedAt: string
  finishedAt: string | null
  status: TaskRunStatus
  result: string
  attachments: TaskAttachmentMeta[]
}

export function toTaskRunView(run: TaskRun): TaskRunView {
  return {
    id: run.id,
    taskId: run.taskId,
    taskName: run.taskName,
    startedAt: toIso(run.startedAt) ?? new Date(run.startedAt).toISOString(),
    finishedAt: toIso(run.finishedAt),
    status: run.status,
    result: run.result,
    attachments: run.attachments
  }
}

export type TasksSnapshot = {
  tasks: TaskView[]
  runs: TaskRunView[]
}

export const EMPTY_TASKS_SNAPSHOT: TasksSnapshot = { tasks: [], runs: [] }

export function formatTaskWhen(iso: string | null, timeZone: string): string {
  if (!iso) return 'زمان بعدی ندارد'
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return 'زمان بعدی ندارد'
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      timeZone,
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(ms))
  } catch {
    return new Intl.DateTimeFormat('fa-IR', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(ms))
  }
}

export function taskStatusLabel(status: TaskStatus): string {
  if (status === 'paused') return 'متوقف'
  if (status === 'done') return 'انجام‌شده'
  if (status === 'missed') return 'از دست رفته'
  return 'فعال'
}

export function taskKindLabel(kind: TaskKind): string {
  return kind === 'run' ? 'کار' : 'یادآوری'
}

export function taskReportModeLabel(mode: TaskReportMode): string {
  return mode === 'silent' ? 'بی‌صدا' : 'اعلان'
}

export function taskRunStatusLabel(status: TaskRunStatus): string {
  if (status === 'running') return 'در حال انجام'
  if (status === 'error') return 'خطا'
  return 'آماده'
}

export function excerptTaskResult(text: string, max = 180): string {
  const compact = text
    .replace(/[#*_`>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (compact.length <= max) return compact
  return `${compact.slice(0, max).trimEnd()}…`
}
