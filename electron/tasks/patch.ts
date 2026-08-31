import {
  isTaskKind,
  isTaskReportMode,
  isTaskScheduleType,
  isTaskStatus,
  type UpdateTaskInput
} from '@/lib/tasks'

export function parseTaskId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const id = value.trim()
  if (!id || id.length > 80 || id.includes('/') || id.includes('\\') || id.includes('..')) {
    return null
  }
  return id
}

export function parseTaskPatch(value: unknown): UpdateTaskInput | null {
  if (!isRecord(value)) return null
  const patch: UpdateTaskInput = {}
  let any = false

  if (typeof value.name === 'string') {
    patch.name = value.name
    any = true
  }
  if (typeof value.prompt === 'string') {
    patch.prompt = value.prompt
    any = true
  }
  if (isTaskKind(value.kind)) {
    patch.kind = value.kind
    any = true
  }
  if (isTaskScheduleType(value.scheduleType)) {
    patch.scheduleType = value.scheduleType
    any = true
  }
  if (value.runAt === null) {
    patch.runAt = null
    any = true
  } else if (typeof value.runAt === 'string') {
    const runAt = Date.parse(value.runAt)
    if (!Number.isFinite(runAt)) return null
    patch.runAt = runAt
    any = true
  }
  if (value.cron === null) {
    patch.cron = null
    any = true
  } else if (typeof value.cron === 'string') {
    patch.cron = value.cron
    any = true
  }
  if (typeof value.timezone === 'string') {
    patch.timezone = value.timezone
    any = true
  }
  if (value.status === 'active' || value.status === 'paused' || value.status === 'done') {
    if (isTaskStatus(value.status)) {
      patch.status = value.status
      any = true
    }
  }
  if (isTaskReportMode(value.reportMode)) {
    patch.reportMode = value.reportMode
    any = true
  }

  return any ? patch : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
