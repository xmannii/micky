export const APP_UPDATE_SNAPSHOT_CHANNEL = 'app-update:snapshot'

export const MICKY_RELEASES_URL = 'https://github.com/xmannii/micky/releases'
export const MICKY_LATEST_RELEASE_API = 'https://api.github.com/repos/xmannii/micky/releases/latest'

export type AppUpdatePhase = 'idle' | 'checking' | 'ready' | 'error'

export type AppUpdateSnapshot = {
  phase: AppUpdatePhase
  currentVersion: string
  currentReleaseNotes: string
  latestVersion: string | null
  releaseName: string | null
  releaseNotes: string
  publishedAt: string | null
  updateAvailable: boolean
  downloadUrl: string | null
  releaseUrl: string
  checkedAt: string | null
  error: string | null
}

export type ReleaseAsset = {
  name: string
  downloadUrl: string
}

export function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '').split('+', 1)[0] ?? ''
}

export function compareVersions(left: string, right: string): number {
  const [leftCore = '', leftPrerelease] = normalizeVersion(left).split('-', 2)
  const [rightCore = '', rightPrerelease] = normalizeVersion(right).split('-', 2)
  const leftParts = leftCore.split('.').map(toVersionNumber)
  const rightParts = rightCore.split('.').map(toVersionNumber)
  const length = Math.max(leftParts.length, rightParts.length, 3)

  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (difference !== 0) return difference > 0 ? 1 : -1
  }

  if (leftPrerelease === rightPrerelease) return 0
  if (!leftPrerelease) return 1
  if (!rightPrerelease) return -1
  return comparePrerelease(leftPrerelease, rightPrerelease)
}

export function extractVersionNotes(changelog: string, version: string): string {
  const normalized = normalizeVersion(version)
  const sections = changelog.split(/^##\s+/m).slice(1)
  const section = sections.find((candidate) => {
    const heading = candidate.split('\n', 1)[0] ?? ''
    const headingVersion = heading.trim().split(/\s|—|-/u, 1)[0] ?? ''
    return normalizeVersion(headingVersion) === normalized
  })
  if (!section) return ''
  return section.split('\n').slice(1).join('\n').trim()
}

export function selectReleaseAsset(
  assets: ReleaseAsset[],
  platform: string,
  arch: string
): ReleaseAsset | null {
  const allowedExtensions =
    platform === 'darwin'
      ? ['.dmg']
      : platform === 'win32'
        ? ['.exe']
        : ['.appimage', '.deb']

  const compatible = assets.filter((asset) => {
    const lower = asset.name.toLowerCase()
    return allowedExtensions.some((extension) => lower.endsWith(extension))
  })
  if (compatible.length === 0) return null

  const archPatterns =
    arch === 'arm64'
      ? [/arm64/i, /aarch64/i]
      : arch === 'x64'
        ? [/(^|[-_.])x64([-_.]|$)/i, /x86_64/i, /amd64/i]
        : [new RegExp(escapeRegExp(arch), 'i')]

  const matched = compatible.filter((asset) =>
    archPatterns.some((pattern) => pattern.test(asset.name))
  )

  if (matched.length > 0) {
    if (platform === 'linux') {
      return matched.find((asset) => asset.name.toLowerCase().endsWith('.appimage')) ?? matched[0]!
    }
    return matched[0]!
  }

  const universal = compatible.find((asset) => /universal|all[-_.]?arch/i.test(asset.name))
  if (universal) return universal

  if (compatible.length === 1 && !/arm64|aarch64|x64|x86_64|amd64/i.test(compatible[0]!.name)) {
    return compatible[0]!
  }

  return null
}

function toVersionNumber(value: string): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function comparePrerelease(left: string, right: string): number {
  const leftParts = left.split('.')
  const rightParts = right.split('.')
  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index]
    const rightPart = rightParts[index]
    if (leftPart === rightPart) continue
    if (leftPart === undefined) return -1
    if (rightPart === undefined) return 1
    const leftNumber = /^\d+$/.test(leftPart) ? Number(leftPart) : null
    const rightNumber = /^\d+$/.test(rightPart) ? Number(rightPart) : null
    if (leftNumber !== null && rightNumber !== null) return leftNumber > rightNumber ? 1 : -1
    if (leftNumber !== null) return -1
    if (rightNumber !== null) return 1
    return leftPart.localeCompare(rightPart)
  }
  return 0
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
