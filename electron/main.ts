import {
  app,
  clipboard,
  shell,
  BrowserWindow,
  ipcMain,
  nativeImage,
  nativeTheme,
  Menu,
  screen,
  Tray,
  globalShortcut
} from 'electron'
import { existsSync } from 'node:fs'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { agentStatusLabel, INITIAL_AGENT_STATUS, type AgentStatus } from '@/lib/agent'
import { CHATS_SNAPSHOT_CHANNEL, type ChatSearchOptions, type ChatsSnapshot } from '@/lib/chats'
import {
  hasSpokenText,
  INITIAL_CONVERSATION_STATUS,
  type ConversationStatus
} from '@/lib/conversation'
import { AUDIO_CHUNK_CHANNEL } from '@/lib/asr'
import {
  OPENROUTER_KEYS_URL,
  isLlmProviderId,
  isLlmReasoningEffort,
  isOpenAiCompatibleProviderId
} from '@/lib/llm'
import {
  APPEARANCE_SNAPSHOT_CHANNEL,
  DEFAULT_FONT_FAMILY,
  DEFAULT_THEME,
  SETTINGS_SNAPSHOT_CHANNEL,
  TOOL_APPROVAL_PRESETS,
  isFlyoverInputMode,
  isSystemToolId,
  isToolApprovalMode,
  isToolApprovalPreset,
  toAppearanceSnapshot,
  toSettingsSnapshot,
  type AppTheme
} from '@/lib/settings'
import type { SpeechSessionMode } from '@/lib/asr'
import {
  ELEVENLABS_KEYS_URL,
  GEMINI_KEYS_URL,
  INITIAL_TTS_STATUS,
  type TtsProviderId
} from '@/lib/tts'
import {
  SOUL_SNAPSHOT_CHANNEL,
  type SoulFileId,
  type SoulSnapshot,
  type UserProfileDraft
} from '@/lib/soul'
import { isWakeWordAudioPayload } from '@/lib/wake-word'
import { FLYOVER_WINDOW_SIZES, getFlyoverContentLayout } from '@/lib/flyover-layout'
import type { FlyoverSnapshot } from '@/lib/flyover'
import { AgentService } from './agent/service'
import { ChatStore } from './chats/store'
import { AudioRouter } from './audio-router'
import { ConversationController } from './conversation/controller'
import { LlmService } from './llm/service'
import { SecretStore } from './llm/secrets'
import { ModelRegistry } from './models/registry'
import { SettingsStore } from './settings/store'
import { SpeechService } from './speech/service'
import { LocalShenavaProvider } from './speech/provider'
import { SoulStore } from './soul/store'
import { WakeWordService } from './wake-word/service'
import { TtsService } from './tts/service'
import { DictationController } from './dictation/controller'
import { FlyoverService } from './flyover/service'
import { getFlyoverConversationPreview } from './flyover/context'
import {
  assistantShortcutAction,
  flyoverAllowsTyping,
  flyoverAllowsVoice,
  inputModeAfterTyping,
  mainWindowFocusAction,
  resolveFlyoverInputMode,
  shouldInterruptForWakeWordResume,
  shouldShowWakeFlyover
} from './flyover/activation'
import type { FlyoverInputMode } from '@/lib/settings'
import {
  canAcceptFlyoverCompose,
  clampFlyoverDraft,
  shouldIgnoreFlyoverSpeech,
  FLYOVER_COMPOSE_HINT,
  FLYOVER_TYPED_IDLE_MS
} from './flyover/compose'
import { ShortcutService, type ShortcutKind } from './shortcuts/service'
import { PasteService } from './system/paste'
import { VisionService } from './vision/service'
import { SkillService } from './skills/service'
import { SKILLS_SNAPSHOT_CHANNEL, type SkillsSnapshot } from '@/lib/skills'
import { EARCON_CHANNEL, type EarconKind } from '@/lib/earcon'
import {
  EXA_KEYS_URL,
  FIRECRAWL_KEYS_URL,
  isWebSearchApiProviderId,
  isWebSearchProviderId
} from '@/lib/web-search'
import { WebSearchService } from './web-search/service'
import { extractVersionNotes } from '@/lib/app-update'
import { AppUpdateService } from './update/service'
import type { MainWindowMode } from '@/lib/home-layout'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RENDERER_DEV_URL = process.env.ELECTRON_RENDERER_URL
const COMPACT_COMPANION_WIDTH = 400
const EXPANDED_COMPANION_WIDTH = 760
const COMPANION_HEIGHT = 712
const SETTINGS_WIDTH = 760
const SETTINGS_HEIGHT = 712
let mainWindow: BrowserWindow | null = null
let flyoverWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let shortcutError: string | null = null
let settingsStore: SettingsStore | null = null
let modelRegistry: ModelRegistry | null = null
let secretStore: SecretStore | null = null
let soulStore: SoulStore | null = null
let llmService: LlmService | null = null
let agentService: AgentService | null = null
let chatStore: ChatStore | null = null
let conversation: ConversationController | null = null
let wakeWordService: WakeWordService | null = null
let speechService: SpeechService | null = null
let audioRouter: AudioRouter | null = null
let ttsService: TtsService | null = null
let flyoverService: FlyoverService | null = null
let shortcutService: ShortcutService | null = null
let dictationController: DictationController | null = null
let visionService: VisionService | null = null
let skillService: SkillService | null = null
let webSearchService: WebSearchService | null = null
let appUpdateService: AppUpdateService | null = null
let assistantFlyoverActive = false
let assistantFlyoverMirroring = false
let assistantShortcutSilent = false
let assistantFlyoverInputMode: FlyoverInputMode = 'voice'
let assistantFlyoverComposing = false
let assistantFlyoverTyped = false
let assistantFlyoverIdleTimer: NodeJS.Timeout | null = null
let lastConfirmEarconTurnId: string | null = null

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.commandLine.appendSwitch('enable-features', 'GlobalShortcutsPortal')

function sendEarcon(kind: EarconKind): void {
  const flyoverLive =
    flyoverWindow &&
    !flyoverWindow.isDestroyed() &&
    (flyoverWindow.isVisible() || assistantFlyoverActive)
  const target = flyoverLive ? flyoverWindow : mainWindow
  if (target && !target.isDestroyed()) target.webContents.send(EARCON_CHANNEL, kind)
}

function isTrustedSender(sender: Electron.WebContents): boolean {
  return Boolean(mainWindow && !mainWindow.isDestroyed() && sender === mainWindow.webContents)
}

function isTrustedFlyoverSender(sender: Electron.WebContents): boolean {
  return Boolean(
    flyoverWindow && !flyoverWindow.isDestroyed() && sender === flyoverWindow.webContents
  )
}

function showMainWindow(openSettings = false): void {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow()
  const window = mainWindow
  if (!window) return
  if (openSettings) setMainWindowMode('settings')
  window.show()
  window.focus()
  if (openSettings) window.webContents.send('app:open-settings')
}

function setMainWindowMode(mode: MainWindowMode): void {
  const window = mainWindow
  if (!window || window.isDestroyed()) return

  const currentBounds = window.getBounds()
  const workArea = screen.getDisplayMatching(currentBounds).workArea
  const desiredWidth =
    mode === 'settings'
      ? SETTINGS_WIDTH
      : mode === 'expanded'
        ? EXPANDED_COMPANION_WIDTH
        : COMPACT_COMPANION_WIDTH
  const desiredHeight = mode === 'settings' ? SETTINGS_HEIGHT : COMPANION_HEIGHT
  const width = Math.min(desiredWidth, workArea.width)
  const height = Math.min(desiredHeight, workArea.height)
  const x = Math.min(
    Math.max(Math.round(currentBounds.x + (currentBounds.width - width) / 2), workArea.x),
    workArea.x + workArea.width - width
  )
  const y = Math.min(
    Math.max(Math.round(currentBounds.y + (currentBounds.height - height) / 2), workArea.y),
    workArea.y + workArea.height - height
  )

  window.setAspectRatio(0)
  if (mode === 'settings') {
    window.setMaximumSize(960, 900)
    window.setMinimumSize(Math.min(640, width), Math.min(640, height))
  } else if (mode === 'expanded') {
    window.setMaximumSize(860, 900)
    window.setMinimumSize(Math.min(680, width), Math.min(640, height))
  } else {
    window.setMinimumSize(360, Math.min(640, height))
    window.setMaximumSize(480, 900)
  }
  window.setBounds({ x, y, width, height }, true)
  if (mode === 'expanded') {
    window.setAspectRatio(EXPANDED_COMPANION_WIDTH / COMPANION_HEIGHT)
  } else if (mode === 'compact') {
    window.setAspectRatio(COMPACT_COMPANION_WIDTH / COMPANION_HEIGHT)
  }
}

