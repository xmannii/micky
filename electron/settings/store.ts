import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { ASR_RULE3_UTTERANCE_LIMIT_SECONDS, DEFAULT_ENDPOINT_SETTINGS } from '@/lib/asr'
import { DEFAULT_ASR_MODEL_ID, getAsrModel } from '@/lib/asr-models'
import {
  CURATED_LLM_MODELS,
  DEFAULT_LLM_BASE_URLS,
  DEFAULT_LLM_MODEL_ID,
  DEFAULT_LLM_PROVIDER_MODEL_IDS,
  DEFAULT_LLM_PROVIDER_ID,
  DEFAULT_LLM_REASONING_EFFORT,
  DEFAULT_LLM_SETTINGS,
  DEFAULT_LLM_TEMPERATURE,
  isLlmProviderId,
  isLlmReasoningEffort,
  type LlmSettings
} from '@/lib/llm'
import {
  DEFAULT_ASSISTANT_SHORTCUT,
  DEFAULT_NEW_CHAT_SHORTCUT,
  DEFAULT_DICTATION_SHORTCUT,
  DEFAULT_AUDIO_DEVICE_ID,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FLYOVER_INPUT_MODE,
  DEFAULT_TOOL_APPROVALS,
  DEFAULT_THEME,
  DEFAULT_WAKE_WORD_SHORTCUT,
  DEFAULT_VISION_MODEL_ID,
  COMPANION_TOOL_IDS,
  SYSTEM_TOOL_IDS,
  isToolApprovalMode,
  isFlyoverInputMode,
  type AppSettings,
  type AppSettingsPatch,
  type ToolApprovalSettings
} from '@/lib/settings'
import {
  DEFAULT_TTS_SETTINGS,
  GEMINI_TTS_VOICES,
  type TtsProviderId,
  type TtsSettings
} from '@/lib/tts'
import {
  DEFAULT_WEB_SEARCH_SETTINGS,
  isWebSearchProviderId,
  type WebSearchSettings
} from '@/lib/web-search'

const SETTINGS_FILE_NAME = 'settings.json'
const CURATED_MODEL_IDS = new Set(CURATED_LLM_MODELS.map((model) => model.id))

export const DEFAULT_APP_SETTINGS: AppSettings = {
  activeModelId: DEFAULT_ASR_MODEL_ID,
  wakeWordEnabled: true,
  endpoint: { ...DEFAULT_ENDPOINT_SETTINGS },
  llm: {
    ...DEFAULT_LLM_SETTINGS,
    customModelIds: []
  },
  tts: { ...DEFAULT_TTS_SETTINGS },
  webSearch: { ...DEFAULT_WEB_SEARCH_SETTINGS, enabledProviders: [] },
  onboardingCompleted: false,
  systemToolsEnabled: true,
  toolApprovals: { ...DEFAULT_TOOL_APPROVALS },
  screenAccessEnabled: true,
  assistantShortcut: DEFAULT_ASSISTANT_SHORTCUT,
  newChatShortcut: DEFAULT_NEW_CHAT_SHORTCUT,
  dictationShortcut: DEFAULT_DICTATION_SHORTCUT,
  wakeWordShortcut: DEFAULT_WAKE_WORD_SHORTCUT,
  flyoverInputMode: DEFAULT_FLYOVER_INPUT_MODE,
  dictationAiCleanup: true,
  dictationAutoPaste: true,
  launchAtLogin: false,
  visionModelId: DEFAULT_VISION_MODEL_ID,
  screenDisclosureAccepted: false,
  chatHistoryEnabled: true,
  skillsEnabled: true,
  disabledSkillIds: [],
  theme: DEFAULT_THEME,
  fontFamily: DEFAULT_FONT_FAMILY,
  inputDeviceId: DEFAULT_AUDIO_DEVICE_ID,
  outputDeviceId: DEFAULT_AUDIO_DEVICE_ID
}

export class SettingsStore {
  #path: string
  #settings: AppSettings = cloneSettings(DEFAULT_APP_SETTINGS)
  #persistQueue: Promise<void> = Promise.resolve()

  constructor(userDataPath: string) {
    this.#path = join(userDataPath, SETTINGS_FILE_NAME)
  }

