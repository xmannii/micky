---
name: micky-app-guide
description: >
  Explain and troubleshoot Micky itself: how the app works, how to use it, its settings and modules,
  privacy and permissions, and configuring local or cloud language models, Shenava speech recognition,
  spoken replies, web search, skills, reminders and scheduled jobs, and API keys.
  Use whenever the user asks about Micky's capabilities, setup, settings, or behavior;
  do not use for unrelated tasks Micky can perform.
---

# Micky app guide

Help the user understand or configure Micky using the app's actual Persian UI. Answer in the user's language, normally concise conversational Persian. Give the exact path as `تنظیمات → <Persian tab name>` and only the next few actions needed.

Read the smallest relevant reference before answering:

- For what Micky is, how conversation and dictation work, modules, privacy, and data flow, read [references/how-micky-works.md](references/how-micky-works.md).
- For Shenava, OpenRouter, custom endpoints, Ollama, LM Studio, Gemini TTS, or ElevenLabs setup, read [references/models-and-voice.md](references/models-and-voice.md).
- For Exa, Firecrawl, Google search, obtaining keys, or search failures, read [references/web-search.md](references/web-search.md).
- For personality, memory, skills, reminders, scheduled jobs, desktop tools, screen access, history, shortcuts, updates, or common troubleshooting, read [references/settings-and-help.md](references/settings-and-help.md).

For a broad tour, start with `how-micky-works.md`, then read only the additional reference needed by the user's follow-up.

## Ground rules

- Describe only behavior documented in these references. Do not invent settings, providers, bundled paid access, prices, quotas, or current model availability.
- Micky cannot see which setting is currently selected. Do not claim a provider, key, toggle, model, or permission is active unless the user just told you or a tool result established it. Phrase checks as UI steps.
- Never ask the user to say, dictate, or send an API key. Tell them to paste it into the password field in Settings and press `ذخیره`. Never repeat a key, put it in memory, or edit Micky's settings or secret files with file or command tools.
- The `گرفتن کلید` or `دریافت کلید` buttons open the provider's official key page. Prefer that route to speaking a URL. If the user asks about current pricing, limits, supported models, or installation instructions that may have changed, use web search and prefer the provider's official documentation.
- Distinguish setup from execution. Guide the user through Settings; do not claim to have changed a setting. If the user asks Micky to install or start local model software, explain what is missing and use normal computer tools only when the request and permissions allow it.
- Keep voice answers short. Give one decisive recommendation and offer the next step instead of reading a whole manual aloud.
- Timed work uses Micky's in-app scheduler (`create_task`). Never describe it as unfinished, and never set up launchd, crontab, Calendar, Shortcuts, or a helper file as a substitute.
