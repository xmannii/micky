import {
  AppWindow,
  FilePenLine,
  FileSearch,
  FileText,
  FolderSearch,
  Globe2,
  ShieldAlert,
  TerminalSquare
} from 'lucide-react'
import { useState } from 'react'
import {
  detectToolApprovalPreset,
  isToolApprovalMode,
  type SettingsSnapshot,
  type SystemToolId,
  type ToolApprovalMode,
  type ToolApprovalPreset
} from '@/lib/settings'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel
} from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const TOOL_ROWS: ReadonlyArray<{
  id: SystemToolId
  title: string
  description: string
  icon: typeof FileText
}> = [
  {
    id: 'read_file',
    title: 'خواندن فایل',
    description: 'خواندن متن فایل‌های مجاز؛ مسیرهای محرمانه همیشه بسته می‌مانند',
    icon: FileText
  },
  {
    id: 'write_file',
    title: 'نوشتن فایل',
    description: 'ساختن، بازنویسی یا افزودن متن به فایل',
    icon: FilePenLine
  },
  {
    id: 'list_directory',
    title: 'دیدن پوشه',
    description: 'نمایش فهرست فایل‌ها و پوشه‌های یک مسیر مجاز',
    icon: FolderSearch
  },
  {
    id: 'search_files',
    title: 'پیداکردن فایل',
    description: 'جستجو بین نام فایل‌ها و پوشه‌ها',
    icon: FileSearch
  },
  {
    id: 'search_in_files',
    title: 'جستجو داخل فایل‌ها',
    description: 'پیداکردن یک عبارت در محتوای فایل‌های متنی',
    icon: FileSearch
  },
  {
    id: 'fetch_webpage',
    title: 'خواندن صفحه وب',
    description: 'دریافت متن یک صفحه عمومی بدون ورود به حساب‌ها',
    icon: Globe2
  },
  {
    id: 'open_app',
    title: 'بازکردن برنامه یا لینک',
    description: 'بازکردن برنامه، فایل یا نشانی وب روی مک',
    icon: AppWindow
  },
  {
    id: 'run_command',
    title: 'اجرای دستور ترمینال',
    description: 'اجرای دستور در محیط محدود یا مستقیم، بسته به سطح خطر',
    icon: TerminalSquare
  }
]

const MODE_OPTIONS: ReadonlyArray<{ value: ToolApprovalMode; label: string }> = [
  { value: 'auto', label: 'خودکار' },
  { value: 'smart', label: 'بر اساس خطر' },
  { value: 'confirm', label: 'هر بار بپرس' },
  { value: 'blocked', label: 'خاموش' }
]

