import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { ASR_RULE3_UTTERANCE_LIMIT_SECONDS } from '@/lib/asr'
import { DEFAULT_ASR_MODEL_ID } from '@/lib/asr-models'
import {
  DEFAULT_LLM_BASE_URLS,
  DEFAULT_LLM_MODEL_ID,
  DEFAULT_LLM_REASONING_EFFORT,
  DEFAULT_LLM_TEMPERATURE
} from '@/lib/llm'
import { DEFAULT_TTS_SETTINGS } from '@/lib/tts'
import { DEFAULT_WEB_SEARCH_SETTINGS } from '@/lib/web-search'
import { DEFAULT_APP_SETTINGS, SettingsStore } from './store'
import {
  DEFAULT_ASSISTANT_SHORTCUT,
  DEFAULT_AUDIO_DEVICE_ID,
  DEFAULT_DICTATION_SHORTCUT,
  DEFAULT_FLYOVER_INPUT_MODE,
  DEFAULT_FONT_FAMILY,
  DEFAULT_THEME,
  DEFAULT_NEW_CHAT_SHORTCUT,
  DEFAULT_TOOL_APPROVALS,
  DEFAULT_WAKE_WORD_SHORTCUT,
  DEFAULT_VISION_MODEL_ID
} from '@/lib/settings'

test('loads defaults when no settings file exists', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'micky-settings-'))
  const store = new SettingsStore(dir)
  const settings = await store.load()
  assert.equal(settings.activeModelId, DEFAULT_ASR_MODEL_ID)
  assert.equal(settings.wakeWordEnabled, true)
  assert.equal(settings.onboardingCompleted, false)
  assert.equal(settings.systemToolsEnabled, true)
  assert.deepEqual(settings.toolApprovals, DEFAULT_TOOL_APPROVALS)
  assert.equal(settings.screenAccessEnabled, true)
  assert.equal(settings.llm.modelId, DEFAULT_LLM_MODEL_ID)
  assert.equal(settings.llm.providerModelIds.openrouter, DEFAULT_LLM_MODEL_ID)
  assert.deepEqual(settings.llm.baseUrls, DEFAULT_LLM_BASE_URLS)
  assert.deepEqual(settings.llm.customModelIds, [])
  assert.equal(settings.llm.temperature, DEFAULT_LLM_TEMPERATURE)
  assert.equal(settings.llm.reasoningEffort, DEFAULT_LLM_REASONING_EFFORT)
  assert.deepEqual(settings.tts, DEFAULT_TTS_SETTINGS)
  assert.deepEqual(settings.webSearch, DEFAULT_WEB_SEARCH_SETTINGS)
  assert.equal(settings.assistantShortcut, DEFAULT_ASSISTANT_SHORTCUT)
  assert.equal(settings.newChatShortcut, DEFAULT_NEW_CHAT_SHORTCUT)
  assert.equal(settings.dictationShortcut, DEFAULT_DICTATION_SHORTCUT)
  assert.equal(settings.wakeWordShortcut, DEFAULT_WAKE_WORD_SHORTCUT)
  assert.equal(settings.flyoverInputMode, DEFAULT_FLYOVER_INPUT_MODE)
  assert.equal(settings.dictationAiCleanup, true)
  assert.equal(settings.dictationAutoPaste, true)
  assert.equal(settings.launchAtLogin, false)
  assert.equal(settings.visionModelId, DEFAULT_VISION_MODEL_ID)
  assert.equal(settings.screenDisclosureAccepted, false)
  assert.equal(settings.chatHistoryEnabled, true)
  assert.equal(settings.skillsEnabled, true)
  assert.deepEqual(settings.disabledSkillIds, [])
  assert.equal(settings.theme, DEFAULT_THEME)
  assert.equal(settings.fontFamily, DEFAULT_FONT_FAMILY)
  assert.equal(settings.inputDeviceId, DEFAULT_AUDIO_DEVICE_ID)
  assert.equal(settings.outputDeviceId, DEFAULT_AUDIO_DEVICE_ID)
})

