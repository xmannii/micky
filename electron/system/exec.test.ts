import assert from 'node:assert/strict'
import test from 'node:test'
import { linuxAppLaunchId } from './exec'

test('linuxAppLaunchId accepts desktop ids and strips a .desktop suffix', () => {
  assert.equal(linuxAppLaunchId('firefox'), 'firefox')
  assert.equal(linuxAppLaunchId(' org.gnome.Nautilus '), 'org.gnome.Nautilus')
  assert.equal(linuxAppLaunchId('code.desktop'), 'code')
  assert.equal(linuxAppLaunchId('Code.Desktop'), 'Code')
})

test('linuxAppLaunchId rejects paths, flags, and shell-like names', () => {
  assert.equal(linuxAppLaunchId(''), null)
  assert.equal(linuxAppLaunchId('-a'), null)
  assert.equal(linuxAppLaunchId('/usr/bin/curl'), null)
  assert.equal(linuxAppLaunchId('../usr/bin/curl'), null)
  assert.equal(linuxAppLaunchId('bash; rm -rf /'), null)
  assert.equal(linuxAppLaunchId('Visual Studio Code'), null)
})
