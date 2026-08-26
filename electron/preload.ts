import { contextBridge, ipcRenderer } from 'electron'
import {
  AGENT_DELTA_CHANNEL,
  AGENT_STATUS_CHANNEL,
  type AgentDelta,
  type AgentStatus
} from '@/lib/agent'
import {
  AUDIO_CHUNK_CHANNEL,
  MODELS_STATUS_CHANNEL,
  SPEECH_STATUS_CHANNEL,
  SPEECH_TRANSCRIPT_CHANNEL,
  type ModelsSnapshot,
  type SpeechStatus,
  type SpeechTranscript
} from '@/lib/asr'
import { CONVERSATION_STATUS_CHANNEL, type ConversationStatus } from '@/lib/conversation'
import { CHATS_SNAPSHOT_CHANNEL, type ChatSearchOptions, type ChatsSnapshot } from '@/lib/chats'
import { EARCON_CHANNEL, type EarconKind } from '@/lib/earcon'
import type { MickyAPI } from '@/lib/desktop-api'
import {
  LLM_SNAPSHOT_CHANNEL,
  type LlmProviderId,
  type LlmReasoningEffort,
  type LlmSnapshot,
  type OpenAiCompatibleProviderId
} from '@/lib/llm'
import { SETTINGS_SNAPSHOT_CHANNEL, type SettingsSnapshot } from '@/lib/settings'
import {
  TTS_PLAYBACK_CHANNEL,
  TTS_SNAPSHOT_CHANNEL,
  TTS_STATUS_CHANNEL,
  TTS_STOP_CHANNEL,
  copyPlaybackAudio,
  type TtsPlayback,
  type TtsProviderId,
  type TtsSnapshot,
  type TtsStatus
} from '@/lib/tts'
import {
  SOUL_SNAPSHOT_CHANNEL,
  type SoulFileId,
  type SoulSnapshot,
  type UserProfileDraft
} from '@/lib/soul'
import type { WakeWordActivation, WakeWordStatus } from '@/lib/wake-word'
import { SKILLS_SNAPSHOT_CHANNEL, type SkillsSnapshot } from '@/lib/skills'
import { TASKS_OPEN_RUN_CHANNEL, TASKS_SNAPSHOT_CHANNEL, type TasksSnapshot } from '@/lib/tasks'
import type { SaveTextInput, SaveTextResult, CopyTextResult } from '@/lib/export-text'
import {
  WEB_SEARCH_SNAPSHOT_CHANNEL,
  type WebSearchApiProviderId,
  type WebSearchProviderId,
  type WebSearchSnapshot
} from '@/lib/web-search'
import { APP_UPDATE_SNAPSHOT_CHANNEL, type AppUpdateSnapshot } from '@/lib/app-update'

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: MickyAPI = {
  wakeWord: {
    getStatus: (): Promise<WakeWordStatus> => ipcRenderer.invoke('wake-word:get-status'),
    setEnabled: (enabled: boolean): Promise<WakeWordStatus> =>
      ipcRenderer.invoke('wake-word:set-enabled', enabled),
    retry: (): Promise<WakeWordStatus> => ipcRenderer.invoke('wake-word:retry'),
    activateManually: (): Promise<WakeWordStatus> =>
      ipcRenderer.invoke('wake-word:activate-manually'),
    resume: (): Promise<void> => ipcRenderer.invoke('wake-word:resume'),
    processAudio: (buffer: ArrayBuffer): void => ipcRenderer.send(AUDIO_CHUNK_CHANNEL, buffer),
    reportCaptureError: (error: string): void => ipcRenderer.send('wake-word:capture-error', error),
    onStatusChange: (listener: (status: WakeWordStatus) => void): (() => void) =>
      subscribe('wake-word:status', listener),
    onActivation: (listener: (activation: WakeWordActivation) => void): (() => void) =>
      subscribe('wake-word:activation', listener)
  },
  speech: {
    getStatus: (): Promise<SpeechStatus> => ipcRenderer.invoke('speech:get-status'),
    onStatusChange: (listener: (status: SpeechStatus) => void): (() => void) =>
      subscribe(SPEECH_STATUS_CHANNEL, listener),
    onTranscript: (listener: (transcript: SpeechTranscript) => void): (() => void) =>
      subscribe(SPEECH_TRANSCRIPT_CHANNEL, listener)
  },
  tts: {
    getStatus: (): Promise<TtsStatus> => ipcRenderer.invoke('tts:get-status'),
    getSnapshot: (): Promise<TtsSnapshot> => ipcRenderer.invoke('tts:get-snapshot'),
    setEnabled: (enabled: boolean): Promise<TtsSnapshot> =>
      ipcRenderer.invoke('tts:set-enabled', enabled),
    setProvider: (providerId: TtsProviderId): Promise<TtsSnapshot> =>
      ipcRenderer.invoke('tts:set-provider', providerId),
    setVoice: (providerId: TtsProviderId, voiceId: string): Promise<TtsSnapshot> =>
      ipcRenderer.invoke('tts:set-voice', providerId, voiceId),
    setApiKey: (providerId: TtsProviderId, apiKey: string): Promise<TtsSnapshot> =>
      ipcRenderer.invoke('tts:set-api-key', providerId, apiKey),
    clearApiKey: (providerId: TtsProviderId): Promise<TtsSnapshot> =>
      ipcRenderer.invoke('tts:clear-api-key', providerId),
    refreshVoices: (): Promise<TtsSnapshot> => ipcRenderer.invoke('tts:refresh-voices'),
    preview: (): Promise<void> => ipcRenderer.invoke('tts:preview'),
    openKeys: (providerId: TtsProviderId): Promise<void> =>
      ipcRenderer.invoke('tts:open-keys', providerId),
    playbackFinished: (id: string, error?: string): void =>
      ipcRenderer.send('tts:playback-finished', id, error),
    onStatusChange: (listener: (status: TtsStatus) => void): (() => void) =>
      subscribe(TTS_STATUS_CHANNEL, listener),
    onSnapshotChange: (listener: (snapshot: TtsSnapshot) => void): (() => void) =>
      subscribe(TTS_SNAPSHOT_CHANNEL, listener),
    onPlayback: (listener: (playback: TtsPlayback) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, playback: TtsPlayback): void => {
        listener({
          id: playback.id,
          mimeType: playback.mimeType,
          audio: copyPlaybackAudio(playback.audio)
        })
      }
      ipcRenderer.on(TTS_PLAYBACK_CHANNEL, handler)
      return () => ipcRenderer.removeListener(TTS_PLAYBACK_CHANNEL, handler)
    },
    onStop: (listener: (id: string) => void): (() => void) => subscribe(TTS_STOP_CHANNEL, listener)
  },
  conversation: {
    getStatus: (): Promise<ConversationStatus> => ipcRenderer.invoke('conversation:get-status'),
    resolveApproval: (approved: boolean): void =>
      ipcRenderer.send('conversation:resolve-approval', approved),
    onStatusChange: (listener: (status: ConversationStatus) => void): (() => void) =>
      subscribe(CONVERSATION_STATUS_CHANNEL, listener)
  },
  chats: {
    getSnapshot: (): Promise<ChatsSnapshot> => ipcRenderer.invoke('chats:get-snapshot'),
    get: (chatId): Promise<Awaited<ReturnType<MickyAPI['chats']['get']>>> =>
      ipcRenderer.invoke('chats:get', chatId),
    search: (options: ChatSearchOptions) => ipcRenderer.invoke('chats:search', options),
    resume: (chatId) => ipcRenderer.invoke('chats:resume', chatId),
    delete: (chatId) => ipcRenderer.invoke('chats:delete', chatId),
    clear: () => ipcRenderer.invoke('chats:clear'),
    onSnapshotChange: (listener) => subscribe(CHATS_SNAPSHOT_CHANNEL, listener)
  },
  models: {
    getStatus: (): Promise<ModelsSnapshot> => ipcRenderer.invoke('models:get-status'),
    download: (modelId: string): Promise<ModelsSnapshot> =>
      ipcRenderer.invoke('models:download', modelId),
    cancel: (modelId: string): Promise<ModelsSnapshot> =>
      ipcRenderer.invoke('models:cancel', modelId),
    remove: (modelId: string): Promise<ModelsSnapshot> =>
      ipcRenderer.invoke('models:remove', modelId),
    setActive: (modelId: string): Promise<ModelsSnapshot> =>
      ipcRenderer.invoke('models:set-active', modelId),
    openCard: (url: string): Promise<void> => ipcRenderer.invoke('models:open-card', url),
    openFolder: (): Promise<void> => ipcRenderer.invoke('models:open-folder'),
    onStatusChange: (listener: (snapshot: ModelsSnapshot) => void): (() => void) =>
      subscribe(MODELS_STATUS_CHANNEL, listener)
  },
  agent: {
    getStatus: (): Promise<AgentStatus> => ipcRenderer.invoke('agent:get-status'),
    send: (text: string): Promise<void> => ipcRenderer.invoke('agent:send', text),
    abort: (): Promise<AgentStatus> => ipcRenderer.invoke('agent:abort'),
    reset: (): Promise<AgentStatus> => ipcRenderer.invoke('agent:reset'),
    onStatusChange: (listener: (status: AgentStatus) => void): (() => void) =>
      subscribe(AGENT_STATUS_CHANNEL, listener),
    onDelta: (listener: (delta: AgentDelta) => void): (() => void) =>
      subscribe(AGENT_DELTA_CHANNEL, listener)
  },
  settings: {
    getSnapshot: (): Promise<SettingsSnapshot> => ipcRenderer.invoke('settings:get-snapshot'),
    setSystemToolsEnabled: (enabled: boolean): Promise<SettingsSnapshot> =>
      ipcRenderer.invoke('settings:set-system-tools', enabled),
    setToolApproval: (toolId, mode): Promise<SettingsSnapshot> =>
      ipcRenderer.invoke('settings:set-tool-approval', toolId, mode),
    setToolApprovalPreset: (preset): Promise<SettingsSnapshot> =>
      ipcRenderer.invoke('settings:set-tool-approval-preset', preset),
    setFlyoverInputMode: (mode): Promise<SettingsSnapshot> =>
      ipcRenderer.invoke('settings:set-flyover-input-mode', mode),
    setScreenAccessEnabled: (enabled: boolean): Promise<SettingsSnapshot> =>
      ipcRenderer.invoke('settings:set-screen-access', enabled),
    getScreenAccessStatus: () => ipcRenderer.invoke('settings:get-screen-access-status'),
    openScreenAccessSettings: (): Promise<void> =>
      ipcRenderer.invoke('settings:open-screen-access-settings'),
    setChatHistoryEnabled: (enabled: boolean): Promise<SettingsSnapshot> =>
      ipcRenderer.invoke('settings:set-chat-history', enabled),
    setShortcut: (kind, accelerator): Promise<SettingsSnapshot> =>
      ipcRenderer.invoke('settings:set-shortcut', kind, accelerator),
    setDictationAiCleanup: (enabled): Promise<SettingsSnapshot> =>
      ipcRenderer.invoke('settings:set-dictation-cleanup', enabled),
    setDictationAutoPaste: (enabled): Promise<SettingsSnapshot> =>
      ipcRenderer.invoke('settings:set-dictation-auto-paste', enabled),
    setLaunchAtLogin: (enabled): Promise<SettingsSnapshot> =>
      ipcRenderer.invoke('settings:set-launch-at-login', enabled),
    setVisionModel: (modelId): Promise<SettingsSnapshot> =>
      ipcRenderer.invoke('settings:set-vision-model', modelId),
    setTheme: (theme): Promise<SettingsSnapshot> => ipcRenderer.invoke('settings:set-theme', theme),
    setFontFamily: (fontFamily): Promise<SettingsSnapshot> =>
      ipcRenderer.invoke('settings:set-font-family', fontFamily),
    setAudioDevice: (kind, deviceId): Promise<SettingsSnapshot> =>
      ipcRenderer.invoke('settings:set-audio-device', kind, deviceId),
    onSnapshotChange: (listener: (snapshot: SettingsSnapshot) => void): (() => void) =>
      subscribe(SETTINGS_SNAPSHOT_CHANNEL, listener)
  },
  webSearch: {
    getSnapshot: (): Promise<WebSearchSnapshot> => ipcRenderer.invoke('web-search:get-snapshot'),
    setProviderEnabled: (
      providerId: WebSearchProviderId,
      enabled: boolean
    ): Promise<WebSearchSnapshot> =>
      ipcRenderer.invoke('web-search:set-provider-enabled', providerId, enabled),
    setApiKey: (providerId: WebSearchApiProviderId, apiKey: string): Promise<WebSearchSnapshot> =>
      ipcRenderer.invoke('web-search:set-api-key', providerId, apiKey),
    clearApiKey: (providerId: WebSearchApiProviderId): Promise<WebSearchSnapshot> =>
      ipcRenderer.invoke('web-search:clear-api-key', providerId),
    openKeys: (providerId: WebSearchApiProviderId): Promise<void> =>
      ipcRenderer.invoke('web-search:open-keys', providerId),
    onSnapshotChange: (listener: (snapshot: WebSearchSnapshot) => void): (() => void) =>
      subscribe(WEB_SEARCH_SNAPSHOT_CHANNEL, listener)
  },
  skills: {
    getSnapshot: (): Promise<SkillsSnapshot> => ipcRenderer.invoke('skills:get-snapshot'),
    refresh: (): Promise<SkillsSnapshot> => ipcRenderer.invoke('skills:refresh'),
    setEnabled: (enabled: boolean): Promise<SkillsSnapshot> =>
      ipcRenderer.invoke('skills:set-enabled', enabled),
    setSkillEnabled: (id: string, enabled: boolean): Promise<SkillsSnapshot> =>
      ipcRenderer.invoke('skills:set-skill-enabled', id, enabled),
    openCatalog: (): Promise<void> => ipcRenderer.invoke('skills:open-catalog'),
    onSnapshotChange: (listener: (snapshot: SkillsSnapshot) => void): (() => void) =>
      subscribe(SKILLS_SNAPSHOT_CHANNEL, listener)
  },
  tasks: {
    getSnapshot: (): Promise<TasksSnapshot> => ipcRenderer.invoke('tasks:get-snapshot'),
    update: (id, patch): Promise<TasksSnapshot> => ipcRenderer.invoke('tasks:update', id, patch),
    delete: (id): Promise<TasksSnapshot> => ipcRenderer.invoke('tasks:delete', id),
    onSnapshotChange: (listener: (snapshot: TasksSnapshot) => void): (() => void) =>
      subscribe(TASKS_SNAPSHOT_CHANNEL, listener),
    onOpenRun: (listener: (runId: string) => void): (() => void) =>
      subscribe(TASKS_OPEN_RUN_CHANNEL, listener)
  },
  app: {
    platform:
      process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux',
    isDevelopment: Boolean(process.defaultApp || process.env.ELECTRON_RENDERER_URL),
    setWindowMode: (mode): Promise<void> => ipcRenderer.invoke('app:set-window-mode', mode),
    saveText: (input: SaveTextInput): Promise<SaveTextResult> =>
      ipcRenderer.invoke('app:save-text', input),
    copyText: (text: string): Promise<CopyTextResult> => ipcRenderer.invoke('app:copy-text', text),
    onOpenSettings: (listener): (() => void) => subscribe('app:open-settings', listener),
    onEarcon: (listener: (kind: EarconKind) => void): (() => void) =>
      subscribe(EARCON_CHANNEL, listener)
  },
  updates: {
    getSnapshot: (): Promise<AppUpdateSnapshot> => ipcRenderer.invoke('app-update:get-snapshot'),
    check: (): Promise<AppUpdateSnapshot> => ipcRenderer.invoke('app-update:check'),
    openDownload: (): Promise<void> => ipcRenderer.invoke('app-update:open-download'),
    openReleases: (): Promise<void> => ipcRenderer.invoke('app-update:open-releases'),
    onSnapshotChange: (listener: (snapshot: AppUpdateSnapshot) => void): (() => void) =>
      subscribe(APP_UPDATE_SNAPSHOT_CHANNEL, listener)
  },
  llm: {
    getSnapshot: (): Promise<LlmSnapshot> => ipcRenderer.invoke('llm:get-snapshot'),
    setProvider: (providerId: LlmProviderId): Promise<LlmSnapshot> =>
      ipcRenderer.invoke('llm:set-provider', providerId),
    setBaseUrl: (providerId: OpenAiCompatibleProviderId, baseUrl: string): Promise<LlmSnapshot> =>
      ipcRenderer.invoke('llm:set-base-url', providerId, baseUrl),
    setModel: (modelId: string): Promise<LlmSnapshot> =>
      ipcRenderer.invoke('llm:set-model', modelId),
    setTemperature: (temperature: number): Promise<LlmSnapshot> =>
      ipcRenderer.invoke('llm:set-temperature', temperature),
    setReasoningEffort: (effort: LlmReasoningEffort): Promise<LlmSnapshot> =>
      ipcRenderer.invoke('llm:set-reasoning-effort', effort),
    addCustomModel: (modelId: string): Promise<LlmSnapshot> =>
      ipcRenderer.invoke('llm:add-custom-model', modelId),
    removeCustomModel: (modelId: string): Promise<LlmSnapshot> =>
      ipcRenderer.invoke('llm:remove-custom-model', modelId),
    setApiKey: (providerId: LlmProviderId, apiKey: string): Promise<LlmSnapshot> =>
      ipcRenderer.invoke('llm:set-api-key', providerId, apiKey),
    clearApiKey: (providerId: LlmProviderId): Promise<LlmSnapshot> =>
      ipcRenderer.invoke('llm:clear-api-key', providerId),
    refreshModels: (): Promise<LlmSnapshot> => ipcRenderer.invoke('llm:refresh-models'),
    openKeys: (): Promise<void> => ipcRenderer.invoke('llm:open-keys'),
    onSnapshotChange: (listener: (snapshot: LlmSnapshot) => void): (() => void) =>
      subscribe(LLM_SNAPSHOT_CHANNEL, listener)
  },
  soul: {
    getSnapshot: (): Promise<SoulSnapshot> => ipcRenderer.invoke('soul:get-snapshot'),
    readFile: (id: SoulFileId): Promise<string> => ipcRenderer.invoke('soul:read-file', id),
    writeFile: (id: SoulFileId, content: string): Promise<SoulSnapshot> =>
      ipcRenderer.invoke('soul:write-file', id, content),
    completeOnboarding: (draft: UserProfileDraft): Promise<SoulSnapshot> =>
      ipcRenderer.invoke('soul:complete-onboarding', draft),
    dismissOnboarding: (): Promise<SoulSnapshot> => ipcRenderer.invoke('soul:dismiss-onboarding'),
    restartOnboarding: (): Promise<SoulSnapshot> => ipcRenderer.invoke('soul:restart-onboarding'),
    onSnapshotChange: (listener: (snapshot: SoulSnapshot) => void): (() => void) =>
      subscribe(SOUL_SNAPSHOT_CHANNEL, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