function positionFlyover(window: BrowserWindow, snapshot: FlyoverSnapshot): void {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const area = process.platform === 'darwin' ? display.bounds : display.workArea
  const desired = FLYOVER_WINDOW_SIZES[getFlyoverContentLayout(snapshot)]
  const margin = process.platform === 'darwin' ? 6 : 10
  const width = Math.min(desired.width, area.width - margin * 2)
  const height = Math.min(desired.height, area.height - margin * 2)
  const x = Math.round(area.x + (area.width - width) / 2)
  const y = area.y + margin
  const current = window.getBounds()
  if (current.x === x && current.y === y && current.width === width && current.height === height) {
    return
  }
  window.setBounds({ x, y, width, height }, true)
}

function emitSettingsSnapshot(): void {
  if (!settingsStore) return
  const settings = settingsStore.get()
  const snapshot = toSettingsSnapshot(settings, shortcutError)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(SETTINGS_SNAPSHOT_CHANNEL, snapshot)
  }
  if (flyoverWindow && !flyoverWindow.isDestroyed()) {
    flyoverWindow.webContents.send(APPEARANCE_SNAPSHOT_CHANNEL, toAppearanceSnapshot(settings))
  }
}

function applyNativeTheme(theme: AppTheme): void {
  nativeTheme.themeSource = theme
  if (mainWindow && !mainWindow.isDestroyed() && process.platform !== 'darwin') {
    mainWindow.setTitleBarOverlay(titleBarOverlay(theme))
  }
}

function titleBarOverlay(theme: AppTheme = settingsStore?.get().theme ?? DEFAULT_THEME) {
  return theme === 'light'
    ? { color: '#fbfaf4', symbolColor: '#1c1c19', height: 36 }
    : { color: '#121211', symbolColor: '#e1e0cc', height: 36 }
}

function appearanceQuery(): Record<string, string> {
  const appearance = settingsStore
    ? toAppearanceSnapshot(settingsStore.get())
    : { theme: DEFAULT_THEME, fontFamily: DEFAULT_FONT_FAMILY }
  return { theme: appearance.theme, fontFamily: appearance.fontFamily }
}

async function emitSkillsSnapshot(snapshot?: SkillsSnapshot): Promise<SkillsSnapshot | null> {
  if (!skillService) return null
  const next = snapshot ?? (await skillService.refresh())
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(SKILLS_SNAPSHOT_CHANNEL, next)
  }
  return next
}

async function setWakeWordEnabled(enabled: boolean) {
  const status = wakeWordService?.setEnabled(enabled)
  await settingsStore?.update({ wakeWordEnabled: enabled })
  emitSettingsSnapshot()
  return status
}

function toggleWakeWord(): void {
  const enabled =
    wakeWordService?.getStatus().enabled ?? settingsStore?.get().wakeWordEnabled !== false
  void setWakeWordEnabled(!enabled).catch((error) => {
    console.error('Failed to persist wake-word setting:', error)
  })
}

async function setLaunchAtLogin(enabled: boolean): Promise<void> {
  if (process.platform !== 'linux') {
    app.setLoginItemSettings({ openAtLogin: enabled, args: enabled ? ['--hidden'] : [] })
    return
  }
  const autostartDir = join(app.getPath('appData'), 'autostart')
  const desktopFile = join(autostartDir, 'micky.desktop')
  if (!enabled) {
    try {
      await unlink(desktopFile)
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
    }
    return
  }
  await mkdir(autostartDir, { recursive: true })
  const appArgument = app.isPackaged ? '' : ` "${app.getAppPath().replaceAll('"', '\\"')}"`
  const executable = process.execPath.replaceAll('"', '\\"')
  await writeFile(
    desktopFile,
    `[Desktop Entry]\nType=Application\nName=Micky\nExec="${executable}"${appArgument} --hidden\nTerminal=false\nX-GNOME-Autostart-enabled=true\n`,
    'utf8'
  )
}

function resolveUnpackedWorkerPath(fileName: string): string {
  const bundled = join(__dirname, fileName)
  const unpacked = bundled.replace(`${sep}app.asar${sep}`, `${sep}app.asar.unpacked${sep}`)
  return unpacked !== bundled && existsSync(unpacked) ? unpacked : bundled
}

function resolveAppIcon(): Electron.NativeImage | undefined {
  return resolveAssetImage('icon.png')
}

function resolveTrayIcon(): Electron.NativeImage | undefined {
  return resolveAssetImage(process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png')
}

function resolveAssetImage(fileName: string): Electron.NativeImage | undefined {
  const candidates = [
    join(__dirname, '../assets', fileName),
    join(app.getAppPath(), 'assets', fileName)
  ]
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue
    const image = nativeImage.createFromPath(candidate)
    if (!image.isEmpty()) return image
  }
  return undefined
}

async function getSoulSnapshot(): Promise<SoulSnapshot> {
  const files = soulStore ? await soulStore.readAll() : { soul: '', user: '', memory: '' }
  return {
    onboardingCompleted: settingsStore?.get().onboardingCompleted === true,
    files
  }
}

async function emitSoulSnapshot(): Promise<SoulSnapshot> {
  const snapshot = await getSoulSnapshot()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(SOUL_SNAPSHOT_CHANNEL, snapshot)
  }
  return snapshot
}

function getChatsSnapshot(): ChatsSnapshot {
  return (
    chatStore?.getSnapshot() ?? {
      activeChatId: null,
      activeChat: null,
      chats: [],
      totalCount: 0
    }
  )
}

function emitChatsSnapshot(): ChatsSnapshot {
  const snapshot = getChatsSnapshot()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(CHATS_SNAPSHOT_CHANNEL, snapshot)
  }
  return snapshot
}

