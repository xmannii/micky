import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import {
  TASK_ATTACHMENT_MAX,
  excerptTaskResult,
  isTaskKind,
  isTaskReportMode,
  isTaskStatus,
  systemTimeZone,
  taskKindLabel,
  toTaskView,
  type TaskScheduleType
} from '@/lib/tasks'
import { DEFAULT_TOOL_APPROVALS, type ToolApprovalMode } from '@/lib/settings'
import type { ApprovalRequest } from '../system/exec'
import { parseCron } from './schedule'
import type { TaskStore } from './store'

type TaskToolHooks = {
  tasks?: TaskStore
  toolApprovals?: { manage_tasks?: ToolApprovalMode }
  requestApproval?: (request: ApprovalRequest) => Promise<boolean>
}

export function registerTaskTools(tools: ToolSet, hooks: TaskToolHooks): void {
  if (!hooks.tasks) return
  if (getManageTasksMode(hooks) === 'blocked') return
  const store = hooks.tasks

  tools.list_tasks = tool({
    description:
      'List locally stored scheduled reminders and jobs, including the latest result excerpt for run jobs. Use when the user asks what is scheduled, what already ran, what the result was, before editing or deleting a task whose id is unknown, or to check that a new task was saved.',
    inputSchema: z.object({
      status: z
        .enum(['active', 'paused', 'done', 'missed'])
        .optional()
        .describe('If set, only return tasks with this status')
    }),
    execute: async ({ status }) => {
      const latestRun = new Map<string, ReturnType<TaskStore['listRuns']>[number]>()
      for (const run of store.listRuns()) {
        if (!latestRun.has(run.taskId)) latestRun.set(run.taskId, run)
      }
      const tasks = store
        .list()
        .filter((task) => !status || task.status === status)
        .slice(0, 40)
        .map((task) => {
          const run = latestRun.get(task.id)
          return {
            ...toTaskView(task),
            lastRun: run
              ? {
                  status: run.status,
                  at: new Date(run.startedAt).toISOString(),
                  excerpt: excerptTaskResult(run.result, 280),
                  attachments: run.attachments.map((file) => file.name)
                }
              : null
          }
        })
      return { tasks, count: tasks.length }
    }
  })

  tools.create_task = tool({
    description:
      "Create a local scheduled reminder or job. This is Micky's scheduler; never substitute launchd, crontab, Calendar, Shortcuts, write_file, or run_command. Use after they ask to be reminded or to do work later, or after they accept an offer you just made — never from a hunch. Use kind remind when they want to be told or nudged; prompt is the notification text. Use kind run when they want Micky to do work later (summarize, check, look up, daily news, a csv or markdown file); prompt is the full unattended job instructions, including attach_file when a downloadable file should sit on that run. Kind defaults to remind — always set kind run for jobs. Recurring work needs a 5-field cron (minute hour day-of-month month day-of-week). Do not fetch or do the job in this turn unless they also asked for it now. Claim success only after this tool returns. Convert spoken Persian times with the local clock: one-shot tasks need runAt as ISO-8601. Store timezone explicitly. Do not ask the user to type.",
    inputSchema: z.object({
      name: z.string().min(1).max(80).describe('Short Persian name for the task'),
      kind: z
        .enum(['remind', 'run'])
        .optional()
        .describe(
          'remind = notification only; run = unattended job whose result and any attached md/csv/txt files appear in کارها. Defaults to remind'
        ),
      prompt: z
        .string()
        .min(1)
        .max(1_000)
        .describe(
          'For remind, the exact notification text. For run, the complete instructions Micky should execute later; say to attach a csv or markdown file when the artifact is a file'
        ),
      scheduleType: z.enum(['once', 'recurring']),
      runAt: z
        .string()
        .max(40)
        .optional()
        .describe('ISO-8601 datetime for a one-shot task, including offset or Z'),
      cron: z
        .string()
        .max(80)
        .optional()
        .describe('5-field cron for recurring tasks, for example 0 21 * * *'),
      timezone: z
        .string()
        .max(80)
        .optional()
        .describe('IANA timezone; omit to use the computer timezone'),
      reportMode: z.enum(['notify', 'silent']).optional(),
      purpose: z
        .string()
        .min(1)
        .max(160)
        .optional()
        .describe('One short Persian sentence describing the saved schedule')
    }),
    execute: async (input) =>
      guardTask(async () => {
        const kind = input.kind && isTaskKind(input.kind) ? input.kind : 'remind'
        const scheduleType = input.scheduleType
        const timezone = input.timezone?.trim() || systemTimeZone()
        const parsed = parseSchedule(scheduleType, input.runAt, input.cron)
        if ('message' in parsed) return { created: false, message: parsed.message }
        const approved = await requestTaskApproval(hooks, 'create', {
          purpose: input.purpose?.trim() || `${taskKindLabel(kind)} «${input.name.trim()}» را ذخیره کنم؟`,
          command: input.name.trim(),
          toolName: 'create_task',
          detail: scheduleDetail(scheduleType, parsed.runAt, parsed.cron, timezone)
        })
        if (!approved) return approvalDenied()
        const reportMode =
          input.reportMode && isTaskReportMode(input.reportMode) ? input.reportMode : 'notify'
        const task = store.create({
          name: input.name,
          kind,
          prompt: input.prompt,
          scheduleType,
          runAt: parsed.runAt,
          cron: parsed.cron,
          timezone,
          reportMode
        })
        return { created: true, task: toTaskView(task) }
      })
  })

  tools.update_task = tool({
    description:
      'Edit an existing scheduled task. Use list_tasks first if you do not have the id. Pass only fields that should change. To pause or resume, set status. To change the time, pass a new runAt or cron.',
    inputSchema: z.object({
      id: z.string().uuid().describe('Task id from list_tasks or create_task'),
      name: z.string().min(1).max(80).optional(),
      kind: z.enum(['remind', 'run']).optional(),
      prompt: z.string().min(1).max(1_000).optional(),
      scheduleType: z.enum(['once', 'recurring']).optional(),
      runAt: z.string().max(40).optional(),
      cron: z.string().max(80).optional(),
      timezone: z.string().max(80).optional(),
      status: z.enum(['active', 'paused', 'done']).optional(),
      reportMode: z.enum(['notify', 'silent']).optional(),
      purpose: z
        .string()
        .min(1)
        .max(160)
        .optional()
        .describe('One short Persian sentence describing the change')
    }),
    execute: async (input) =>
      guardTask(async () => {
        const current = store.get(input.id)
        if (!current) return { updated: false, message: 'زمان‌بندی پیدا نشد.' }
        const scheduleType = input.scheduleType ?? current.scheduleType
        const parsed = parseSchedule(
          scheduleType,
          input.runAt,
          input.cron,
          current.runAt,
          current.cron
        )
        if ('message' in parsed) return { updated: false, message: parsed.message }
        const approved = await requestTaskApproval(hooks, 'update', {
          purpose: input.purpose?.trim() || `${taskKindLabel(current.kind)} «${current.name}» را عوض کنم؟`,
          command: current.name,
          toolName: 'update_task',
          detail: input.id
        })
        if (!approved) return approvalDenied()
        const task = store.update(input.id, {
          name: input.name,
          kind: input.kind && isTaskKind(input.kind) ? input.kind : undefined,
          prompt: input.prompt,
          scheduleType: input.scheduleType,
          runAt: input.runAt !== undefined || input.scheduleType ? parsed.runAt : undefined,
          cron: input.cron !== undefined || input.scheduleType ? parsed.cron : undefined,
          timezone: input.timezone,
          status: input.status && isTaskStatus(input.status) ? input.status : undefined,
          reportMode:
            input.reportMode && isTaskReportMode(input.reportMode) ? input.reportMode : undefined
        })
        if (!task) return { updated: false, message: 'زمان‌بندی پیدا نشد.' }
        return { updated: true, task: toTaskView(task) }
      })
  })

  tools.delete_task = tool({
    description: 'Delete a scheduled task. Use list_tasks first if you do not have the id.',
    inputSchema: z.object({
      id: z.string().uuid().describe('Task id from list_tasks'),
      purpose: z
        .string()
        .min(1)
        .max(160)
        .optional()
        .describe('One short Persian sentence describing the deletion')
    }),
    execute: async ({ id, purpose }) =>
      guardTask(async () => {
        const current = store.get(id)
        if (!current) return { deleted: false, message: 'زمان‌بندی پیدا نشد.' }
        const approved = await requestTaskApproval(hooks, 'delete', {
          purpose: purpose?.trim() || `${taskKindLabel(current.kind)} «${current.name}» را حذف کنم؟`,
          command: current.name,
          toolName: 'delete_task',
          detail: id
        })
        if (!approved) return approvalDenied()
        return { deleted: store.delete(id), id }
      })
  })
}

