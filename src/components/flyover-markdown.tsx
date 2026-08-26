import { memo, useEffect } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { detectTextDirection } from '@/lib/text-direction'
import { cn } from '@/lib/utils'

const MARKDOWN_PLUGINS = [remarkGfm]

const MARKDOWN_COMPONENTS: Components = {
  table({ node, ...props }) {
    void node
    return (
      <div className="markdown-table-scroll" tabIndex={0} role="region" aria-label="جدول">
        <table {...props} />
      </div>
    )
  }
}

function MarkdownContent({
  text,
  surface,
  dir
}: {
  text: string
  surface: 'flyover' | 'chat'
  dir?: 'auto' | 'rtl' | 'ltr'
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'markdown-content',
        surface === 'flyover' ? 'flyover-markdown' : 'chat-markdown'
      )}
      dir={dir ?? detectTextDirection(text)}
    >
      <Markdown
        remarkPlugins={MARKDOWN_PLUGINS}
        components={MARKDOWN_COMPONENTS}
        skipHtml
        disallowedElements={['img']}
      >
        {text}
      </Markdown>
    </div>
  )
}

export const FlyoverMarkdown = memo(function FlyoverMarkdown({
  text,
  onRendered
}: {
  text: string
  onRendered: () => void
}): React.JSX.Element {
  useEffect(() => {
    onRendered()
  }, [onRendered, text])

  return <MarkdownContent text={text} surface="flyover" />
})

export const ChatMarkdown = memo(function ChatMarkdown({
  text,
  dir
}: {
  text: string
  dir?: 'auto' | 'rtl' | 'ltr'
}): React.JSX.Element {
  return <MarkdownContent text={text} surface="chat" dir={dir} />
})
