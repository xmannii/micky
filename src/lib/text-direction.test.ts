import assert from 'node:assert/strict'
import test from 'node:test'
import { detectTextDirection } from './text-direction'

test('uses the dominant writing direction across the whole text', () => {
  assert.equal(detectTextDirection('سلام میکی'), 'rtl')
  assert.equal(detectTextDirection('open my notes'), 'ltr')
  assert.equal(detectTextDirection('ChatGPT پاسخ کامل فارسی را اینجا می‌دهد'), 'rtl')
  assert.equal(detectTextDirection('سلام this answer is mostly written in English'), 'ltr')
})

test('treats a URL or product name as one directional word', () => {
  assert.equal(detectTextDirection('https://example.com/docs راهنمای کامل اینجاست'), 'rtl')
  assert.equal(detectTextDirection('OpenAI API رو باز کن'), 'rtl')
})

test('keeps the fallback while the draft has no letters yet', () => {
  assert.equal(detectTextDirection(''), 'rtl')
  assert.equal(detectTextDirection('  ۱۲۳ …'), 'rtl')
  assert.equal(detectTextDirection('123', 'ltr'), 'ltr')
})

test('does not count Persian or Arabic-Indic digits as directional words', () => {
  for (const digits of ['123 456', '۱۲۳ ۴۵۶', '١٢٣ ٤٥٦']) {
    assert.equal(detectTextDirection(`Hello ${digits}`), 'ltr')
    assert.equal(detectTextDirection(`سلام ${digits}`, 'ltr'), 'rtl')
    assert.equal(detectTextDirection(digits, 'ltr'), 'ltr')
    assert.equal(detectTextDirection(digits, 'rtl'), 'rtl')
  }
})

test("does not let attached numerals outweigh a word's letters", () => {
  assert.equal(detectTextDirection('API۱۲۳۴'), 'ltr')
  assert.equal(detectTextDirection('API١٢٣٤'), 'ltr')
  assert.equal(detectTextDirection('سلام1234', 'ltr'), 'rtl')
  assert.equal(detectTextDirection('Ⅻ'), 'ltr')
})
