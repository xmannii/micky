import { clipboard, dialog, type BrowserWindow } from 'electron'
import { writeFile } from 'node:fs/promises'
import {
  exportExtensionOf,
  resolveExportPath,
  SAVE_TEXT_MAX,
  withExportExtension,
  type CopyTextResult,
  type SaveTextResult
} from '@/lib/export-text'

export function copyTextToClipboard(content: string): CopyTextResult {
  if (!content.trim() || content.length > SAVE_TEXT_MAX) return { copied: false }
  clipboard.writeText(content)
  return { copied: true }
}

export async function saveTextWithDialog(input: {
  browserWindow: BrowserWindow | null
  content: string
  defaultName: string
}): Promise<SaveTextResult> {
  const content = input.content
  if (!content.trim() || content.length > SAVE_TEXT_MAX) return { saved: false }

  const ext = exportExtensionOf(input.defaultName)
  const options: Electron.SaveDialogOptions = {
    defaultPath: withExportExtension(input.defaultName, ext),
    filters:
      ext === 'csv'
        ? [
            { name: 'CSV', extensions: ['csv'] },
            { name: 'Text', extensions: ['txt'] }
          ]
        : [
            { name: 'Markdown', extensions: ['md'] },
            { name: 'Text', extensions: ['txt'] }
          ]
  }
  const window = input.browserWindow && !input.browserWindow.isDestroyed() ? input.browserWindow : undefined
  const result = window
    ? await dialog.showSaveDialog(window, options)
    : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return { saved: false }

  const filePath = resolveExportPath(result.filePath)
  if (!filePath) return { saved: false }

  await writeFile(filePath, content, 'utf8')
  return { saved: true }
}
