import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { activeAgentToolNames, createAgentTools } from './tools'
import { TOOL_APPROVAL_PRESETS } from '@/lib/settings'

type ExecutableTool = {
  execute: (input: Record<string, unknown>) => Promise<Record<string, unknown>>
}

function executable(tool: unknown): ExecutableTool {
  return tool as ExecutableTool
}

test('registers eighteen tools with system tools and skills enabled', () => {
  const tools = createAgentTools({} as never, {
    systemToolsEnabled: true,
    skills: {} as never
  })

  assert.equal(Object.keys(tools).length, 18)
  assert.equal('get_current_datetime' in tools, false)
})

test('keeps screen viewing separate from file and command access', async () => {
  const tools = createAgentTools({} as never, {
    systemToolsEnabled: false,
    screenAccessEnabled: false,
    screenCaptureAllowed: true
  })

  assert.equal('look_at_screen' in tools, true)
  assert.equal('read_file' in tools, false)
  assert.deepEqual(await executable(tools.look_at_screen).execute({ question: 'چه می‌بینی؟' }), {
    observed: false,
    message: 'دیدن صفحه از تنظیمات «ابزارها و دسترسی‌ها» خاموش است.'
  })
})

test('exposes read_chat only after search_chats completes', () => {
  const tools = { remember: {}, search_chats: {}, read_chat: {} } as never

  assert.deepEqual(activeAgentToolNames(tools), ['remember', 'search_chats'])
  assert.deepEqual(activeAgentToolNames(tools, { chatSearchCompleted: true }), [
    'remember',
    'search_chats',
    'read_chat'
  ])
})

test('registers search_web only when a configured provider is available', () => {
  const withoutProvider = createAgentTools({} as never, {
    webSearch: { getAvailableProviderIds: () => [] } as never
  })
  const withProvider = createAgentTools({} as never, {
    webSearch: { getAvailableProviderIds: () => ['firecrawl'] } as never
  })

  assert.equal('search_web' in withoutProvider, false)
  assert.equal('search_web' in withProvider, true)
})

test('edits explicitly requested personal context without approval', async () => {
  let written: { file: string; content: string } | null = null
  let approvalRequests = 0
  const tools = createAgentTools(
    {
      write: async (file: string, content: string) => {
        written = { file, content }
      }
    } as never,
    {
      requestApproval: async () => {
        approvalRequests += 1
        return false
      }
    }
  )

  const result = await executable(tools.edit_personal_context).execute({
    file: 'soul',
    content: '# Updated soul'
  })

  assert.deepEqual(result, { updated: true, file: 'SOUL.md' })
  assert.deepEqual(written, { file: 'soul', content: '# Updated soul' })
  assert.equal(approvalRequests, 0)
})

test('writes ordinary text directly but asks before suspicious formats', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'micky-tool-write-'))
  t.after(() => rm(directory, { recursive: true, force: true }))

  const approvals: string[] = []
  const tools = createAgentTools({} as never, {
    systemToolsEnabled: true,
    requestApproval: async ({ command }) => {
      approvals.push(command)
      return false
    }
  })

  const markdownPath = join(directory, 'notes.md')
  const markdownResult = await executable(tools.write_file).execute({
    path: markdownPath,
    content: '# Notes\n',
    mode: 'create',
    purpose: 'یادداشت را ذخیره می‌کنم.'
  })
  assert.equal(markdownResult.written, true)
  assert.equal(await readFile(markdownPath, 'utf8'), '# Notes\n')

  const scriptPath = join(directory, 'install.sh')
  const scriptResult = await executable(tools.write_file).execute({
    path: scriptPath,
    content: '#!/bin/sh\n',
    mode: 'create',
    purpose: 'اسکریپت را می‌سازم.'
  })
  assert.deepEqual(scriptResult, {
    written: false,
    approved: false,
    message: 'کاربر اجازه نداد.'
  })
  assert.equal(approvals.length, 1)
  assert.equal(approvals[0]?.endsWith('/install.sh'), true)
})

test('removes individually blocked tools from the model tool set', () => {
  const tools = createAgentTools({} as never, {
    systemToolsEnabled: true,
    toolApprovals: {
      ...TOOL_APPROVAL_PRESETS.balanced,
      open_app: 'blocked',
      run_command: 'blocked'
    }
  })

  assert.equal('read_file' in tools, true)
  assert.equal('open_app' in tools, false)
  assert.equal('run_command' in tools, false)
})

test('strict mode asks before an otherwise automatic file read', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'micky-tool-read-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const filePath = join(directory, 'notes.txt')
  await writeFile(filePath, 'private notes', 'utf8')
  const approvals: string[] = []
  const tools = createAgentTools({} as never, {
    systemToolsEnabled: true,
    toolApprovals: TOOL_APPROVAL_PRESETS.strict,
    requestApproval: async (request) => {
      approvals.push(request.toolName ?? '')
      return false
    }
  })

  const result = await executable(tools.read_file).execute({ path: filePath })

  assert.deepEqual(result, { approved: false, message: 'کاربر اجازه نداد.' })
  assert.deepEqual(approvals, ['read_file'])
})

test('yolo mode writes sensitive formats without asking while retaining path guards', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'micky-tool-yolo-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  let approvalRequests = 0
  const tools = createAgentTools({} as never, {
    systemToolsEnabled: true,
    toolApprovals: TOOL_APPROVAL_PRESETS.yolo,
    requestApproval: async () => {
      approvalRequests += 1
      return false
    }
  })
  const scriptPath = join(directory, 'local-script.sh')

  const result = await executable(tools.write_file).execute({
    path: scriptPath,
    content: '#!/bin/sh\necho safe-test\n',
    mode: 'create',
    purpose: 'اسکریپت را بساز.'
  })

  assert.equal(result.written, true)
  assert.equal(approvalRequests, 0)
  assert.equal(await readFile(scriptPath, 'utf8'), '#!/bin/sh\necho safe-test\n')
})

test('yolo mode runs an allowed changing-tier command without asking', async () => {
  let approvalRequests = 0
  const tools = createAgentTools({} as never, {
    systemToolsEnabled: true,
    toolApprovals: TOOL_APPROVAL_PRESETS.yolo,
    requestApproval: async () => {
      approvalRequests += 1
      return false
    }
  })

  const result = await executable(tools.run_command).execute({
    command: '/usr/bin/printf yolo',
    purpose: 'یک خروجی آزمایشی می‌سازم.'
  })

  assert.equal(result.ran, true)
  assert.equal(result.stdout, 'yolo')
  assert.equal(approvalRequests, 0)
})

test('strict mode asks even before a safe read-only command', async () => {
  let approvalRequests = 0
  const tools = createAgentTools({} as never, {
    systemToolsEnabled: true,
    toolApprovals: TOOL_APPROVAL_PRESETS.strict,
    requestApproval: async () => {
      approvalRequests += 1
      return false
    }
  })

  const result = await executable(tools.run_command).execute({
    command: 'echo safe',
    purpose: 'یک خروجی آزمایشی می‌سازم.'
  })

  assert.deepEqual(result, { ran: false, approved: false, message: 'کاربر اجازه نداد.' })
  assert.equal(approvalRequests, 1)
})