test('normalizes invalid persisted values on load', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'micky-settings-'))
  await writeFile(
    join(dir, 'settings.json'),
    JSON.stringify({
      activeModelId: 'not-a-model',
      wakeWordEnabled: 'yes',
      onboardingCompleted: 1,
      llm: {
        modelId: '  custom/model  ',
        customModelIds: ['', 'qwen/qwen3.7-flash', 'ok/model'],
        temperature: 8,
        reasoningEffort: 'extreme'
      },
      tts: { providerId: 'bad', geminiVoice: 'bad', elevenLabsVoiceId: 4 },
      webSearch: { enabledProviders: ['exa', 'bad', 'exa', 'google'] },
      toolApprovals: {
        read_file: 'confirm',
        write_file: 'anything',
        run_command: 'blocked'
      },
      flyoverInputMode: 'video'
    }),
    'utf8'
  )

  const store = new SettingsStore(dir)
  const settings = await store.load()
  assert.equal(settings.activeModelId, DEFAULT_APP_SETTINGS.activeModelId)
  assert.equal(settings.wakeWordEnabled, true)
  assert.equal(settings.onboardingCompleted, false)
  assert.equal(settings.llm.modelId, 'custom/model')
  assert.deepEqual(settings.llm.customModelIds, ['ok/model'])
  assert.equal(settings.llm.temperature, 2)
  assert.equal(settings.llm.reasoningEffort, DEFAULT_LLM_REASONING_EFFORT)
  assert.deepEqual(settings.tts, DEFAULT_TTS_SETTINGS)
  assert.deepEqual(settings.webSearch.enabledProviders, ['exa', 'google'])
  assert.equal(settings.toolApprovals.read_file, 'confirm')
  assert.equal(settings.toolApprovals.write_file, DEFAULT_TOOL_APPROVALS.write_file)
  assert.equal(settings.toolApprovals.run_command, 'blocked')
  assert.equal(settings.toolApprovals.open_app, DEFAULT_TOOL_APPROVALS.open_app)
  assert.equal(settings.flyoverInputMode, DEFAULT_FLYOVER_INPUT_MODE)
  assert.equal(settings.assistantShortcut, DEFAULT_ASSISTANT_SHORTCUT)
  assert.equal(settings.newChatShortcut, DEFAULT_NEW_CHAT_SHORTCUT)
  assert.equal(settings.wakeWordShortcut, DEFAULT_WAKE_WORD_SHORTCUT)
  assert.equal(settings.dictationAiCleanup, true)
  assert.equal(settings.chatHistoryEnabled, true)
  assert.equal(settings.skillsEnabled, true)
  assert.deepEqual(settings.disabledSkillIds, [])
  assert.equal(settings.theme, DEFAULT_THEME)
  assert.equal(settings.fontFamily, DEFAULT_FONT_FAMILY)
})

test('normalizes and persists appearance settings', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'micky-settings-'))
  const store = new SettingsStore(dir)
  await store.load()
  await store.update({ theme: 'light', fontFamily: '  Shabnam  ' })

  const settings = await store.load()
  assert.equal(settings.theme, 'light')
  assert.equal(settings.fontFamily, 'Shabnam')

  await writeFile(
    join(dir, 'settings.json'),
    JSON.stringify({ theme: 'system', fontFamily: 'bad;font' }),
    'utf8'
  )
  const normalized = await store.load()
  assert.equal(normalized.theme, DEFAULT_THEME)
  assert.equal(normalized.fontFamily, DEFAULT_FONT_FAMILY)
})

test('normalizes and persists audio device settings', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'micky-settings-'))
  const store = new SettingsStore(dir)
  await store.load()
  await store.update({ inputDeviceId: ' mic-1 ', outputDeviceId: 'speaker-1' })

  const settings = await store.load()
  assert.equal(settings.inputDeviceId, 'mic-1')
  assert.equal(settings.outputDeviceId, 'speaker-1')

  await writeFile(
    join(dir, 'settings.json'),
    JSON.stringify({ inputDeviceId: '', outputDeviceId: 4 }),
    'utf8'
  )
  const normalized = await store.load()
  assert.equal(normalized.inputDeviceId, DEFAULT_AUDIO_DEVICE_ID)
  assert.equal(normalized.outputDeviceId, DEFAULT_AUDIO_DEVICE_ID)
})

