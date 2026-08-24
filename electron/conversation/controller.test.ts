import assert from 'node:assert/strict'
import test from 'node:test'
import { FOLLOWUP_WINDOW_MS } from '@/lib/conversation'
import { ConversationController } from './controller'

type Harness = ReturnType<typeof createHarness>

function createHarness(
  respond: (
    text: string,
    options?: {
      responseSurface?: 'main' | 'flyover'
      speechEnabled?: boolean
      sessionId?: string
    }
  ) => Promise<'completed' | 'ended' | 'aborted' | 'skipped'> = async () => 'completed',
  shouldUseVoice: () => boolean = () => true,
  chats: Record<string, unknown> | null = null,
  shouldStartFollowupListening: () => boolean = () => true
) {
  const speech = {
    started: 0,
    cancelled: 0,
    async startSession() {
      this.started += 1
    },
    cancelSession() {
      this.cancelled += 1
    },
    getStatus() {
      return { phase: 'listening' as const }
    }
  }
  const wake = {
    resumed: 0,
    capturePaused: 0,
    externalStarted: 0,
    resumeListening() {
      this.resumed += 1
    },
    pauseCapture() {
      this.capturePaused += 1
    },
    beginExternalSession() {
      this.externalStarted += 1
    }
  }
  const agent = {
    aborted: 0,
    resetCount: 0,
    resolved: [] as boolean[],
    confirmText: null as string | null,
    histories: [] as unknown[][],
    respond,
    getStatus() {
      return { turn: { replyText: 'جواب میکی', confirmText: this.confirmText } }
    },
    abort() {
      this.aborted += 1
      this.resolveApproval(false)
    },
    reset() {
      this.resetCount += 1
      this.resolveApproval(false)
    },
    replaceHistory(messages: unknown[]) {
      this.histories.push(messages)
    },
    resolveApproval(approved: boolean) {
      this.resolved.push(approved)
    }
  }
  const tts = {
    spoken: [] as string[],
    stopped: 0,
    async speak(text: string): Promise<'completed' | 'aborted'> {
      this.spoken.push(text)
      return 'completed' as const
    },
    getSnapshot() {
      return { configured: true }
    },
    stop() {
      this.stopped += 1
    }
  }
  const controller = new ConversationController({
    settings: { get: () => ({ onboardingCompleted: true }) },
    llm: { isConfigured: () => true },
    getAgent: () => agent,
    getSpeech: () => speech,
    getTts: () => tts,
    getWakeWord: () => wake,
    getChats: () => chats,
    getWindow: () => null,
    shouldUseVoice,
    shouldStartFollowupListening
  } as never)

  return { controller, speech, wake, agent, tts, chats }
}

async function waitForFollowup(harness: Harness, started = 1): Promise<void> {
  for (let i = 0; i < 20; i++) {
    if (harness.controller.getStatus().mode === 'followup' && harness.speech.started >= started) {
      return
    }
    await new Promise((resolve) => setImmediate(resolve))
  }
  assert.equal(harness.controller.getStatus().mode, 'followup')
  assert.ok(harness.speech.started >= started)
}

test('opens a longer followup listen window after the agent finishes', async () => {
  const harness = createHarness()
  harness.controller.onFinalTranscript('ساعت چنده؟')
  await waitForFollowup(harness)

  const status = harness.controller.getStatus()
  assert.equal(harness.speech.started, 1)
  assert.deepEqual(harness.tts.spoken, ['جواب میکی'])
  assert.equal(status.followupHeard, false)
  assert.ok(status.followupUntil)
  assert.ok((status.followupUntil ?? 0) - Date.now() > FOLLOWUP_WINDOW_MS - 250)
  assert.equal(harness.wake.capturePaused, 1)
  assert.equal(harness.wake.externalStarted, 1)
})

test('opens a text followup without starting microphone capture', async () => {
  const harness = createHarness(
    async () => 'completed',
    () => false,
    null,
    () => false
  )

  harness.controller.onFinalTranscript('سلام')
  await waitForMode(harness, 'followup')

  assert.equal(harness.speech.started, 0)
  assert.equal(harness.wake.externalStarted, 0)
  assert.equal(harness.controller.getStatus().mode, 'followup')
})