function registerIpc(): void {
  ipcMain.handle('app:set-window-mode', (event, mode: unknown) => {
    if (
      !isTrustedSender(event.sender) ||
      (mode !== 'expanded' && mode !== 'compact' && mode !== 'settings')
    ) {
      throw new Error('Invalid window mode.')
    }
    setMainWindowMode(mode)
  })

  ipcMain.handle('app-update:get-snapshot', (event) => {
    if (!isTrustedSender(event.sender)) throw new Error('Untrusted update request.')
    return appUpdateService?.getSnapshot()
  })
  ipcMain.handle('app-update:check', (event) => {
    if (!isTrustedSender(event.sender)) throw new Error('Untrusted update request.')
    return appUpdateService?.check()
  })
  ipcMain.handle('app-update:open-download', async (event) => {
    if (!isTrustedSender(event.sender) || !appUpdateService) {
      throw new Error('Untrusted update download request.')
    }
    await appUpdateService.openDownload()
  })
  ipcMain.handle('app-update:open-releases', async (event) => {
    if (!isTrustedSender(event.sender) || !appUpdateService) {
      throw new Error('Untrusted releases request.')
    }
    await appUpdateService.openReleases()
  })

  ipcMain.handle('wake-word:get-status', (event) => {
    if (!isTrustedSender(event.sender)) throw new Error('Untrusted wake-word status request.')
    return wakeWordService?.getStatus()
  })
  ipcMain.handle('wake-word:set-enabled', async (event, enabled: unknown) => {
    if (!isTrustedSender(event.sender) || typeof enabled !== 'boolean') {
      throw new Error('Invalid wake-word setting.')
    }
    return setWakeWordEnabled(enabled)
  })
  ipcMain.handle('wake-word:retry', (event) => {
    if (!isTrustedSender(event.sender)) throw new Error('Untrusted wake-word retry request.')
    return wakeWordService?.retry()
  })
  ipcMain.handle('wake-word:activate-manually', (event) => {
    if (!isTrustedSender(event.sender)) throw new Error('Untrusted wake-word activation request.')
    return wakeWordService?.activateManually()
  })
  ipcMain.handle('wake-word:resume', (event) => {
    if (!isTrustedSender(event.sender)) throw new Error('Untrusted wake-word resume request.')
    wakeWordService?.resumeListening()
  })
  ipcMain.on(AUDIO_CHUNK_CHANNEL, (event, payload: unknown) => {
    if (isTrustedSender(event.sender) && isWakeWordAudioPayload(payload)) {
      audioRouter?.process(payload)
    }
  })
  ipcMain.on('wake-word:capture-error', (event, error: unknown) => {
    if (isTrustedSender(event.sender) && typeof error === 'string') {
      wakeWordService?.reportCaptureError(error.slice(0, 500))
    }
  })

  ipcMain.handle('speech:get-status', (event) => {
    if (!isTrustedSender(event.sender)) throw new Error('Untrusted speech status request.')
    return speechService?.getStatus()
  })

  ipcMain.handle('tts:get-status', (event) => {
    if (!isTrustedSender(event.sender)) throw new Error('Untrusted TTS status request.')
    return ttsService?.getStatus() ?? INITIAL_TTS_STATUS
  })
  ipcMain.handle('tts:get-snapshot', (event) => {
    if (!isTrustedSender(event.sender)) throw new Error('Untrusted TTS snapshot request.')
    return ttsService?.getSnapshot()
  })
  ipcMain.handle('tts:set-enabled', async (event, enabled: unknown) => {
    if (!isTrustedSender(event.sender) || typeof enabled !== 'boolean') {
      throw new Error('Invalid TTS setting.')
    }
    return ttsService?.setEnabled(enabled)
  })
  ipcMain.handle('tts:set-provider', async (event, providerId: unknown) => {
    if (!isTrustedSender(event.sender)) throw new Error('Untrusted TTS provider request.')
    return ttsService?.setProvider(asTtsProviderId(providerId))
  })
  ipcMain.handle('tts:set-voice', async (event, providerId: unknown, voiceId: unknown) => {
    if (!isTrustedSender(event.sender) || typeof voiceId !== 'string') {
      throw new Error('Invalid TTS voice.')
    }
    return ttsService?.setVoice(asTtsProviderId(providerId), voiceId)
  })
  ipcMain.handle('tts:set-api-key', async (event, providerId: unknown, apiKey: unknown) => {
    if (!isTrustedSender(event.sender) || typeof apiKey !== 'string') {
      throw new Error('Invalid TTS API key.')
    }
    return ttsService?.setApiKey(asTtsProviderId(providerId), apiKey.slice(0, 256))
  })
  ipcMain.handle('tts:clear-api-key', async (event, providerId: unknown) => {
    if (!isTrustedSender(event.sender)) throw new Error('Untrusted TTS API key request.')
    return ttsService?.clearApiKey(asTtsProviderId(providerId))
  })
  ipcMain.handle('tts:refresh-voices', async (event) => {
    if (!isTrustedSender(event.sender)) throw new Error('Untrusted TTS refresh request.')
    return ttsService?.refresh()
  })
  ipcMain.handle('tts:preview', async (event) => {
    if (!isTrustedSender(event.sender)) throw new Error('Untrusted TTS preview request.')
    return ttsService?.speak('سلام، من میکی‌ام. چه کاری برات انجام بدم؟')
  })
  ipcMain.handle('tts:open-keys', async (event, providerId: unknown) => {
    if (!isTrustedSender(event.sender)) throw new Error('Untrusted TTS keys request.')
    const provider = asTtsProviderId(providerId)
    await shell.openExternal(provider === 'gemini' ? GEMINI_KEYS_URL : ELEVENLABS_KEYS_URL)
  })
  ipcMain.on('tts:playback-finished', (event, id: unknown, error: unknown) => {
    if (!isTrustedSender(event.sender) || typeof id !== 'string') return
    ttsService?.finishPlayback(id, typeof error === 'string' ? error : undefined)
  })

  ipcMain.handle('models:get-status', (event) => {
    if (!isTrustedSender(event.sender)) throw new Error('Untrusted models status request.')
    return modelRegistry?.getSnapshot()
  })
  ipcMain.handle('models:download', async (event, modelId: unknown) => {
    if (!isTrustedSender(event.sender) || typeof modelId !== 'string') {
      throw new Error('Invalid model download request.')
    }
    return modelRegistry?.download(modelId)
  })
  ipcMain.handle('models:cancel', (event, modelId: unknown) => {
    if (!isTrustedSender(event.sender) || typeof modelId !== 'string') {
      throw new Error('Invalid model cancel request.')
    }
    return modelRegistry?.cancel(modelId)
  })
  ipcMain.handle('models:remove', async (event, modelId: unknown) => {
    if (!isTrustedSender(event.sender) || typeof modelId !== 'string') {
      throw new Error('Invalid model remove request.')
    }
    return modelRegistry?.remove(modelId)
  })
  ipcMain.handle('models:set-active', async (event, modelId: unknown) => {
    if (!isTrustedSender(event.sender) || typeof modelId !== 'string') {
      throw new Error('Invalid model selection.')
    }
    return modelRegistry?.setActive(modelId)
  })
  ipcMain.handle('models:open-card', async (event, url: unknown) => {
    if (!isTrustedSender(event.sender) || typeof url !== 'string') {
      throw new Error('Invalid model card request.')
    }
    if (!url.startsWith('https://huggingface.co/')) {
      throw new Error('Only Hugging Face model cards can be opened.')
    }
    await shell.openExternal(url)
  })
  ipcMain.handle('models:open-folder', async (event) => {
    if (!isTrustedSender(event.sender) || !modelRegistry) {
      throw new Error('Invalid model folder request.')
    }
    const modelsRoot = modelRegistry.getModelsRoot()
    await mkdir(modelsRoot, { recursive: true })
    const error = await shell.openPath(modelsRoot)
    if (error) throw new Error(error)
  })

  ipcMain.handle('conversation:get-status', (event) => {
    if (!isTrustedSender(event.sender)) throw new Error('Untrusted conversation status request.')
    return conversation?.getStatus() ?? INITIAL_CONVERSATION_STATUS
  })
  ipcMain.on('conversation:resolve-approval', (event, approved: unknown) => {
    if (!isTrustedSender(event.sender) || typeof approved !== 'boolean') return
    conversation?.resolveApproval(approved)
  })
  ipcMain.handle('chats:get-snapshot', (event) => {
    if (!isTrustedSender(event.sender)) throw new Error('Untrusted chats request.')
    return getChatsSnapshot()
  })
  ipcMain.handle('chats:get', (event, chatId: unknown) => {
    if (!isTrustedSender(event.sender) || typeof chatId !== 'string') {
      throw new Error('Invalid chat request.')
    }
    return chatStore?.getChat(chatId.slice(0, 80)) ?? null
  })
  ipcMain.handle('chats:search', (event, options: unknown) => {
    if (!isTrustedSender(event.sender)) throw new Error('Untrusted chat search request.')
    return chatStore?.searchChats(asChatSearchOptions(options)) ?? []
  })
  ipcMain.handle('chats:resume', (event, chatId: unknown) => {
    if (!isTrustedSender(event.sender) || typeof chatId !== 'string') {
      throw new Error('Invalid chat resume request.')
    }
    const resumed = conversation?.resumeChat(chatId.slice(0, 80)) ?? false
    return { resumed, snapshot: getChatsSnapshot() }
  })
  ipcMain.handle('chats:delete', (event, chatId: unknown) => {
    if (!isTrustedSender(event.sender) || typeof chatId !== 'string') {
      throw new Error('Invalid chat deletion request.')
    }
    const deleted = conversation?.deleteChat(chatId.slice(0, 80)) ?? false
    return { deleted, snapshot: getChatsSnapshot() }
  })
  ipcMain.handle('chats:clear', (event) => {
    if (!isTrustedSender(event.sender)) throw new Error('Untrusted chat deletion request.')
    conversation?.clearChats()
    return getChatsSnapshot()
  })
  ipcMain.handle('agent:get-status', (event) => {
    if (!isTrustedSender(event.sender)) throw new Error('Untrusted agent status request.')
    return agentService?.getStatus() ?? INITIAL_AGENT_STATUS
  })
  ipcMain.handle('agent:send', async (event, text: unknown) => {
    if (!isTrustedSender(event.sender) || typeof text !== 'string') {
      throw new Error('Invalid agent message.')
    }
    conversation?.sendText(text.slice(0, 4_000))
  })
  ipcMain.handle('agent:abort', (event) => {
    if (!isTrustedSender(event.sender)) throw new Error('Untrusted agent abort request.')
    conversation?.onWakeResume()
    agentService?.abort()
    return agentService?.getStatus() ?? INITIAL_AGENT_STATUS
  })
  ipcMain.handle('agent:reset', (event) => {
    if (!isTrustedSender(event.sender)) throw new Error('Untrusted agent reset request.')
    if (conversation) conversation.startFresh()
    else agentService?.reset()
    return agentService?.getStatus() ?? INITIAL_AGENT_STATUS
  })

  ipcMain.handle('settings:get-snapshot', (event) => {
    if (!isTrustedSender(event.sender)) throw new Error('Untrusted settings request.')
    return settingsStore ? toSettingsSnapshot(settingsStore.get(), shortcutError) : null
  })
  ipcMain.handle('appearance:get-snapshot', (event) => {
    if (!isTrustedSender(event.sender) && !isTrustedFlyoverSender(event.sender)) {
      throw new Error('Untrusted appearance request.')
    }
    return settingsStore ? toAppearanceSnapshot(settingsStore.get()) : null
  })
  ipcMain.handle('settings:set-theme', async (event, theme: unknown) => {
    if (!isTrustedSender(event.sender) || (theme !== 'light' && theme !== 'dark')) {
      throw new Error('Invalid theme setting.')
    }
    await settingsStore?.update({ theme })
    applyNativeTheme(theme)
    emitSettingsSnapshot()
    return settingsStore ? toSettingsSnapshot(settingsStore.get(), shortcutError) : null
  })
  ipcMain.handle('settings:set-font-family', async (event, fontFamily: unknown) => {
    if (!isTrustedSender(event.sender) || typeof fontFamily !== 'string') {
      throw new Error('Invalid font setting.')
    }
    await settingsStore?.update({ fontFamily })
    emitSettingsSnapshot()
    return settingsStore ? toSettingsSnapshot(settingsStore.get(), shortcutError) : null
  })
  ipcMain.handle('settings:set-audio-device', async (event, kind: unknown, deviceId: unknown) => {
    if (
      !isTrustedSender(event.sender) ||
      (kind !== 'input' && kind !== 'output') ||
      typeof deviceId !== 'string'
    ) {
      throw new Error('Invalid audio device setting.')
    }
    const normalizedId = deviceId.trim().slice(0, 512) || 'default'
    await settingsStore?.update(
      kind === 'input' ? { inputDeviceId: normalizedId } : { outputDeviceId: normalizedId }
    )
    emitSettingsSnapshot()
    return settingsStore ? toSettingsSnapshot(settingsStore.get(), shortcutError) : null
  })
  ipcMain.handle('settings:set-system-tools', async (event, enabled: unknown) => {
    if (!isTrustedSender(event.sender) || typeof enabled !== 'boolean') {
      throw new Error('Invalid system tools setting.')
    }
    const settings = await settingsStore?.update({ systemToolsEnabled: enabled })
    const snapshot = settings ? toSettingsSnapshot(settings, shortcutError) : null
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(SETTINGS_SNAPSHOT_CHANNEL, snapshot)
    }
    return snapshot
  })
  ipcMain.handle('settings:set-tool-approval', async (event, toolId: unknown, mode: unknown) => {
    if (!isTrustedSender(event.sender) || !isSystemToolId(toolId) || !isToolApprovalMode(mode)) {
      throw new Error('Invalid tool approval setting.')
    }
    const current = settingsStore?.get()
    const settings = await settingsStore?.update({
      toolApprovals: {
        ...(current?.toolApprovals ?? TOOL_APPROVAL_PRESETS.balanced),
        [toolId]: mode
      }
    })
    const snapshot = settings ? toSettingsSnapshot(settings, shortcutError) : null
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(SETTINGS_SNAPSHOT_CHANNEL, snapshot)
    }
    return snapshot
  })
  ipcMain.handle('settings:set-tool-approval-preset', async (event, preset: unknown) => {
    if (!isTrustedSender(event.sender) || !isToolApprovalPreset(preset)) {
      throw new Error('Invalid tool approval preset.')
    }
    const settings = await settingsStore?.update({
      toolApprovals: { ...TOOL_APPROVAL_PRESETS[preset] }
    })
    const snapshot = settings ? toSettingsSnapshot(settings, shortcutError) : null
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(SETTINGS_SNAPSHOT_CHANNEL, snapshot)
    }
    return snapshot
  })
  ipcMain.handle('settings:set-flyover-input-mode', async (event, mode: unknown) => {
    if (!isTrustedSender(event.sender) || !isFlyoverInputMode(mode)) {
      throw new Error('Invalid flyover input mode.')
    }
    await settingsStore?.update({ flyoverInputMode: mode })
    emitSettingsSnapshot()
    return settingsStore ? toSettingsSnapshot(settingsStore.get(), shortcutError) : null
  })
  ipcMain.handle('settings:set-screen-access', async (event, enabled: unknown) => {
    if (!isTrustedSender(event.sender) || typeof enabled !== 'boolean') {
      throw new Error('Invalid screen access setting.')
    }
    await settingsStore?.update({ screenAccessEnabled: enabled })
    emitSettingsSnapshot()
    return settingsStore ? toSettingsSnapshot(settingsStore.get(), shortcutError) : null
  })
  ipcMain.handle('settings:get-screen-access-status', (event) => {
    if (!isTrustedSender(event.sender)) throw new Error('Untrusted screen access request.')
    return visionService?.getAccessStatus() ?? 'unknown'
  })
  ipcMain.handle('settings:open-screen-access-settings', async (event) => {
    if (!isTrustedSender(event.sender)) throw new Error('Untrusted screen settings request.')
    await visionService?.openAccessSettings()
  })
  ipcMain.handle('settings:set-chat-history', async (event, enabled: unknown) => {
    if (!isTrustedSender(event.sender) || typeof enabled !== 'boolean') {
      throw new Error('Invalid chat history setting.')
    }
    await settingsStore?.update({ chatHistoryEnabled: enabled })
    if (!enabled) conversation?.startFresh()
    emitSettingsSnapshot()
    return settingsStore ? toSettingsSnapshot(settingsStore.get(), shortcutError) : null
  })
  ipcMain.handle('settings:set-shortcut', async (event, kind: unknown, accelerator: unknown) => {
    if (
      !isTrustedSender(event.sender) ||
      (kind !== 'assistant' && kind !== 'newChat' && kind !== 'dictation' && kind !== 'wakeWord') ||
      typeof accelerator !== 'string'
    ) {
      throw new Error('Invalid shortcut setting.')
    }
    await shortcutService?.replace(kind as ShortcutKind, accelerator.slice(0, 80))
    emitSettingsSnapshot()
    return settingsStore ? toSettingsSnapshot(settingsStore.get(), shortcutError) : null
  })
  ipcMain.handle('settings:set-dictation-cleanup', async (event, enabled: unknown) => {
    if (!isTrustedSender(event.sender) || typeof enabled !== 'boolean')
      throw new Error('Invalid dictation setting.')
    await settingsStore?.update({ dictationAiCleanup: enabled })
    emitSettingsSnapshot()
    return settingsStore ? toSettingsSnapshot(settingsStore.get(), shortcutError) : null
  })
  ipcMain.handle('settings:set-dictation-auto-paste', async (event, enabled: unknown) => {
    if (!isTrustedSender(event.sender) || typeof enabled !== 'boolean')
      throw new Error('Invalid dictation setting.')
    await settingsStore?.update({ dictationAutoPaste: enabled })
    emitSettingsSnapshot()
    return settingsStore ? toSettingsSnapshot(settingsStore.get(), shortcutError) : null
  })
  ipcMain.handle('settings:set-launch-at-login', async (event, enabled: unknown) => {
    if (!isTrustedSender(event.sender) || typeof enabled !== 'boolean')
      throw new Error('Invalid login setting.')
    await setLaunchAtLogin(enabled)
    await settingsStore?.update({ launchAtLogin: enabled })
    emitSettingsSnapshot()
    return settingsStore ? toSettingsSnapshot(settingsStore.get(), shortcutError) : null
  })
  ipcMain.handle('settings:set-vision-model', async (event, modelId: unknown) => {
    if (!isTrustedSender(event.sender) || typeof modelId !== 'string')
      throw new Error('Invalid vision model.')
    await llmService?.setVisionModel(modelId.slice(0, 160))
    emitSettingsSnapshot()
    return settingsStore ? toSettingsSnapshot(settingsStore.get(), shortcutError) : null
  })

  ipcMain.handle('web-search:get-snapshot', (event) => {
    if (!isTrustedSender(event.sender)) throw new Error('Untrusted web search request.')
    return webSearchService?.getSnapshot() ?? null
  })
  ipcMain.handle(
    'web-search:set-provider-enabled',
    async (event, providerId: unknown, enabled: unknown) => {
      if (
        !isTrustedSender(event.sender) ||
        !isWebSearchProviderId(providerId) ||
        typeof enabled !== 'boolean'
      ) {
        throw new Error('Invalid web search provider setting.')
      }
      return webSearchService?.setProviderEnabled(providerId, enabled)
    }
  )
  ipcMain.handle('web-search:set-api-key', async (event, providerId: unknown, apiKey: unknown) => {
    if (
      !isTrustedSender(event.sender) ||
      !isWebSearchApiProviderId(providerId) ||
      typeof apiKey !== 'string'
    ) {
      throw new Error('Invalid web search API key.')
    }
    return webSearchService?.setApiKey(providerId, apiKey.slice(0, 512))
  })
  ipcMain.handle('web-search:clear-api-key', async (event, providerId: unknown) => {
    if (!isTrustedSender(event.sender) || !isWebSearchApiProviderId(providerId)) {
      throw new Error('Untrusted web search API key request.')
    }
    return webSearchService?.clearApiKey(providerId)
  })
  ipcMain.handle('web-search:open-keys', async (event, providerId: unknown) => {
    if (!isTrustedSender(event.sender) || !isWebSearchApiProviderId(providerId)) {
      throw new Error('Invalid web search keys request.')
    }
    await shell.openExternal(providerId === 'exa' ? EXA_KEYS_URL : FIRECRAWL_KEYS_URL)
  })

  ipcMain.handle('skills:get-snapshot', async (event) => {
    if (!isTrustedSender(event.sender)) throw new Error('Untrusted skills request.')
    return skillService?.refresh() ?? null
  })
  ipcMain.handle('skills:refresh', async (event) => {
    if (!isTrustedSender(event.sender)) throw new Error('Untrusted skills refresh request.')
    return emitSkillsSnapshot()
  })
  ipcMain.handle('skills:set-enabled', async (event, enabled: unknown) => {
    if (!isTrustedSender(event.sender) || typeof enabled !== 'boolean') {
      throw new Error('Invalid skills setting.')
    }
    if (!skillService) return null
    return emitSkillsSnapshot(await skillService.setEnabled(enabled))
  })
  ipcMain.handle('skills:set-skill-enabled', async (event, id: unknown, enabled: unknown) => {
    if (!isTrustedSender(event.sender) || typeof id !== 'string' || typeof enabled !== 'boolean') {
      throw new Error('Invalid skill setting.')
    }
    if (!skillService) return null
    return emitSkillsSnapshot(await skillService.setSkillEnabled(id.slice(0, 80), enabled))
  })
  ipcMain.handle('skills:open-catalog', async (event) => {
    if (!isTrustedSender(event.sender)) throw new Error('Untrusted skills catalog request.')
    await shell.openExternal('https://skills.sh')
  })

  ipcMain.handle('llm:get-snapshot', (event) => {
    if (!isTrustedSender(event.sender)) throw new Error('Untrusted llm snapshot request.')
    return llmService?.getSnapshot()
  })
  ipcMain.handle('llm:set-provider', async (event, providerId: unknown) => {
    if (!isTrustedSender(event.sender) || !isLlmProviderId(providerId)) {
      throw new Error('Invalid LLM provider.')
    }
    return llmService?.setProvider(providerId)
  })
  ipcMain.handle('llm:set-base-url', async (event, providerId: unknown, baseUrl: unknown) => {
    if (
      !isTrustedSender(event.sender) ||
      !isLlmProviderId(providerId) ||
      !isOpenAiCompatibleProviderId(providerId) ||
      typeof baseUrl !== 'string'
    ) {
      throw new Error('Invalid LLM base URL.')
    }
    return llmService?.setBaseUrl(providerId, baseUrl.slice(0, 2_048))
  })
  ipcMain.handle('llm:set-model', async (event, modelId: unknown) => {
    if (!isTrustedSender(event.sender) || typeof modelId !== 'string') {
      throw new Error('Invalid model selection.')
    }
    return llmService?.setModel(modelId)
  })
  ipcMain.handle('llm:set-temperature', async (event, temperature: unknown) => {
    if (!isTrustedSender(event.sender) || typeof temperature !== 'number') {
      throw new Error('Invalid LLM temperature.')
    }
    return llmService?.setTemperature(temperature)
  })
  ipcMain.handle('llm:set-reasoning-effort', async (event, effort: unknown) => {
    if (!isTrustedSender(event.sender) || !isLlmReasoningEffort(effort)) {
      throw new Error('Invalid LLM reasoning effort.')
    }
    return llmService?.setReasoningEffort(effort)
  })
  ipcMain.handle('llm:add-custom-model', async (event, modelId: unknown) => {
    if (!isTrustedSender(event.sender) || typeof modelId !== 'string') {
      throw new Error('Invalid custom model.')
    }
    return llmService?.addCustomModel(modelId)
  })
  ipcMain.handle('llm:remove-custom-model', async (event, modelId: unknown) => {
    if (!isTrustedSender(event.sender) || typeof modelId !== 'string') {
      throw new Error('Invalid custom model.')
    }
    return llmService?.removeCustomModel(modelId)
  })
  ipcMain.handle('llm:set-api-key', async (event, providerId: unknown, apiKey: unknown) => {
    if (
      !isTrustedSender(event.sender) ||
      !isLlmProviderId(providerId) ||
      typeof apiKey !== 'string'
    ) {
      throw new Error('Invalid API key.')
    }
    return llmService?.setApiKey(providerId, apiKey.slice(0, 256))
  })
  ipcMain.handle('llm:clear-api-key', async (event, providerId: unknown) => {
    if (!isTrustedSender(event.sender) || !isLlmProviderId(providerId)) {
      throw new Error('Untrusted API key request.')
    }
    return llmService?.clearApiKey(providerId)
  })
  ipcMain.handle('llm:refresh-models', async (event) => {
    if (!isTrustedSender(event.sender)) throw new Error('Untrusted llm refresh request.')
    return llmService?.refresh()
  })
  ipcMain.handle('llm:open-keys', async (event) => {
    if (!isTrustedSender(event.sender)) throw new Error('Untrusted keys request.')
    await shell.openExternal(OPENROUTER_KEYS_URL)
  })

  ipcMain.handle('soul:get-snapshot', async (event) => {
    if (!isTrustedSender(event.sender)) throw new Error('Untrusted soul snapshot request.')
    return getSoulSnapshot()
  })
  ipcMain.handle('soul:read-file', async (event, id: unknown) => {
    if (!isTrustedSender(event.sender)) throw new Error('Untrusted soul read request.')
    return soulStore?.read(asSoulFileId(id))
  })
  ipcMain.handle('soul:write-file', async (event, id: unknown, content: unknown) => {
    if (!isTrustedSender(event.sender) || typeof content !== 'string') {
      throw new Error('Invalid soul write request.')
    }
    await soulStore?.write(asSoulFileId(id), content.slice(0, 20_000))
    return emitSoulSnapshot()
  })
  ipcMain.handle('soul:complete-onboarding', async (event, draft: unknown) => {
    if (!isTrustedSender(event.sender)) throw new Error('Untrusted onboarding request.')
    await soulStore?.writeUserProfile(asUserProfileDraft(draft))
    await settingsStore?.update({ onboardingCompleted: true })
    return emitSoulSnapshot()
  })
  ipcMain.handle('soul:dismiss-onboarding', async (event) => {
    if (!isTrustedSender(event.sender)) throw new Error('Untrusted onboarding request.')
    await settingsStore?.update({ onboardingCompleted: true })
    return emitSoulSnapshot()
  })
  ipcMain.handle('soul:restart-onboarding', async (event) => {
    if (!isTrustedSender(event.sender) || app.isPackaged) {
      throw new Error('Onboarding replay is only available while developing Micky.')
    }
    await settingsStore?.update({ onboardingCompleted: false })
    return emitSoulSnapshot()
  })

  ipcMain.handle('flyover:get-snapshot', (event) => {
    if (!isTrustedFlyoverSender(event.sender)) throw new Error('Untrusted flyover request.')
    return flyoverService?.getSnapshot()
  })
  ipcMain.on('flyover:cancel', (event) => {
    if (!isTrustedFlyoverSender(event.sender)) return
    if (assistantFlyoverMirroring) {
      hideMirroredAssistantFlyover()
      return
    }
    if (assistantFlyoverActive) {
      stopAssistantFlyoverSession()
      return
    }
    dictationController?.cancel()
    conversation?.onWakeResume()
    speechService?.cancelSession()
    flyoverService?.hide()
  })
  ipcMain.on('flyover:finish-dictation', (event) => {
    if (isTrustedFlyoverSender(event.sender)) dictationController?.finish()
  })
  ipcMain.on('flyover:compose-start', (event, text: unknown) => {
    if (isTrustedFlyoverSender(event.sender) && typeof text === 'string') startFlyoverCompose(text)
  })
  ipcMain.on('flyover:compose-update', (event, text: unknown) => {
    if (isTrustedFlyoverSender(event.sender) && typeof text === 'string') updateFlyoverCompose(text)
  })
  ipcMain.on('flyover:compose-submit', (event, text: unknown) => {
    if (isTrustedFlyoverSender(event.sender) && typeof text === 'string') submitFlyoverCompose(text)
  })
  ipcMain.on('flyover:resolve-approval', (event, approved: unknown) => {
    if (isTrustedFlyoverSender(event.sender) && typeof approved === 'boolean') {
      conversation?.resolveApproval(approved)
    }
  })
  ipcMain.on('flyover:resolve-disclosure', (event, accepted: unknown) => {
    if (isTrustedFlyoverSender(event.sender) && typeof accepted === 'boolean') {
      flyoverService?.resolveDisclosure(accepted)
    }
  })
  ipcMain.on('flyover:open-main', (event) => {
    if (isTrustedFlyoverSender(event.sender)) showMainWindow()
  })
  ipcMain.on('flyover:open-models', (event) => {
    if (!isTrustedFlyoverSender(event.sender)) return
    flyoverService?.hide()
    showMainWindow(true)
  })
}

function createWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    showMainWindow()
    return
  }
  const window = new BrowserWindow({
    width: EXPANDED_COMPANION_WIDTH,
    height: COMPANION_HEIGHT,
    minWidth: 680,
    minHeight: 640,
    maxWidth: 860,
    show: false,
    center: true,
    title: 'میکی',
    autoHideMenuBar: true,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: '#00000000',
    ...(process.platform !== 'darwin' ? { icon: resolveAppIcon() } : {}),
    ...(process.platform === 'darwin'
      ? {
          vibrancy: 'under-window' as const,
          visualEffectState: 'active' as const,
          titleBarStyle: 'hidden' as const,
          trafficLightPosition: { x: 12, y: 11 },
          titleBarOverlay: { height: 36 }
        }
      : {}),
    ...(process.platform === 'win32'
      ? {
          backgroundMaterial: 'acrylic' as const,
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: {
            ...titleBarOverlay()
          }
        }
      : {}),
    ...(process.platform === 'linux'
      ? {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: {
            ...titleBarOverlay()
          }
        }
      : {}),
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  mainWindow = window

  window.setAspectRatio(EXPANDED_COMPANION_WIDTH / COMPANION_HEIGHT)

  window.on('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) window.show()
  })
  window.on('focus', handleMainWindowFocus)

  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window.webContents.getURL()) event.preventDefault()
  })
  window.webContents.session.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      const permissionName = permission as string
      const trustedMainFrame = webContents === window.webContents && details.isMainFrame
      const mediaTypes = permission === 'media' && 'mediaTypes' in details ? details.mediaTypes : []
      const audioOnly =
        permission === 'media' && mediaTypes?.includes('audio') && !mediaTypes.includes('video')
      const localFonts = permissionName === 'local-fonts' && trustedMainFrame
      callback(Boolean((webContents === window.webContents && audioOnly) || localFonts))
    }
  )
  window.webContents.session.setPermissionCheckHandler(
    (webContents, permission, _requestingOrigin, details) => {
      const permissionName = permission as string
      const audioOnly =
        permission === 'media' && 'mediaType' in details && details.mediaType === 'audio'
      const localFonts =
        permissionName === 'local-fonts' &&
        webContents === window.webContents &&
        details.isMainFrame
      return Boolean((webContents === window.webContents && audioOnly) || localFonts)
    }
  )
  window.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    window.hide()
  })
  window.on('closed', () => {
    ttsService?.stop()
    if (mainWindow === window) mainWindow = null
  })

  if (RENDERER_DEV_URL) {
    const rendererUrl = new URL(RENDERER_DEV_URL)
    const query = appearanceQuery()
    rendererUrl.searchParams.set('theme', query.theme)
    rendererUrl.searchParams.set('fontFamily', query.fontFamily)
    void window.loadURL(rendererUrl.toString())
  } else {
    void window.loadFile(join(__dirname, '../dist/index.html'), { query: appearanceQuery() })
  }

  startRuntime()
}

