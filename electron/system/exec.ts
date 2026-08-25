import { homedir } from 'node:os'
import { classifyCommand } from './policy'
import {
  PathDeniedError,
  lineLooksSecret,
  looksLikePath,
  resolveSafePath,
  type PathGuardOptions
} from './paths'
import { COMMAND_TIMEOUT_MS, isSandboxAvailable, runArgv, type ExecResult } from './sandbox'
import type { ToolApprovalMode } from '@/lib/settings'

export type ApprovalRequest = {
  purpose: string
  command: string
  toolName?: string
  detail?: string
}

export type RunCommandResult = {
  ran: boolean
  approved?: boolean
  blocked?: boolean
  exitCode?: number | null
  stdout?: string
  stderr?: string
  truncated?: boolean
  timedOut?: boolean
  message?: string
}

export async function runUserCommand(
  command: string,
  purpose: string,
  options: {
    requestApproval: (request: ApprovalRequest) => Promise<boolean>
    approvalMode?: Exclude<ToolApprovalMode, 'blocked'>
    abortSignal?: AbortSignal
    path?: PathGuardOptions
  }
): Promise<RunCommandResult> {
  const classified = await classifyCommand(command, options.path)
  if (classified.tier === 'blocked') {
    return {
      ran: false,
      blocked: true,
      message: 'این دستور اجازه اجرا ندارد.'
    }
  }

  const approvalMode = options.approvalMode ?? 'smart'
  const sandboxAvailable = isSandboxAvailable()
  const needsApproval =
    approvalMode === 'confirm' ||
    (approvalMode === 'smart' &&
      (classified.tier === 'confirm' || (classified.tier === 'auto' && !sandboxAvailable)))

  if (needsApproval) {
    const approved = await options.requestApproval({
      purpose: purpose.trim() || 'می‌خوام یه دستور روی سیستم اجرا کنم.',
      command,
      toolName: 'run_command',
      detail: command
    })
    if (!approved) {
      return { ran: false, approved: false, message: 'کاربر اجازه نداد.' }
    }
  }

  if (classified.tier === 'confirm' || !sandboxAvailable) {
    return finish(
      await runArgv(classified.argv ?? ['/bin/bash', '-lc', command], {
        sandboxed: false,
        abortSignal: options.abortSignal,
        cwd: options.path?.home ?? homedir()
      })
    )
  }

  if (!classified.argv) {
    return { ran: false, blocked: true, message: 'این دستور قابل اجرا نیست.' }
  }

  return finish(
    await runArgv(classified.argv, {
      sandboxed: true,
      abortSignal: options.abortSignal,
      timeoutMs: COMMAND_TIMEOUT_MS,
      cwd: options.path?.home ?? homedir()
    })
  )
}

export async function openUserTarget(
  target: string,
  options: PathGuardOptions = {}
): Promise<{ opened: boolean; message?: string }> {
  if (process.platform !== 'darwin' && process.platform !== 'linux') {
    return { opened: false, message: 'باز کردن برنامه فعلاً فقط روی مک و لینوکس است.' }
  }
  const trimmed = target.trim()
  if (!trimmed) return { opened: false, message: 'چیزی برای باز کردن نیست.' }
  if (/[\n\r;|&$`<>]/.test(trimmed)) {
    return { opened: false, message: 'این هدف مجاز نیست.' }
  }

  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) {
    if (!/^https?:\/\//i.test(trimmed) && !/^mailto:/i.test(trimmed)) {
      return { opened: false, message: 'فقط لینک‌های معمولی باز می‌شوند.' }
    }
    const opener = process.platform === 'darwin' ? '/usr/bin/open' : LINUX_OPENER
    const result = await runArgv([opener, trimmed], {
      sandboxed: false,
      timeoutMs: 8_000
    })
    return result.ok ? { opened: true } : { opened: false, message: result.stderr || 'باز نشد.' }
  }

  if (looksLikePath(trimmed)) {
    try {
      const path = await resolveSafePath(trimmed, options)
      const opener = process.platform === 'darwin' ? '/usr/bin/open' : LINUX_OPENER
      const result = await runArgv([opener, path], {
        sandboxed: false,
        timeoutMs: 8_000
      })
      return result.ok ? { opened: true } : { opened: false, message: result.stderr || 'باز نشد.' }
    } catch (error) {
      if (error instanceof PathDeniedError) {
        return { opened: false, message: error.message }
      }
      throw error
    }
  }

  if (trimmed.startsWith('-')) {
    return { opened: false, message: 'اسم برنامه نامعتبر است.' }
  }

  if (process.platform === 'darwin') {
    const result = await runArgv(['/usr/bin/open', '-a', trimmed], {
      sandboxed: false,
      timeoutMs: 8_000
    })
    return result.ok
      ? { opened: true }
      : { opened: false, message: result.stderr || 'برنامه پیدا نشد.' }
  }

  const launchId = linuxAppLaunchId(trimmed)
  if (!launchId) {
    return { opened: false, message: 'اسم برنامه نامعتبر است.' }
  }

  const gtkResult = await runArgv([LINUX_LAUNCHER, launchId], {
    sandboxed: false,
    timeoutMs: 8_000
  })
  return gtkResult.ok
    ? { opened: true }
    : { opened: false, message: gtkResult.stderr || 'برنامه پیدا نشد.' }
}

const LINUX_OPENER = '/usr/bin/xdg-open'
const LINUX_LAUNCHER = '/usr/bin/gtk-launch'

export function linuxAppLaunchId(target: string): string | null {
  const trimmed = target.trim()
  if (!trimmed || trimmed.startsWith('-') || trimmed.includes('/') || trimmed.includes('\\')) {
    return null
  }
  if (/[\n\r;|&$`<>]/.test(trimmed)) return null
  const desktopId = trimmed.replace(/\.desktop$/i, '')
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(desktopId)) return null
  return desktopId
}

function finish(result: ExecResult): RunCommandResult {
  return {
    ran: true,
    exitCode: result.exitCode,
    stdout: scrub(result.stdout),
    stderr: scrub(result.stderr),
    truncated: result.truncated,
    timedOut: result.timedOut,
    message: result.timedOut
      ? 'زمان دستور تمام شد.'
      : result.sandboxDenied
        ? 'سندباکس جلوی این دستور را گرفت.'
        : undefined
  }
}

function scrub(text: string): string {
  return text
    .split('\n')
    .filter((line) => !lineLooksSecret(line))
    .join('\n')
}