test('releases microphone capture for the full agent turn', async () => {
  let finishAgent: (result: 'completed') => void = () => {}
  const harness = createHarness(
    () =>
      new Promise<'completed'>((resolve) => {
        finishAgent = resolve
      })
  )

  harness.controller.onFinalTranscript('فایل‌هام رو بررسی کن')
  await waitForMode(harness, 'agent')

  assert.equal(harness.wake.capturePaused, 1)
  assert.equal(harness.wake.externalStarted, 0)
  assert.equal(harness.speech.started, 0)

  finishAgent('completed')
  await waitForFollowup(harness)
  assert.equal(harness.wake.externalStarted, 1)
  assert.equal(harness.speech.started, 1)
})

test('keeps listening if the user starts speaking during followup', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const harness = createHarness()
  harness.controller.onFinalTranscript('سلام')
  await waitForFollowup(harness)

  harness.controller.onPartialTranscript('و فردا چی')
  assert.equal(harness.controller.getStatus().followupHeard, true)
  assert.equal(harness.controller.getStatus().followupUntil, null)

  t.mock.timers.tick(FOLLOWUP_WINDOW_MS + 1_000)
  assert.equal(harness.controller.getStatus().mode, 'followup')
  assert.equal(harness.speech.cancelled, 0)
  assert.equal(harness.wake.resumed, 0)
})

test('returns to wake-word listening when followup stays silent', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const harness = createHarness()
  harness.controller.onFinalTranscript('سلام')
  await waitForFollowup(harness)

  t.mock.timers.tick(FOLLOWUP_WINDOW_MS)
  assert.equal(harness.controller.getStatus().mode, 'idle')
  assert.equal(harness.speech.cancelled, 1)
  assert.equal(harness.wake.resumed, 1)
})

test('holds the followup window while the user types a draft', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const harness = createHarness()
  harness.controller.onFinalTranscript('سلام')
  await waitForFollowup(harness)

  harness.controller.holdListenWindow()
  assert.equal(harness.controller.getStatus().mode, 'followup')
  assert.equal(harness.controller.getStatus().followupHeard, true)

  t.mock.timers.tick(FOLLOWUP_WINDOW_MS + 1_000)
  assert.equal(harness.controller.getStatus().mode, 'followup')
  assert.equal(harness.wake.resumed, 0)

  harness.controller.onFinalTranscript('فردا چی کار داریم')
  await waitForFollowup(harness, 2)
  assert.equal(harness.controller.getStatus().mode, 'followup')
  assert.deepEqual(harness.tts.spoken, ['جواب میکی', 'جواب میکی'])
})

test('typed followup submission releases the microphone before running the agent', async () => {
  const received: string[] = []
  const harness = createHarness(async (text) => {
    received.push(text)
    return 'completed'
  })
  harness.controller.onFinalTranscript('سلام')
  await waitForFollowup(harness)

  harness.controller.sendText('فردا چی کار داریم')
  await waitForFollowup(harness, 2)

  assert.deepEqual(received, ['سلام', 'فردا چی کار داریم'])
  assert.equal(harness.speech.cancelled, 1)
  assert.equal(harness.controller.getStatus().mode, 'followup')
})

test('ignores empty ASR silence endpoints and keeps the followup window', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const harness = createHarness()
  harness.controller.onFinalTranscript('سلام')
  await waitForFollowup(harness)

  const until = harness.controller.getStatus().followupUntil
  harness.controller.onFinalTranscript('   ')
  await waitForFollowup(harness, 2)

  assert.equal(harness.controller.getStatus().mode, 'followup')
  assert.equal(harness.controller.getStatus().followupHeard, false)
  assert.equal(harness.controller.getStatus().followupUntil, until)
  assert.equal(harness.speech.started, 2)
  assert.equal(harness.wake.resumed, 0)

  t.mock.timers.tick(FOLLOWUP_WINDOW_MS)
  assert.equal(harness.controller.getStatus().mode, 'idle')
  assert.equal(harness.wake.resumed, 1)
})