function createFlyoverWindow(): void {
  if (flyoverWindow && !flyoverWindow.isDestroyed()) return
  const window = new BrowserWindow({
    width: 420,
    height: 400,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, 'flyover-preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  })
  flyoverWindow = window
  window.setAlwaysOnTop(true, process.platform === 'darwin' ? 'status' : 'floating')
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  window.setContentProtection(true)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.on('closed', () => {
    if (flyoverWindow === window) flyoverWindow = null
  })
  flyoverService?.attachWindow(window)
  if (RENDERER_DEV_URL) {
    const rendererUrl = new URL(RENDERER_DEV_URL)
    const query = appearanceQuery()
    rendererUrl.searchParams.set('flyover', '1')
    rendererUrl.searchParams.set('theme', query.theme)
    rendererUrl.searchParams.set('fontFamily', query.fontFamily)
    void window.loadURL(rendererUrl.toString())
  } else {
    void window.loadFile(join(__dirname, '../dist/index.html'), {
      query: { flyover: '1', ...appearanceQuery() }
    })
  }
}

function createTray(): void {
  if (tray) return
  const icon = resolveTrayIcon() ?? resolveAppIcon()
  if (!icon) return
  if (process.platform === 'darwin') icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip('Micky')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Micky', click: () => showMainWindow() },
      { label: 'Settings', click: () => showMainWindow(true) },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])
  )
  tray.on('click', () => showMainWindow())
}

