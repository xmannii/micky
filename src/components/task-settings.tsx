import { ChevronDown, Clock, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { TaskRunHistory } from '@/components/task-run-panel'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldContent, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  formatTaskWhen,
  taskKindLabel,
  taskReportModeLabel,
  taskStatusLabel,
  type TaskKind,
  type TaskReportMode,
  type TaskRunView,
  type TaskScheduleType,
  type TaskStatus,
  type TaskView,
  type TaskPatchPayload,
  type TasksSnapshot
} from '@/lib/tasks'

export function TaskSettings({ snapshot }: { snapshot: TasksSnapshot | null }): React.JSX.Element {
  const tasks = snapshot?.tasks ?? []
  const runs = snapshot?.runs ?? []
  const activeCount = tasks.filter((task) => task.status === 'active').length

  return (
    <div className="flex flex-col gap-3">
      <Card size="sm" className="bg-card/30">
        <CardHeader>
          <CardTitle>زمان‌بندی‌های ذخیره‌شده</CardTitle>
          <CardDescription>
            از گفتگو ساخته می‌شوند. یادآوری فقط خبر می‌دهد؛ کار را میکی سر وقت انجام می‌دهد
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-[0.68rem] leading-5 text-muted-foreground">
            {tasks.length > 0
              ? `${tasks.length.toLocaleString('fa-IR')} مورد، ${activeCount.toLocaleString('fa-IR')} فعال`
              : 'هنوز چیزی ذخیره نشده. از میکی بخواه سر وقت بهت بگوید یا کاری انجام دهد.'}
          </p>
        </CardContent>
      </Card>

      {tasks.length === 0 ? (
        <Empty className="border border-dashed border-border/60 py-10">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Clock />
            </EmptyMedia>
            <EmptyTitle>زمان‌بندی‌ای نیست</EmptyTitle>
            <EmptyDescription>
              مثلاً بگو هر روز ساعت ۲۱ به من یاد بده نرمش کنم، یا هر شب خبرها را خلاصه کن
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-2">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} runs={runs} />
          ))}
        </div>
      )}
    </div>
  )
}

function TaskCard({ task, runs }: { task: TaskView; runs: TaskRunView[] }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const paused = task.status === 'paused'
  const canToggle = task.status === 'active' || task.status === 'paused'

  return (
    <Card size="sm" className="bg-card/30">
      <CardHeader>
        <CardTitle className="text-sm">{task.name}</CardTitle>
        <CardDescription>
          {taskKindLabel(task.kind)} · {formatTaskWhen(task.nextRun, task.timezone)}
        </CardDescription>
        <CardAction className="flex items-center gap-1">
          <Badge variant={task.status === 'active' ? 'default' : 'secondary'}>
            {taskStatusLabel(task.status)}
          </Badge>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-expanded={open}
            aria-label={open ? 'بستن جزئیات' : 'دیدن و ویرایش'}
            onClick={() => setOpen((current) => !current)}
          >
            <ChevronDown className={open ? 'rotate-180' : undefined} />
          </Button>
        </CardAction>
      </CardHeader>
      {canToggle ? (
        <CardContent className="pt-0">
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor={`task-active-${task.id}`}>فعال</FieldLabel>
            </FieldContent>
            <Switch
              id={`task-active-${task.id}`}
              dir="ltr"
              checked={!paused}
              onCheckedChange={(checked) => {
                void window.api.tasks.update(task.id, { status: checked ? 'active' : 'paused' })
              }}
            />
          </Field>
        </CardContent>
      ) : null}
      {open && task.kind === 'run' ? (
        <CardContent className="flex flex-col gap-2 border-t border-border/40 pt-3">
          <p className="text-[0.68rem] font-medium">آخرین نتیجه‌ها</p>
          <TaskRunHistory taskId={task.id} runs={runs} />
        </CardContent>
      ) : null}
      {open ? <TaskEditor task={task} /> : null}
    </Card>
  )
}