test('does not treat a blip as speech during followup', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const harness = createHarness()
  harness.controller.onFinalTranscript('سلام')
  await waitForFollowup(harness)

  harness.controller.onPartialTranscript('.')
  harness.controller.onPartialTranscript('ا')
  assert.equal(harness.controller.getStatus().followupHeard, false)
  assert.ok(harness.controller.getStatus().followupUntil)

  t.mock.timers.tick(FOLLOWUP_WINDOW_MS)
  assert.equal(harness.controller.getStatus().mode, 'idle')
})

test('does not send punctuation or one-character ASR fragments to the agent', async () => {
  const received: string[] = []
  const harness = createHarness(async (text) => {
    received.push(text)
    return 'completed'
  })

  harness.controller.onFinalTranscript('...')
  harness.controller.onFinalTranscript('ا.')
  harness.controller.onFinalTranscript('\ufffd')
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(received, [])
  assert.equal(harness.controller.getStatus().mode, 'idle')
})

test('keeps short meaningful ASR commands', async () => {
  const received: string[] = []
  const harness = createHarness(async (text) => {
    received.push(text)
    return 'completed'
  })

  harness.controller.onFinalTranscript('نه')
  await waitForFollowup(harness)

  assert.deepEqual(received, ['نه'])
})

test('starts a fresh conversation and returns to wake-word listening', async () => {
  const harness = createHarness()
  harness.controller.onFinalTranscript('سلام')
  await waitForFollowup(harness)

  harness.controller.startFresh()
  assert.equal(harness.controller.getStatus().mode, 'idle')
  assert.equal(harness.agent.resetCount, 1)
  assert.equal(harness.speech.cancelled, 1)
  assert.equal(harness.wake.resumed, 1)
})

test('persists the final user and assistant messages around an agent turn', async () => {
  const appended: Array<Record<string, unknown>> = []
  const chats = {
    ensureActiveChat: () => ({ chatId: 'chat-1', created: true }),
    getContext: () => [{ role: 'assistant', content: 'قبل‌تر اینجا بودیم' }],
    appendMessage: (_chatId: string, message: Record<string, unknown>) => appended.push(message),
    endActiveChat: () => {}
  }
  const harness = createHarness(
    async () => 'completed',
    () => true,
    chats
  )
  harness.controller.onFinalTranscript('ادامه بدیم')
  await waitForFollowup(harness)

  assert.deepEqual(harness.agent.histories, [
    [{ role: 'assistant', content: 'قبل‌تر اینجا بودیم' }]
  ])
  assert.equal(appended.length, 2)
  assert.deepEqual(
    appended.map(({ role, content }) => ({ role, content })),
    [
      { role: 'user', content: 'ادامه بدیم' },
      { role: 'assistant', content: 'جواب میکی' }
    ]
  )
})

test('resumes a stored chat and restores its recent context', () => {
  const chats = {
    resumeChat: () => ({ id: 'chat-1' }),
    getContext: () => [{ role: 'user', content: 'موضوع قبلی' }]
  }
  const harness = createHarness(
    async () => 'completed',
    () => true,
    chats
  )
  assert.equal(harness.controller.resumeChat('chat-1'), true)
  assert.deepEqual(harness.agent.histories, [[{ role: 'user', content: 'موضوع قبلی' }]])
  assert.equal(harness.speech.cancelled, 1)
  assert.equal(harness.wake.resumed, 1)
})

test('does not open a followup listen window when the agent ends the conversation', async () => {
  const harness = createHarness(async () => 'ended')
  harness.controller.onFinalTranscript('خداحافظ')

  for (let i = 0; i < 20; i++) {
    if (harness.wake.resumed > 0) break
    await new Promise((resolve) => setImmediate(resolve))
  }

  assert.equal(harness.controller.getStatus().mode, 'idle')
  assert.equal(harness.speech.started, 0)
  assert.deepEqual(harness.tts.spoken, ['جواب میکی'])
  assert.equal(harness.wake.resumed, 1)
})