function showAssistantFlyover(silent: boolean, requestedMode?: FlyoverInputMode): void {
  const configuredMode = settingsStore?.get().flyoverInputMode ?? 'both'
  const inputMode = silent
    ? (requestedMode ??
      resolveFlyoverInputMode(configuredMode, modelRegistry?.hasInstalledModel() === true))
    : 'voice'
  const canCompose = silent && flyoverAllowsTyping(inputMode)
  assistantFlyoverActive = true
  assistantFlyoverMirroring = false
  assistantShortcutSilent = silent
  assistantFlyoverInputMode = inputMode
  assistantFlyoverComposing = false
  assistantFlyoverTyped = false
  clearFlyoverIdleDismiss()
  const activeChatId = silent ? chatStore?.getActiveChatId() : null
  const conversationPreview = getFlyoverConversationPreview(
    activeChatId ? (chatStore?.getChat(activeChatId, 4) ?? null) : null
  )
  flyoverService?.show({
    mode: 'assistant',
    inputMode,
    phase: 'listening',
    title: conversationPreview?.title ?? 'میکی',
    text: conversationPreview?.text ?? flyoverInputPrompt(inputMode, silent),
    hint: flyoverInputHint(inputMode, silent),
    interactive: canCompose,
    canCompose
  })
}

function flyoverCanCompose(): boolean {
  return assistantShortcutSilent && flyoverAllowsTyping(assistantFlyoverInputMode)
}

function flyoverShouldListen(): boolean {
  if (!assistantFlyoverActive || !assistantShortcutSilent) return true
  return flyoverAllowsVoice(assistantFlyoverInputMode)
}

function flyoverInputPrompt(mode: FlyoverInputMode, silent: boolean): string {
  if (!silent || mode === 'voice') return 'گوش می‌دم…'
  if (mode === 'typing') return 'پیامت رو بنویس…'
  return 'حرف بزن، یا بنویس…'
}

function flyoverInputHint(mode: FlyoverInputMode, silent: boolean): string {
  if (!silent || mode === 'voice') return 'هر وقت آماده‌ای شروع کن'
  if (mode === 'typing') return 'برای شروع بنویس'
  return 'حرف بزن یا بنویس'
}

// A typed exchange has no spoken reply to wait through, so the answer would vanish
// with the 12s listen window. Hold it open, but never leave the mic on forever.
function clearFlyoverIdleDismiss(): void {
  if (!assistantFlyoverIdleTimer) return
  clearTimeout(assistantFlyoverIdleTimer)
  assistantFlyoverIdleTimer = null
}

function armFlyoverIdleDismiss(): void {
  clearFlyoverIdleDismiss()
  assistantFlyoverIdleTimer = setTimeout(() => {
    assistantFlyoverIdleTimer = null
    stopAssistantFlyoverSession()
  }, FLYOVER_TYPED_IDLE_MS)
}

function noteSpokenActivity(): void {
  assistantFlyoverTyped = false
  clearFlyoverIdleDismiss()
}

function showMissingAsrModelFlyover(): void {
  assistantFlyoverActive = false
  assistantFlyoverMirroring = false
  assistantShortcutSilent = false
  assistantFlyoverInputMode = 'voice'
  assistantFlyoverComposing = false
  assistantFlyoverTyped = false
  clearFlyoverIdleDismiss()
  flyoverService?.show({
    mode: 'assistant',
    phase: 'unavailable',
    title: 'میکی فعلاً غیرفعاله',
    text: 'برای شنیدن صدات، اول یه مدل شنوا دانلود کن.',
    hint: 'بعد از دانلود، مدل روی همین کامپیوتر اجرا می‌شه',
    interactive: true,
    canOpenModels: true
  })
}

function stopAssistantFlyoverSession(): void {
  if (!assistantFlyoverActive) return
  detachAssistantFlyover()
  conversation?.onWakeResume()
  agentService?.abort()
  ttsService?.stop()
  speechService?.cancelSession()
  wakeWordService?.endExternalSession()
}

function detachAssistantFlyover(dismissedByMainWindow = false): void {
  assistantFlyoverActive = false
  assistantFlyoverMirroring = false
  assistantShortcutSilent = false
  assistantFlyoverInputMode = 'voice'
  assistantFlyoverComposing = false
  assistantFlyoverTyped = false
  clearFlyoverIdleDismiss()
  if (dismissedByMainWindow) flyoverService?.dismiss()
  else flyoverService?.hide()
}

function hideMirroredAssistantFlyover(): void {
  if (!assistantFlyoverActive || !assistantFlyoverMirroring) return
  detachAssistantFlyover()
}

function handleMainWindowFocus(): void {
  const action = mainWindowFocusAction({
    flyoverVisible: flyoverService?.getSnapshot().visible ?? false,
    assistantActive: assistantFlyoverActive,
    assistantComposing: assistantFlyoverComposing
  })
  if (action === 'none') return
  if (action === 'hide') {
    flyoverService?.dismiss()
    return
  }
  detachAssistantFlyover(true)
  if (action === 'cancel-compose') {
    conversation?.onWakeResume()
    speechService?.cancelSession()
    wakeWordService?.endExternalSession()
  }
}

function showOngoingAssistantFlyover(): void {
  if (assistantFlyoverActive) {
    flyoverService?.redisplay()
    return
  }
  showAssistantFlyover(true)
  assistantFlyoverMirroring = true
  const conversationStatus = conversation?.getStatus() ?? INITIAL_CONVERSATION_STATUS
  if (conversationStatus.mode !== 'idle') {
    handleAgentStatus(agentService?.getStatus() ?? INITIAL_AGENT_STATUS)
    handleConversationStatus(conversationStatus)
  }
}

