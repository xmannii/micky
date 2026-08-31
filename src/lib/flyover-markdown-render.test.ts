import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ChatMarkdown, FlyoverMarkdown } from '@/components/flyover-markdown'

test('renders flyover emphasis and GFM tables as semantic markup', () => {
  const html = renderToStaticMarkup(
    createElement(FlyoverMarkdown, {
      text: '**نتیجه**\n\n| نام | مقدار |\n| --- | --- |\n| سرعت | خوب |',
      onRendered() {}
    })
  )

  assert.match(html, /<strong>نتیجه<\/strong>/)
  assert.match(html, /class="markdown-table-scroll"/)
  assert.match(html, /<table>/)
})

test('does not render raw HTML or Markdown images in the flyover', () => {
  const html = renderToStaticMarkup(
    createElement(FlyoverMarkdown, {
      text: '<script>alert(1)</script>\n\n![remote](https://example.com/image.png)',
      onRendered() {}
    })
  )

  assert.doesNotMatch(html, /<script|<img/i)
})

test('renders the same safe Markdown inside chat history', () => {
  const html = renderToStaticMarkup(
    createElement(ChatMarkdown, {
      text: '## نتیجه\n\n- **اول**\n- دوم'
    })
  )

  assert.match(html, /class="markdown-content chat-markdown"/)
  assert.match(html, /<h2>نتیجه<\/h2>/)
  assert.match(html, /<strong>اول<\/strong>/)
})

test('lets the reader follow the text direction automatically', () => {
  const html = renderToStaticMarkup(
    createElement(ChatMarkdown, {
      text: '## GTA 6\n\nCyberleek update from Mashable.',
      dir: 'auto'
    })
  )

  assert.match(html, /dir="auto"/)
  assert.match(html, /<h2>GTA 6<\/h2>/)
})
