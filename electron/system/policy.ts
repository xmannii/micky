import { basename } from 'node:path'
import {
  PathDeniedError,
  assertAllowedPath,
  expandHome,
  looksLikePath,
  resolveSafePath,
  type PathGuardOptions
} from './paths'
import { isSandboxAvailable } from './sandbox'

export type CommandTier = 'auto' | 'confirm' | 'blocked'

export type ClassifiedCommand = {
  tier: CommandTier
  argv: string[] | null
  binary: string | null
  reason: string
}

const AUTO_BINARIES = new Set([
  'ls',
  'cat',
  'head',
  'tail',
  'wc',
  'file',
  'stat',
  'grep',
  'rg',
  'du',
  'df',
  'date',
  'uname',
  'sw_vers',
  'ps',
  'which',
  'echo',
  'defaults',
  'sysctl'
])

const GIT_AUTO_SUBCOMMANDS = new Set(['status', 'log', 'diff', 'show', 'branch', 'ls-files'])

const BLOCKED_BINARIES = new Set([
  'sudo',
  'su',
  'dd',
  'mkfs',
  'csrutil',
  'nvram',
  'security',
  'launchctl',
  'crontab'
])

const SHELL_META = /(?:[|;&`$<>()\n\r]|&&|\|\|)/
const DOWNLOAD_TO_SHELL =
  /\b(?:curl|wget|fetch|Invoke-WebRequest)\b[\s\S]*\|[\s\S]*\b(?:sh|bash|zsh|fish|pwsh|powershell)\b/i

export async function classifyCommand(
  command: string,
  options: PathGuardOptions = {}
): Promise<ClassifiedCommand> {
  const trimmed = command.trim()
  if (!trimmed) {
    return { tier: 'blocked', argv: null, binary: null, reason: 'empty' }
  }
  if (DOWNLOAD_TO_SHELL.test(trimmed)) {
    return { tier: 'blocked', argv: null, binary: null, reason: 'download-pipe' }
  }
  if (/\bsudo\b/i.test(trimmed) || /\bcsrutil\b/i.test(trimmed)) {
    return { tier: 'blocked', argv: null, binary: null, reason: 'privileged' }
  }
  if (/\blaunchctl\b/i.test(trimmed) || /\bcrontab\b/i.test(trimmed)) {
    return { tier: 'blocked', argv: null, binary: null, reason: 'os-scheduler' }
  }

  const argv = parseArgv(trimmed)
  const binary = argv ? basename(argv[0] ?? '') : inferBinary(trimmed)

  if (binary && BLOCKED_BINARIES.has(binary)) {
    return { tier: 'blocked', argv, binary, reason: 'blocked-binary' }
  }
  if (binary === 'diskutil' && argv?.some((arg) => /^erase/i.test(arg))) {
    return { tier: 'blocked', argv, binary, reason: 'disk-erase' }
  }

  if (!argv) {
    return { tier: 'confirm', argv: null, binary, reason: 'shell-meta' }
  }

  try {
    await assertCommandPaths(argv, options)
  } catch (error) {
    if (error instanceof PathDeniedError) {
      return { tier: 'blocked', argv, binary, reason: 'secret-path' }
    }
    throw error
  }

  if (isAutoArgv(argv, binary) && isSandboxAvailable()) {
    return { tier: 'auto', argv, binary, reason: 'allowlist' }
  }
  return { tier: 'confirm', argv, binary, reason: 'needs-approval' }
}

export function parseArgv(command: string): string[] | null {
  if (SHELL_META.test(command)) return null
  const args: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!
    if (quote) {
      if (ch === '\\' && quote === '"' && i + 1 < command.length) {
        current += command[++i]
        continue
      }
      if (ch === quote) {
        quote = null
        continue
      }
      current += ch
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (/\s/.test(ch)) {
      if (current) {
        args.push(current)
        current = ''
      }
      continue
    }
    current += ch
  }
  if (quote) return null
  if (current) args.push(current)
  return args.length > 0 ? args : null
}

function inferBinary(command: string): string | null {
  const first = command.split(/\s+/)[0]
  return first ? basename(first) : null
}

function isAutoArgv(argv: string[], binary: string | null): boolean {
  if (!binary || argv[0]?.includes('/') || argv[0]?.includes('\\')) return false
  if (binary === 'git') return isAutoGit(argv)
  if (binary === 'defaults') return argv[1] === 'read'
  if (binary === 'sysctl') return argv[1] === '-n'
  return AUTO_BINARIES.has(binary)
}

function isAutoGit(argv: string[]): boolean {
  if (argv.some((arg) => arg === '-C' || arg.startsWith('--git-dir') || arg === '-c')) {
    return false
  }
  const sub = argv[1]
  if (sub === 'remote') return argv[2] === '-v' && argv.length === 3
  return Boolean(sub && GIT_AUTO_SUBCOMMANDS.has(sub))
}

async function assertCommandPaths(argv: string[], options: PathGuardOptions): Promise<void> {
  for (const raw of argv.slice(1)) {
    if (!looksLikePath(raw)) continue
    const expanded = expandHome(raw, options.home)
    if (looksLikePath(expanded)) {
      await resolveSafePath(expanded, options)
    } else {
      assertAllowedPath(expanded, options)
    }
  }
}