export function registerAttachFileTool(
  tools: ToolSet,
  hooks: { tasks?: TaskStore; taskRunId?: string; profile?: string }
): void {
  if (hooks.profile !== 'unattended' || !hooks.tasks || !hooks.taskRunId) return
  const store = hooks.tasks
  const runId = hooks.taskRunId

  tools.attach_file = tool({
    description:
      'Attach a markdown, CSV, or plain-text file to this job run. Use when the useful artifact is a table, draft, or downloadable list — not a substitute for the readable writeup in کارها. Never pass a filesystem path; name and kind only. Do not attach a copy of the same writeup. At most four files per run; the same name overwrites.',
    inputSchema: z.object({
      name: z.string().min(1).max(80).describe('Short file name, with or without an extension'),
      kind: z.enum(['md', 'csv', 'txt']).describe('md, csv, or txt only'),
      content: z
        .string()
        .min(1)
        .max(TASK_ATTACHMENT_MAX)
        .describe('The exact UTF-8 file contents')
    }),
    execute: async ({ name, kind, content }) =>
      guardTask(async () => {
        const file = store.addAttachment(runId, { name, kind, content })
        return { attached: true, name: file.name, kind: file.kind, bytes: file.bytes }
      })
  })
}

type TaskMutation = 'create' | 'update' | 'delete'

