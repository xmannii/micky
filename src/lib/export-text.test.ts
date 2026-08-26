import assert from 'node:assert/strict'
import test from 'node:test'
import {
  chatToMarkdown,
  resolveExportPath,
  sanitizeExportFileName,
  withExportExtension
} from './export-text'

test('sanitizes export names and keeps a markdown default', () => {
  assert.equal(sanitizeExportFileName('GTA 6 / news: tonight?'), 'GTA 6 news tonight')
  assert.equal(withExportExtension('خبرهای GTA 6.md'), 'خبرهای GTA 6.md')
  assert.equal(withExportExtension(''), 'micky.md')
})

test('only allows markdown or text save paths', () => {
  assert.equal(resolveExportPath('/tmp/news.md'), '/tmp/news.md')
  assert.equal(resolveExportPath('/tmp/news.txt'), '/tmp/news.txt')
  assert.equal(resolveExportPath('/tmp/news.csv'), '/tmp/news.csv')
  assert.equal(resolveExportPath('/tmp/news'), '/tmp/news.md')
  assert.equal(resolveExportPath('/tmp/news.sh'), null)
  assert.equal(resolveExportPath(''), null)
})

test('turns a chat into readable markdown', () => {
  const markdown = chatToMarkdown({
    title: 'GTA 6',
    messages: [
      { role: 'user', content: 'خبر بده' },
      { role: 'assistant', content: 'لو رفته.' }
    ]
  })
  assert.match(markdown, /^# GTA 6\n/)
  assert.match(markdown, /## تو\n\nخبر بده/)
  assert.match(markdown, /## میکی\n\nلو رفته\./)
})
