import type { BrowserWindow } from 'electron'
import { isStepCount, ToolLoopAgent, type ModelMessage } from 'ai'
import type { ChatContextMessage } from '@/lib/chats'
import {
  AGENT_DELTA_CHANNEL,
  AGENT_HISTORY_LIMIT,
  AGENT_MAX_STEPS,
  AGENT_STATUS_CHANNEL,
  INITIAL_AGENT_STATUS,
  type AgentDelta,
  type AgentStatus,
  type AgentTurn
} from '@/lib/agent'
import type { LlmService } from '../llm/service'
import type { SettingsStore } from '../settings/store'
import { buildSystemInstructions, type AgentResponseSurface } from '../soul/prompt'
import type { SoulStore } from '../soul/store'
import type { ApprovalRequest } from '../system/exec'
import { activeAgentToolNames, createAgentTools } from './tools'
import { agentErrorMessage, emptyResponseMessage, errorText } from './error-message'
import { hasExplicitScreenIntent } from '../vision/intent'
import type { ChatStore } from '../chats/store'
import type { SkillService } from '../skills/service'
import type { WebSearchService } from '../web-search/service'

type AgentServiceOptions = {
  settings: SettingsStore
  llm: LlmService
  soul: SoulStore
  chats?: ChatStore
  skills?: SkillService
  webSearch?: WebSearchService
  getWindow: () => BrowserWindow | null
  onApprovalNeeded?: () => void
  lookAtScreen?: (question: string, abortSignal?: AbortSignal) => Promise<string>
  onStatusChange?: (status: AgentStatus) => void
}

type AgentRespondOptions = {
  responseSurface?: AgentResponseSurface
  speechEnabled?: boolean
  sessionId?: string
}

export class AgentService {
  #status: AgentStatus = { ...INITIAL_AGENT_STATUS }
  #history: ModelMessage[] = []
  #abort: AbortController | null = null
  #turnSeq = 0
  #pendingApproval: ((approved: boolean) => void) | null = null

  constructor(private readonly options: AgentServiceOptions) {}

  getStatus(): AgentStatus {
    return this.#status
  }

  abort(): void {
    this.resolveApproval(false)
    this.#abort?.abort()
    this.#abort = null
    if (this.#status.phase !== 'idle' && this.#status.phase !== 'error') {
      this.#update({ phase: 'idle' })
    }
  }

  reset(): AgentStatus {
    this.abort()
    this.#history = []
    this.#status = { ...INITIAL_AGENT_STATUS }
    this.#emitStatus()
    return this.#status
  }

  replaceHistory(messages: ChatContextMessage[]): AgentStatus {
    this.abort()
    this.#history = messages.map(({ role, content }) => ({ role, content }))
    this.#status = { ...INITIAL_AGENT_STATUS }
    this.#emitStatus()
    return this.#status
  }

