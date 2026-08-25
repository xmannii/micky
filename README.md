<div align="center">
  <img src="./public/micky.png" alt="Micky" width="128" height="128" />

# Micky

**A small Persian-first voice assistant for your desktop.**

Speak naturally, let Micky handle the task, and get back to your life.

[فارسی](./README.fa.md) · [Download](https://github.com/xmannii/micky/releases/latest) · [Changelog](./CHANGELOG.md)

[![Release](https://img.shields.io/github/v/release/xmannii/micky?style=flat-square)](https://github.com/xmannii/micky/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/xmannii/micky/ci.yml?branch=main&style=flat-square&label=tests)](https://github.com/xmannii/micky/actions/workflows/ci.yml)
[![Linux](https://img.shields.io/badge/Linux-Ubuntu%20|%20Debian-E95420?style=flat-square&logo=ubuntu)](https://github.com/xmannii/micky/releases/latest)
[![macOS](https://img.shields.io/badge/macOS-Apple%20Silicon-111111?style=flat-square&logo=apple)](https://github.com/xmannii/micky/releases/latest)
[![Windows](https://img.shields.io/badge/Windows-x64-0078D4?style=flat-square&logo=windows11)](https://github.com/xmannii/micky/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-7c3aed?style=flat-square)](#license)
</div>

![Micky home screen](./docs/images/micky-home.png)

> [!WARNING]
> Micky can misunderstand speech, produce incorrect answers, or fail while using a tool. Review confirmation prompts and keep backups of important files. Public builds are currently unsigned.

## Meet Micky

Most AI desktop apps grow into workspaces full of panels, threads, and text boxes. Micky stays small. Wake it with **«هی میکی»** ("Hey Micky"), tap the orb, or use a global shortcut. Say what you need and hear a short Persian answer.

The home window is a 400×712 companion built around one conversation. A compact archive keeps past chats close without turning the app into a permanent chat interface. The shortcut flyover works from any app and accepts voice or typing.

Micky is Persian-first across the whole loop: interface copy, wake phrase, local transcription, agent instructions, and spoken replies. A selected language model may understand other languages, but Persian is the designed experience.

## Three parts, configured separately

Micky treats voice assistance as three independent systems. You can replace or disable one part without rebuilding the others.

| Part             | What it does                                                                     | Your choices                                                                                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 👂 **Listening** | Detects «هی میکی», captures speech, and turns Persian audio into text            | Local ONNX wake word, local [Shenava](https://huggingface.co/collections/Reza2kn/shenava-10-open-streaming-persian-asr-and-captioning) models, selectable microphone and endpoint timing |
| 🧠 **Brain**     | Understands the request, keeps context, chooses tools, and writes a short answer | OpenRouter, custom OpenAI-compatible endpoints, Ollama, or LM Studio; configurable personality, memory, skills, tools, and web search                                                    |
| 🔊 **Speaking**  | Reads Micky's answer aloud                                                       | Gemini TTS, ElevenLabs, or fully disabled for written replies                                                                                                                            |

This split makes local and cloud setups practical. One person can use local listening with OpenRouter and no spoken output. Another can keep the brain local with Ollama, then enable a cloud voice. Provider choices remain explicit in Settings.

## The conversation loop

```text
«هی میکی», orb, or shortcut
              ↓
       local listening
              ↓
   selected model + tools
              ↓
 short reply + optional voice
              ↓
      follow-up listening
```

Micky keeps the current conversation active across follow-up windows and app reloads. A separate global shortcut opens a clean conversation when context is no longer useful. The flyover can use voice only, typing only, or both. When typing wins a session, later turns stay typed and the microphone does not restart. It grows in two steps for longer answers and keeps the text scrollable and selectable.

## What Micky can do

- Hold short Persian voice conversations with natural follow-ups.
- Dictate into the active application, with optional AI cleanup and automatic paste.
- Search the web through a configured provider and read public pages.
- Inspect the active display after a direct request and a clear disclosure.
- Read, search, create, and update files inside guarded locations.
- Open applications and run policy-checked commands.
- Remember useful facts and maintain editable personality and profile files.
- Store, search, resume, disable, or clear local conversation history.
- Load compatible agent skills only when a task needs them.
- Check GitHub Releases and point to the correct installer for the current platform.

## A closer look

<table>
  <tr>
    <td width="50%"><img src="./docs/images/micky-onboarding.png" alt="Micky Persian onboarding" /></td>
    <td width="50%"><img src="./docs/images/micky-settings.png" alt="Micky modular settings" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Short Persian onboarding</sub></td>
    <td align="center"><sub>Independent listening, brain, speaking, tools, and behavior settings</sub></td>
  </tr>
</table>

## Privacy and safety

Micky is local-first. It is only cloud-free when every selected provider is local.

| Data or feature      | Where it goes                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Wake-word audio      | Processed locally by bundled ONNX models                                                                                 |
| Speech recognition   | Processed locally by the downloaded Shenava model                                                                        |
| Conversation history | Stored in local SQLite; it can be disabled or cleared                                                                    |
| API keys             | Stored in the operating system keychain                                                                                  |
| Agent requests       | Sent to the selected LLM endpoint; Ollama and LM Studio can stay local                                                   |
| Spoken replies       | Sent to Gemini or ElevenLabs only when that provider is enabled                                                          |
| Screen content       | Captured after a direct request and disclosure, then sent to the selected vision model; captures are not stored by Micky |
| Files and commands   | Handled locally under path guards, command policy, sandboxing, and approval rules                                        |

There is no analytics or telemetry code in the app. For the most private setup, use local Shenava with Ollama or LM Studio, leave cloud TTS off, and enable desktop tools only when needed.

Ordinary reads and text-file edits inside allowed locations can run directly. Executable files, startup locations, destructive commands, installations, and other sensitive actions require approval or remain blocked. Secrets, browser data, SSH keys, and protected paths stay outside tool access.

## Download

Get the latest installer from [GitHub Releases](https://github.com/xmannii/micky/releases/latest):

- **Linux x64 (Ubuntu / Debian):** `micky-<version>-amd64.deb`
- **Linux x64 (Universal AppImage):** `micky-<version>-x64.AppImage`
- **macOS Apple Silicon:** `micky-<version>-arm64.dmg`
- **Windows x64:** `micky-<version>-x64-setup.exe`

### Installing on Linux (Ubuntu / Debian)

**Using the `.deb` package (Recommended):**
```bash
sudo apt install ./micky-<version>-amd64.deb
```

**Using the portable `.AppImage`:**
```bash
chmod +x micky-<version>-x64.AppImage
./micky-<version>-x64.AppImage
```

*Note:* Secure API key storage uses GNOME Keyring / KWallet via `libsecret`. For active window paste during dictation on X11, install `xdotool` (`sudo apt install xdotool`).

The current builds are unsigned and macOS builds are not notarized. Gatekeeper or SmartScreen may show a warning. Download Micky only from this repository, or build it from source.

### Opening the unsigned app

Micky's public builds are not code-signed yet. Because Windows and macOS cannot verify the publisher, their security systems may block the app or incorrectly present it as suspicious. This warning is caused by the missing signature and does not by itself mean that Micky is a virus. Only bypass the warning when you downloaded Micky from the [official GitHub Releases page](https://github.com/xmannii/micky/releases/latest).

**Windows:** Windows Defender SmartScreen may say **“Windows protected your PC”**, and Windows Security or other antivirus software may label the unsigned installer as potentially unsafe or even as a virus. For the SmartScreen warning, click **More info**, confirm that this is the Micky installer you downloaded from this repository, and then click **Run anyway**.

**macOS:** After dragging Micky into the Applications folder, macOS may say **“Micky is damaged and can't be opened.”** Close that message, open Terminal, and run:

```bash
xattr -dr com.apple.quarantine "/Applications/Micky.app"
```

Then open Micky again. This command removes macOS's downloaded-file quarantine attribute from Micky only.

## First run

1. Open Micky and allow microphone access.
2. Download a Shenava speech model. Smaller models are faster; larger models are usually more accurate.
3. Choose a brain: OpenRouter, a custom compatible endpoint, Ollama, or LM Studio.
4. Optionally configure Gemini or ElevenLabs for spoken replies.
5. Say «هی میکی», tap the orb, or use the configured global shortcut.

Models and provider usage may have separate licenses, privacy policies, and costs. Micky does not include paid provider access.

## Development

### Requirements

- Node.js 24.8 or newer
- pnpm 9 or newer
- macOS or Windows for supported desktop builds

### Run locally

```bash
git clone https://github.com/xmannii/micky.git
cd micky
pnpm install
pnpm dev
```

### Validate changes

```bash
pnpm typecheck
pnpm test
pnpm build
```

### Package the app

```bash
pnpm dist
```

Installers are written to `release/`.

## Project structure

| Path                     | Responsibility                                                         |
| ------------------------ | ---------------------------------------------------------------------- |
| `src/`                   | React renderer: orb, microphone capture, status, settings, and archive |
| `src/lib/`               | Types and constants shared across Electron processes                   |
| `electron/conversation/` | Turn state machine and follow-up behavior                              |
| `electron/wake-word/`    | Local ONNX wake-word detector                                          |
| `electron/speech/`       | Local Shenava speech recognition process                               |
| `electron/agent/`        | Model tool loop and Persian response contract                          |
| `electron/system/`       | File guards, write policy, command policy, and sandboxing              |
| `electron/chats/`        | Local SQLite persistence and full-text search                          |
| `electron/soul/`         | Personality, user profile, and memory layers                           |
| `electron/llm/`          | Model providers and keychain-backed secrets                            |

The renderer talks to the Electron main process only through the preload API. Conversation state, model calls, tools, permissions, and persistence stay in the main process.

## Releases and CI

Every push and pull request runs typechecking and the test suite. A version change on `main` starts macOS, Windows, and Linux packaging. When those builds succeed, the release workflow creates `v<version>` and attaches the installers.

To prepare a release:

1. Update `version` in `package.json`.
2. Update `CHANGELOG.md`.
3. Commit and push to `main`.
4. Let the release workflow test, package, tag, and publish.

## Contributing

Bug reports and pull requests are welcome. Include the operating system, expected behavior, actual behavior, and useful logs with secrets removed.

Keep Micky small, voice-first, and Persian-first. Prefer a tool and one line of status over a new dashboard or permanent view. Run `pnpm typecheck` and `pnpm test` before opening a pull request.

Never include API keys, private conversations, personal screenshots, or downloaded model files in an issue or commit.

## License

MIT. See [package.json](./package.json).

<div align="center">
  <sub>Built for speaking Persian, getting things done, and closing the computer again.</sub>
</div>
