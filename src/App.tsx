import {
  Download,
  History,
  MessageSquarePlus,
  Mic,
  MicOff,
  PanelRightOpen,
  RotateCcw,
  Settings
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { ThinkingOrb, type OrbState } from 'thinking-orbs'
import { ActiveConversationPanel } from '@/components/active-conversation-panel'
import { AgentReplyView } from '@/components/agent-reply-view'
import { AppUpdateNotice } from '@/components/app-update-notice'
import { ChatDetailView, ChatHistoryView } from '@/components/chat-history-view'
import { ConversationPreview } from '@/components/conversation-preview'
import { Button } from '@/components/ui/button'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle
} from '@/components/ui/empty'
import { OnboardingView } from '@/components/onboarding-view'
import { SettingsView } from '@/components/settings-view'
import { TranscriptView } from '@/components/transcript-view'
import { useAgent } from '@/hooks/use-agent'
import { useAppUpdate } from '@/hooks/use-app-update'
import { useConversation } from '@/hooks/use-conversation'
import { useChats } from '@/hooks/use-chats'
import { useModels } from '@/hooks/use-models'
import { useSoul } from '@/hooks/use-soul'
import { useSpeech } from '@/hooks/use-speech'
import { useSettings } from '@/hooks/use-settings'
import { useTurnCues } from '@/hooks/use-turn-cues'
import { useTasks } from '@/hooks/use-tasks'
import { useTts } from '@/hooks/use-tts'
import { useWakeWord } from '@/hooks/use-wake-word'
import { useEarcons } from '@/hooks/use-earcons'
import { DEFAULT_ASSISTANT_SHORTCUT } from '@/lib/settings'
import {
  DEFAULT_CONVERSATION_PANEL_EXPANDED,
  resolveMainWindowMode,
  type AppScreen
} from '@/lib/home-layout'
import { shortcutDisplayKeys } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'

const PHASE_LABEL = {
  disabled: 'شنیدن خاموش است',
  loading: 'یک لحظه…',
  listening: 'بگو «میکی» یا «هی میکی»',
  activated: 'گوش می‌دم…',
  followup: 'ادامه بده…',
  confirm: 'تأیید یا رد کن',
  error: 'میکروفن در دسترس نیست'
} as const

const ORB_STATE: Record<keyof typeof PHASE_LABEL, OrbState> = {
  disabled: 'breathing',
  loading: 'connecting',
  listening: 'breathing',
  activated: 'listening',
  followup: 'listening',
  confirm: 'breathing',
  error: 'shaping'
}

function FollowupTimer({ until }: { until: number }): React.JSX.Element {
  const [durationMs] = useState(() => Math.max(320, until - Date.now()))
  return (
    <svg
      className="orb-followup-timer"
      viewBox="0 0 100 100"
      aria-hidden="true"
      style={{ '--followup-ms': `${durationMs}ms` } as React.CSSProperties}
    >
      <circle cx="50" cy="50" r="48.2" pathLength="100" />
    </svg>
  )
}

type FooterButtonProps = Omit<React.ComponentProps<typeof Button>, 'aria-label' | 'size'> & {
  label: string
  shortLabel?: string
}

function FooterButton({
  label,
  shortLabel,
  children,
  ...props
}: FooterButtonProps): React.JSX.Element {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="home-dock-action h-9 rounded-xl px-2.5 text-[0.68rem] text-muted-foreground"
      aria-label={label}
      {...props}
    >
      {children}
      <span>{shortLabel ?? label}</span>
    </Button>
  )
}

