import { DEFAULT_ENDPOINT_SETTINGS, type EndpointSettings } from './asr'
import { DEFAULT_LLM_SETTINGS, type LlmSettings } from './llm'
import { DEFAULT_TTS_SETTINGS, type TtsSettings } from './tts'
import { DEFAULT_WEB_SEARCH_SETTINGS, type WebSearchSettings } from './web-search'

export const SETTINGS_SNAPSHOT_CHANNEL = 'settings:snapshot'
export const APPEARANCE_SNAPSHOT_CHANNEL = 'appearance:snapshot'

export const DEFAULT_ASSISTANT_SHORTCUT = 'CommandOrControl+Shift+Space'
export const DEFAULT_NEW_CHAT_SHORTCUT = 'CommandOrControl+Alt+Shift+Space'
export const DEFAULT_DICTATION_SHORTCUT = 'CommandOrControl+Shift+D'
export const DEFAULT_WAKE_WORD_SHORTCUT = 'CommandOrControl+Shift+M'
export const DEFAULT_VISION_MODEL_ID = 'google/gemini-2.5-flash'
export const DEFAULT_THEME = 'dark'
export const DEFAULT_FONT_FAMILY = 'Vazirmatn'
export const DEFAULT_AUDIO_DEVICE_ID = 'default'
export const DEFAULT_FLYOVER_INPUT_MODE = 'both'

export const SYSTEM_TOOL_IDS = [
  'fetch_webpage',
  'read_file',
  'write_file',
  'list_directory',
  'search_files',
  'search_in_files',
  'open_app',
  'run_command'
] as const

export type SystemToolId = (typeof SYSTEM_TOOL_IDS)[number]
export type ToolApprovalMode = 'auto' | 'smart' | 'confirm' | 'blocked'
export type ToolApprovalPreset = 'strict' | 'balanced' | 'yolo'
export type ToolApprovalSettings = Record<SystemToolId, ToolApprovalMode>

export const TOOL_APPROVAL_PRESETS: Record<ToolApprovalPreset, ToolApprovalSettings> = {
  strict: {
    fetch_webpage: 'confirm',
    read_file: 'confirm',
    write_file: 'confirm',
    list_directory: 'confirm',
    search_files: 'confirm',
    search_in_files: 'confirm',
    open_app: 'confirm',
    run_command: 'confirm'
  },
  balanced: {
    fetch_webpage: 'auto',
    read_file: 'auto',
    write_file: 'smart',
    list_directory: 'auto',
    search_files: 'auto',
    search_in_files: 'auto',
    open_app: 'auto',
    run_command: 'smart'
  },
  yolo: {
    fetch_webpage: 'auto',
    read_file: 'auto',
    write_file: 'auto',
    list_directory: 'auto',
    search_files: 'auto',
    search_in_files: 'auto',
    open_app: 'auto',
    run_command: 'auto'
  }
}

export const DEFAULT_TOOL_APPROVALS: ToolApprovalSettings = {
  ...TOOL_APPROVAL_PRESETS.balanced
}

export function detectToolApprovalPreset(
  settings: ToolApprovalSettings
): ToolApprovalPreset | 'custom' {
  for (const preset of ['strict', 'balanced', 'yolo'] as const) {
    if (
      SYSTEM_TOOL_IDS.every((toolId) => settings[toolId] === TOOL_APPROVAL_PRESETS[preset][toolId])
    ) {
      return preset
    }
  }
  return 'custom'
}

export function isSystemToolId(value: unknown): value is SystemToolId {
  return typeof value === 'string' && SYSTEM_TOOL_IDS.includes(value as SystemToolId)
}

export function isToolApprovalMode(value: unknown): value is ToolApprovalMode {
  return value === 'auto' || value === 'smart' || value === 'confirm' || value === 'blocked'
}

export function isToolApprovalPreset(value: unknown): value is ToolApprovalPreset {
  return value === 'strict' || value === 'balanced' || value === 'yolo'
}

export type AppTheme = 'light' | 'dark'
export type FlyoverInputMode = 'voice' | 'typing' | 'both'

