import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSystemInstructions, buildSystemPrompt } from './prompt'

test('includes soul, user, memory, and a frozen clock', () => {
  const prompt = buildSystemPrompt({
    soul: 'Soul line.',
    user: 'User is Mani.',
    memory: 'Likes tea.',
    now: new Date('2026-08-19T18:00:00.000Z')
  })

  assert.match(prompt, /Soul line/)
  assert.match(prompt, /User is Mani/)
  assert.match(prompt, /Likes tea/)
  assert.match(prompt, /Local time:/)
  assert.match(prompt, /You are Micky/)
})

test('keeps the spoken-voice contract and skips empty user layers', () => {
  const prompt = buildSystemPrompt({
    soul: '',
    user: '   ',
    memory: '',
    now: new Date('2026-08-19T18:00:00.000Z')
  })

  assert.match(prompt, /markdown/)
  assert.match(prompt, /short sentences/)
  assert.match(prompt, /end_conversation/)
  assert.match(prompt, /run_command/)
  assert.match(prompt, /user's computer/)
  assert.match(prompt, /look_at_screen/)
  assert.match(prompt, /write_file/)
  assert.match(prompt, /fetch_webpage/)
  assert.match(prompt, /Search results are a discovery layer/)
  assert.match(prompt, /one or two strongest results/)
  assert.match(prompt, /Prefer official or primary sources/)
  assert.match(prompt, /edit_personal_context/)
  assert.match(prompt, /living context/)
  assert.match(prompt, /search_chats/)
  assert.match(prompt, /read_chat/)
  assert.match(prompt, /create_task/)
  assert.match(prompt, /kind run/)
  assert.match(prompt, /کارها/)
  assert.match(prompt, /launchd/)
  assert.match(prompt, /Never say it is unfinished/)
  assert.match(prompt, /Do not fetch or summarize in this turn/)
  assert.match(prompt, /attach_file/)
  assert.match(prompt, /Offer, do not nag/)
  assert.match(prompt, /Wait for a yes before create_task/)
  assert.match(prompt, /single offer to save a reminder/)
  assert.doesNotMatch(prompt, /get_current_datetime/)
  assert.doesNotMatch(prompt, /^User$/m)
  assert.doesNotMatch(prompt, /^Memory$/m)
})

test('uses a compact written contract for flyover replies', () => {
  const prompt = buildSystemPrompt(
    { soul: '', user: '', memory: '', now: new Date('2026-08-19T18:00:00.000Z') },
    [],
    { responseSurface: 'flyover' }
  )

  assert.match(prompt, /compact flyover/)
  assert.match(prompt, /will not be spoken/)
  assert.match(prompt, /Normal digits and punctuation are fine/)
  assert.match(prompt, /Lightweight Markdown is supported/)
  assert.match(prompt, /compact tables/)
  assert.match(prompt, /Do not use images, raw HTML, long code fences/)
  assert.doesNotMatch(prompt, /speech playback is enabled/)
})

test('uses a written unattended contract for scheduled jobs', () => {
  const prompt = buildSystemPrompt(
    { soul: '', user: '', memory: '', now: new Date('2026-08-19T18:00:00.000Z') },
    [],
    { responseSurface: 'scheduled' }
  )
  assert.match(prompt, /scheduled job/)
  assert.match(prompt, /no user in the loop/)
  assert.match(prompt, /Do not offer to schedule anything/)
  assert.match(prompt, /attach_file/)
  assert.match(prompt, /کارها/)
  assert.doesNotMatch(prompt, /speech playback is enabled/)
})

test('makes main-app replies speech-friendly only when playback is enabled', () => {
  const files = { soul: '', user: '', memory: '', now: new Date('2026-08-19T18:00:00.000Z') }
  const silent = buildSystemPrompt(files, [], { responseSurface: 'main', speechEnabled: false })
  const spoken = buildSystemPrompt(files, [], { responseSurface: 'main', speechEnabled: true })

  assert.match(silent, /main window and speech playback is disabled/)
  assert.match(silent, /Normal digits and punctuation are fine/)
  assert.match(spoken, /main window and speech playback is enabled/)
  assert.match(spoken, /naturally spoken/)
})

test('splits stable and dynamic instructions and marks only the stable prefix for caching', () => {
  const instructions = buildSystemInstructions(
    {
      soul: 'Stable soul.',
      user: 'Dynamic user.',
      memory: 'Dynamic memory.',
      now: new Date('2026-08-19T18:00:00.000Z')
    },
    [],
    { cacheStaticPrefix: true }
  )

  assert.equal(instructions.length, 2)
  assert.match(instructions[0]!.content, /Stable soul/)
  assert.doesNotMatch(instructions[0]!.content, /Dynamic user/)
  assert.deepEqual(instructions[0]!.providerOptions, {
    openrouter: { cacheControl: { type: 'ephemeral' } }
  })
  assert.match(instructions[1]!.content, /Dynamic user/)
  assert.match(instructions[1]!.content, /Local time:/)
  assert.equal(instructions[1]!.providerOptions, undefined)
})

test('adds only skill metadata and progressive loading guidance', () => {
  const prompt = buildSystemPrompt(
    { soul: '', user: '', memory: '', now: new Date('2026-08-19T18:00:00.000Z') },
    [
      {
        id: 'skill-1',
        name: 'writing-helper',
        description: 'Use for <careful> writing.',
        source: 'مشترک',
        enabled: true,
        hasResources: false
      }
    ]
  )

  assert.match(prompt, /load_skill/)
  assert.match(prompt, /read_skill_resource/)
  assert.match(prompt, /id="skill-1"/)
  assert.match(prompt, /writing-helper/)
  assert.match(prompt, /&lt;careful&gt;/)
  assert.match(prompt, /load the smallest sufficient set/)
})
