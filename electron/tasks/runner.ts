import {
  TASK_CHECK_INTERVAL_MS,
  TASK_MISSED_GRACE_MS,
  TASK_SEED_DELAY_MS,
  TASK_SEED_ID,
  excerptTaskResult,
  systemTimeZone,
  type ScheduledTask
} from '@/lib/tasks'
import type { TaskStore } from './store'

export type TaskNotifyMeta = {
  title?: string
  runId?: string
}

export type TaskRunnerOptions = {
  now?: () => number
  delay?: (fn: () => void, ms: number) => unknown
  cancel?: (id: unknown) => void
  notify?: (body: string, meta?: TaskNotifyMeta) => void
  log?: (message: string) => void
  checkIntervalMs?: number
  graceMs?: number
  runJob?: (task: ScheduledTask) => Promise<string>
}

export class TaskRunner {
  #store: TaskStore
  #now: () => number
  #delay: (fn: () => void, ms: number) => unknown
  #cancel: (id: unknown) => void
  #notify: (body: string, meta?: TaskNotifyMeta) => void
  #log: (message: string) => void
  #checkIntervalMs: number
  #graceMs: number
  #runJob?: (task: ScheduledTask) => Promise<string>
  #timer: unknown = null
  #started = false
  #jobs: Promise<void> = Promise.resolve()

  constructor(store: TaskStore, options: TaskRunnerOptions = {}) {
    this.#store = store
    this.#now = options.now ?? Date.now
    this.#delay = options.delay ?? ((fn, ms) => setTimeout(fn, ms))
    this.#cancel = options.cancel ?? ((id) => clearTimeout(id as NodeJS.Timeout))
    this.#notify = options.notify ?? (() => {})
    this.#log = options.log ?? ((message) => console.log(message))
    this.#checkIntervalMs = options.checkIntervalMs ?? TASK_CHECK_INTERVAL_MS
    this.#graceMs = options.graceMs ?? TASK_MISSED_GRACE_MS
    this.#runJob = options.runJob
  }

  start(): void {
    if (this.#started) return
    this.#started = true
    this.#arm()
  }

  stop(): void {
    this.#started = false
    this.#clearTimer()
  }

  reschedule(): void {
    if (!this.#started) return
    this.#arm()
  }

  /**
   * Timers do not fire while the machine sleeps, so a wake has to catch up
   * immediately instead of waiting for the next interval.
   */
  resume(): void {
    if (!this.#started) return
    this.#log('[tasks] checking schedule after wake')
    this.#tick()
  }

  #arm(): void {
    this.#clearTimer()
    if (!this.#started) return
    const now = this.#now()
    const next = this.#store.nextRunAt()
    const wait =
      next == null
        ? this.#checkIntervalMs
        : Math.max(0, Math.min(next - now, this.#checkIntervalMs))
    this.#timer = this.#delay(() => {
      this.#tick()
    }, wait)
  }

  #tick(): void {
    const now = this.#now()
    for (const task of this.#store.due(now)) {
      this.#fire(task, now)
    }
    this.#arm()
  }

  #fire(task: ScheduledTask, now: number): void {
    if (task.running) return
    if (this.#isTooLate(task, now)) {
      const skipped = this.#store.skipMissed(task.id, now)
      this.#log(`[tasks] skipped ${task.name}: ${skipped?.status === 'missed' ? 'missed' : 'stale'}`)
      return
    }
    if (task.kind === 'remind') {
      this.#store.setRunning(task.id, true)
      try {
        this.#log(`[tasks] fired ${task.name}: ${task.prompt}`)
        if (task.reportMode === 'notify') this.#notify(task.prompt, { title: task.name })
      } finally {
        this.#store.finishRun(task.id, now)
      }
      return
    }
    this.#enqueueRun(task, now)
  }

  #enqueueRun(task: ScheduledTask, now: number): void {
    this.#store.setRunning(task.id, true)
    const run = this.#store.startRun(task.id, now)
    if (!run) {
      this.#store.setRunning(task.id, false)
      return
    }
    this.#jobs = this.#jobs
      .then(() => this.#executeRun(task, run.id, now))
      .catch((error) => {
        const message = error instanceof Error && error.message.trim() ? error.message : String(error)
        this.#log(`[tasks] run queue failed: ${message}`)
      })
  }

  async #executeRun(task: ScheduledTask, runId: string, now: number): Promise<void> {
    try {
      if (!this.#runJob) {
        this.#store.finishTaskRun(runId, {
          status: 'error',
          result: 'عامل زمان‌دار در دسترس نیست.',
          now
        })
        return
      }
      this.#log(`[tasks] running ${task.name}`)
      const text = (await this.#runJob(task)).trim()
      const result = text || 'نتیجه‌ای برنگشت.'
      this.#store.finishTaskRun(runId, { status: 'ok', result, now: this.#now() })
      if (task.reportMode === 'notify') {
        this.#notify(excerptTaskResult(result), { title: task.name, runId })
      }
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : 'انجام این کار ناموفق بود.'
      this.#store.finishTaskRun(runId, { status: 'error', result: message, now: this.#now() })
      if (task.reportMode === 'notify') {
        this.#notify(message, { title: task.name, runId })
      }
    } finally {
      this.#store.finishRun(task.id, this.#now())
    }
  }

  #isTooLate(task: ScheduledTask, now: number): boolean {
    if (task.nextRun == null) return false
    return now - task.nextRun > this.#graceMs
  }

  #clearTimer(): void {
    if (this.#timer == null) return
    this.#cancel(this.#timer)
    this.#timer = null
  }
}

export function seedSmokeTask(store: TaskStore, now = Date.now()): ScheduledTask | null {
  if (store.get(TASK_SEED_ID)) return null
  return store.create(
    {
      id: TASK_SEED_ID,
      name: 'M0 seed',
      kind: 'remind',
      prompt: 'hello',
      scheduleType: 'once',
      runAt: now + TASK_SEED_DELAY_MS,
      timezone: systemTimeZone(),
      reportMode: 'notify',
      createdAt: now
    },
    now
  )
}
