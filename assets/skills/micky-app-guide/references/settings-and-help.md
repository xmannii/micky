# Settings and help

## Settings map

- `ظاهر`: light/dark appearance and the UI font.
- `شنیدن`: Shenava ASR model, model download/removal, and input microphone.
- `مغز (مدل AI)`: OpenRouter, custom endpoint, Ollama, or LM Studio; API key, model, temperature, and reasoning effort.
- `حرف‌زدن`: optional Gemini or ElevenLabs TTS, voice, preview, and output device.
- `جستجوی وب`: Exa, Firecrawl, and experimental direct Google search.
- `آشنایی`: personality, user profile, and memory documents.
- `مهارت‌ها`: global skills switch and one switch per bundled or discovered skill.
- `ابزارها و دسترسی‌ها`: screen access, vision model, and local file/app/command tools.
- `گفتگوها`: local conversation-history switch and deletion controls.
- `میانبرها`: assistant, new conversation, flyover voice/typing preference, dictation, wake-word toggle, dictation cleanup/paste, and launch at login.
- `نسخه و تغییرات`: installed version and available releases.
- `روش کار`: a compact in-app explanation of the listening, brain, speaking, and local-storage flow.

## Personality and memory

Micky uses three local context layers:

- Personality controls how Micky should behave.
- The user profile holds stable identity and preference fields.
- Memory stores durable useful facts.

The user can inspect or reset these in `آشنایی`. Ordinary temporary requests should not become memory. Credentials, financial account details, and guesses must never be stored.

## Skills

Skills are instruction guides, not executable plugins and not new permissions. Micky receives enabled skill metadata and loads a matching `SKILL.md` only when the current request clearly fits. A skill can include text references loaded on demand.

This `micky-app-guide` is bundled with the app, discovered under the source badge `همراه میکی`, and enabled by default. The user can disable this skill, another skill, or the whole skills system in `تنظیمات → مهارت‌ها`. Micky also discovers compatible skills from standard global folders used by skills.sh and supported agents.

## Desktop tools and screen access

The system-tools switch controls file reads/writes, directory and content search, opening applications, and policy-checked commands. Micky uses guarded paths and a sandbox. Some sensitive actions require an explicit confirmation, and protected secrets or dangerous operations remain unavailable.

Screen access is separate. Micky may inspect the active display only after the user directly asks it to look at or explain the screen. The first-use disclosure and operating-system permission may be required. A vision-capable model must be selected. Captures are not saved by Micky, but their content is sent to that selected model endpoint.

## Conversation history

When enabled, completed turns are stored in a local SQLite database. The archive can search and resume chats. Disabling history stops local chat persistence; deletion is separate and should be treated as destructive. The active conversation can continue across reloads, and a resumed archive chat restores recent context.

## Useful shortcuts

All shortcuts can be changed in `میانبرها`:

- `دستیار میکی`: opens Micky and continues the current conversation.
- `گفتگوی تازه`: clears the active model context and starts fresh.
- `دیکته در برنامه فعال`: transcribes into the focused app, with optional AI cleanup and auto-paste.
- `روشن یا خاموش کردن عبارت بیدارباش`: toggles listening for `هی میکی` without disabling the other shortcuts.

The shortcut flyover can be set to voice only, typing only, or both. In `both`, starting to type makes the rest of that open flyover conversation typing-only, so follow-up turns do not restart microphone capture. A new flyover session starts from the saved preference again.

## Common problems

- `برای جواب‌دادن، سرویس و مدل زبانی را از تنظیمات کامل کن`: configure a brain provider, any required key, and a model in `مغز (مدل AI)`.
- Micky does not hear speech: confirm a Shenava model is installed and active, choose the right microphone, allow microphone permission, and try tapping the orb to separate wake-word trouble from microphone/ASR trouble.
- `هی میکی` does nothing: make sure wake-word listening is enabled; the orb and assistant shortcut should still work.
- Local brain connection fails: start the Ollama or LM Studio server, verify its displayed port/base URL, confirm a model is loaded, then refresh the model list.
- No spoken answer: enable `صدای میکی`, save the chosen TTS provider's own key, select a voice/output device, and preview it.
- Micky cannot search: enable at least one usable provider in `جستجوی وب`; Exa needs a key.
- Micky cannot use files or commands: check the system-tools switch. Even when enabled, path policy, sandboxing, or required confirmation may block an action.
- Micky cannot see the screen: check the screen-access switch, operating-system permission, and chosen vision-capable model; then ask directly, for example `به صفحه نگاه کن`.
- API-key fields are disabled: the operating-system keychain is unavailable. Fix the keychain; never put the key into a normal file as a workaround.
- A setting seems stale: close the relevant operation, refresh its model/provider list where offered, and retry. Use `نسخه و تغییرات` to check whether a newer app release is available.