export function isFlyoverInputMode(value: unknown): value is FlyoverInputMode {
  return value === 'voice' || value === 'typing' || value === 'both'
}

export type ScreenAccessStatus =
  'granted' | 'denied' | 'restricted' | 'not-determined' | 'unknown' | 'not-required'

export type AppSettings = {
  activeModelId: string
  wakeWordEnabled: boolean
  endpoint: EndpointSettings
  llm: LlmSettings
  tts: TtsSettings
  webSearch: WebSearchSettings
  onboardingCompleted: boolean
  systemToolsEnabled: boolean
  toolApprovals: ToolApprovalSettings
  screenAccessEnabled: boolean
  assistantShortcut: string
  newChatShortcut: string
  dictationShortcut: string
  wakeWordShortcut: string
  flyoverInputMode: FlyoverInputMode
  dictationAiCleanup: boolean
  dictationAutoPaste: boolean
  launchAtLogin: boolean
  visionModelId: string
  screenDisclosureAccepted: boolean
  chatHistoryEnabled: boolean
  skillsEnabled: boolean
  disabledSkillIds: string[]
  theme: AppTheme
  fontFamily: string
  inputDeviceId: string
  outputDeviceId: string
}

export type SettingsSnapshot = {
  wakeWordEnabled: boolean
  systemToolsEnabled: boolean
  toolApprovals: ToolApprovalSettings
  screenAccessEnabled: boolean
  assistantShortcut: string
  newChatShortcut: string
  dictationShortcut: string
  wakeWordShortcut: string
  flyoverInputMode: FlyoverInputMode
  dictationAiCleanup: boolean
  dictationAutoPaste: boolean
  launchAtLogin: boolean
  visionModelId: string
  screenDisclosureAccepted: boolean
  chatHistoryEnabled: boolean
  theme: AppTheme
  fontFamily: string
  inputDeviceId: string
  outputDeviceId: string
  shortcutError: string | null
}

export type AppearanceSnapshot = Pick<SettingsSnapshot, 'theme' | 'fontFamily'>

export function toSettingsSnapshot(
  settings: AppSettings,
  shortcutError: string | null = null
): SettingsSnapshot {
  return {
    wakeWordEnabled: settings.wakeWordEnabled !== false,
    systemToolsEnabled: settings.systemToolsEnabled !== false,
    toolApprovals: { ...settings.toolApprovals },
    screenAccessEnabled: settings.screenAccessEnabled !== false,
    assistantShortcut: settings.assistantShortcut,
    newChatShortcut: settings.newChatShortcut,
    dictationShortcut: settings.dictationShortcut,
    wakeWordShortcut: settings.wakeWordShortcut,
    flyoverInputMode: settings.flyoverInputMode,
    dictationAiCleanup: settings.dictationAiCleanup,
    dictationAutoPaste: settings.dictationAutoPaste,
    launchAtLogin: settings.launchAtLogin,
    visionModelId: settings.visionModelId,
    screenDisclosureAccepted: settings.screenDisclosureAccepted,
    chatHistoryEnabled: settings.chatHistoryEnabled !== false,
    theme: settings.theme,
    fontFamily: settings.fontFamily,
    inputDeviceId: settings.inputDeviceId,
    outputDeviceId: settings.outputDeviceId,
    shortcutError
  }
}

export function toAppearanceSnapshot(settings: AppSettings): AppearanceSnapshot {
  return { theme: settings.theme, fontFamily: settings.fontFamily }
}

export type AppSettingsPatch = Partial<
  Omit<AppSettings, 'endpoint' | 'llm' | 'tts' | 'webSearch'>
> & {
  endpoint?: Partial<EndpointSettings>
  llm?: Partial<LlmSettings>
  tts?: Partial<TtsSettings>
  webSearch?: Partial<WebSearchSettings>
}

export {
  DEFAULT_ENDPOINT_SETTINGS,
  DEFAULT_LLM_SETTINGS,
  DEFAULT_TTS_SETTINGS,
  DEFAULT_WEB_SEARCH_SETTINGS
}