  resolveApproval(approved: boolean): void {
    const pending = this.#pendingApproval
    this.#pendingApproval = null
    if (!pending) return
    const turn = this.#status.turn
    if (turn && turn.phase === 'confirm') {
      this.#setTurn({
        ...turn,
        phase: 'tool',
        confirmText: null,
        confirmDetail: null
      })
    }
    pending(approved)
  }

  async respond(
    userText: string,
    options: AgentRespondOptions = {}
  ): Promise<'completed' | 'ended' | 'aborted' | 'skipped'> {
    const text = userText.trim()
    if (!text) return 'skipped'

    this.abort()
    const abort = new AbortController()
    this.#abort = abort
    const turnId = String(++this.#turnSeq)
    const turn: AgentTurn = {
      turnId,
      userText: text,
      replyText: '',
      phase: 'thinking',
      toolName: null,
      confirmText: null,
      confirmDetail: null,
      error: null
    }
    this.#setTurn(turn)

    if (!this.options.llm.isConfigured()) {
      this.#fail(turn, 'برای جواب‌دادن، سرویس و مدل زبانی را از تنظیمات کامل کن.')
      return 'skipped'
    }

    try {
      const files = await this.options.soul.readAll()
      const settings = this.options.settings.get()
      const skills = await this.options.skills?.refresh()
      let endRequested = false
      let screenCaptureConsumed = false
      const screenCaptureAllowed = hasExplicitScreenIntent(text)
      const tools = createAgentTools(this.options.soul, {
        chats: this.options.chats,
        systemToolsEnabled: settings.systemToolsEnabled !== false,
        toolApprovals: settings.toolApprovals,
        screenAccessEnabled: settings.screenAccessEnabled !== false,
        abortSignal: abort.signal,
        onEndConversation: () => {
          endRequested = true
        },
        requestApproval: (request) => this.#requestApproval(turnId, turn, request, abort.signal),
        screenCaptureAllowed,
        lookAtScreen: async (question) => {
          if (!screenCaptureAllowed) return 'درخواست صریحی برای دیدن صفحه وجود ندارد.'
          if (screenCaptureConsumed) return 'در هر نوبت فقط یک بار می‌توانم صفحه را ببینم.'
          screenCaptureConsumed = true
          return this.options.lookAtScreen?.(question, abort.signal) ?? 'دیدن صفحه در دسترس نیست.'
        },
        skills: this.options.skills,
        webSearch: this.options.webSearch
      })
      const toolOrder = Object.keys(tools)
      const initialActiveTools = activeAgentToolNames(tools)
      const isOpenRouter = settings.llm.providerId === 'openrouter'
      const reasoningEffort = this.options.llm.getReasoningEffort()
      const openRouterOptions = {
        ...(options.sessionId ? { session_id: options.sessionId } : {}),
        ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {})
      }
      const agent = new ToolLoopAgent({
        model: this.options.llm.getModel(),
        instructions: buildSystemInstructions(
          files,
          skills?.enabled ? skills.skills.filter((skill) => skill.enabled) : [],
          {
            responseSurface: options.responseSurface,
            speechEnabled: options.speechEnabled,
            cacheStaticPrefix: isOpenRouter && settings.llm.modelId.startsWith('anthropic/')
          }
        ),
        tools,
        activeTools: initialActiveTools,
        toolOrder,
        prepareStep: ({ steps }) => ({
          activeTools: activeAgentToolNames(tools, {
            chatSearchCompleted: steps.some((step) =>
              step.toolCalls.some((toolCall) => toolCall.toolName === 'search_chats')
            )
          })
        }),
        ...(isOpenRouter && (options.sessionId || reasoningEffort)
          ? { providerOptions: { openrouter: openRouterOptions } }
          : {}),
        ...(!isOpenRouter && reasoningEffort ? { reasoning: reasoningEffort } : {}),
        temperature: settings.llm.temperature,
        stopWhen: isStepCount(AGENT_MAX_STEPS)
      })

      const userMessage: ModelMessage = { role: 'user', content: text }
      const result = await agent.stream({
        messages: [...this.#history, userMessage],
        abortSignal: abort.signal,
        onToolExecutionStart: ({ toolCall }) => {
          if (abort.signal.aborted || this.#status.turn?.turnId !== turnId) return
          this.#setTurn({
            ...this.#currentTurn(turnId, turn),
            phase: 'tool',
            toolName: toolCall.toolName,
            confirmText: null,
            confirmDetail: null
          })
        }
      })

      let reply = ''
      let streamError: unknown = null
      for await (const part of result.stream) {
        if (abort.signal.aborted) return 'aborted'
        if (part.type === 'error') {
          streamError = part.error
          continue
        }
        if (part.type !== 'text-delta' || !part.text) continue
        reply += part.text
        this.#setTurn({
          ...this.#currentTurn(turnId, turn),
          phase: 'speaking',
          toolName: null,
          confirmText: null,
          confirmDetail: null,
          replyText: reply
        })
        this.#emitDelta({ turnId, delta: part.text, text: reply })
      }

      if (abort.signal.aborted) return 'aborted'
      // The SDK rejects its result promises with a generic "No output generated" wrapper
      // when a provider stream ends badly. Preserve the error event from the stream instead.
      if (streamError) throw streamError

      const [responseMessages, usage, steps, finishReason, rawFinishReason] = await Promise.all([
        result.responseMessages,
        result.usage,
        result.steps,
        result.finishReason,
        result.rawFinishReason
      ])
      console.info('[agent] model usage', {
        provider: settings.llm.providerId,
        modelId: settings.llm.modelId,
        inputTokens: usage.inputTokens,
        cacheReadTokens: usage.inputTokenDetails.cacheReadTokens,
        cacheWriteTokens: usage.inputTokenDetails.cacheWriteTokens,
        outputTokens: usage.outputTokens,
        steps: steps.length,
        finishReason,
        rawFinishReason
      })
      if (!reply.trim()) {
        console.warn('[agent] model returned no visible response', {
          provider: settings.llm.providerId,
          modelId: settings.llm.modelId,
          finishReason,
          rawFinishReason,
          steps: steps.map((step) => ({
            finishReason: step.finishReason,
            rawFinishReason: step.rawFinishReason,
            outputTokens: step.usage.outputTokens
          }))
        })
        this.#fail(this.#currentTurn(turnId, turn), emptyResponseMessage())
        return 'skipped'
      }
      if (endRequested) {
        this.#history = []
      } else {
        this.#history = trimHistory([...this.#history, userMessage, ...responseMessages])
      }
      this.#setTurn({
        ...this.#currentTurn(turnId, turn),
        phase: 'idle',
        toolName: null,
        confirmText: null,
        confirmDetail: null,
        replyText: reply,
        error: null
      })
      this.#update({ phase: 'idle', error: null })
      return endRequested ? 'ended' : 'completed'
    } catch (error) {
      if (abort.signal.aborted) return 'aborted'
      console.warn('[agent] response failed', {
        provider: this.options.settings.get().llm.providerId,
        modelId: this.options.settings.get().llm.modelId,
        error: errorText(error),
        cause: errorCauseText(error)
      })
      this.#fail(this.#currentTurn(turnId, turn), agentErrorMessage(error))
      return 'skipped'
    } finally {
      this.resolveApproval(false)
      if (this.#abort === abort) this.#abort = null
    }
  }

  #requestApproval(
    turnId: string,
    fallback: AgentTurn,
    request: ApprovalRequest,
    abortSignal: AbortSignal
  ): Promise<boolean> {
    if (abortSignal.aborted) return Promise.resolve(false)
    this.resolveApproval(false)
    return new Promise((resolve) => {
      this.#pendingApproval = resolve
      this.#setTurn({
        ...this.#currentTurn(turnId, fallback),
        phase: 'confirm',
        toolName: request.toolName ?? 'run_command',
        confirmText: request.purpose,
        confirmDetail: request.detail ?? request.command,
        error: null
      })
      this.options.onApprovalNeeded?.()
      const onAbort = (): void => {
        abortSignal.removeEventListener('abort', onAbort)
        this.resolveApproval(false)
      }
      abortSignal.addEventListener('abort', onAbort, { once: true })
    })
  }

  #currentTurn(turnId: string, fallback: AgentTurn): AgentTurn {
    return this.#status.turn?.turnId === turnId ? this.#status.turn : fallback
  }

  #setTurn(turn: AgentTurn): void {
    this.#status = {
      phase: turn.phase,
      turn,
      error: turn.error
    }
    this.#emitStatus()
  }

  #fail(turn: AgentTurn, error: string): void {
    this.#setTurn({
      ...turn,
      phase: 'error',
      error,
      toolName: null,
      confirmText: null,
      confirmDetail: null
    })
    this.#update({ phase: 'error', error })
  }

  #update(update: Partial<AgentStatus>): void {
    this.#status = { ...this.#status, ...update }
    this.#emitStatus()
  }

  #emitStatus(): void {
    this.options.onStatusChange?.(this.#status)
    const window = this.options.getWindow()
    if (window && !window.isDestroyed()) {
      window.webContents.send(AGENT_STATUS_CHANNEL, this.#status)
    }
  }

  #emitDelta(delta: AgentDelta): void {
    const window = this.options.getWindow()
    if (window && !window.isDestroyed()) {
      window.webContents.send(AGENT_DELTA_CHANNEL, delta)
    }
  }
}

function errorCauseText(error: unknown): string {
  if (!(error instanceof Error) || !('cause' in error)) return ''
  return errorText(error.cause)
}

function trimHistory(messages: ModelMessage[]): ModelMessage[] {
  if (messages.length <= AGENT_HISTORY_LIMIT) return messages
  let sliced = messages.slice(-AGENT_HISTORY_LIMIT)
  while (sliced.length > 0 && sliced[0]?.role === 'tool') {
    sliced = sliced.slice(1)
  }
  return sliced
}
