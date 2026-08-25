import assert from 'node:assert/strict'
import test from 'node:test'
import { compareVersions, extractVersionNotes, selectReleaseAsset } from './app-update'

test('compareVersions handles tags, missing parts, and prereleases', () => {
  assert.equal(compareVersions('v0.0.5', '0.0.4'), 1)
  assert.equal(compareVersions('1.2', '1.2.0'), 0)
  assert.equal(compareVersions('1.2.0-beta.2', '1.2.0-beta.10'), -1)
  assert.equal(compareVersions('1.2.0', '1.2.0-rc.1'), 1)
})

test('extractVersionNotes returns only the requested changelog section', () => {
  const changelog =
    '# Changelog\n\n## 0.0.4 — today\n\n### Added\n\n- Updates.\n\n## 0.0.3 — yesterday\n\n- Older.'
  assert.equal(extractVersionNotes(changelog, 'v0.0.4'), '### Added\n\n- Updates.')
})

test('selectReleaseAsset prefers the current platform and architecture', () => {
  const assets = [
    { name: 'micky-0.0.5-arm64.dmg', downloadUrl: 'arm' },
    { name: 'micky-0.0.5-x64.dmg', downloadUrl: 'intel' },
    { name: 'micky-0.0.5-x64-setup.exe', downloadUrl: 'windows' },
    { name: 'micky-0.0.5-x64.AppImage', downloadUrl: 'linux-appimage' },
    { name: 'micky-0.0.5-amd64.deb', downloadUrl: 'linux-deb' }
  ]
  assert.equal(selectReleaseAsset(assets, 'darwin', 'arm64')?.downloadUrl, 'arm')
  assert.equal(selectReleaseAsset(assets, 'win32', 'x64')?.downloadUrl, 'windows')
  assert.equal(selectReleaseAsset(assets, 'linux', 'x64')?.downloadUrl, 'linux-appimage')
  assert.equal(
    selectReleaseAsset([assets[4]], 'linux', 'x64')?.downloadUrl,
    'linux-deb'
  )
  assert.equal(
    selectReleaseAsset([assets[0]], 'darwin', 'x64'),
    null,
    'does not offer an incompatible single-architecture download'
  )
})