function App(): React.JSX.Element {
  const [screen, setScreen] = useState<AppScreen>('home')
  const [conversationPanelExpanded, setConversationPanelExpanded] = useState(
    DEFAULT_CONVERSATION_PANEL_EXPANDED
  )
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)
  const [openRunId, setOpenRunId] = useState<string | null>(null)
  const [firstConversationName, setFirstConversationName] = useState<string | null>(null)
  const [wakeWordTogglePending, setWakeWordTogglePending] = useState(false)
  const [wakeWordToggleError, setWakeWordToggleError] = useState<string | null>(null)
  const settings = useSettings()
  const appUpdate = useAppUpdate()
  const status = useWakeWord(settings?.inputDeviceId)
  const speech = useSpeech()
  const models = useModels()
  const soul = useSoul()
  const agent = useAgent()
  const conversation = useConversation()
  const chats = useChats()
  const tasks = useTasks()
  const tts = useTts(settings?.outputDeviceId)
  const onboardingActive = soul?.onboardingCompleted === false
  useTurnCues(conversation)
  useEarcons(window.api.app.onEarcon, settings?.outputDeviceId)
  useEffect(() => window.api.app.onOpenSettings(() => setScreen('settings')), [])
  useEffect(() => {
    return window.api.tasks.onOpenRun((runId) => {
      setScreen('home')
      setConversationPanelExpanded(true)
      setOpenRunId(runId)
    })
  }, [])
  const handleOpenRunHandled = useCallback(() => setOpenRunId(null), [])
  useEffect(() => {
    void window.api.app.setWindowMode(
      resolveMainWindowMode({ onboardingActive, screen, conversationPanelExpanded })
    )
  }, [conversationPanelExpanded, onboardingActive, screen])
  const phase = status?.phase ?? 'loading'
  const enabled = status?.enabled ?? true
  const isActivated = phase === 'activated'
  useEffect(() => {
    if (isActivated) setFirstConversationName(null)
  }, [isActivated])
  const isAgentMode = conversation?.mode === 'agent'
  const isFollowup = conversation?.mode === 'followup'
  const isConfirm = conversation?.mode === 'confirm' || agent?.phase === 'confirm'
  const followupOpen = isFollowup && !conversation?.followupHeard
  const isLoading = phase === 'loading'
  const hasInstalledModel = models?.models.some((model) => model.state === 'installed') ?? false
  const modelUnavailable = models !== null && !hasInstalledModel
  const transcript = speech?.transcript
  const agentTurn = agent?.turn
  const agentBusy =
    agent?.phase === 'thinking' ||
    agent?.phase === 'tool' ||
    agent?.phase === 'confirm' ||
    agent?.phase === 'speaking'
  const ttsBusy = tts.status.phase === 'synthesizing' || tts.status.phase === 'playing'
  const responseBusy = agentBusy || ttsBusy || isAgentMode
  const showAgent =
    Boolean(agentTurn) &&
    (agentBusy || ttsBusy || isAgentMode || agent?.phase === 'error' || isFollowup || isConfirm) &&
    !(isActivated && transcript?.text && !transcript.isFinal && !isConfirm)
  const showTranscript = isActivated && Boolean(transcript?.text) && !showAgent
  const showFollowupPrompt = followupOpen && !showTranscript && !responseBusy
  const sessionActive = speech?.phase === 'listening' || speech?.phase === 'loading'
  const error =
    wakeWordToggleError ??
    (tts.status.phase === 'error' ? tts.status.error : null) ??
    (showAgent ? agent?.error : null) ??
    (isActivated ? speech?.error : null) ??
    status?.error ??
    null
  const activeChat = chats?.activeChat ?? null
  const hasConversation = Boolean(agentTurn || activeChat)
  const showContinuePrompt =
    !modelUnavailable &&
    enabled &&
    hasConversation &&
    !responseBusy &&
    !isActivated &&
    !isFollowup &&
    !error
  const showFreshAction =
    !modelUnavailable &&
    hasConversation &&
    !responseBusy &&
    !showTranscript &&
    (!isActivated || isFollowup)
  const showIdleGuide =
    !modelUnavailable &&
    !hasConversation &&
    !error &&
    !responseBusy &&
    !isActivated &&
    !isFollowup &&
    phase === 'listening'
  const showFirstConversationPrompt = firstConversationName !== null && showIdleGuide
  const showListeningDisabledGuide =
    !modelUnavailable && !enabled && !error && !responseBusy && !isActivated && !isFollowup
  const assistantShortcutKeys = shortcutDisplayKeys(
    settings?.assistantShortcut ?? DEFAULT_ASSISTANT_SHORTCUT,
    window.api.app.platform
  )

  const orbState: OrbState = modelUnavailable
    ? 'breathing'
    : tts.status.phase === 'synthesizing'
      ? 'connecting'
      : tts.status.phase === 'playing'
        ? 'composing'
        : agent?.phase === 'thinking'
          ? 'working'
          : agent?.phase === 'tool'
            ? 'searching'
            : agent?.phase === 'confirm'
              ? 'breathing'
              : agent?.phase === 'speaking'
                ? 'composing'
                : speech?.phase === 'finalizing' || (isActivated && transcript?.isFinal)
                  ? 'shaping'
                  : speech?.phase === 'listening' || isActivated
                    ? 'listening'
                    : ORB_STATE[phase]

  const handleOrbClick = (): void => {
    if (modelUnavailable) {
      setScreen('settings')
      return
    }
    if (isLoading) return
    setFirstConversationName(null)
    if (phase === 'error') {
      void window.api.wakeWord.retry()
      return
    }
    void window.api.wakeWord.activateManually()
  }

  const handleStartFresh = (): void => {
    void window.api.agent.reset()
  }

  const handleSendText = (text: string): Promise<void> => window.api.agent.send(text)

  const handleListeningToggle = async (): Promise<void> => {
    if (wakeWordTogglePending) return
    setWakeWordTogglePending(true)
    setWakeWordToggleError(null)
    try {
      await window.api.wakeWord.setEnabled(!enabled)
    } catch (cause) {
      console.error('Failed to change wake-word setting:', cause)
      setWakeWordToggleError('تغییر وضعیت شنیدن ذخیره نشد. دوباره تلاش کن.')
    } finally {
      setWakeWordTogglePending(false)
    }
  }

  const handleOpenChat = (chatId: string): void => {
    setSelectedChatId(chatId)
    setScreen('chat')
  }

  const handleResumeChat = async (chatId: string): Promise<void> => {
    const result = await window.api.chats.resume(chatId)
    if (!result.resumed) return
    setSelectedChatId(null)
    setScreen('home')
    void window.api.wakeWord.activateManually()
  }

  if (onboardingActive && soul) {
    return (
      <OnboardingView
        models={models}
        ttsSnapshot={tts.snapshot}
        existingUserMarkdown={soul.files.user}
        settings={settings}
        onFinished={(name) => {
          setFirstConversationName(name)
          setScreen('home')
        }}
      />
    )
  }

  if (screen === 'settings') {
    return (
      <SettingsView
        snapshot={models}
        ttsSnapshot={tts.snapshot}
        chatsSnapshot={chats}
        settings={settings}
        appUpdate={appUpdate}
        sessionActive={sessionActive}
        onBack={() => setScreen('home')}
      />
    )
  }

  if (screen === 'history') {
    return (
      <ChatHistoryView snapshot={chats} onBack={() => setScreen('home')} onOpen={handleOpenChat} />
    )
  }

  if (screen === 'chat' && selectedChatId) {
    const selected = chats?.chats.find((chat) => chat.id === selectedChatId)
    return (
      <ChatDetailView
        chatId={selectedChatId}
        updatedAt={selected?.updatedAt}
        onBack={() => setScreen('history')}
        onResume={(chatId) => void handleResumeChat(chatId)}
        onDeleted={() => {
          setSelectedChatId(null)
          setScreen('history')
        }}
      />
    )
  }

  return (
    <main
      className="voice-shell home-shell min-h-full overflow-hidden text-center"
      data-conversation-panel={conversationPanelExpanded ? 'expanded' : 'compact'}
    >
      <div className="home-companion-column flex min-h-0 flex-col overflow-hidden">
        <header className="app-titlebar relative flex items-center justify-center px-3"></header>

        {!conversationPanelExpanded ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="home-panel-reveal"
                  onClick={() => setConversationPanelExpanded(true)}
                  aria-label="باز کردن گفتگو و کارها"
                />
              }
            >
              <PanelRightOpen />
            </TooltipTrigger>
            <TooltipContent side="left" dir="rtl">
              نمایش گفتگو و کارها
            </TooltipContent>
          </Tooltip>
        ) : null}

        <AppUpdateNotice snapshot={appUpdate} />

        <section className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-6 pb-2">
          <div className="flex min-h-8 max-w-80 items-center">
            {modelUnavailable ? (
              <span className="home-status">مدل شنیدن آماده نیست</span>
            ) : activeChat && !conversationPanelExpanded ? (
              <Button
                variant="ghost"
                size="sm"
                className="home-chat-title max-w-80 text-muted-foreground"
                onClick={() => handleOpenChat(activeChat.id)}
              >
                <span className="truncate">{activeChat.title}</span>
              </Button>
            ) : (
              <span className="home-status">
                <span
                  className="home-status-dot"
                  data-active={phase === 'listening'}
                  aria-hidden="true"
                />
                {enabled ? 'آماده برای شنیدن' : 'شنیدن خاموش است'}
              </span>
            )}
          </div>
          <button
            type="button"
            className="orb-trigger"
            data-phase={
              modelUnavailable
                ? 'disabled'
                : responseBusy
                  ? 'thinking'
                  : isActivated || isFollowup
                    ? 'activated'
                    : phase
            }
            onClick={handleOrbClick}
            disabled={isLoading && !modelUnavailable}
            aria-label={
              modelUnavailable
                ? 'باز کردن تنظیمات مدل شنوا'
                : responseBusy
                  ? 'قطع پاسخ'
                  : isFollowup
                    ? 'پایان گفتگو و بازگشت به حالت آماده'
                    : isActivated
                      ? 'پایان شنیدن و بازگشت به حالت آماده'
                      : 'شروع شنیدن'
            }
            aria-pressed={isActivated || responseBusy || isFollowup}
          >
            <span className="orb-aura" aria-hidden="true" />
            {followupOpen && conversation?.followupUntil ? (
              <FollowupTimer
                key={conversation?.followupUntil}
                until={conversation?.followupUntil ?? 0}
              />
            ) : null}
            <span className="orb-core">
              <ThinkingOrb
                state={orbState}
                size={64}
                theme={settings?.theme === 'light' ? 'light' : 'dark'}
                speed={isActivated || responseBusy || isFollowup ? 1.25 : 0.82}
                paused={
                  modelUnavailable || phase === 'disabled' || (phase === 'error' && !responseBusy)
                }
                aria-label={
                  modelUnavailable
                    ? 'میکی تا دانلود مدل شنوا غیرفعال است'
                    : responseBusy
                      ? 'میکی در حال جواب‌دادن است'
                      : isFollowup || isActivated
                        ? 'میکی در حال گوش‌دادن است'
                        : 'میکی آماده شنیدن است'
                }
              />
            </span>
          </button>

          <div
            className="flex min-h-16 w-full max-w-80 flex-col items-center gap-3"
            aria-live="polite"
          >
            {modelUnavailable ? (
              <Empty className="gap-2 p-0">
                <EmptyHeader className="gap-1">
                  <EmptyTitle>میکی فعلاً غیرفعاله</EmptyTitle>
                  <EmptyDescription className="max-w-64">
                    برای شنیدن صدات، اول یه مدل شنوا دانلود کن. بعدش مدل روی همین کامپیوتر اجرا
                    می‌شه.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button size="sm" onClick={() => setScreen('settings')}>
                    <Download data-icon="inline-start" />
                    دانلود مدل شنوا
                  </Button>
                </EmptyContent>
              </Empty>
            ) : showAgent && agentTurn ? (
              <AgentReplyView
                turnId={agentTurn.turnId}
                text={agentTurn.error ?? agentTurn.replyText}
                phase={agentTurn.phase}
                toolName={agentTurn.toolName}
                confirmText={agentTurn.confirmText}
                confirmDetail={agentTurn.confirmDetail}
                dimmed={showFollowupPrompt || showContinuePrompt}
                onApprove={
                  isConfirm ? () => window.api.conversation.resolveApproval(true) : undefined
                }
                onDeny={
                  isConfirm ? () => window.api.conversation.resolveApproval(false) : undefined
                }
              />
            ) : showTranscript && transcript ? (
              <TranscriptView
                sessionId={transcript.sessionId}
                text={transcript.text}
                isFinal={transcript.isFinal}
              />
            ) : showListeningDisabledGuide ? (
              <div className="home-idle-copy gap-2.5">
                <h1>شنیدن اسمم خاموشه</h1>
                <p className="text-[0.68rem] leading-5 text-muted-foreground">
                  هنوز می‌تونی از هر برنامه‌ای با این میانبر منو باز کنی
                </p>
                <KbdGroup
                  dir="ltr"
                  aria-label={`میانبر بازکردن میکی: ${assistantShortcutKeys.join(' + ')}`}
                  className="mt-1"
                >
                  {assistantShortcutKeys.map((key) => (
                    <Kbd
                      key={key}
                      className="h-7 min-w-7 rounded-md border border-border/60 bg-foreground/8 px-2 text-xs text-foreground shadow-sm"
                    >
                      {key}
                    </Kbd>
                  ))}
                </KbdGroup>
                <p className="text-[0.68rem] leading-5 text-muted-foreground">
                  یا همین الان روی گوی بزن
                </p>
              </div>
            ) : !conversationPanelExpanded &&
              activeChat &&
              !error &&
              !isActivated &&
              !isFollowup ? (
              <ConversationPreview chat={activeChat} onOpen={() => handleOpenChat(activeChat.id)} />
            ) : showFirstConversationPrompt ? (
              <div className="home-idle-copy">
                <h1>
                  {firstConversationName
                    ? `سلام ${firstConversationName}، از چی شروع کنیم؟`
                    : 'سلام، از چی شروع کنیم؟'}
                </h1>
                <span>روی گوی بزن یا بگو «میکی»؛ یه سؤال بپرس یا یه کار بهم بسپر.</span>
              </div>
            ) : showIdleGuide ? (
              <div className="home-idle-copy">
                <h1>{PHASE_LABEL.listening}</h1>
                <span>یا برای شروع روی گوی بزن</span>
              </div>
            ) : (
              <p
                className={cn(
                  'text-[1.15rem] font-medium tracking-[-0.035em]',
                  error && 'text-sm font-normal leading-6 text-muted-foreground'
                )}
              >
                {error ??
                  (showFollowupPrompt
                    ? PHASE_LABEL.followup
                    : showContinuePrompt
                      ? `برای ادامه، ${PHASE_LABEL.listening}`
                      : PHASE_LABEL[phase])}
              </p>
            )}
            {showFollowupPrompt && showAgent ? (
              <p className="followup-hint">{PHASE_LABEL.followup}</p>
            ) : null}
            {showContinuePrompt && activeChat ? (
              <p className="followup-hint">برای ادامه، {PHASE_LABEL.listening}</p>
            ) : null}
            {showFreshAction && !conversationPanelExpanded ? (
              <Button
                variant="ghost"
                size="xs"
                className="text-muted-foreground"
                onClick={handleStartFresh}
              >
                گفتگوی تازه
              </Button>
            ) : null}
          </div>
        </section>

        <footer className="flex items-center justify-center px-4 pb-5">
          <nav className="home-dock" aria-label="دسترسی‌های میکی">
            <FooterButton
              label="گفتگوهای قبلی"
              shortLabel="گفتگوها"
              onClick={() => setScreen('history')}
            >
              <History />
            </FooterButton>
            {hasConversation && !showFreshAction ? (
              <FooterButton label="گفتگوی تازه" onClick={handleStartFresh}>
                <MessageSquarePlus />
              </FooterButton>
            ) : null}
            {phase === 'error' ? (
              <FooterButton
                label="تلاش دوباره"
                shortLabel="دوباره"
                onClick={() => void window.api.wakeWord.retry()}
              >
                <RotateCcw />
              </FooterButton>
            ) : (
              <FooterButton
                label={enabled ? 'خاموش‌کردن شنیدن' : 'روشن‌کردن شنیدن'}
                shortLabel="شنیدن"
                onClick={() => void handleListeningToggle()}
                disabled={wakeWordTogglePending}
                aria-pressed={enabled}
              >
                {enabled ? <Mic /> : <MicOff />}
              </FooterButton>
            )}
            <FooterButton label="تنظیمات" onClick={() => setScreen('settings')}>
              <Settings />
            </FooterButton>
          </nav>
        </footer>
      </div>

      {conversationPanelExpanded ? (
        <ActiveConversationPanel
          chat={activeChat}
          agent={agent}
          conversation={conversation}
          transcript={showTranscript ? transcript : null}
          modelUnavailable={modelUnavailable}
          tasks={tasks}
          openRunId={openRunId}
          onOpenRunHandled={handleOpenRunHandled}
          onCollapse={() => setConversationPanelExpanded(false)}
          onOpenHistory={() => setScreen('history')}
          onStartFresh={handleStartFresh}
          onSend={handleSendText}
        />
      ) : null}
    </main>
  )
}

export default App
