import { ArrowRight, Check, Clock, Copy, Download, FileText, ListTodo } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ChatMessageContent } from '@/components/chat-history-view'
import { TextExportActions } from '@/components/text-export-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  excerptTaskResult,
  taskRunStatusLabel,
  type TaskAttachmentMeta,
  type TaskRunView,
  type TasksSnapshot
} from '@/lib/tasks'

const PERSIAN_WHEN = new Intl.DateTimeFormat('fa-IR', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
})

export function TaskRunPanel({
  snapshot,
  openRunId,
  onOpenRunHandled
}: {
  snapshot: TasksSnapshot | null
  openRunId: string | null
  onOpenRunHandled: () => void
}): React.JSX.Element {
  const runs = snapshot?.runs ?? []
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = runs.find((run) => run.id === selectedId) ?? null

  useEffect(() => {
    if (!openRunId) return
    setSelectedId(openRunId)
    onOpenRunHandled()
  }, [openRunId, onOpenRunHandled])

  useEffect(() => {
    if (selectedId && !runs.some((run) => run.id === selectedId)) {
      setSelectedId(null)
    }
  }, [runs, selectedId])

  if (selected) {
    return <TaskRunDetail run={selected} onBack={() => setSelectedId(null)} />
  }

  if (runs.length === 0) {
    return (
      <Empty className="h-full min-h-96 flex-1 px-8" dir="rtl">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ListTodo />
          </EmptyMedia>
          <EmptyTitle>هنوز نتیجه‌ای نیست</EmptyTitle>
          <EmptyDescription>
            وقتی میکی سر وقت کاری انجام بده، نتیجه‌ش همین‌جا می‌مونه
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <ScrollArea className="min-h-0 flex-1" dir="ltr">
      <div className="task-run-list" dir="rtl">
        {runs.map((run) => (
          <button
            key={run.id}
            type="button"
            className="task-run-row"
            onClick={() => setSelectedId(run.id)}
          >
            <span className="task-run-row-title">
              <span className="truncate font-medium">{run.taskName}</span>
              <Badge variant={run.status === 'error' ? 'destructive' : 'secondary'}>
                {taskRunStatusLabel(run.status)}
              </Badge>
            </span>
            <span className="task-run-row-meta">
              {formatRunWhen(run.startedAt)}
              {run.attachments.length > 0
                ? ` · ${run.attachments.length.toLocaleString('fa-IR')} پیوست`
                : ''}
              {run.status !== 'running' ? ` · ${excerptTaskResult(run.result, 72)}` : ''}
            </span>
          </button>
        ))}
      </div>
    </ScrollArea>
  )
}

function TaskRunDetail({
  run,
  onBack
}: {
  run: TaskRunView
  onBack: () => void
}): React.JSX.Element {
  return (
    <div className="task-run-detail" dir="rtl">
      <div className="task-run-detail-bar">
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="همه کارها">
          <ArrowRight />
        </Button>
        <div className="min-w-0 flex-1 text-start">
          <p className="truncate text-sm font-medium">{run.taskName}</p>
          <p className="text-[0.62rem] text-muted-foreground">
            {taskRunStatusLabel(run.status)} · {formatRunWhen(run.startedAt)}
          </p>
        </div>
        {run.status !== 'running' && run.result.trim() ? (
          <TextExportActions content={run.result} defaultName={run.taskName} />
        ) : null}
      </div>
      <ScrollArea className="min-h-0 flex-1" dir="ltr">
        <div className="task-run-result">
          {run.status === 'running' ? (
            <p className="text-sm text-muted-foreground">دارد انجام می‌شود…</p>
          ) : run.result.trim() ? (
            <ChatMessageContent content={run.result} markdown />
          ) : (
            <p className="text-sm text-muted-foreground">نتیجه‌ای ثبت نشد.</p>
          )}
        </div>
        <TaskRunAttachments files={run.attachments} />
      </ScrollArea>
    </div>
  )
}

export function TaskRunHistory({
  taskId,
  runs
}: {
  taskId: string
  runs: TaskRunView[]
}): React.JSX.Element | null {
  const items = runs.filter((run) => run.taskId === taskId).slice(0, 5)
  if (items.length === 0) {
    return (
      <p className="px-1 text-[0.68rem] leading-5 text-muted-foreground">هنوز اجرا نشده</p>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map((run) => (
        <article key={run.id} className="task-run-history-item">
          <div className="flex items-center gap-2">
            <Clock className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="text-[0.62rem] text-muted-foreground">{formatRunWhen(run.startedAt)}</span>
            <Badge variant={run.status === 'error' ? 'destructive' : 'secondary'}>
              {taskRunStatusLabel(run.status)}
            </Badge>
          </div>
          {run.status === 'running' ? (
            <p className="text-[0.68rem] text-muted-foreground">دارد انجام می‌شود…</p>
          ) : (
            <div className="task-run-history-body">
              <ChatMessageContent content={run.result || 'نتیجه‌ای ثبت نشد.'} markdown />
            </div>
          )}
          {run.attachments.length > 0 ? (
            <p className="text-[0.62rem] text-muted-foreground">
              {run.attachments.map((file) => file.name).join('، ')}
            </p>
          ) : null}
        </article>
      ))}
    </div>
  )
}

function TaskRunAttachments({ files }: { files: TaskAttachmentMeta[] }): React.JSX.Element | null {
  if (files.length === 0) return null
  return (
    <div className="task-run-attachments">
      {files.map((file) => (
        <AttachmentChip key={file.id} file={file} />
      ))}
    </div>
  )
}

function AttachmentChip({ file }: { file: TaskAttachmentMeta }): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  const load = (): Promise<{ content: string; name: string } | null> =>
    window.api.tasks.getAttachment(file.id)

  const copy = async (): Promise<void> => {
    const attached = await load()
    if (!attached) return
    const result = await window.api.app.copyText(attached.content)
    if (!result.copied) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1_400)
  }

  const save = async (): Promise<void> => {
    const attached = await load()
    if (!attached) return
    await window.api.app.saveText({ content: attached.content, defaultName: attached.name })
  }

  return (
    <div className="task-run-file">
      <FileText className="size-3.5 text-muted-foreground" aria-hidden="true" />
      <span className="truncate">{file.name}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => void copy()}
        aria-label={copied ? 'کپی شد' : `کپی ${file.name}`}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => void save()}
        aria-label={`ذخیره ${file.name}`}
      >
        <Download className="size-3.5" />
      </Button>
    </div>
  )
}

function formatRunWhen(iso: string): string {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return ''
  return PERSIAN_WHEN.format(new Date(ms))
}
