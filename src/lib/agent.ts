export const AGENT_STATUS_CHANNEL = 'agent:status'
export const AGENT_DELTA_CHANNEL = 'agent:delta'

export const AGENT_MAX_STEPS = 12
export const AGENT_HISTORY_LIMIT = 20

export type AgentPhase = 'idle' | 'thinking' | 'tool' | 'confirm' | 'speaking' | 'error'

export type AgentTurn = {
  turnId: string
  userText: string
  replyText: string
  phase: AgentPhase
  toolName: string | null
  confirmText: string | null
  confirmDetail: string | null
  error: string | null
}

export type AgentStatus = {
  phase: AgentPhase
  turn: AgentTurn | null
  error: string | null
}

export type AgentDelta = {
  turnId: string
  delta: string
  text: string
}

export const INITIAL_AGENT_STATUS: AgentStatus = {
  phase: 'idle',
  turn: null,
  error: null
}

const TOOL_STATUS_LABEL: Record<string, string> = {
  remember: 'دارم می‌ذارم تو حافظه…',
  recall: 'دارم حافظه رو می‌خونم…',
  search_chats: 'دارم گفتگوهای قبلی رو می‌گردم…',
  read_chat: 'دارم گفتگوی قبلی رو مرور می‌کنم…',
  update_user_profile: 'دارم پروفایلت رو عوض می‌کنم…',
  end_conversation: 'دارم گفتگو رو می‌بندم…',
  read_file: 'دارم فایل رو می‌خونم…',
  write_file: 'دارم فایل رو آماده می‌کنم…',
  list_directory: 'دارم پوشه رو نگاه می‌کنم…',
  search_files: 'دارم دنبال فایل می‌گردم…',
  search_in_files: 'دارم تو فایل‌ها می‌گردم…',
  open_app: 'دارم یه برنامه رو باز می‌کنم…',
  run_command: 'دارم یه دستور اجرا می‌کنم…',
  look_at_screen: 'دارم صفحه رو نگاه می‌کنم…',
  fetch_webpage: 'دارم صفحهٔ وب رو می‌خونم…',
  search_web: 'دارم وب رو می‌گردم…',
  edit_personal_context: 'دارم تنظیمات شخصی رو آماده می‌کنم…',
  load_skill: 'دارم مهارت مناسب رو آماده می‌کنم…',
  read_skill_resource: 'دارم راهنمای مهارت رو می‌خونم…',
  list_tasks: 'دارم زمان‌بندی رو می‌خونم…',
  create_task: 'دارم زمان‌بندی رو ذخیره می‌کنم…',
  update_task: 'دارم زمان‌بندی رو عوض می‌کنم…',
  delete_task: 'دارم زمان‌بندی رو حذف می‌کنم…',
  attach_file: 'دارم فایل رو پیوست می‌کنم…'
}

const TOOL_NAME_LABEL: Record<string, string> = {
  remember: 'حافظه',
  recall: 'یادآوری',
  search_chats: 'جستجوی گفتگوها',
  read_chat: 'مرور گفتگو',
  update_user_profile: 'پروفایل',
  end_conversation: 'گفتگو',
  read_file: 'خواندن فایل',
  write_file: 'نوشتن فایل',
  list_directory: 'دیدن پوشه',
  search_files: 'پیداکردن فایل',
  search_in_files: 'جستجو در فایل‌ها',
  open_app: 'بازکردن',
  run_command: 'اجرای دستور',
  look_at_screen: 'دیدن صفحه',
  fetch_webpage: 'خواندن وب',
  search_web: 'جستجوی وب',
  edit_personal_context: 'تنظیمات شخصی',
  load_skill: 'بارگذاری مهارت',
  read_skill_resource: 'راهنمای مهارت',
  list_tasks: 'زمان‌بندی',
  create_task: 'ثبت زمان‌بندی',
  update_task: 'ویرایش زمان‌بندی',
  delete_task: 'حذف زمان‌بندی',
  attach_file: 'پیوست فایل'
}

export function agentStatusLabel(phase: AgentPhase | string, toolName?: string | null): string {
  if (phase === 'confirm') return 'تأیید یا رد کن'
  if (phase === 'tool') {
    return (toolName && TOOL_STATUS_LABEL[toolName]) || 'یک لحظه…'
  }
  if (phase === 'error') return '…'
  if (phase === 'speaking') return 'دارم جواب می‌دم…'
  return 'دارم فکر می‌کنم…'
}

export function agentToolLabel(toolName?: string | null): string {
  return (toolName && TOOL_NAME_LABEL[toolName]) || 'انجام کار'
}