export function SystemToolsSettings({
  settings
}: {
  settings: SettingsSnapshot
}): React.JSX.Element {
  const [confirmYolo, setConfirmYolo] = useState(false)
  const activePreset = detectToolApprovalPreset(settings.toolApprovals)

  const applyPreset = (preset: ToolApprovalPreset): void => {
    if (preset === activePreset) return
    if (preset === 'yolo') {
      setConfirmYolo(true)
      return
    }
    void window.api.settings.setToolApprovalPreset(preset)
  }

  return (
    <div className="flex flex-col gap-3">
      <Card size="sm" className="bg-card/30">
        <CardHeader>
          <CardTitle id="system-tools-label">فایل‌ها، برنامه‌ها و دستورها</CardTitle>
          <CardDescription>
            مشخص کن میکی برای کارهای روی مک چه زمانی باید از تو اجازه بگیرد
          </CardDescription>
          <CardAction>
            <Switch
              dir="ltr"
              checked={settings.systemToolsEnabled}
              aria-labelledby="system-tools-label"
              onCheckedChange={(checked) => void window.api.settings.setSystemToolsEnabled(checked)}
            />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">سطح محافظت</span>
              {activePreset === 'custom' ? <Badge variant="outline">شخصی</Badge> : null}
            </div>
            <ToggleGroup
              value={activePreset === 'custom' ? [] : [activePreset]}
              multiple={false}
              variant="outline"
              size="sm"
              spacing={2}
              disabled={!settings.systemToolsEnabled}
              aria-label="سطح محافظت ابزارهای سیستم"
              onValueChange={(values) => {
                const preset = values.at(-1)
                if (preset === 'strict' || preset === 'balanced' || preset === 'yolo') {
                  applyPreset(preset)
                }
              }}
            >
              <ToggleGroupItem value="strict">محافظه‌کار</ToggleGroupItem>
              <ToggleGroupItem value="balanced">متعادل</ToggleGroupItem>
              <ToggleGroupItem value="yolo">YOLO</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <p className="text-[0.68rem] leading-5 text-muted-foreground">
            {presetDescription(activePreset)}
          </p>
        </CardContent>
        <CardFooter className="gap-2 text-start">
          <ShieldAlert className="shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="text-xs leading-5 text-muted-foreground">
            رمزها، کلیدها، داده مرورگر، مسیرهای محافظت‌شده، sudo و دستورهای پاک‌کردن دیسک در همه
            حالت‌ها مسدودند
          </p>
        </CardFooter>
      </Card>

      <Card size="sm" className="bg-card/30">
        <CardHeader>
          <CardTitle>اجازه هر ابزار</CardTitle>
          <CardDescription>
            هر تغییر در این بخش، سطح محافظت را به «شخصی» تبدیل می‌کند
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {TOOL_ROWS.map(({ id, title, description, icon: Icon }) => (
              <Field key={id} orientation="horizontal" data-disabled={!settings.systemToolsEnabled}>
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                  <Icon aria-hidden="true" />
                </span>
                <FieldContent>
                  <FieldLabel htmlFor={`tool-policy-${id}`}>{title}</FieldLabel>
                  <FieldDescription className="text-[0.68rem] leading-5">
                    {description}
                  </FieldDescription>
                </FieldContent>
                <Select
                  value={settings.toolApprovals[id]}
                  disabled={!settings.systemToolsEnabled}
                  onValueChange={(mode) => {
                    if (isToolApprovalMode(mode)) {
                      void window.api.settings.setToolApproval(id, mode)
                    }
                  }}
                >
                  <SelectTrigger
                    id={`tool-policy-${id}`}
                    size="sm"
                    className="w-30 shrink-0"
                    aria-label={`اجازه ${title}`}
                  >
                    <SelectValue>{modeLabel(settings.toolApprovals[id])}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {MODE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            ))}
          </FieldGroup>
        </CardContent>
      </Card>

      <AlertDialog open={confirmYolo} onOpenChange={setConfirmYolo}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حالت YOLO روشن شود؟</AlertDialogTitle>
            <AlertDialogDescription>
              میکی بیشتر کارها، از جمله نوشتن فایل و اجرای دستورهای تغییردهنده را بدون پرسیدن انجام
              می‌دهد. مرزهای ثابت امنیتی همچنان فعال می‌مانند.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>نه، بی‌خیال</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void window.api.settings.setToolApprovalPreset('yolo')}
            >
              روشن‌کردن YOLO
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function presetDescription(preset: ReturnType<typeof detectToolApprovalPreset>): string {
  if (preset === 'strict') return 'پیش از استفاده از هر ابزار یک تأیید جدا می‌گیرد.'
  if (preset === 'balanced')
    return 'کارهای خواندنی مستقیم‌اند؛ تغییرهای حساس بر اساس خطر تأیید می‌خواهند.'
  if (preset === 'yolo')
    return 'تقریباً همه کارهای مجاز را بدون تأیید انجام می‌دهد؛ سریع‌تر و پرریسک‌تر.'
  return 'رفتار هر ابزار مطابق انتخاب‌های پایین تنظیم شده است.'
}

function modeLabel(mode: ToolApprovalMode): string {
  return MODE_OPTIONS.find((option) => option.value === mode)?.label ?? mode
}
