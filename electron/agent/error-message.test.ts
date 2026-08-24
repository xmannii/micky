import assert from 'node:assert/strict'
import test from 'node:test'
import { agentErrorMessage, emptyResponseMessage } from './error-message'

test('turns an empty model generation into a helpful retry message', () => {
  assert.equal(agentErrorMessage(new Error('No output generated.')), emptyResponseMessage())
})

test('keeps provider failures friendly and actionable', () => {
  assert.match(agentErrorMessage(new Error('HTTP 429: rate limit exceeded')), /فعلاً در دسترس نیست/)
  assert.match(agentErrorMessage(new Error('401 Unauthorized')), /کلید OpenRouter/)
  assert.match(agentErrorMessage(new Error('fetch failed')), /اینترنت/)
})
