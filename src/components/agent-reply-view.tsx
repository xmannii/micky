import {
  AppWindow,
  Brain,
  Check,
  ChevronDown,
  Clock,
  FileSearch,
  FileText,
  FolderOpen,
  Globe2,
  LoaderCircle,
  Monitor,
  ShieldCheck,
  Sparkles,
  Terminal,
  UserRound,
  X,
  type LucideIcon
} from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { agentStatusLabel, agentToolLabel } from '@/lib/agent'

type AgentReplyViewProps = {
  turnId: string
  text: string
  phase: string
  toolName?: string | null
  confirmText?: string | null
  confirmDetail?: string | null
  dimmed?: boolean
  onApprove?: () => void
  onDeny?: () => void
}

const TOOL_ICON: Record<string, LucideIcon> = {
  remember: Brain,
  recall: Brain,
  search_chats: FileSearch,
  read_chat: FileText,
  update_user_profile: UserRound,
  end_conversation: Check,
  read_file: FileText,
  write_file: FileText,
  list_directory: FolderOpen,
  search_files: FileSearch,
  search_in_files: FileSearch,
  open_app: AppWindow,
  run_command: Terminal,
  look_at_screen: Monitor,
  fetch_webpage: Globe2,
  search_web: Globe2,
  edit_personal_context: UserRound,
  load_skill: Sparkles,
  read_skill_resource: FileText,
  list_tasks: Clock,
  create_task: Clock,
  update_task: Clock,
  delete_task: Clock
}

function ApprovalCard({
  purpose,
  detail,
  onApprove,
  onDeny
}: {
  purpose: string
  detail: string | null
  onApprove?: () => void
  onDeny?: () => void
}): React.JSX.Element {
  const [revealed, setRevealed] = useState(false)

  return (
    <section className="approval-card" aria-labelledby="approval-title">
      <div className="approval-heading">
        <span className="approval-icon" aria-hidden="true">
          <ShieldCheck />
        </span>
        <div className="min-w-0 text-start">
          <span className="approval-kicker">نیاز به اجازه</span>
          <p id="approval-title" className="approval-purpose">
            {purpose}
          </p>
        </div>
      </div>

      <p className="approval-hint">تا انتخاب نکنی، کاری انجام نمی‌شه.</p>

      {detail ? (
        <>
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
            onClick={() => setRevealed((open) => !open)}
            aria-expanded={revealed}
          >
            <Terminal data-icon="inline-start" />
            {revealed ? 'بستن جزئیات' : 'دیدن جزئیات'}
            <ChevronDown data-icon="inline-end" className={revealed ? 'rotate-180' : undefined} />
          </Button>
          {revealed ? <pre className="tool-confirm-detail">{detail}</pre> : null}
        </>
      ) : null}

      <div className="grid w-full grid-cols-[1.15fr_1fr] gap-2" dir="rtl">
        <Button size="lg" className="w-full" onClick={onApprove} disabled={!onApprove}>
          <Check data-icon="inline-start" />
          اجازه بده
        </Button>
        <Button size="lg" variant="outline" className="w-full" onClick={onDeny} disabled={!onDeny}>
          <X data-icon="inline-start" />
          رد کن
        </Button>
      </div>
    </section>
  )
}

function ToolActivity({ toolName }: { toolName: string | null }): React.JSX.Element {
  const ToolIcon = (toolName && TOOL_ICON[toolName]) || Sparkles

  return (
    <section className="tool-activity" role="status" aria-live="polite">
      <span className="tool-activity-icon" aria-hidden="true">
        <ToolIcon />
      </span>
      <div className="tool-activity-body">
        <div className="tool-activity-heading">
          <Badge variant="secondary">{agentToolLabel(toolName)}</Badge>
          <span className="tool-activity-live">
            <LoaderCircle className="tool-activity-spinner" aria-hidden="true" />
            در حال انجام
          </span>
        </div>
        <p className="tool-activity-status">{agentStatusLabel('tool', toolName)}</p>
        <span className="tool-activity-progress" aria-hidden="true">
          <span />
        </span>
      </div>
    </section>
  )
}

function StreamingReply({ text, dimmed }: { text: string; dimmed: boolean }): React.JSX.Element {
  return (
    <ScrollArea
      className="agent-reply-window"
      data-followup={dimmed ? 'true' : 'false'}
      role="region"
      aria-label="پاسخ میکی"
    >
      <p className="agent-reply-text">{text}</p>
    </ScrollArea>
  )
}

export function AgentReplyView({
  turnId,
  text,
  phase,
  toolName = null,
  confirmText = null,
  confirmDetail = null,
  dimmed = false,
  onApprove,
  onDeny
}: AgentReplyViewProps): React.JSX.Element {
  if (phase === 'confirm') {
    return (
      <ApprovalCard
        key={`${turnId}-${confirmDetail ?? ''}`}
        purpose={confirmText?.trim() || 'این کار رو انجام بدم؟'}
        detail={confirmDetail}
        onApprove={onApprove}
        onDeny={onDeny}
      />
    )
  }

  if (phase === 'tool') {
    return <ToolActivity toolName={toolName} />
  }

  if (!text.trim()) {
    return (
      <span className="transcript-placeholder text-muted-foreground">
        {agentStatusLabel(phase, toolName)}
      </span>
    )
  }

  return <StreamingReply text={text} dimmed={dimmed} />
}