test('waits for spoken playback before opening followup listening', async () => {
  const harness = createHarness()
  let finishPlayback: () => void = () => {}
  harness.tts.speak = async (text: string) => {
    harness.tts.spoken.push(text)
    await new Promise<void>((resolve) => {
      finishPlayback = resolve
    })
    return 'completed'
  }

  harness.controller.onFinalTranscript('سلام')
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(harness.controller.getStatus().mode, 'agent')
  assert.equal(harness.speech.started, 0)

  finishPlayback()
  await waitForFollowup(harness)
  assert.equal(harness.speech.started, 1)
})

test('skips spoken playback for a visual-only shortcut session', async () => {
  let responseOptions:
    | { responseSurface?: 'main' | 'flyover'; speechEnabled?: boolean; sessionId?: string }
    | undefined
  const harness = createHarness(
    async (_text, options) => {
      responseOptions = options
      return 'completed'
    },
    () => false
  )
  harness.controller.onFinalTranscript('سلام')
  await waitForFollowup(harness)

  assert.deepEqual(harness.tts.spoken, [])
  assert.equal(harness.speech.started, 1)
  assert.deepEqual(responseOptions, { responseSurface: 'flyover', speechEnabled: false })
})

test('uses spoken main-window instructions and the chat id as the provider cache session', async () => {
  let responseOptions:
    | { responseSurface?: 'main' | 'flyover'; speechEnabled?: boolean; sessionId?: string }
    | undefined
  const chats = {
    ensureActiveChat: () => ({ chatId: 'chat-1', created: true }),
    getContext: () => [],
    appendMessage: () => {},
    endActiveChat: () => {}
  }
  const harness = createHarness(
    async (_text, options) => {
      responseOptions = options
      return 'completed'
    },
    () => true,
    chats
  )

  harness.controller.onFinalTranscript('سلام')
  await waitForFollowup(harness)

  assert.deepEqual(responseOptions, {
    responseSurface: 'main',
    speechEnabled: true,
    sessionId: 'chat-1'
  })
})

test('uses written main-window instructions when speech playback is disabled', async () => {
  let responseOptions:
    | { responseSurface?: 'main' | 'flyover'; speechEnabled?: boolean; sessionId?: string }
    | undefined
  const harness = createHarness(async (_text, options) => {
    responseOptions = options
    return 'completed'
  })
  harness.tts.getSnapshot = () => ({ configured: false })

  harness.controller.onFinalTranscript('سلام')
  await waitForFollowup(harness)

  assert.deepEqual(responseOptions, { responseSurface: 'main', speechEnabled: false })
  assert.deepEqual(harness.tts.spoken, [])
})

test('interrupting a turn stops TTS playback', async () => {
  const harness = createHarness()
  let finishPlayback: () => void = () => {}
  harness.tts.speak = async () => {
    await new Promise<void>((resolve) => {
      finishPlayback = resolve
    })
    return 'aborted'
  }
  harness.controller.onFinalTranscript('سلام')
  await new Promise((resolve) => setImmediate(resolve))

  harness.controller.onWakeActivated()
  finishPlayback()
  assert.equal(harness.tts.stopped, 1)
  assert.equal(harness.controller.getStatus().mode, 'idle')
})

async function waitForMode(
  harness: Harness,
  mode: 'confirm' | 'followup' | 'agent' | 'idle',
  started?: number
): Promise<void> {
  for (let i = 0; i < 20; i++) {
    if (
      harness.controller.getStatus().mode === mode &&
      (started == null || harness.speech.started >= started)
    ) {
      await new Promise((resolve) => setImmediate(resolve))
      await new Promise((resolve) => setImmediate(resolve))
      return
    }
    await new Promise((resolve) => setImmediate(resolve))
  }
  assert.equal(harness.controller.getStatus().mode, mode)
}