  async load(): Promise<AppSettings> {
    try {
      const raw = await readFile(this.#path, 'utf8')
      this.#settings = normalizeSettings(JSON.parse(raw) as unknown)
    } catch {
      this.#settings = cloneSettings(DEFAULT_APP_SETTINGS)
    }
    return this.get()
  }

  get(): AppSettings {
    return cloneSettings(this.#settings)
  }

  async update(patch: AppSettingsPatch): Promise<AppSettings> {
    this.#settings = normalizeSettings({
      ...this.#settings,
      ...patch,
      endpoint: { ...this.#settings.endpoint, ...patch.endpoint },
      llm: { ...this.#settings.llm, ...patch.llm },
      tts: { ...this.#settings.tts, ...patch.tts },
      webSearch: { ...this.#settings.webSearch, ...patch.webSearch }
    })
    const snapshot = cloneSettings(this.#settings)
    const persist = this.#persistQueue.then(() => this.#persist(snapshot))
    this.#persistQueue = persist.catch(() => undefined)
    await persist
    return this.get()
  }

  async #persist(settings: AppSettings): Promise<void> {
    await mkdir(dirname(this.#path), { recursive: true })
    const tempPath = `${this.#path}.tmp`
    await writeFile(tempPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
    await rename(tempPath, this.#path)
  }
}

function cloneSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    endpoint: { ...settings.endpoint },
    llm: {
      ...settings.llm,
      providerModelIds: { ...settings.llm.providerModelIds },
      baseUrls: { ...settings.llm.baseUrls },
      customModelIds: [...settings.llm.customModelIds]
    },
    tts: { ...settings.tts },
    webSearch: {
      ...settings.webSearch,
      enabledProviders: [...settings.webSearch.enabledProviders]
    },
    systemToolsEnabled: settings.systemToolsEnabled !== false,
    toolApprovals: { ...settings.toolApprovals },
    screenAccessEnabled: settings.screenAccessEnabled !== false,
    disabledSkillIds: [...settings.disabledSkillIds]
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeLlmSettings(value: unknown): LlmSettings {
  const record = isRecord(value) ? value : {}
  const providerId = isLlmProviderId(record.providerId)
    ? record.providerId
    : DEFAULT_LLM_PROVIDER_ID
  const legacyModelId =
    typeof record.modelId === 'string' && record.modelId.trim()
      ? record.modelId.trim()
      : DEFAULT_LLM_MODEL_ID
  const providerModelRecord = isRecord(record.providerModelIds) ? record.providerModelIds : {}
  const providerModelIds = {
    openrouter: readOptionalString(
      providerModelRecord.openrouter,
      providerId === 'openrouter' ? legacyModelId : DEFAULT_LLM_PROVIDER_MODEL_IDS.openrouter,
      160
    ),
    custom: readOptionalString(
      providerModelRecord.custom,
      providerId === 'custom' ? legacyModelId : DEFAULT_LLM_PROVIDER_MODEL_IDS.custom,
      160
    ),
    ollama: readOptionalString(
      providerModelRecord.ollama,
      providerId === 'ollama' ? legacyModelId : DEFAULT_LLM_PROVIDER_MODEL_IDS.ollama,
      160
    ),
    lmstudio: readOptionalString(
      providerModelRecord.lmstudio,
      providerId === 'lmstudio' ? legacyModelId : DEFAULT_LLM_PROVIDER_MODEL_IDS.lmstudio,
      160
    )
  }
  const baseUrlRecord = isRecord(record.baseUrls) ? record.baseUrls : {}
  const baseUrls = {
    custom: readString(baseUrlRecord.custom, DEFAULT_LLM_BASE_URLS.custom, 2_048),
    ollama: readString(baseUrlRecord.ollama, DEFAULT_LLM_BASE_URLS.ollama, 2_048),
    lmstudio: readString(baseUrlRecord.lmstudio, DEFAULT_LLM_BASE_URLS.lmstudio, 2_048)
  }
  const customModelIds = Array.isArray(record.customModelIds)
    ? [
        ...new Set(
          record.customModelIds.filter(
            (id): id is string =>
              typeof id === 'string' && id.trim().length > 0 && !CURATED_MODEL_IDS.has(id.trim())
          )
        )
      ]
    : []
  const temperature = Math.min(
    2,
    Math.max(0, readNumber(record.temperature, DEFAULT_LLM_TEMPERATURE))
  )
  const reasoningEffort = isLlmReasoningEffort(record.reasoningEffort)
    ? record.reasoningEffort
    : DEFAULT_LLM_REASONING_EFFORT

  return {
    providerId,
    modelId: providerModelIds[providerId],
    providerModelIds,
    baseUrls,
    customModelIds,
    temperature,
    reasoningEffort
  }
}

function normalizeTtsSettings(value: unknown): TtsSettings {
  const record = isRecord(value) ? value : {}
  const providerId: TtsProviderId =
    record.providerId === 'elevenlabs' || record.providerId === 'gemini'
      ? record.providerId
      : DEFAULT_TTS_SETTINGS.providerId
  const geminiVoice =
    typeof record.geminiVoice === 'string' &&
    GEMINI_TTS_VOICES.some((voice) => voice.id === record.geminiVoice)
      ? record.geminiVoice
      : DEFAULT_TTS_SETTINGS.geminiVoice
  const elevenLabsVoiceId =
    typeof record.elevenLabsVoiceId === 'string'
      ? record.elevenLabsVoiceId.trim().slice(0, 128)
      : DEFAULT_TTS_SETTINGS.elevenLabsVoiceId
  return {
    enabled: record.enabled === true,
    providerId,
    geminiVoice,
    elevenLabsVoiceId
  }
}

function normalizeWebSearchSettings(value: unknown): WebSearchSettings {
  const record = isRecord(value) ? value : {}
  const enabledProviders = Array.isArray(record.enabledProviders)
    ? [...new Set(record.enabledProviders.filter(isWebSearchProviderId))]
    : []
  return { enabledProviders }
}

function normalizeSettings(value: unknown): AppSettings {
  const record = isRecord(value) ? value : {}
  const endpointRecord = isRecord(record.endpoint) ? record.endpoint : {}
  const activeModelId =
    typeof record.activeModelId === 'string' && getAsrModel(record.activeModelId)
      ? record.activeModelId
      : DEFAULT_ASR_MODEL_ID

  return {
    activeModelId,
    wakeWordEnabled: record.wakeWordEnabled !== false,
    onboardingCompleted: record.onboardingCompleted === true,
    systemToolsEnabled: record.systemToolsEnabled !== false,
    toolApprovals: normalizeToolApprovals(record.toolApprovals),
    screenAccessEnabled: record.screenAccessEnabled !== false,
    assistantShortcut: readShortcut(record.assistantShortcut, DEFAULT_ASSISTANT_SHORTCUT),
    newChatShortcut: readShortcut(record.newChatShortcut, DEFAULT_NEW_CHAT_SHORTCUT),
    dictationShortcut: readShortcut(record.dictationShortcut, DEFAULT_DICTATION_SHORTCUT),
    wakeWordShortcut: readShortcut(record.wakeWordShortcut, DEFAULT_WAKE_WORD_SHORTCUT),
    flyoverInputMode: isFlyoverInputMode(record.flyoverInputMode)
      ? record.flyoverInputMode
      : DEFAULT_FLYOVER_INPUT_MODE,
    dictationAiCleanup: record.dictationAiCleanup !== false,
    dictationAutoPaste: record.dictationAutoPaste !== false,
    launchAtLogin: record.launchAtLogin === true,
    visionModelId: readString(record.visionModelId, DEFAULT_VISION_MODEL_ID, 160),
    screenDisclosureAccepted: record.screenDisclosureAccepted === true,
    chatHistoryEnabled: record.chatHistoryEnabled !== false,
    skillsEnabled: record.skillsEnabled !== false,
    disabledSkillIds: readStringArray(record.disabledSkillIds, 200, 80),
    theme: record.theme === 'light' ? 'light' : DEFAULT_THEME,
    fontFamily: readFontFamily(record.fontFamily),
    inputDeviceId: readAudioDeviceId(record.inputDeviceId),
    outputDeviceId: readAudioDeviceId(record.outputDeviceId),
    endpoint: {
      rule1MinTrailingSilence: readNumber(
        endpointRecord.rule1MinTrailingSilence,
        DEFAULT_ENDPOINT_SETTINGS.rule1MinTrailingSilence
      ),
      rule2MinTrailingSilence: readNumber(
        endpointRecord.rule2MinTrailingSilence,
        DEFAULT_ENDPOINT_SETTINGS.rule2MinTrailingSilence
      ),
      rule3MinUtteranceLength: Math.max(
        ASR_RULE3_UTTERANCE_LIMIT_SECONDS,
        readNumber(
          endpointRecord.rule3MinUtteranceLength,
          DEFAULT_ENDPOINT_SETTINGS.rule3MinUtteranceLength
        )
      )
    },
    llm: normalizeLlmSettings(record.llm),
    tts: normalizeTtsSettings(record.tts),
    webSearch: normalizeWebSearchSettings(record.webSearch)
  }
}

function normalizeToolApprovals(value: unknown): ToolApprovalSettings {
  const record = isRecord(value) ? value : {}
  const ids = [...SYSTEM_TOOL_IDS, ...COMPANION_TOOL_IDS]
  return Object.fromEntries(
    ids.map((toolId) => [
      toolId,
      isToolApprovalMode(record[toolId]) ? record[toolId] : DEFAULT_TOOL_APPROVALS[toolId]
    ])
  ) as ToolApprovalSettings
}

function readString(value: unknown, fallback: string, max: number): string {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback
}

function readOptionalString(value: unknown, fallback: string, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : fallback
}

function readShortcut(value: unknown, fallback: string): string {
  const shortcut = readString(value, fallback, 80)
  return shortcut.includes('+') ? shortcut : fallback
}

function readFontFamily(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_FONT_FAMILY
  const fontFamily = value.trim().slice(0, 120)
  return fontFamily && !/[\u0000-\u001f\u007f;{}]/.test(fontFamily)
    ? fontFamily
    : DEFAULT_FONT_FAMILY
}

function readAudioDeviceId(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_AUDIO_DEVICE_ID
  const deviceId = value.trim().slice(0, 512)
  return deviceId && !/[\u0000-\u001f\u007f]/.test(deviceId) ? deviceId : DEFAULT_AUDIO_DEVICE_ID
}

function readStringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return []
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim().slice(0, maxLength))
    )
  ].slice(0, maxItems)
}