function TaskEditor({ task }: { task: TaskView }): React.JSX.Element {
  const [name, setName] = useState(task.name)
  const [prompt, setPrompt] = useState(task.prompt)
  const [kind, setKind] = useState<TaskKind>(task.kind)
  const [scheduleType, setScheduleType] = useState<TaskScheduleType>(task.scheduleType)
  const [runAtLocal, setRunAtLocal] = useState(isoToDatetimeLocal(task.runAt))
  const [cron, setCron] = useState(task.cron ?? '')
  const [timezone, setTimezone] = useState(task.timezone)
  const [status, setStatus] = useState<TaskStatus>(task.status)
  const [reportMode, setReportMode] = useState<TaskReportMode>(task.reportMode)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setName(task.name)
    setPrompt(task.prompt)
    setKind(task.kind)
    setScheduleType(task.scheduleType)
    setRunAtLocal(isoToDatetimeLocal(task.runAt))
    setCron(task.cron ?? '')
    setTimezone(task.timezone)
    setStatus(task.status)
    setReportMode(task.reportMode)
    setError(null)
  }, [task])

  const save = async (): Promise<void> => {
    setSaving(true)
    setError(null)
    try {
      const patch: TaskPatchPayload = {
        name,
        prompt,
        kind,
        scheduleType,
        timezone,
        status,
        reportMode
      }
      if (scheduleType === 'once') {
        const iso = datetimeLocalToIso(runAtLocal)
        if (!iso) {
          setError('برای کار یک‌بار باید زمان را وارد کنی.')
          return
        }
        patch.runAt = iso
        patch.cron = null
      } else {
        if (!cron.trim()) {
          setError('برای کار تکراری باید الگوی cron را وارد کنی.')
          return
        }
        patch.cron = cron
        patch.runAt = null
      }
      await window.api.tasks.update(task.id, patch)
    } catch {
      setError('ذخیره نشد. زمان یا الگوی تکرار را بررسی کن.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <CardContent className="flex flex-col gap-3 border-t border-border/40 pt-3">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`task-name-${task.id}`}>نام</FieldLabel>
          <Input
            id={`task-name-${task.id}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`task-prompt-${task.id}`}>متن</FieldLabel>
          <Textarea
            id={`task-prompt-${task.id}`}
            value={prompt}
            rows={3}
            onChange={(event) => setPrompt(event.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field>
            <FieldLabel htmlFor={`task-kind-${task.id}`}>نوع</FieldLabel>
            <Select value={kind} onValueChange={(value) => isKind(value) && setKind(value)}>
              <SelectTrigger id={`task-kind-${task.id}`} size="sm">
                <SelectValue>{taskKindLabel(kind)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="remind">{taskKindLabel('remind')}</SelectItem>
                  <SelectItem value="run">{taskKindLabel('run')}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor={`task-report-${task.id}`}>گزارش</FieldLabel>
            <Select
              value={reportMode}
              onValueChange={(value) => isReport(value) && setReportMode(value)}
            >
              <SelectTrigger id={`task-report-${task.id}`} size="sm">
                <SelectValue>{taskReportModeLabel(reportMode)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="notify">{taskReportModeLabel('notify')}</SelectItem>
                  <SelectItem value="silent">{taskReportModeLabel('silent')}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor={`task-schedule-${task.id}`}>تکرار</FieldLabel>
            <Select
              value={scheduleType}
              onValueChange={(value) => isSchedule(value) && setScheduleType(value)}
            >
              <SelectTrigger id={`task-schedule-${task.id}`} size="sm">
                <SelectValue>{scheduleType === 'once' ? 'یک‌بار' : 'تکراری'}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="once">یک‌بار</SelectItem>
                  <SelectItem value="recurring">تکراری</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor={`task-status-${task.id}`}>وضعیت</FieldLabel>
            <Select
              value={status}
              onValueChange={(value) => isEditableStatus(value) && setStatus(value)}
            >
              <SelectTrigger id={`task-status-${task.id}`} size="sm">
                <SelectValue>{taskStatusLabel(status)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="active">{taskStatusLabel('active')}</SelectItem>
                  <SelectItem value="paused">{taskStatusLabel('paused')}</SelectItem>
                  <SelectItem value="done">{taskStatusLabel('done')}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </div>
        {scheduleType === 'once' ? (
          <Field>
            <FieldLabel htmlFor={`task-runat-${task.id}`}>زمان</FieldLabel>
            <Input
              id={`task-runat-${task.id}`}
              type="datetime-local"
              dir="ltr"
              value={runAtLocal}
              onChange={(event) => setRunAtLocal(event.target.value)}
            />
          </Field>
        ) : (
          <Field>
            <FieldLabel htmlFor={`task-cron-${task.id}`}>Cron</FieldLabel>
            <Input
              id={`task-cron-${task.id}`}
              dir="ltr"
              value={cron}
              placeholder="0 21 * * *"
              onChange={(event) => setCron(event.target.value)}
            />
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor={`task-tz-${task.id}`}>منطقه زمانی</FieldLabel>
          <Input
            id={`task-tz-${task.id}`}
            dir="ltr"
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
          />
        </Field>
      </FieldGroup>
      {error ? <p className="text-[0.68rem] text-destructive">{error}</p> : null}
      <div className="flex items-center justify-between gap-2">
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button variant="ghost" size="sm">
                <Trash2 data-icon="inline-start" />
                حذف
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>این {taskKindLabel(task.kind)} حذف شود؟</AlertDialogTitle>
              <AlertDialogDescription>
                «{task.name}» از روی همین دستگاه پاک می‌شود.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>نه، بی‌خیال</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => void window.api.tasks.delete(task.id)}
              >
                حذف
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button size="sm" disabled={saving} onClick={() => void save()}>
          ذخیره
        </Button>
      </div>
    </CardContent>
  )
}

function isoToDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function datetimeLocalToIso(value: string): string | null {
  if (!value.trim()) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

function isKind(value: unknown): value is TaskKind {
  return value === 'remind' || value === 'run'
}

function isSchedule(value: unknown): value is TaskScheduleType {
  return value === 'once' || value === 'recurring'
}

function isReport(value: unknown): value is TaskReportMode {
  return value === 'notify' || value === 'silent'
}

function isEditableStatus(value: unknown): value is TaskStatus {
  return value === 'active' || value === 'paused' || value === 'done'
}
