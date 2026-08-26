# How Micky works

## Product shape

Micky is a small Persian-first desktop companion, not a chat workspace. The main window centers on one orb and a spoken conversation. Past conversations are available from the compact archive in the footer. The shortcut flyover can accept voice or typed input without turning the main app into a text-first chat.

## The three independent modules

1. `شنیدن`: the bundled local ONNX wake-word detector listens for `هی میکی`; a downloaded local Shenava model converts Persian speech to text. Raw speech is not sent to a cloud speech-recognition service.
2. `مغز (مدل AI)`: the selected language-model endpoint receives the transcript, keeps conversation context, chooses enabled tools, and creates a short answer. It can be OpenRouter, a custom OpenAI-compatible endpoint, Ollama, or LM Studio.
3. `حرف‌زدن`: optional Gemini or ElevenLabs text-to-speech reads the answer. If this is off, Micky still shows the reply as text.

The choices are independent. For example, listening can stay local while the brain uses OpenRouter and spoken replies remain off. A fully local core setup uses Shenava plus Ollama or LM Studio and keeps cloud TTS off. Web search and any explicitly requested screen inspection can still send data online when enabled.

## Starting and continuing a conversation

- Say `هی میکی`, tap the orb, or press the `دستیار میکی` global shortcut.
- After a completed spoken answer, Micky listens for a follow-up for about 12 seconds. A typing flyover keeps a text follow-up open without starting the microphone. The same conversation and model context continue.
- Use the `گفتگوی تازه` shortcut when old context is no longer useful.
- The current chat survives app reloads and normally rolls over after 30 minutes of inactivity. A chat from the archive can be resumed with recent turns restored to context.
- Speech recognition can omit punctuation, split words, or hear English words phonetically. The user should simply repeat or correct the request by voice; do not tell them to type a corrected transcript.

## Dictation versus assistant

The `دیکته در برنامه فعال` shortcut transcribes speech into the currently focused application. Optional AI cleanup can improve the text, and automatic paste can insert it. This is separate from asking the assistant to reason or use tools. These switches live in `تنظیمات → میانبرها`.

The assistant flyover input can also be configured in `تنظیمات → میانبرها` as voice only, typing only, or both. If the user begins typing in `both`, that flyover session stays in typing mode for later turns and does not reopen ASR.

## Reminders and later jobs

Ask Micky in conversation to remind them or to do work at a time. Micky's own scheduler saves these; do not describe launchd, crontab, Calendar, Shortcuts, or a helper script as the way it schedules work, and never say the scheduler is unfinished. After answering, Micky may offer once to save a reminder or job when this conversation clearly implies later or repeating work; it waits for a yes and does not create from a hunch or by searching old chats. A reminder only notifies with the saved text. A job (`کار`) runs later without interrupting the live chat, then stores a written result in `کارها`, not a file Micky invents. If the job produces a table or draft, it may also attach `.md`, `.csv`, or `.txt` files on that same run; those show up under the writeup in `کارها`.

Open the expanded side panel and choose `کارها` to read job results. Clicking the job notification opens that result. Saved items can be paused, edited, or deleted in `تنظیمات → زمان‌بندی`. Jobs fire only while Micky is running (including hidden in the tray) and need a configured brain. Results are not written into the live conversation.

## Agent modules

- `آشنایی`: Micky's personality, user profile, and durable memory. These are local Markdown layers and are included selectively in its context.
- `مهارت‌ها`: procedural guides. Micky sees only enabled skill names and descriptions, then loads a matching guide on demand.
- `زمان‌بندی`: local reminders and later jobs, saved from conversation. Reminders fire as notifications. Jobs run an isolated read-only agent, store a written result in `کارها`, and may attach markdown, CSV, or text files on that run.
- `ابزارها و دسترسی‌ها`: guarded file actions, app opening, commands, schedule create/edit policy, and direct screen inspection. Sensitive actions require confirmation or remain blocked.
- `جستجوی وب`: optional Exa, Firecrawl, or local Google search. Reading a known public page is separate from searching.
- `گفتگوها`: local SQLite conversation storage and full-text search. It can be disabled or cleared.

## Privacy and data destinations

- Wake-word detection and Shenava speech recognition run locally.
- API keys are stored in the operating-system keychain, not ordinary settings files.
- Agent requests go to the selected language-model endpoint, including isolated scheduled jobs. Ollama and LM Studio can remain local; OpenRouter and remote custom endpoints are cloud services.
- Spoken reply text goes to Gemini or ElevenLabs only when that TTS service is enabled.
- Screen content is captured only after a direct request and the disclosure flow, then sent to the chosen vision-capable model. Micky does not retain the capture.
- Conversation history, personality, profile, memory, reminders, job results, and job attachments are stored locally.
- There is no analytics or telemetry in Micky.

Do not describe Micky as fully offline merely because speech recognition is local. A setup is cloud-free only when its language model is local, cloud TTS is off, web search is not used, no screen request is sent to a cloud vision model, and no scheduled job is sent to a cloud brain.