function handleAssistantShortcut(): void {
  const action = assistantShortcutAction({
    flyoverActive: assistantFlyoverActive,
    flyoverVisible: flyoverService?.getSnapshot().visible ?? false,
    flyoverMirroring: assistantFlyoverMirroring,
    conversationMode: conversation?.getStatus().mode ?? 'idle',
    speechActive: speechService?.isSessionActive() ?? false,
    dictationActive: dictationController?.isActive() ?? false
  })
  if (action === 'hide-mirror') {
    hideMirroredAssistantFlyover()
    return
  }
  if (action === 'hide-ongoing') {
    flyoverService?.conceal()
    return
  }
  if (action === 'stop-session') {
    stopAssistantFlyoverSession()
    return
  }
  if (action === 'reveal-ongoing') {
    showOngoingAssistantFlyover()
    return
  }
  dictationController?.cancel()
  const configuredMode = settingsStore?.get().flyoverInputMode ?? 'both'
  const voiceAvailable = modelRegistry?.hasInstalledModel() === true
  if (configuredMode === 'voice' && !voiceAvailable) {
    showMissingAsrModelFlyover()
    return
  }
  const inputMode = resolveFlyoverInputMode(configuredMode, voiceAvailable)
  ttsService?.stop()
  conversation?.onWakeActivated()
  showAssistantFlyover(true, inputMode)
  if (flyoverAllowsVoice(inputMode)) {
    sendEarcon('listen')
    wakeWordService?.beginExternalSession()
    void speechService?.startSession({ preroll: false, mode: 'conversation' })
  }
}

function handleNewChatShortcut(): void {
  dictationController?.cancel()
  detachAssistantFlyover()
  conversation?.startFresh()
  wakeWordService?.endExternalSession()
  const configuredMode = settingsStore?.get().flyoverInputMode ?? 'both'
  const voiceAvailable = modelRegistry?.hasInstalledModel() === true
  if (configuredMode === 'voice' && !voiceAvailable) {
    showMissingAsrModelFlyover()
    return
  }
  const inputMode = resolveFlyoverInputMode(configuredMode, voiceAvailable)
  showAssistantFlyover(true, inputMode)
  if (flyoverAllowsVoice(inputMode)) {
    sendEarcon('listen')
    wakeWordService?.beginExternalSession()
    void speechService?.startSession({ preroll: false, mode: 'conversation' })
  }
}

function startFlyoverCompose(text: string): void {
  const snapshot = flyoverService?.getSnapshot()
  if (
    !snapshot ||
    !flyoverCanCompose() ||
    !canAcceptFlyoverCompose({
      active: assistantFlyoverActive,
      shortcutSession: assistantShortcutSilent,
      phase: snapshot.phase,
      canApprove: snapshot.canApprove
    })
  ) {
    return
  }
  clearFlyoverIdleDismiss()
  if (!assistantFlyoverComposing) {
    assistantFlyoverComposing = true
    assistantFlyoverInputMode = inputModeAfterTyping()
    assistantFlyoverTyped = true
    speechService?.cancelSession()
    conversation?.holdListenWindow()
  }
  flyoverService?.update({
    mode: 'assistant',
    inputMode: assistantFlyoverInputMode,
    phase: 'composing',
    hint: FLYOVER_COMPOSE_HINT,
    detail: null,
    composeText: clampFlyoverDraft(text),
    previewImage: null,
    interactive: true,
    canCompose: true
  })
}

function updateFlyoverCompose(text: string): void {
  if (!assistantFlyoverComposing) return
  clearFlyoverIdleDismiss()
  flyoverService?.update({
    phase: 'composing',
    hint: FLYOVER_COMPOSE_HINT,
    composeText: clampFlyoverDraft(text),
    interactive: true,
    canCompose: true
  })
}

function submitFlyoverCompose(text: string): void {
  if (!assistantFlyoverComposing) return
  const draft = clampFlyoverDraft(text).trim()
  if (!draft) return
  assistantFlyoverComposing = false
  assistantFlyoverTyped = true
  clearFlyoverIdleDismiss()
  flyoverService?.update({
    phase: 'thinking',
    title: 'میکی',
    text: 'دارم فکر می‌کنم…',
    hint: null,
    composeText: null,
    interactive: assistantShortcutSilent,
    canCompose: false
  })
  conversation?.onFinalTranscript(draft)
}

function handleAgentStatus(status: AgentStatus): void {
  const turn = status.turn
  if (turn?.phase === 'confirm') {
    if (!assistantFlyoverActive) assistantFlyoverMirroring = true
    assistantFlyoverActive = true
    assistantFlyoverComposing = false
    clearFlyoverIdleDismiss()
    flyoverService?.show({
      mode: 'assistant',
      inputMode: assistantFlyoverInputMode,
      phase: 'confirm',
      title: 'تأیید لازم است',
      text: turn.confirmText ?? 'این کار رو انجام بدم؟',
      hint: 'تا انتخاب نکنی، کاری انجام نمی‌شه',
      detail: turn.confirmDetail,
      interactive: true,
      canCompose: false,
      canApprove: true
    })
    if (turn.turnId !== lastConfirmEarconTurnId) {
      lastConfirmEarconTurnId = turn.turnId
      sendEarcon('confirm')
    }
    return
  }
  lastConfirmEarconTurnId = null
  if (!assistantFlyoverActive || !turn) return
  const reply = turn.replyText.trim()
  const phase =
    turn.phase === 'tool'
      ? 'tool'
      : turn.phase === 'speaking' || (turn.phase === 'idle' && Boolean(reply))
        ? 'reply'
        : turn.phase === 'error'
          ? 'error'
          : 'thinking'
  flyoverService?.reveal({
    mode: 'assistant',
    inputMode: assistantFlyoverInputMode,
    phase,
    title: 'میکی',
    text: reply.slice(0, 700) || turn.error || agentStatusLabel(turn.phase, turn.toolName),
    hint: null,
    detail: null,
    ...(phase === 'reply' || phase === 'error' ? { previewImage: null } : {}),
    interactive: assistantShortcutSilent,
    canCompose: false,
    canApprove: false,
    canRespondToDisclosure: false,
    canFinish: false
  })
}

function handleConversationStatus(status: ConversationStatus): void {
  if (!assistantFlyoverActive) return
  if (status.mode === 'followup') {
    if (status.followupHeard) return
    const current = flyoverService?.getSnapshot()
    const compose = flyoverCanCompose()
    const hint =
      assistantFlyoverInputMode === 'typing'
        ? 'برای ادامه بنویس'
        : assistantFlyoverInputMode === 'both'
          ? 'حرف بزن یا بنویس'
          : 'ادامه بده…'
    const keepsReply = current?.phase === 'reply' && Boolean(current.text.trim())
    flyoverService?.update(
      keepsReply
        ? {
            inputMode: assistantFlyoverInputMode,
            phase: 'reply',
            title: 'میکی',
            hint,
            interactive: compose,
            canCompose: compose,
            canApprove: false
          }
        : {
            inputMode: assistantFlyoverInputMode,
            phase: 'listening',
            title: 'میکی',
            text:
              assistantFlyoverInputMode === 'typing'
                ? 'ادامه‌ات رو بنویس…'
                : assistantFlyoverInputMode === 'both'
                  ? 'حرف بزن یا بنویس…'
                  : 'ادامه بده…',
            hint: null,
            interactive: compose,
            canCompose: compose,
            canApprove: false
          }
    )
    if (assistantFlyoverTyped && compose) {
      conversation?.holdListenWindow()
      armFlyoverIdleDismiss()
    }
    return
  }
  if (status.mode === 'idle' && !speechService?.isSessionActive() && !assistantFlyoverComposing) {
    assistantFlyoverActive = false
    assistantFlyoverMirroring = false
    assistantShortcutSilent = false
    assistantFlyoverInputMode = 'voice'
    assistantFlyoverComposing = false
    assistantFlyoverTyped = false
    clearFlyoverIdleDismiss()
    flyoverService?.hide()
  }
}