function armConfirmRespond(harness: Harness, purpose = 'می‌خوام این دستور رو اجرا کنم.'): void {
  harness.agent.respond = async () => {
    let resolveApproval: (approved: boolean) => void = () => {}
    const wait = new Promise<boolean>((resolve) => {
      resolveApproval = resolve
    })
    harness.agent.resolveApproval = (approved: boolean) => {
      harness.agent.resolved.push(approved)
      resolveApproval(approved)
    }
    harness.agent.confirmText = purpose
    harness.controller.onApprovalNeeded()
    await wait
    return 'completed'
  }
}

test('holds approval as a click-only state without TTS or microphone capture', async () => {
  const harness = createHarness()
  armConfirmRespond(harness, 'می‌خوام پوشه دانلودها رو پاک کنم.')

  harness.controller.onFinalTranscript('پوشه دانلودها رو پاک کن')
  await waitForMode(harness, 'confirm')

  assert.deepEqual(harness.tts.spoken, [])
  assert.equal(harness.speech.started, 0)
  assert.equal(harness.speech.cancelled, 1)
  assert.equal(harness.wake.externalStarted, 0)
  assert.equal(harness.controller.getStatus().followupUntil, null)

  harness.controller.resolveApproval(false)
  assert.deepEqual(harness.agent.resolved, [false])
  await waitForFollowup(harness)
})

test('keeps visual-only shortcut approval click-only too', async () => {
  const harness = createHarness(
    async () => 'completed',
    () => false
  )
  armConfirmRespond(harness)

  harness.controller.onFinalTranscript('این دستور رو اجرا کن')
  await waitForMode(harness, 'confirm')

  assert.deepEqual(harness.tts.spoken, [])
  assert.equal(harness.speech.started, 0)
  assert.equal(harness.controller.getStatus().followupUntil, null)
  harness.controller.resolveApproval(false)
  await waitForFollowup(harness)
})

test('ignores speech while approval is pending and accepts an explicit click', async () => {
  const harness = createHarness()
  armConfirmRespond(harness)
  harness.controller.onFinalTranscript('سافاری رو باز کن')
  await waitForMode(harness, 'confirm')

  harness.controller.onFinalTranscript('آره')
  harness.controller.onPartialTranscript('آره')
  harness.controller.sendText('yes')
  harness.controller.onSpeechSessionEnd()
  assert.deepEqual(harness.agent.resolved, [])
  assert.equal(harness.controller.getStatus().mode, 'confirm')

  harness.controller.resolveApproval(true)
  assert.deepEqual(harness.agent.resolved, [true])
  await waitForFollowup(harness)
  assert.equal(harness.controller.getStatus().mode, 'followup')
})

test('an explicit deny click returns the conversation to followup', async () => {
  const harness = createHarness()
  armConfirmRespond(harness)
  harness.controller.onFinalTranscript('حذف کن')
  await waitForMode(harness, 'confirm')

  harness.controller.resolveApproval(false)
  assert.deepEqual(harness.agent.resolved, [false])
  await waitForFollowup(harness)
})

test('does not resolve or resume the agent when approval sits inactive', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const harness = createHarness()
  armConfirmRespond(harness)
  harness.controller.onFinalTranscript('یه دستور اجرا کن')
  await waitForMode(harness, 'confirm')

  t.mock.timers.tick(60 * 60 * 1_000)

  assert.deepEqual(harness.agent.resolved, [])
  assert.equal(harness.controller.getStatus().mode, 'confirm')
  assert.equal(harness.controller.getStatus().followupUntil, null)
  assert.equal(harness.speech.started, 0)

  harness.controller.resolveApproval(false)
  await waitForFollowup(harness)
})

test('denies a confirm request when the conversation is interrupted', async () => {
  const harness = createHarness()
  armConfirmRespond(harness)
  harness.controller.onFinalTranscript('نصب کن')
  await waitForMode(harness, 'confirm')

  harness.controller.onWakeActivated()
  assert.deepEqual(harness.agent.resolved, [false])
  assert.equal(harness.controller.getStatus().mode, 'idle')
  assert.equal(harness.agent.aborted, 1)
})
