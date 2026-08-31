import {
  ArrowUp,
  History,
  MessageCircleMore,
  MessageSquarePlus,
  PanelRightClose
} from 'lucide-react'
import { useDeferredValue, useEffect, useRef, useState } from 'react'
import { ChatMessageContent } from '@/components/chat-history-view'
import { TaskRunPanel } from '@/components/task-run-panel'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from '@/components/ui/input-group'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { agentStatusLabel, type AgentStatus } from '@/lib/agent'
import { persistedTurnState } from '@/lib/active-conversation'
import type { SpeechTranscript } from '@/lib/asr'
import type { ChatDetail, ChatMessage } from '@/lib/chats'
import type { ConversationStatus } from '@/lib/conversation'
import { detectTextDirection } from '@/lib/text-direction'
import type { TasksSnapshot } from '@/lib/tasks'

const PERSIAN_TIME = new Intl.DateTimeFormat('fa-IR', {
  hour: '2-digit',
  minute: '2-digit'
})

type ActiveConversationPanelProps = {
  chat: ChatDetail | null
  agent: AgentStatus | null
  conversation: ConversationStatus | null
  transcript: SpeechTranscript | null | undefined
  modelUnavailable: boolean
  tasks: TasksSnapshot | null
  openRunId: string | null
  onOpenRunHandled: () => void
  onCollapse: () => void
  onOpenHistory: () => void
  onStartFresh: () => void
  onSend: (text: string) => Promise<void>
}

function PersistedMessage({ message }: { message: ChatMessage }): React.JSX.Element {
  return (
    <article className="conversation-panel-message chat-message" data-role={message.role}>
      <div className="conversation-panel-message-meta">
        <span>{message.role === 'user' ? 'تو' : 'میکی'}</span>
        <time dateTime={new Date(message.createdAt).toISOString()}>
          {PERSIAN_TIME.format(message.createdAt)}
        </time>
      </div>
      <div className="conversation-panel-bubble">
        <ChatMessageContent content={message.content} />
      </div>
    </article>
  )
}

function LiveMessage({
  role,
  text,
  pending = false
}: {
  role: 'user' | 'assistant'
  text: string
  pending?: boolean
}): React.JSX.Element {
  return (
    <article className="conversation-panel-message" data-role={role} data-pending={pending}>
      <div className="conversation-panel-message-meta">
        <span>{role === 'user' ? 'تو' : 'میکی'}</span>
        <span>{pending ? 'در جریان' : 'الان'}</span>
      </div>
      <div className="conversation-panel-bubble">
        <ChatMessageContent content={text} />
      </div>
    </article>
  )
}