function startRuntime(): void {
  const wakeWordResourcesRoot = app.isPackaged
    ? join(process.resourcesPath, 'wakeword')
    : join(app.getAppPath(), 'assets', 'wakeword')

  wakeWordService?.dispose()
  speechService?.dispose()
  conversation?.dispose()
  ttsService?.stop()

  const settings = settingsStore?.get()
  audioRouter = new AudioRouter(
    () => wakeWordService,
    () => speechService
  )
  speechService = new SpeechService({
    models: modelRegistry!,
    settings: settingsStore!,
    createProvider: (handlers) =>
      new LocalShenavaProvider({
        scriptPath: resolveUnpackedWorkerPath('asr-process.cjs'),
        handlers
      }),
    getWindow: () => mainWindow,
    getPreroll: () => audioRouter?.takePreroll() ?? new ArrayBuffer(0),
    onSessionEnd: (mode: SpeechSessionMode) => {
      if (mode === 'dictation') dictationController?.onSessionEnd()
      else conversation?.onSpeechSessionEnd()
    },
    onPartialTranscript: (text, mode) => {
      if (mode === 'dictation') dictationController?.onPartial(text)
      else {
        if (shouldIgnoreFlyoverSpeech(assistantFlyoverComposing)) return
        if (
          assistantFlyoverActive &&
          conversation?.getStatus().mode !== 'confirm' &&
          hasSpokenText(text)
        ) {
          noteSpokenActivity()
          flyoverService?.update({
            phase: 'listening',
            title: 'صدای تو',
            text: text.trim().slice(0, 700),
            hint: 'دارم می‌شنوم…',
            detail: null,
            previewImage: null,
            interactive: flyoverCanCompose(),
            // Once speech wins the turn, give the live transcript the whole copy area.
            canCompose: false,
            canApprove: false
          })
        }
        conversation?.onPartialTranscript(text)
      }
    },
    onFinalTranscript: (text, mode) => {
      if (mode === 'dictation') void dictationController?.onFinal(text)
      else {
        if (shouldIgnoreFlyoverSpeech(assistantFlyoverComposing)) return
        if (text.trim()) noteSpokenActivity()
        if (assistantFlyoverActive && conversation?.getStatus().mode !== 'confirm' && text.trim()) {
          flyoverService?.update({
            phase: 'thinking',
            title: 'میکی',
            text: 'دارم فکر می‌کنم…',
            hint: null,
            previewImage: null,
            canCompose: false
          })
        }
        conversation?.onFinalTranscript(text)
      }
    }
  })
  wakeWordService = new WakeWordService({
    workerScript: resolveUnpackedWorkerPath('wake-word-worker.cjs'),
    resources: {
      melModelPath: join(wakeWordResourcesRoot, 'melspectrogram.onnx'),
      embeddingModelPath: join(wakeWordResourcesRoot, 'embedding_model.onnx'),
      classifierModelPath: join(wakeWordResourcesRoot, 'hey_micky.onnx')
    },
    getWindow: () => mainWindow,
    enabled: settings?.wakeWordEnabled,
    onActivated: (activation) => {
      if (!modelRegistry?.hasInstalledModel()) {
        if (activation.source === 'wake-word') showMissingAsrModelFlyover()
        wakeWordService?.resumeListening()
        return
      }
      conversation?.onWakeActivated()
      if (shouldShowWakeFlyover(activation, mainWindow?.isFocused() === true)) {
        showAssistantFlyover(false)
      }
      void speechService?.startSession()
    },
    onResume: () => {
      const mode = conversation?.getStatus().mode ?? 'idle'
      if (!shouldInterruptForWakeWordResume(mode)) return
      conversation?.onWakeResume()
      speechService?.cancelSession()
    }
  })
  wakeWordService.initialize()
  void speechService.preload()
}

app.whenReady().then(async () => {
  nativeTheme.themeSource = DEFAULT_THEME
  if (process.platform === 'darwin') {
    const icon = resolveAppIcon()
    if (icon) app.dock?.setIcon(icon)
  }
  if (process.platform === 'win32') {
    app.setAppUserModelId('dev.micky.app')
  }

  settingsStore = new SettingsStore(app.getPath('userData'))
  await settingsStore.load()
  applyNativeTheme(settingsStore.get().theme)
  secretStore = new SecretStore(app.getPath('userData'))
  await secretStore.load()
  soulStore = new SoulStore(app.getPath('userData'))
  await soulStore.initialize()
  skillService = new SkillService(settingsStore, {
    bundledRoot: join(app.getAppPath(), 'assets', 'skills')
  })
  await skillService.refresh()
  chatStore = new ChatStore(app.getPath('userData'), { onChange: emitChatsSnapshot })
  llmService = new LlmService({
    settings: settingsStore,
    secrets: secretStore,
    getWindow: () => mainWindow
  })
  await llmService.refresh()
  ttsService = new TtsService({
    settings: settingsStore,
    secrets: secretStore,
    getWindow: () => mainWindow
  })
  void ttsService.refresh()
  flyoverService = new FlyoverService(positionFlyover)
  visionService = new VisionService({
    settings: settingsStore,
    llm: llmService,
    flyover: flyoverService
  })
  webSearchService = new WebSearchService({
    settings: settingsStore,
    secrets: secretStore,
    getWindow: () => mainWindow
  })
  agentService = new AgentService({
    settings: settingsStore,
    llm: llmService,
    soul: soulStore,
    chats: chatStore,
    skills: skillService,
    webSearch: webSearchService,
    getWindow: () => mainWindow,
    onApprovalNeeded: () => conversation?.onApprovalNeeded(),
    lookAtScreen: (question, abortSignal) => visionService!.inspect(question, abortSignal),
    onStatusChange: handleAgentStatus
  })
  conversation = new ConversationController({
    settings: settingsStore,
    llm: llmService,
    getAgent: () => agentService,
    getSpeech: () => speechService,
    getTts: () => ttsService,
    getWakeWord: () => wakeWordService,
    getChats: () => chatStore,
    getWindow: () => mainWindow,
    onStatusChange: handleConversationStatus,
    shouldUseVoice: () => !assistantShortcutSilent,
    shouldStartFollowupListening: flyoverShouldListen
  })
  modelRegistry = new ModelRegistry({
    modelsRoot: join(app.getPath('userData'), 'models'),
    settings: settingsStore,
    getWindow: () => mainWindow,
    isSessionActive: () => Boolean(speechService?.isSessionActive()),
    onActiveModelChange: (modelId) => {
      if (!speechService) return
      if (!modelId) {
        speechService.dispose()
        return
      }
      void speechService.preload()
    }
  })
  await modelRegistry.initialize()

  let changelog = ''
  try {
    changelog = await readFile(join(app.getAppPath(), 'CHANGELOG.md'), 'utf8')
  } catch (error) {
    console.error('Failed to read the bundled changelog:', error)
  }
  appUpdateService = new AppUpdateService({
    currentVersion: app.getVersion(),
    currentReleaseNotes: extractVersionNotes(changelog, app.getVersion()),
    platform: process.platform,
    arch: process.arch,
    getWindow: () => mainWindow,
    openExternal: (url) => shell.openExternal(url)
  })

  registerIpc()
  createWindow()
  void appUpdateService.check()
  createFlyoverWindow()
  createTray()
  dictationController = new DictationController({
    settings: settingsStore,
    llm: llmService,
    getSpeech: () => speechService,
    getWakeWord: () => wakeWordService,
    flyover: flyoverService,
    paste: new PasteService(),
    writeClipboard: (text) => clipboard.writeText(text),
    interruptAssistant: () => {
      assistantFlyoverActive = false
      assistantFlyoverMirroring = false
      assistantShortcutSilent = false
      assistantFlyoverInputMode = 'voice'
      assistantFlyoverComposing = false
      assistantFlyoverTyped = false
      clearFlyoverIdleDismiss()
      conversation?.onWakeResume()
      agentService?.abort()
      ttsService?.stop()
    }
  })
  shortcutService = new ShortcutService({
    settings: settingsStore,
    registry: globalShortcut,
    onAssistant: handleAssistantShortcut,
    onNewChat: handleNewChatShortcut,
    onDictation: () => {
      void (async () => {
        const starting = !dictationController?.isActive()
        await dictationController?.toggle()
        if (starting && dictationController?.isActive()) sendEarcon('listen')
      })()
    },
    onToggleWakeWord: toggleWakeWord,
    onError: (error) => {
      shortcutError = error
      emitSettingsSnapshot()
    }
  })
  shortcutService.registerAll()

  app.on('activate', function () {
    showMainWindow()
  })
})

app.on('window-all-closed', () => {
  // Micky remains available from the tray and global shortcuts.
})

app.on('before-quit', () => {
  isQuitting = true
  shortcutService?.unregisterAll()
  dictationController?.cancel()
  conversation?.dispose()
  agentService?.abort()
  wakeWordService?.dispose()
  speechService?.dispose()
  ttsService?.dispose()
  flyoverService?.dispose()
  chatStore?.close()
  tray?.destroy()
  tray = null
  conversation = null
  agentService = null
  chatStore = null
  wakeWordService = null
  speechService = null
  ttsService = null
  audioRouter = null
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asSoulFileId(value: unknown): SoulFileId {
  if (value === 'soul' || value === 'user' || value === 'memory') return value
  throw new Error('Invalid soul file.')
}

function asUserProfileDraft(value: unknown): UserProfileDraft {
  const record = isRecord(value) ? value : {}
  return {
    name: readString(record.name, 80),
    about: readString(record.about, 500),
    personalityProfile:
      record.personalityProfile === 'direct' ||
      record.personalityProfile === 'thoughtful' ||
      record.personalityProfile === 'playful'
        ? record.personalityProfile
        : 'balanced',
    addressForm: record.addressForm === 'shoma' ? 'shoma' : 'to',
    languageMix: record.languageMix === 'persian' ? 'persian' : 'mixed',
    city: readString(record.city, 80),
    work: readString(record.work, 120),
    focus: readString(record.focus, 160),
    replyLength: record.replyLength === 'medium' ? 'medium' : 'short'
  }
}

function asChatSearchOptions(value: unknown): ChatSearchOptions {
  const record = isRecord(value) ? value : {}
  return {
    query: typeof record.query === 'string' ? record.query.slice(0, 200) : undefined,
    from: readFiniteNumber(record.from),
    to: readFiniteNumber(record.to),
    limit:
      typeof record.limit === 'number' && Number.isInteger(record.limit)
        ? Math.max(1, Math.min(record.limit, 20))
        : undefined
  }
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readString(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function asTtsProviderId(value: unknown): TtsProviderId {
  if (value === 'gemini' || value === 'elevenlabs') return value
  throw new Error('Invalid TTS provider.')
}
