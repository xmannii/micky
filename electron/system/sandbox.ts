import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { COMMAND_OUTPUT_CAP, capOutput } from './output'

export const COMMAND_TIMEOUT_MS = 15_000
const SANDBOX_EXEC = '/usr/bin/sandbox-exec'

const MAC_DEFAULT_PATH = '/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin'
const LINUX_DEFAULT_PATH = `/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin:/snap/bin:${join(homedir(), '.local/bin')}`

const SEATBELT_POLICY = `(version 1)
(deny default)
(allow file-read*)
(allow file-write-data
  (literal "/dev/null")
  (literal "/dev/dtracehelper")
)
(allow file-ioctl
  (literal "/dev/dtracehelper")
)
(allow process-exec)
(allow process-fork)
(allow signal (target self))
(allow sysctl-read)
(allow mach-lookup)
`

export type ExecResult = {
  ok: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  truncated: boolean
  timedOut: boolean
  sandboxDenied: boolean
}

export function isSandboxAvailable(): boolean {
  return process.platform === 'darwin' && existsSync(SANDBOX_EXEC)
}

export async function runArgv(
  argv: string[],
  options: {
    sandboxed: boolean
    cwd?: string
    abortSignal?: AbortSignal
    timeoutMs?: number
  }
): Promise<ExecResult> {
  if (argv.length === 0) {
    return {
      ok: false,
      exitCode: null,
      stdout: '',
      stderr: 'empty command',
      truncated: false,
      timedOut: false,
      sandboxDenied: false
    }
  }

  const timeoutMs = options.timeoutMs ?? COMMAND_TIMEOUT_MS
  const command = options.sandboxed ? [SANDBOX_EXEC, '-p', SEATBELT_POLICY, '--', ...argv] : argv
  const child = spawn(command[0]!, command.slice(1), {
    cwd: options.cwd ?? homedir(),
    env: {
      PATH:
        process.platform === 'darwin'
          ? MAC_DEFAULT_PATH
          : process.env.PATH || LINUX_DEFAULT_PATH,
      HOME: homedir(),
      USER: process.env.USER ?? '',
      LANG: process.env.LANG ?? 'en_US.UTF-8',
      TMPDIR: process.env.TMPDIR ?? '/tmp',
      TERM: 'dumb'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  let stdout = ''
  let stderr = ''
  let truncated = false
  const take = (chunk: Buffer, current: string): string => {
    const next = current + chunk.toString('utf8')
    if (next.length <= COMMAND_OUTPUT_CAP) return next
    truncated = true
    return next.slice(0, COMMAND_OUTPUT_CAP)
  }
  child.stdout?.on('data', (chunk: Buffer) => {
    stdout = take(chunk, stdout)
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr = take(chunk, stderr)
  })

  const abort = (): void => {
    if (!child.killed) child.kill('SIGKILL')
  }
  const onAbort = (): void => abort()
  options.abortSignal?.addEventListener('abort', onAbort, { once: true })

  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    abort()
  }, timeoutMs)

  try {
    const exitCode: number | null = await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code) => resolve(code))
    })
    const stdoutCap = capOutput(stdout, COMMAND_OUTPUT_CAP)
    const stderrCap = capOutput(stderr, COMMAND_OUTPUT_CAP)
    truncated = truncated || stdoutCap.truncated || stderrCap.truncated
    const sandboxDenied =
      options.sandboxed &&
      exitCode !== 0 &&
      /sandbox|operation not permitted/i.test(`${stderrCap.text}\n${stdoutCap.text}`)
    return {
      ok: exitCode === 0 && !timedOut,
      exitCode,
      stdout: stdoutCap.text,
      stderr: stderrCap.text,
      truncated,
      timedOut,
      sandboxDenied
    }
  } catch (error) {
    return {
      ok: false,
      exitCode: null,
      stdout,
      stderr: error instanceof Error ? error.message : 'command failed',
      truncated,
      timedOut,
      sandboxDenied: false
    }
  } finally {
    clearTimeout(timer)
    options.abortSignal?.removeEventListener('abort', onAbort)
  }
}
