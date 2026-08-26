import { ArrowRight, History, MessageSquareText, Mic, Search, Trash2 } from 'lucide-react'
import { lazy, memo, Suspense, useDeferredValue, useEffect, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { TextExportActions } from '@/components/text-export-actions'
import type { ChatDetail, ChatSearchHit, ChatSummary, ChatsSnapshot } from '@/lib/chats'
import { chatToMarkdown } from '@/lib/export-text'
import { hasRichMarkdown } from '@/lib/flyover-markdown'

const ChatMarkdown = lazy(() =>
  import('@/components/flyover-markdown').then((module) => ({ default: module.ChatMarkdown }))
)

const PERSIAN_DATE = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  day: 'numeric',
  month: 'long'
})
const PERSIAN_TIME = new Intl.DateTimeFormat('fa-IR', {
  hour: '2-digit',
  minute: '2-digit'
})

export function ChatHistoryView({
  snapshot,
  onBack,
  onOpen
}: {
  snapshot: ChatsSnapshot | null
  onBack: () => void
  onOpen: (chatId: string) => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.trim())
  const [searchResults, setSearchResults] = useState<ChatSearchHit[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (!deferredQuery) {
      setSearching(false)
      setSearchResults([])
      return
    }
    let active = true
    setSearching(true)
    void window.api.chats
      .search({ query: deferredQuery, limit: 20 })
      .then((results) => {
        if (active) setSearchResults(results)
      })
      .catch(() => {
        if (active) setSearchResults([])
      })
      .finally(() => {
        if (active) setSearching(false)
      })
    return () => {
      active = false
    }
  }, [deferredQuery])

  const chats: ChatSummary[] = deferredQuery ? searchResults : (snapshot?.chats ?? [])
  const groups = groupChatsByDay(chats)

  return (
    <main className="voice-shell flex h-full min-h-0 flex-col overflow-hidden">
      <CompanionTitlebar />
      <section className="flex shrink-0 items-center gap-2 px-4 pb-3">
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="بازگشت">
          <ArrowRight />
        </Button>
        <div className="flex min-w-0 flex-1 flex-col text-start">
          <h1 className="text-sm font-medium">گفتگوها</h1>
          <p className="text-[0.65rem] text-muted-foreground">فقط روی همین دستگاه</p>
        </div>
      </section>

      <div className="relative shrink-0 px-4 pb-3">
        <Search
          className="pointer-events-none absolute top-2.5 right-7 size-4 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="ps-9"
          placeholder="جستجو در گفتگوها"
          aria-label="جستجو در گفتگوها"
        />
      </div>

      <ScrollArea className="min-h-0 flex-1 border-t border-border/40">
        <div className="flex flex-col gap-5 px-4 py-4">
          {groups.length > 0 ? (
            groups.map((group) => (
              <section key={group.key} className="flex flex-col gap-2" aria-labelledby={group.key}>
                <h2
                  id={group.key}
                  className="px-1 text-[0.68rem] font-medium text-muted-foreground"
                >
                  {group.label}
                </h2>
                <div className="flex flex-col">
                  {group.chats.map((chat, index) => (
                    <div key={chat.id}>
                      {index > 0 ? <Separator className="opacity-45" /> : null}
                      <ChatRow
                        chat={chat}
                        active={snapshot?.activeChatId === chat.id}
                        onOpen={() => onOpen(chat.id)}
                      />
                    </div>
                  ))}
                </div>
              </section>
            ))
          ) : (
            <Empty className="min-h-80 border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  {searching ? <Search /> : deferredQuery ? <Search /> : <History />}
                </EmptyMedia>
                <EmptyTitle>{searching ? 'دارم می‌گردم…' : 'گفتگویی پیدا نشد'}</EmptyTitle>
                <EmptyDescription>
                  {deferredQuery
                    ? 'با واژه دیگری جستجو کن.'
                    : 'اولین گفتگوی صوتی‌ات اینجا می‌ماند.'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </ScrollArea>
    </main>
  )
}

export function ChatDetailView({
  chatId,
  updatedAt,
  onBack,
  onResume,
  onDeleted
}: {
  chatId: string
  updatedAt?: number
  onBack: () => void
  onResume: (chatId: string) => void
  onDeleted: () => void
}): React.JSX.Element {
  const [chat, setChat] = useState<ChatDetail | null>(null)

  useEffect(() => {
    let active = true
    void window.api.chats
      .get(chatId)
      .then((next) => {
        if (active) setChat(next)
      })
      .catch(() => {
        if (active) setChat(null)
      })
    return () => {
      active = false
    }
  }, [chatId, updatedAt])

  const handleDelete = async (): Promise<void> => {
    const result = await window.api.chats.delete(chatId)
    if (result.deleted) onDeleted()
  }

  return (
    <main className="voice-shell flex h-full min-h-0 flex-col overflow-hidden">
      <CompanionTitlebar />
      <section className="flex shrink-0 items-center gap-2 px-4 pb-3">
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="بازگشت">
          <ArrowRight />
        </Button>
        <div className="flex min-w-0 flex-1 flex-col text-start">
          <h1 className="truncate text-sm font-medium">{chat?.title ?? 'گفتگو'}</h1>
          <p className="text-[0.65rem] text-muted-foreground">
            {chat ? formatFullDate(chat.updatedAt) : 'دارم بازش می‌کنم…'}
          </p>
        </div>
        {chat ? (
          <TextExportActions content={chatToMarkdown(chat)} defaultName={chat.title} />
        ) : null}
        <AlertDialog>
          <AlertDialogTrigger
            render={<Button variant="ghost" size="icon-sm" aria-label="حذف گفتگو" />}
          >
            <Trash2 />
          </AlertDialogTrigger>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>این گفتگو حذف شود؟</AlertDialogTitle>
              <AlertDialogDescription>
                متن گفتگو از این دستگاه پاک می‌شود و دیگر قابل یادآوری نیست.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>نه</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => void handleDelete()}>
                حذفش کن
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>

      <ScrollArea className="min-h-0 flex-1 border-y border-border/40">
        <div className="flex flex-col gap-5 px-5 py-5 text-start">
          {(chat?.messages ?? []).map((message) => (
            <article key={message.id} className="chat-message flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-[0.65rem] text-muted-foreground">
                <span>{message.role === 'user' ? 'تو' : 'میکی'}</span>
                <span aria-hidden="true">·</span>
                <time dateTime={new Date(message.createdAt).toISOString()}>
                  {PERSIAN_TIME.format(message.createdAt)}
                </time>
              </div>
              <ChatMessageContent content={message.content} markdown />
              {message.state !== 'completed' ? (
                <span className="text-[0.62rem] text-muted-foreground">
                  {message.state === 'interrupted' ? 'پاسخ ناتمام' : 'ناموفق'}
                </span>
              ) : null}
            </article>
          ))}
        </div>
      </ScrollArea>

      <footer className="flex shrink-0 items-center gap-2 p-4">
        <Button className="flex-1" onClick={() => onResume(chatId)} disabled={!chat}>
          <Mic data-icon="inline-start" />
          ادامه با صدا
        </Button>
      </footer>
    </main>
  )
}

export const ChatMessageContent = memo(function ChatMessageContent({
  content,
  markdown = false
}: {
  content: string
  markdown?: boolean
}): React.JSX.Element {
  const plain = (
    <p className="chat-message-plain" dir="auto">
      {content}
    </p>
  )
  if (!markdown && !hasRichMarkdown(content)) return plain
  return (
    <Suspense fallback={plain}>
      <ChatMarkdown text={content} dir="auto" />
    </Suspense>
  )
})

function CompanionTitlebar(): React.JSX.Element {
  return <header className="app-titlebar shrink-0" aria-hidden="true" />
}

function ChatRow({
  chat,
  active,
  onOpen
}: {
  chat: ChatSummary
  active: boolean
  onOpen: () => void
}): React.JSX.Element {
  return (
    <Button
      variant="ghost"
      className="h-auto w-full justify-start rounded-xl px-2 py-3 text-start whitespace-normal"
      onClick={onOpen}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{chat.title}</span>
          {active ? (
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[0.58rem] text-muted-foreground">
              جاری
            </span>
          ) : null}
          <span className="ms-auto shrink-0 text-[0.62rem] text-muted-foreground">
            {PERSIAN_TIME.format(chat.updatedAt)}
          </span>
        </span>
        <span className="line-clamp-2 text-[0.68rem] leading-5 text-muted-foreground">
          {chat.lastMessage}
        </span>
      </span>
      <MessageSquareText aria-hidden="true" />
    </Button>
  )
}

function groupChatsByDay(chats: ChatSummary[]): Array<{
  key: string
  label: string
  chats: ChatSummary[]
}> {
  const today = startOfLocalDay(Date.now())
  const yesterdayDate = new Date(today)
  yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  const yesterday = yesterdayDate.getTime()
  const groups = new Map<string, { label: string; chats: ChatSummary[] }>()
  for (const chat of chats) {
    const day = startOfLocalDay(chat.updatedAt)
    const key = String(day)
    const label = day === today ? 'امروز' : day === yesterday ? 'دیروز' : PERSIAN_DATE.format(day)
    const group = groups.get(key) ?? { label, chats: [] }
    group.chats.push(chat)
    groups.set(key, group)
  }
  return [...groups.entries()].map(([key, value]) => ({ key: `chat-day-${key}`, ...value }))
}

function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function formatFullDate(timestamp: number): string {
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    dateStyle: 'long',
    timeStyle: 'short'
  }).format(timestamp)
}