export function ActiveConversationPanel({
  chat,
  agent,
  conversation,
  transcript,
  modelUnavailable,
  tasks,
  openRunId,
  onOpenRunHandled,
  onCollapse,
  onOpenHistory,
  onStartFresh,
  onSend
}: ActiveConversationPanelProps): React.JSX.Element {
  const [tab, setTab] = useState<'chat' | 'runs'>('chat')
  const [draft, setDraft] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const turn = agent?.turn ?? null
  const rawReply = turn?.error ?? turn?.replyText ?? ''
  const liveReply = useDeferredValue(rawReply)
  const persistedMessages = chat?.messages ?? []
  const persistedTurn = turn
    ? persistedTurnState(persistedMessages, {
        userText: turn.userText,
        assistantText: rawReply
      })
    : { user: false, assistant: false }
  const hasPersistedUser = persistedTurn.user
  const hasPersistedAssistant = persistedTurn.assistant
  const liveUserText = turn && !hasPersistedUser ? turn.userText : ''
  const liveAssistantText = turn && !hasPersistedAssistant ? liveReply : ''
  const liveTranscript = transcript?.text?.trim() ?? ''
  const conversationBusy = conversation?.mode === 'agent' || conversation?.mode === 'confirm'
  const panelStatus =
    tab === 'runs'
      ? tasks?.runs.some((run) => run.status === 'running')
        ? 'دارد کار می‌کند'
        : 'نتیجه‌ها'
      : conversation?.mode === 'confirm'
      ? 'منتظر تأیید تو'
      : conversation?.mode === 'agent'
        ? agentStatusLabel(agent?.phase ?? 'thinking', turn?.toolName)
        : conversation?.mode === 'followup'
          ? 'آماده‌ی ادامه'
          : 'آماده'
  const canCompose = !modelUnavailable && !conversationBusy
  const hasMessages = Boolean(
    persistedMessages.length || liveUserText || liveAssistantText || liveTranscript
  )
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [liveAssistantText, liveTranscript, persistedMessages.length])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const text = draft.trim()
    if (!text || !canCompose || submitting) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      await onSend(text)
      setDraft('')
    } catch (error) {
      console.error('Failed to send typed conversation message:', error)
      setSubmitError('پیام فرستاده نشد. دوباره تلاش کن.')
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    if (openRunId) setTab('runs')
  }, [openRunId])

  const showChat = tab === 'chat'

  return (
    <aside className="active-conversation-panel" aria-label="گفتگوی جاری">
      <header className="conversation-panel-header">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="conversation-panel-collapse"
                onClick={onCollapse}
                aria-label="جمع کردن بخش گفتگو"
              />
            }
          >
            <PanelRightClose />
          </TooltipTrigger>
          <TooltipContent side="right" dir="rtl">
            جمع کردن گفتگو
          </TooltipContent>
        </Tooltip>
        <div className="conversation-panel-title min-w-0 flex-1 text-start">
          <h2 className="truncate">{tab === 'runs' ? 'کارها' : (chat?.title ?? 'گفتگوی تازه')}</h2>
          <div className="conversation-panel-presence">
            <span data-active={conversationBusy} aria-hidden="true" />
            <p aria-live="polite">{panelStatus}</p>
          </div>
        </div>
        <nav className="conversation-panel-actions" aria-label="کارهای گفتگو">
          {tab === 'chat' ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={onStartFresh}
                    disabled={conversationBusy}
                    aria-label="گفتگوی تازه"
                  />
                }
              >
                <MessageSquarePlus />
              </TooltipTrigger>
              <TooltipContent side="bottom" dir="rtl">
                گفتگوی تازه
              </TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onOpenHistory}
                  aria-label="همه گفتگوها"
                />
              }
            >
              <History />
            </TooltipTrigger>
            <TooltipContent side="bottom" dir="rtl">
              همه گفتگوها
            </TooltipContent>
          </Tooltip>
        </nav>
      </header>

      <div className="conversation-panel-tabs" role="tablist" aria-label="گفتگو یا کارها">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'chat'}
          onClick={() => setTab('chat')}
        >
          گفتگو
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'runs'}
          onClick={() => setTab('runs')}
        >
          کارها
        </button>
      </div>

      <Separator />

      {showChat ? (
        <ScrollArea className="min-h-0 flex-1" dir="ltr">
        {hasMessages ? (
          <div className="conversation-panel-thread" dir="rtl" aria-live="polite">
            {persistedMessages.map((message) => (
              <PersistedMessage key={message.id} message={message} />
            ))}
            {liveUserText ? <LiveMessage role="user" text={liveUserText} /> : null}
            {liveAssistantText ? (
              <LiveMessage role="assistant" text={liveAssistantText} pending={conversationBusy} />
            ) : conversationBusy && turn ? (
              <LiveMessage
                role="assistant"
                text={agentStatusLabel(agent?.phase ?? 'thinking', turn.toolName)}
                pending
              />
            ) : null}
            {liveTranscript ? <LiveMessage role="user" text={liveTranscript} pending /> : null}
            <div ref={bottomRef} aria-hidden="true" />
          </div>
        ) : (
          <Empty className="h-full min-h-96 px-8" dir="rtl">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageCircleMore />
              </EmptyMedia>
              <EmptyTitle>اینجا گفتگوت رو می‌بینی</EmptyTitle>
              <EmptyDescription>
                با صدا شروع کن یا پایین همین بخش بنویس. میکی همچنان یه همراه صوتی می‌مونه.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </ScrollArea>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <TaskRunPanel snapshot={tasks} openRunId={openRunId} onOpenRunHandled={onOpenRunHandled} />
        </div>
      )}

      {showChat ? (
        <>
          <Separator />
          <footer className="conversation-panel-footer">
            <form onSubmit={(event) => void handleSubmit(event)}>
              <Field orientation="horizontal" className="conversation-composer-field">
                <FieldLabel htmlFor="conversation-composer" className="sr-only">
                  پیام به میکی
                </FieldLabel>
                <InputGroup
                  className="conversation-composer-group h-14 overflow-hidden rounded-full border-foreground/20 bg-foreground/8 dark:bg-foreground/8"
                  dir="ltr"
                >
                  <InputGroupInput
                    id="conversation-composer"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder={conversationBusy ? 'میکی هنوز مشغوله…' : 'به میکی بنویس…'}
                    aria-label="پیام به میکی"
                    dir={detectTextDirection(draft)}
                    disabled={!canCompose || submitting}
                    autoComplete="off"
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      type="submit"
                      variant="default"
                      size="icon-sm"
                      className="size-8 rounded-full"
                      aria-label="فرستادن پیام"
                      disabled={!draft.trim() || !canCompose || submitting}
                    >
                      <ArrowUp />
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </Field>
            </form>
            <div className="conversation-panel-footer-meta">
              <span>{submitError ?? 'Enter بفرست · برای حرف زدن روی گوی بزن'}</span>
            </div>
          </footer>
        </>
      ) : null}
    </aside>
  )
}