test('migrates the old twenty-second utterance endpoint', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'micky-settings-'))
  await writeFile(
    join(dir, 'settings.json'),
    JSON.stringify({ endpoint: { rule3MinUtteranceLength: 20 } }),
    'utf8'
  )

  const store = new SettingsStore(dir)
  const settings = await store.load()
  assert.equal(settings.endpoint.rule3MinUtteranceLength, ASR_RULE3_UTTERANCE_LIMIT_SECONDS)
})

test('normalizes and remembers separate compatible-provider settings', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'micky-settings-'))
  await writeFile(
    join(dir, 'settings.json'),
    JSON.stringify({
      llm: {
        providerId: 'ollama',
        modelId: 'legacy-model',
        providerModelIds: { openrouter: 'cloud/model', ollama: 'qwen3:8b' },
        baseUrls: { ollama: 'http://localhost:9999/v1' }
      }
    }),
    'utf8'
  )

  const store = new SettingsStore(dir)
  const settings = await store.load()
  assert.equal(settings.llm.providerId, 'ollama')
  assert.equal(settings.llm.modelId, 'qwen3:8b')
  assert.equal(settings.llm.providerModelIds.openrouter, 'cloud/model')
  assert.equal(settings.llm.baseUrls.ollama, 'http://localhost:9999/v1')
  assert.equal(settings.llm.baseUrls.lmstudio, DEFAULT_LLM_BASE_URLS.lmstudio)
})

test('persists a patch to disk', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'micky-settings-'))
  const store = new SettingsStore(dir)
  await store.load()
  await store.update({
    wakeWordEnabled: false,
    onboardingCompleted: true,
    flyoverInputMode: 'typing',
    tts: { providerId: 'elevenlabs', elevenLabsVoiceId: 'voice-1' }
  })
  const raw = JSON.parse(await readFile(join(dir, 'settings.json'), 'utf8')) as {
    wakeWordEnabled: boolean
    onboardingCompleted: boolean
    flyoverInputMode: string
    tts: { providerId: string; elevenLabsVoiceId: string }
  }
  assert.equal(raw.wakeWordEnabled, false)
  assert.equal(raw.onboardingCompleted, true)
  assert.equal(raw.flyoverInputMode, 'typing')
  assert.deepEqual(raw.tts, {
    ...DEFAULT_TTS_SETTINGS,
    providerId: 'elevenlabs',
    elevenLabsVoiceId: 'voice-1'
  })
})

test('serializes concurrent settings writes without losing the latest values', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'micky-settings-'))
  const store = new SettingsStore(dir)
  await store.load()

  await Promise.all([
    store.update({ theme: 'light' }),
    store.update({ wakeWordEnabled: false }),
    store.update({ outputDeviceId: 'speaker-1' })
  ])

  const persisted = JSON.parse(await readFile(join(dir, 'settings.json'), 'utf8')) as {
    theme: string
    wakeWordEnabled: boolean
    outputDeviceId: string
  }
  assert.equal(persisted.theme, 'light')
  assert.equal(persisted.wakeWordEnabled, false)
  assert.equal(persisted.outputDeviceId, 'speaker-1')
})

test('persists advanced LLM settings', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'micky-settings-'))
  const store = new SettingsStore(dir)
  await store.load()
  await store.update({ llm: { temperature: 0.3, reasoningEffort: 'none' } })

  const settings = await store.load()
  assert.equal(settings.llm.temperature, 0.3)
  assert.equal(settings.llm.reasoningEffort, 'none')
})

test('persists enabled web search providers with all providers off by default', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'micky-settings-'))
  const store = new SettingsStore(dir)
  await store.load()
  assert.deepEqual(store.get().webSearch.enabledProviders, [])

  await store.update({ webSearch: { enabledProviders: ['firecrawl', 'google'] } })
  const settings = await store.load()
  assert.deepEqual(settings.webSearch.enabledProviders, ['firecrawl', 'google'])
})
