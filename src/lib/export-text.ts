import type { ChatMessageRole } from './chats'

export const SAVE_TEXT_MAX = 200_000

export type SaveTextInput = {
  content: string
  defaultName: string
}

export type SaveTextResult = {
  saved: boolean
}

export type CopyTextResult = {
  copied: boolean
}

export function sanitizeExportFileName(name: string, fallback = 'micky'): string {
  const trimmed = name
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
  return trimmed || fallback
}

export function withExportExtension(name: string, ext: 'md' | 'txt' = 'md'): string {
  const base = sanitizeExportFileName(name).replace(/\.(md|txt)$/i, '')
  return `${base}.${ext}`
}

export function resolveExportPath(filePath: string): string | null {
  const trimmed = filePath.trim()
  if (!trimmed || trimmed.includes('\0')) return null
  const withExt = fileExtension(trimmed) ? trimmed : `${trimmed}.md`
  const ext = fileExtension(withExt).toLowerCase()
  if (ext !== '.md' && ext !== '.txt') return null
  return withExt
}

function fileExtension(filePath: string): string {
  const base = filePath.replaceAll('\\', '/').split('/').pop() ?? filePath
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return ''
  return base.slice(dot)
}

export function chatToMarkdown(chat: {
  title: string
  messages: Array<{ role: ChatMessageRole; content: string }>
}): string {
  const title = chat.title.trim() || 'گفتگو'
  const parts = [`# ${title}`, '']
  for (const message of chat.messages) {
    parts.push(message.role === 'user' ? '## تو' : '## میکی', '', message.content.trim(), '')
  }
  return `${parts.join('\n').trim()}\n`
}
