import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { PathDeniedError, resolveSafePath } from './paths'

async function fakeHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'micky-home-'))
}

test('resolves paths under the home directory', async () => {
  const home = await fakeHome()
  await writeFile(join(home, 'note.txt'), 'hi', 'utf8')
  const resolved = await resolveSafePath('~/note.txt', { home })
  assert.equal(resolved, await realpath(join(home, 'note.txt')))
})

test('denies ssh keys and env files', async () => {
  const home = await fakeHome()
  await mkdir(join(home, '.ssh'), { recursive: true })
  await writeFile(join(home, '.ssh', 'id_rsa'), 'secret', 'utf8')
  await writeFile(join(home, '.env'), 'TOKEN=1', 'utf8')
  await writeFile(join(home, 'notes_history'), 'hist', 'utf8')

  await assert.rejects(() => resolveSafePath('~/.ssh/id_rsa', { home }), PathDeniedError)
  await assert.rejects(() => resolveSafePath(join(home, '.env'), { home }), PathDeniedError)
  await assert.rejects(() => resolveSafePath('~/notes_history', { home }), PathDeniedError)
})

test('denies Linux confidential and browser directories', async () => {
  const home = await fakeHome()
  await mkdir(join(home, '.config', 'google-chrome', 'Default'), { recursive: true })
  await writeFile(join(home, '.config', 'google-chrome', 'Default', 'Cookies'), 'secret', 'utf8')
  await mkdir(join(home, '.local', 'share', 'keyrings'), { recursive: true })
  await writeFile(join(home, '.local', 'share', 'keyrings', 'login.keyring'), 'secret', 'utf8')
  await mkdir(join(home, '.mozilla', 'firefox'), { recursive: true })
  await writeFile(join(home, '.mozilla', 'firefox', 'profiles.ini'), 'secret', 'utf8')

  await assert.rejects(
    () => resolveSafePath('~/.config/google-chrome/Default/Cookies', { home }),
    PathDeniedError
  )
  await assert.rejects(
    () => resolveSafePath('~/.local/share/keyrings/login.keyring', { home }),
    PathDeniedError
  )
  await assert.rejects(
    () => resolveSafePath('~/.mozilla/firefox/profiles.ini', { home }),
    PathDeniedError
  )
})

test('denies traversal into secret directories', async () => {
  const home = await fakeHome()
  await mkdir(join(home, '.ssh'), { recursive: true })
  await writeFile(join(home, '.ssh', 'id_rsa'), 'secret', 'utf8')
  await mkdir(join(home, 'docs'), { recursive: true })

  await assert.rejects(() => resolveSafePath('~/docs/../../.ssh/id_rsa', { home }), PathDeniedError)
})

test('denies a symlink that escapes into a secret file', async () => {
  const home = await fakeHome()
  await mkdir(join(home, '.ssh'), { recursive: true })
  const secret = join(home, '.ssh', 'id_rsa')
  await writeFile(secret, 'secret', 'utf8')
  await mkdir(join(home, 'docs'), { recursive: true })
  const link = join(home, 'docs', 'note')
  await symlink(secret, link)

  await assert.rejects(() => resolveSafePath('~/docs/note', { home }), PathDeniedError)
})

test('denies paths outside home, tmp, Applications, and Volumes', async () => {
  const home = await fakeHome()
  await assert.rejects(() => resolveSafePath('/etc/passwd', { home }), PathDeniedError)
})