function getManageTasksMode(hooks: TaskToolHooks): ToolApprovalMode {
  return hooks.toolApprovals?.manage_tasks ?? DEFAULT_TOOL_APPROVALS.manage_tasks
}

async function requestTaskApproval(
  hooks: TaskToolHooks,
  action: TaskMutation,
  request: ApprovalRequest
): Promise<boolean> {
  const mode = getManageTasksMode(hooks)
  const needsApproval = mode === 'confirm' || (mode === 'smart' && action === 'delete')
  if (!needsApproval) return true
  return hooks.requestApproval?.(request) ?? false
}

function parseSchedule(
  scheduleType: TaskScheduleType,
  runAtRaw?: string,
  cronRaw?: string | null,
  fallbackRunAt?: number | null,
  fallbackCron?: string | null
): { runAt: number | null; cron: string | null } | { message: string } {
  if (scheduleType === 'once') {
    if (runAtRaw?.trim()) {
      const runAt = Date.parse(runAtRaw)
      if (!Number.isFinite(runAt)) return { message: 'زمان ذخیره‌شده نامعتبر است.' }
      return { runAt, cron: null }
    }
    if (fallbackRunAt != null) return { runAt: fallbackRunAt, cron: null }
    return { message: 'برای کار یک‌بار باید زمان را بگویی.' }
  }
  const cron = cronRaw?.trim() || fallbackCron?.trim() || ''
  if (!cron) return { message: 'برای کار تکراری باید الگوی زمان را بگویی.' }
  try {
    parseCron(cron)
  } catch {
    return { message: 'عبارت زمان نامعتبر است.' }
  }
  return { runAt: null, cron }
}

function scheduleDetail(
  scheduleType: TaskScheduleType,
  runAt: number | null,
  cron: string | null,
  timezone: string
): string {
  if (scheduleType === 'once' && runAt != null) {
    return `${new Date(runAt).toISOString()} (${timezone})`
  }
  return `${cron ?? ''} (${timezone})`
}

function approvalDenied(): { approved: false; message: string } {
  return { approved: false, message: 'کاربر اجازه نداد.' }
}

async function guardTask<T>(run: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await run()
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim() ? error.message : 'ذخیره زمان‌بندی ناموفق بود.'
    return { error: message }
  }
}
