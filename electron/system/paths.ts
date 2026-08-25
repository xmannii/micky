import { homedir, tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { realpath } from 'node:fs/promises'

export type PathGuardOptions = {
  home?: string
  tmp?: string
}

const SECRET_HOME_PREFIXES = [
  '.ssh',
  '.aws',
  '.gnupg',
  '.pki',
  join('Library', 'Keychains'),
  join('Library', 'Cookies'),
  join('Library', 'Safari'),
  join('Library', 'Application Support', 'Google', 'Chrome'),
  join('Library', 'Application Support', 'Firefox'),
  join('Library', 'Application Support', 'BraveSoftware'),
  join('Library', 'Application Support', 'Arc'),
  join('Library', 'Application Support', 'Chromium'),
  join('Library', 'Application Support', 'Microsoft Edge'),
  join('.local', 'share', 'keyrings'),
  join('.local', 'share', 'kwalletd'),
  join('.config', 'google-chrome'),
  join('.config', 'chromium'),
  join('.config', 'BraveSoftware'),
  join('.config', 'microsoft-edge'),
  join('.mozilla', 'firefox'),
  '.mozilla',
  '.thunderbird',
  join('snap', 'firefox'),
  join('snap', 'chromium'),
  join('snap', 'brave'),
  join('snap', 'thunderbird'),
  join('.var', 'app', 'org.mozilla.firefox'),
  join('.var', 'app', 'org.mozilla.thunderbird'),
  join('.var', 'app', 'org.chromium.Chromium'),
  join('.var', 'app', 'com.google.Chrome'),
  join('.var', 'app', 'com.brave.Browser'),
  join('.var', 'app', 'com.microsoft.Edge')
]

const SECRET_BASENAME =
  /^(?:\.env(?:\..+)?|id_rsa.*|id_ed25519.*|id_ecdsa.*|id_dsa.*|.+\.pem|.+_history)$/i

export class PathDeniedError extends Error {
  constructor(message = 'این مسیر در دسترس نیست.') {
    super(message)
    this.name = 'PathDeniedError'
  }
}

export function expandHome(input: string, home = defaultHome()): string {
  const trimmed = input.trim()
  if (trimmed === '~') return home
  if (trimmed.startsWith('~/')) return join(home, trimmed.slice(2))
  return trimmed
}

export function looksLikePath(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  return (
    trimmed === '~' ||
    trimmed.startsWith('~/') ||
    trimmed.startsWith('.') ||
    trimmed.includes('/') ||
    trimmed.includes('\\')
  )
}

export async function resolveSafePath(
  input: string,
  options: PathGuardOptions = {}
): Promise<string> {
  const home = await realpathOrSelf(options.home ?? defaultHome())
  const tmp = await realpathOrSelf(options.tmp ?? tmpdir())
  const expanded = expandHome(input, home)
  if (!expanded) throw new PathDeniedError()
  const absolute = isAbsolute(expanded) ? resolve(expanded) : resolve(home, expanded)
  const resolved = await realpathExistingPrefix(absolute)
  assertAllowedPath(resolved, { home, tmp })
  return resolved
}

export function assertAllowedPath(resolved: string, options: PathGuardOptions = {}): void {
  const home = options.home ?? defaultHome()
  const roots = allowedRoots(home, options.tmp)
  if (!roots.some((root) => isInside(root, resolved))) {
    throw new PathDeniedError()
  }
  if (isSecretPath(home, resolved)) {
    throw new PathDeniedError()
  }
}

export function isSecretPath(home: string, resolved: string): boolean {
  const parts = resolved.split(sep).filter(Boolean)
  if (parts.some((part) => SECRET_BASENAME.test(part))) return true
  if (parts.includes('.ssh') || parts.includes('.aws') || parts.includes('.gnupg')) return true
  const libraryIndex = parts.lastIndexOf('Library')
  if (libraryIndex >= 0) {
    const after = parts.slice(libraryIndex + 1).join(sep)
    if (
      after === 'Keychains' ||
      after.startsWith(`Keychains${sep}`) ||
      after === 'Cookies' ||
      after.startsWith(`Cookies${sep}`) ||
      after === 'Safari' ||
      after.startsWith(`Safari${sep}`) ||
      after.startsWith(`Application Support${sep}Google${sep}Chrome`) ||
      after.startsWith(`Application Support${sep}Firefox`) ||
      after.startsWith(`Application Support${sep}BraveSoftware`) ||
      after.startsWith(`Application Support${sep}Arc`) ||
      after.startsWith(`Application Support${sep}Chromium`) ||
      after.startsWith(`Application Support${sep}Microsoft Edge`)
    ) {
      return true
    }
  }
  const rel = relative(home, resolved)
  if (rel.startsWith('..') || isAbsolute(rel)) return false
  return SECRET_HOME_PREFIXES.some((prefix) => rel === prefix || rel.startsWith(`${prefix}${sep}`))
}

export function lineLooksSecret(line: string, home = defaultHome()): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  const candidate = trimmed.split(/\s+/).at(-1) ?? trimmed
  if (isSecretPath(home, candidate)) return true
  return ['.ssh', '.aws', '.gnupg', 'Keychains'].some(
    (part) => trimmed.includes(`${sep}${part}${sep}`) || trimmed.endsWith(`${sep}${part}`)
  )
}

function allowedRoots(home: string, tmp = tmpdir()): string[] {
  const roots = [home, tmp, '/tmp']
  if (process.platform === 'darwin') {
    roots.push('/private/tmp', '/Applications', '/Volumes')
  }
  return roots.map((root) => resolve(root))
}

function isInside(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
}

async function realpathExistingPrefix(absolute: string): Promise<string> {
  const missing: string[] = []
  let current = absolute
  for (;;) {
    try {
      const real = await realpath(current)
      return missing.length === 0 ? real : join(real, ...missing.reverse())
    } catch {
      const parent = dirname(current)
      if (parent === current) {
        throw new PathDeniedError('این مسیر پیدا نشد.')
      }
      missing.push(basename(current))
      current = parent
    }
  }
}

function defaultHome(): string {
  return homedir()
}

async function realpathOrSelf(value: string): Promise<string> {
  try {
    return await realpath(value)
  } catch {
    return resolve(value)
  }
}
