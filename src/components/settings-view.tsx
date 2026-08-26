import {
  ArrowRight,
  BadgeInfo,
  BrainCircuit,
  CircleAlert,
  CircleHelp,
  Database,
  Clock,
  Download,
  Ear,
  ExternalLink,
  History,
  Globe2,
  Keyboard,
  LockKeyhole,
  Mic,
  Monitor,
  Palette,
  Puzzle,
  RefreshCw,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  Trash2,
  Volume2,
  X
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AsrModelView, ModelsSnapshot } from '@/lib/asr'
import type { TtsSnapshot } from '@/lib/tts'
import type { ScreenAccessStatus, SettingsSnapshot } from '@/lib/settings'
import type { LlmSnapshot } from '@/lib/llm'
import type { ChatsSnapshot } from '@/lib/chats'
import { MICKY_APP_GUIDE_SKILL_NAME, type SkillsSnapshot } from '@/lib/skills'
import type { AppUpdateSnapshot } from '@/lib/app-update'
import { Button } from '@/components/ui/button'
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
  FieldError,
  FieldGroup,
  FieldLabel
} from '@/components/ui/field'
import { Badge } from '@/components/ui/badge'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { LlmSettings } from '@/components/llm-settings'
import { MickyLogo } from '@/components/micky-logo'
import { PersonalitySettings } from '@/components/personality-settings'
import { ShenavaModelHelp } from '@/components/shenava-model-help'
import { TtsSettings } from '@/components/tts-settings'
import { AppearanceSettings } from '@/components/appearance-settings'
import { AudioDeviceSettings } from '@/components/audio-device-settings'
import { useLlm } from '@/hooks/use-llm'
import { useSoul } from '@/hooks/use-soul'
import { useSkills } from '@/hooks/use-skills'
import { useAudioDevices } from '@/hooks/use-audio-devices'
import { useWebSearch } from '@/hooks/use-web-search'
import { WebSearchSettings } from '@/components/web-search-settings'
import { AppVersionSettings } from '@/components/app-version-settings'
import { SystemToolsSettings } from '@/components/system-tools-settings'
import { TaskSettings } from '@/components/task-settings'
import { useTasks } from '@/hooks/use-tasks'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty'
import {
  shortcutAccessibleLabel,
  shortcutDisplayKeys,
  shortcutFromKeyboardEvent,
  shortcutPlatformLabel,
  shortcutPreviewKeys,
  type DesktopPlatform
} from '@/lib/shortcuts'

type SettingsTab =
  | 'appearance'
  | 'asr'
  | 'llm'
  | 'tts'
  | 'search'
  | 'soul'
  | 'skills'
  | 'tasks'
  | 'tools'
  | 'history'
  | 'shortcuts'
  | 'version'
  | 'about'

const TAB_COPY: Record<SettingsTab, { title: string; description: string }> = {
  appearance: { title: 'ظاهر', description: 'حالت نمایش و قلم نوشته‌های میکی' },
  asr: { title: 'شنیدن', description: 'میکروفن و مدل تبدیل صدای تو به متن' },
  llm: {
    title: 'مغز (مدل AI)',
    description: 'مدلی که فکر می‌کند، ابزار به کار می‌گیرد و جواب می‌دهد'
  },
  tts: { title: 'حرف‌زدن', description: 'صدا و دستگاهی که جواب‌های میکی را پخش می‌کند' },
  search: {
    title: 'جستجوی وب',
    description: 'سرویس‌هایی که میکی برای پیداکردن اطلاعات تازه به کار می‌گیرد'
  },
  soul: { title: 'آشنایی', description: 'شخصیت میکی و چیزهایی که از تو به یاد دارد' },
  skills: {
    title: 'مهارت‌ها',
    description: 'راهنماهای نصب‌شده‌ای که میکی فقط هنگام نیاز بارگذاری می‌کند'
  },
  tasks: {
    title: 'زمان‌بندی',
    description: 'چیزهایی که میکی سر وقت بهت می‌گه یا انجام می‌ده'
  },
  tools: {
    title: 'ابزارها و دسترسی‌ها',
    description: 'کنترل دیدن صفحه، کار با فایل‌ها و سیاست تأیید کارهای حساس'
  },
  history: {
    title: 'گفتگوها',
    description: 'متن گفتگوهایی که فقط روی همین دستگاه نگه داشته می‌شوند'
  },
  shortcuts: {
    title: 'میانبرها',
    description: 'میانبر دستیار، دیکته و عبارت بیدارباش'
  },
  version: {
    title: 'نسخه و تغییرات',
    description: 'نسخه نصب‌شده، تازه‌ترین انتشار و یادداشت تغییرات'
  },
  about: {
    title: 'میکی چطور کار می‌کند؟',
    description: 'از شنیدن صدای تو تا انجام کار و جواب‌دادن'
  }
}

const CORE_SETTINGS_TABS = [
  { id: 'asr', label: 'شنیدن', icon: Ear },
  { id: 'llm', label: 'مغز (مدل AI)', icon: BrainCircuit },
  { id: 'tts', label: 'حرف‌زدن', icon: Volume2 }
] satisfies ReadonlyArray<{ id: SettingsTab; label: string; icon: typeof Ear }>

const CAPABILITY_SETTINGS_TABS = [
  { id: 'soul', label: 'شخصیت', icon: Sparkles },
  { id: 'skills', label: 'مهارت‌ها', icon: Puzzle },
  { id: 'tasks', label: 'زمان‌بندی', icon: Clock },
  { id: 'tools', label: 'ابزارها', icon: ShieldCheck },
  { id: 'search', label: 'جستجوی وب', icon: Globe2 }
] satisfies ReadonlyArray<{ id: SettingsTab; label: string; icon: typeof Ear }>

const APP_SETTINGS_TABS = [
  { id: 'history', label: 'گفتگوها', icon: History },
  { id: 'shortcuts', label: 'میانبرها', icon: Keyboard },
  { id: 'appearance', label: 'ظاهر', icon: Palette },
  { id: 'version', label: 'نسخه و تغییرات', icon: BadgeInfo },
  { id: 'about', label: 'روش کار', icon: CircleHelp }
] satisfies ReadonlyArray<{ id: SettingsTab; label: string; icon: typeof Ear }>

const HOW_MICKY_WORKS = [
  {
    title: 'صدا را به متن تبدیل می‌کند',
    description:
      'مدل شنوا روی همین دستگاه صدایت را به متن تبدیل می‌کند؛ صدای خام برای تشخیص گفتار جایی فرستاده نمی‌شود.',
    icon: Mic
  },
  {
    title: 'درخواست را پردازش می‌کند',
    description:
      'مدل زبانی متن درخواست را می‌گیرد و در صورت نیاز ابزار مناسب را اجرا می‌کند. سرویس و مدل از تنظیمات قابل تغییرند.',
    icon: BrainCircuit
  },
  {
    title: 'پاسخ را می‌خواند',
    description: 'پاسخ صوتی اختیاری است. اگر روشن باشد، سرویس صدای انتخابی جواب میکی را می‌خواند.',
    icon: Volume2
  },
  {
    title: 'اطلاعات را روی دستگاه نگه می‌دارد',
    description:
      'پروفایل، حافظه و متن گفتگوها محلی ذخیره می‌شوند. از تنظیمات می‌توانی آن‌ها را ببینی یا پاک کنی.',
    icon: Database
  }
] as const

type SettingsViewProps = {
  snapshot: ModelsSnapshot | null
  ttsSnapshot: TtsSnapshot | null
  chatsSnapshot: ChatsSnapshot | null
  sessionActive: boolean
  settings: SettingsSnapshot | null
  appUpdate: AppUpdateSnapshot | null
  onBack: () => void
}

export function SettingsView({
  snapshot,
  ttsSnapshot,
  chatsSnapshot,
  sessionActive,
  settings,
  appUpdate,
  onBack
}: SettingsViewProps): React.JSX.Element {
  const [tab, setTab] = useState<SettingsTab>('asr')
  const llm = useLlm()
  const soul = useSoul()
  const skills = useSkills()
  const tasks = useTasks()
  const audioDevices = useAudioDevices()
  const webSearch = useWebSearch()

  return (
    <main className="voice-shell flex h-full min-h-0 flex-col overflow-hidden">
      <header className="app-titlebar flex shrink-0 items-center justify-center" aria-hidden="true">
        <MickyLogo className="size-5 opacity-55" />
      </header>
      <section className="flex shrink-0 items-center gap-2 px-4 pb-3">
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="بازگشت">
          <ArrowRight />
        </Button>
        <div className="flex min-w-0 flex-col">
          <h1 className="text-sm font-medium">تنظیمات</h1>
          <p className="text-[0.65rem] text-muted-foreground">همه‌چیز برای شنیدن و جواب‌دادن</p>
        </div>
      </section>

      <Tabs
        value={tab}
        orientation="vertical"
        onValueChange={(value) => setTab(value as SettingsTab)}
        className="min-h-0 flex-1 gap-0 overflow-hidden border-t border-border/40"
      >
        <TabsList
          className="settings-scrollbar flex h-full min-h-0 w-44 shrink-0 flex-col items-stretch justify-start overflow-x-hidden overflow-y-auto overscroll-contain rounded-none border-l border-border/50 bg-card/30 p-3 group-data-vertical/tabs:h-full group-data-vertical/tabs:min-h-0"
          aria-label="بخش‌های تنظیمات"
        >
          <p className="px-2 pb-1 text-[0.6rem] font-medium text-muted-foreground">بخش‌های اصلی</p>
          <div
            className="flex flex-col gap-1 rounded-xl border border-border/60 bg-muted/50 p-1.5"
            role="group"
            aria-label="بخش‌های اصلی میکی"
          >
            {CORE_SETTINGS_TABS.map(({ id, label, icon: Icon }) => (
              <TabsTrigger key={id} value={id} className="h-10 flex-none px-2.5">
                <Icon data-icon="inline-start" aria-hidden="true" />
                {label}
              </TabsTrigger>
            ))}
          </div>
          <Separator className="my-2" />
          <p className="px-2 pb-1 text-[0.6rem] font-medium text-muted-foreground">
            رفتار و توانایی‌ها
          </p>
          <div
            className="flex flex-col gap-1 rounded-xl border border-border/50 bg-muted/25 p-1.5"
            role="group"
            aria-label="تنظیمات رفتار و توانایی‌های میکی"
          >
            {CAPABILITY_SETTINGS_TABS.map(({ id, label, icon: Icon }) => (
              <TabsTrigger key={id} value={id} className="h-10 flex-none px-2.5">
                <Icon data-icon="inline-start" aria-hidden="true" />
                {label}
              </TabsTrigger>
            ))}
          </div>
          <Separator className="my-2" />
          <p className="px-2 pb-1 text-[0.6rem] font-medium text-muted-foreground">
            تنظیمات برنامه
          </p>
          {APP_SETTINGS_TABS.map(({ id, label, icon: Icon }) => (
            <TabsTrigger key={id} value={id} className="h-10 flex-none px-3">
              <Icon data-icon="inline-start" aria-hidden="true" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <SettingsTabPanel tab="asr">
          <div className="flex flex-col gap-3">
            <ShenavaModelHelp showFolderAction />
            <div className="flex flex-col gap-2">
              {(snapshot?.models ?? []).map((model) => (
                <ModelRow
                  key={model.id}
                  model={model}
                  active={(snapshot?.activeModelId ?? null) === model.id}
                  sessionActive={sessionActive}
                />
              ))}
            </div>
            <Separator />
            <AudioDeviceSettings settings={settings} devices={audioDevices} mode="input" compact />
          </div>
        </SettingsTabPanel>

        <SettingsTabPanel tab="llm">
          <LlmSettings snapshot={llm} />
        </SettingsTabPanel>

        <SettingsTabPanel tab="tts">
          <TtsSettings snapshot={ttsSnapshot} />
          <AudioDeviceSettings settings={settings} devices={audioDevices} mode="output" />
        </SettingsTabPanel>

        <SettingsTabPanel tab="soul">
          <PersonalitySettings snapshot={soul} />
        </SettingsTabPanel>

        <SettingsTabPanel tab="skills">
          <SkillsSettings snapshot={skills} />
        </SettingsTabPanel>

        <SettingsTabPanel tab="tasks">
          <TaskSettings snapshot={tasks} />
        </SettingsTabPanel>

        <SettingsTabPanel tab="tools">
          {settings ? <ToolsAndAccessSettings settings={settings} llm={llm} /> : null}
        </SettingsTabPanel>

        <SettingsTabPanel tab="search">
          <WebSearchSettings snapshot={webSearch} />
        </SettingsTabPanel>

        <SettingsTabPanel tab="history">
          {settings ? <HistorySettings settings={settings} chats={chatsSnapshot} /> : null}
        </SettingsTabPanel>

        <SettingsTabPanel tab="shortcuts">
          {settings ? <ShortcutSettings settings={settings} /> : null}
        </SettingsTabPanel>

        <SettingsTabPanel tab="appearance">
          {settings ? <AppearanceSettings settings={settings} /> : null}
        </SettingsTabPanel>

        <SettingsTabPanel tab="version">
          <AppVersionSettings snapshot={appUpdate} />
        </SettingsTabPanel>

        <SettingsTabPanel tab="about">
          <HowMickyWorks />
          {window.api.app.isDevelopment ? <DeveloperSettings /> : null}
        </SettingsTabPanel>
      </Tabs>
    </main>
  )
}

function SkillsSettings({ snapshot }: { snapshot: SkillsSnapshot | null }): React.JSX.Element {
  const skills = snapshot?.skills ?? []
  return (
    <div className="flex flex-col gap-3">
      <Card size="sm" className="bg-card/30">
        <CardHeader>
          <CardTitle id="skills-enabled-label">استفاده از مهارت‌ها</CardTitle>
          <CardDescription>
            میکی مهارت‌های همراه برنامه و نصب‌شده با skills.sh را پیدا می‌کند و راهنمای کامل هرکدام
            را فقط موقع نیاز می‌خواند
          </CardDescription>
          <CardAction>
            <Switch
              dir="ltr"
              checked={snapshot?.enabled !== false}
              aria-labelledby="skills-enabled-label"
              onCheckedChange={(enabled) => void window.api.skills.setEnabled(enabled)}
            />
          </CardAction>
        </CardHeader>
      </Card>

      <Card size="sm" className="bg-card/30">
        <CardHeader>
          <CardTitle>مهارت‌های پیدا‌شده</CardTitle>
          <CardDescription>
            {skills.length > 0
              ? `${skills.length.toLocaleString('fa-IR')} مهارت در دسترس`
              : 'پوشه‌های استاندارد skills.sh بررسی می‌شوند'}
          </CardDescription>
          <CardAction>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="بررسی دوباره مهارت‌ها"
              onClick={() => void window.api.skills.refresh()}
            >
              <RefreshCw />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {skills.length > 0 ? (
            <div className="flex flex-col">
              {skills.map((skill, index) => (
                <div
                  key={skill.id}
                  className={
                    skill.name === MICKY_APP_GUIDE_SKILL_NAME
                      ? 'rounded-xl border border-primary/25 bg-primary/5 px-3'
                      : undefined
                  }
                >
                  {index > 0 ? <Separator /> : null}
                  <Field
                    orientation="horizontal"
                    className={
                      skill.name === MICKY_APP_GUIDE_SKILL_NAME
                        ? 'py-3'
                        : 'py-3 first:pt-0 last:pb-0'
                    }
                  >
                    <FieldContent className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <FieldLabel htmlFor={`skill-${skill.id}`} dir="ltr">
                          {skill.name}
                        </FieldLabel>
                        <Badge
                          variant={
                            skill.name === MICKY_APP_GUIDE_SKILL_NAME ? 'default' : 'secondary'
                          }
                          className="text-[0.58rem]"
                        >
                          {skill.source}
                        </Badge>
                      </div>
                      {skill.name === MICKY_APP_GUIDE_SKILL_NAME ? (
                        <FieldDescription className="text-[0.68rem] leading-5">
                          از خود میکی دربارهٔ تنظیمات، مدل‌ها، کلیدهای API و روش کارش بپرس.
                        </FieldDescription>
                      ) : (
                        <FieldDescription className="line-clamp-2 text-[0.68rem] leading-5">
                          {skill.description}
                        </FieldDescription>
                      )}
                    </FieldContent>
                    <Switch
                      id={`skill-${skill.id}`}
                      dir="ltr"
                      checked={skill.enabled}
                      disabled={snapshot?.enabled === false}
                      onCheckedChange={(enabled) =>
                        void window.api.skills.setSkillEnabled(skill.id, enabled)
                      }
                    />
                  </Field>
                </div>
              ))}
            </div>
          ) : (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Puzzle />
                </EmptyMedia>
                <EmptyTitle>هنوز مهارتی نصب نشده</EmptyTitle>
                <EmptyDescription>
                  از skills.sh یک مهارت را برای Universal نصب کن؛ میکی خودش آن را پیدا می‌کند.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <code
                  className="w-full overflow-x-auto rounded-lg bg-muted px-3 py-2 text-[0.65rem]"
                  dir="ltr"
                >
                  npx skills add owner/repo -g -a universal
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void window.api.skills.openCatalog()}
                >
                  <ExternalLink data-icon="inline-start" />
                  دیدن skills.sh
                </Button>
              </EmptyContent>
            </Empty>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function SettingsTabPanel({
  tab,
  children
}: {
  tab: SettingsTab
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <TabsContent
      value={tab}
      className="settings-scrollbar min-h-0 min-w-0 overflow-y-auto overscroll-contain px-6 pb-8"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 pt-4">
        <TabIntro tab={tab} />
        {children}
      </div>
    </TabsContent>
  )
}

function ShortcutSettings({ settings }: { settings: SettingsSnapshot }): React.JSX.Element {
  const platform = window.api.app.platform
  return (
    <div className="flex flex-col gap-3">
      <Card size="sm" className="bg-card/30">
        <CardHeader>
          <CardTitle>فراخوانی سریع</CardTitle>
          <CardDescription>
            این میانبرها در همه برنامه‌ها و هنگام بسته‌بودن پنجره کار می‌کنند
          </CardDescription>
          <CardAction>
            <Badge variant="secondary" dir="ltr">
              {shortcutPlatformLabel(platform)}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <FieldGroup className="gap-4">
            <ShortcutField
              id="assistant-shortcut"
              label="دستیار میکی"
              description="پنجره کوچک میکی را با روش گفتگوی انتخاب‌شده باز می‌کند و گفتگوی فعلی را ادامه می‌دهد"
              value={settings.assistantShortcut}
              platform={platform}
              onChange={(value) => window.api.settings.setShortcut('assistant', value)}
            />
            <Separator />
            <ShortcutField
              id="new-chat-shortcut"
              label="گفتگوی تازه"
              description="گفتگوی فعلی را می‌بندد و میکی را با زمینه‌ای خالی باز می‌کند"
              value={settings.newChatShortcut}
              platform={platform}
              onChange={(value) => window.api.settings.setShortcut('newChat', value)}
            />
            <Separator />
            <ShortcutField
              id="dictation-shortcut"
              label="دیکته در برنامه فعال"
              description="صدایت را به متن تبدیل می‌کند و همان‌جا می‌نویسد"
              value={settings.dictationShortcut}
              platform={platform}
              onChange={(value) => window.api.settings.setShortcut('dictation', value)}
            />
            <Separator />
            <ShortcutField
              id="wake-word-shortcut"
              label="روشن یا خاموش کردن عبارت بیدارباش"
              description="شنیدن «هی میکی» را روشن یا خاموش می‌کند. میانبرهای دیگر فعال می‌مانند"
              value={settings.wakeWordShortcut}
              platform={platform}
              onChange={(value) => window.api.settings.setShortcut('wakeWord', value)}
            />
          </FieldGroup>
        </CardContent>
        <CardFooter className="gap-2 text-start">
          {settings.shortcutError ? (
            <>
              <CircleAlert className="size-4 shrink-0 text-destructive" aria-hidden="true" />
              <FieldError className="text-xs">{settings.shortcutError}</FieldError>
            </>
          ) : (
            <>
              <Keyboard className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <p className="text-xs leading-5 text-muted-foreground">
                روی کلیدها بزن و ترکیب تازه را همزمان فشار بده؛ با Esc لغوش کن
              </p>
            </>
          )}
        </CardFooter>
      </Card>

      <Card size="sm" className="bg-card/30">
        <CardHeader>
          <CardTitle id="flyover-input-label">روش گفتگو در پنجره کوچک</CardTitle>
          <CardDescription>
            وقتی با میانبر دستیار یا گفتگوی تازه، میکی را روی برنامه فعلی باز می‌کنی
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ToggleGroup
            value={[settings.flyoverInputMode]}
            multiple={false}
            variant="outline"
            spacing={2}
            className="w-full"
            aria-labelledby="flyover-input-label"
            onValueChange={(values) => {
              const mode = values.at(-1)
              if (mode === 'voice' || mode === 'typing' || mode === 'both') {
                void window.api.settings.setFlyoverInputMode(mode)
              }
            }}
          >
            <ToggleGroupItem value="voice" className="flex-1">
              <Mic data-icon="inline-start" />
              فقط صدا
            </ToggleGroupItem>
            <ToggleGroupItem value="typing" className="flex-1">
              <Keyboard data-icon="inline-start" />
              فقط تایپ
            </ToggleGroupItem>
            <ToggleGroupItem value="both" className="flex-1">
              <Sparkles data-icon="inline-start" />
              هر دو
            </ToggleGroupItem>
          </ToggleGroup>
        </CardContent>
        <CardFooter className="gap-2 text-start">
          <Keyboard className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="text-xs leading-5 text-muted-foreground">
            اگر در حالت «هر دو» شروع به نوشتن کنی، ادامه همان گفتگو تایپی می‌ماند و میکروفن دوباره
            روشن نمی‌شود
          </p>
        </CardFooter>
      </Card>

      <Card size="sm" className="bg-card/30">
        <CardHeader>
          <CardTitle>کار در پس‌زمینه</CardTitle>
          <CardDescription>شنیدن عبارت بیدارباش، دیکته و اجرای خودکار</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="gap-4">
            <SettingToggle
              id="wake-word-enabled"
              label="شنیدن «هی میکی»"
              description="تشخیص محلی عبارت بیدارباش را کنترل می‌کند. میانبر دستیار و دیکته فعال می‌مانند"
              enabled={settings.wakeWordEnabled}
              onChange={(enabled) => window.api.wakeWord.setEnabled(enabled)}
            />
            <Separator />
            <SettingToggle
              id="dictation-ai-cleanup"
              label="تمیزکردن متن با هوش مصنوعی"
              description="متن دیکته را پیش از چسباندن روان‌تر می‌کند"
              enabled={settings.dictationAiCleanup}
              onChange={(enabled) => window.api.settings.setDictationAiCleanup(enabled)}
            />
            <SettingToggle
              id="dictation-auto-paste"
              label="چسباندن خودکار متن"
              description="خروجی را مستقیم در برنامه فعال می‌چسباند"
              enabled={settings.dictationAutoPaste}
              onChange={(enabled) => window.api.settings.setDictationAutoPaste(enabled)}
            />
            <SettingToggle
              id="launch-at-login"
              label="اجرای میکی هنگام ورود"
              description="پس از ورود به سیستم، میکی در پس‌زمینه آماده می‌ماند"
              enabled={settings.launchAtLogin}
              onChange={(enabled) => window.api.settings.setLaunchAtLogin(enabled)}
            />
          </FieldGroup>
        </CardContent>
      </Card>
    </div>
  )
}

function HistorySettings({
  settings,
  chats
}: {
  settings: SettingsSnapshot
  chats: ChatsSnapshot | null
}): React.JSX.Element {
  const count = chats?.totalCount ?? 0
  return (
    <div className="flex flex-col gap-3">
      <Card size="sm" className="bg-card/30">
        <CardHeader>
          <CardTitle id="chat-history-label">ذخیره گفتگوها</CardTitle>
          <CardDescription>
            متن نهایی حرف‌های تو و جواب میکی را محلی نگه می‌دارد؛ صدای خام و خروجی ابزارها ذخیره
            نمی‌شوند
          </CardDescription>
          <CardAction>
            <Switch
              dir="ltr"
              checked={settings.chatHistoryEnabled}
              aria-labelledby="chat-history-label"
              onCheckedChange={(enabled) => void window.api.settings.setChatHistoryEnabled(enabled)}
            />
          </CardAction>
        </CardHeader>
      </Card>

      <Card size="sm" className="bg-card/30">
        <CardHeader>
          <CardTitle>پاک‌کردن تاریخچه</CardTitle>
          <CardDescription>
            {count > 0
              ? `${count.toLocaleString('fa-IR')} گفتگو روی این دستگاه است`
              : 'هنوز گفتگویی ذخیره نشده'}
          </CardDescription>
          <CardAction>
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button variant="destructive" size="sm" disabled={count === 0}>
                    <Trash2 data-icon="inline-start" />
                    پاک‌کردن همه
                  </Button>
                }
              />
              <AlertDialogContent size="sm">
                <AlertDialogHeader>
                  <AlertDialogTitle>همه گفتگوها حذف شوند؟</AlertDialogTitle>
                  <AlertDialogDescription>
                    این تاریخچه از دستگاه پاک می‌شود و میکی دیگر نمی‌تواند آن را پیدا کند.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>نه</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => void window.api.chats.clear()}
                  >
                    حذف همه
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardAction>
        </CardHeader>
      </Card>
    </div>
  )
}

function ShortcutField({
  id,
  label,
  description,
  value,
  platform,
  onChange
}: {
  id: string
  label: string
  description: string
  value: string
  platform: DesktopPlatform
  onChange: (value: string) => Promise<SettingsSnapshot>
}): React.JSX.Element {
  const [mode, setMode] = useState<'idle' | 'recording' | 'saving'>('idle')
  const [pressedKeys, setPressedKeys] = useState<string[]>([])
  const [saveFailed, setSaveFailed] = useState(false)
  const recording = mode === 'recording'
  const saving = mode === 'saving'
  const currentKeys = shortcutDisplayKeys(value, platform)
  const visibleKeys = recording && pressedKeys.length > 0 ? pressedKeys : currentKeys

  return (
    <Field orientation="responsive" data-invalid={saveFailed || undefined}>
      <FieldContent className="min-w-0">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <FieldDescription className="text-[0.68rem] leading-5">{description}</FieldDescription>
        {saveFailed ? <FieldError>ثبت میانبر ممکن نشد؛ دوباره امتحان کن.</FieldError> : null}
      </FieldContent>
      <Button
        id={id}
        type="button"
        variant={recording ? 'secondary' : 'outline'}
        size="lg"
        className="h-11 w-full justify-between @md/field-group:w-64"
        dir="ltr"
        disabled={saving}
        aria-pressed={recording}
        aria-invalid={saveFailed || undefined}
        aria-label={
          recording
            ? `در حال دریافت میانبر ${label}`
            : `تغییر میانبر ${label}؛ میانبر فعلی ${shortcutAccessibleLabel(value, platform)}`
        }
        onClick={() => {
          setSaveFailed(false)
          setPressedKeys([])
          setMode('recording')
        }}
        onBlur={() => {
          if (recording) {
            setPressedKeys([])
            setMode('idle')
          }
        }}
        onKeyDown={(event) => {
          if (!recording) return
          if (event.key === 'Tab') {
            setPressedKeys([])
            setMode('idle')
            return
          }
          event.preventDefault()
          if (event.key === 'Escape') {
            setPressedKeys([])
            setMode('idle')
            event.currentTarget.blur()
            return
          }
          setPressedKeys(shortcutPreviewKeys(event, platform))
          const accelerator = shortcutFromKeyboardEvent(event, platform)
          if (!accelerator) return
          setMode('saving')
          void onChange(accelerator)
            .then(() => {
              setPressedKeys([])
              setMode('idle')
            })
            .catch(() => {
              setPressedKeys([])
              setSaveFailed(true)
              setMode('idle')
            })
        }}
        onKeyUp={() => {
          if (recording) setPressedKeys([])
        }}
      >
        {recording && pressedKeys.length === 0 ? (
          <span className="text-xs text-muted-foreground" dir="rtl">
            ترکیب را فشار بده…
          </span>
        ) : (
          <KbdGroup aria-hidden="true">
            {visibleKeys.map((key, index) => (
              <Kbd key={`${key}-${index}`}>{key}</Kbd>
            ))}
          </KbdGroup>
        )}
        <span className="text-[0.65rem] text-muted-foreground" dir="rtl">
          {saving ? 'در حال ثبت…' : recording ? 'منتظر کلیدها' : 'تغییر'}
        </span>
      </Button>
    </Field>
  )
}

function SettingToggle({
  id,
  label,
  description,
  enabled,
  onChange
}: {
  id: string
  label: string
  description: string
  enabled: boolean
  onChange: (enabled: boolean) => Promise<unknown>
}): React.JSX.Element {
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)

  const handleChange = async (checked: boolean): Promise<void> => {
    if (saving) return
    setSaving(true)
    setSaveFailed(false)
    try {
      await onChange(checked)
    } catch (error) {
      console.error(`Failed to update setting "${id}":`, error)
      setSaveFailed(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <FieldDescription className="text-[0.68rem] leading-5">{description}</FieldDescription>
        {saveFailed ? <FieldError>ذخیره نشد. دوباره تلاش کن.</FieldError> : null}
      </FieldContent>
      <Switch
        id={id}
        dir="ltr"
        checked={enabled}
        disabled={saving}
        aria-invalid={saveFailed}
        onCheckedChange={(checked) => void handleChange(checked)}
      />
    </Field>
  )
}

function ToolsAndAccessSettings({
  settings,
  llm
}: {
  settings: SettingsSnapshot
  llm: LlmSnapshot | null
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <ScreenAccessSetting settings={settings} />
      {llm ? <VisionModelSetting settings={settings} llm={llm} /> : null}
      <SystemToolsSettings settings={settings} />
    </div>
  )
}

function ScreenAccessSetting({ settings }: { settings: SettingsSnapshot }): React.JSX.Element {
  const [status, setStatus] = useState<ScreenAccessStatus>('unknown')
  const platform = window.api.app.platform

  useEffect(() => {
    let active = true
    const refresh = (): void => {
      void window.api.settings.getScreenAccessStatus().then((next) => {
        if (active) setStatus(next)
      })
    }
    refresh()
    window.addEventListener('focus', refresh)
    return () => {
      active = false
      window.removeEventListener('focus', refresh)
    }
  }, [])

  const statusLabel =
    status === 'granted'
      ? 'اجازه سیستم داده شده'
      : status === 'not-required'
        ? 'آماده استفاده'
        : status === 'denied'
          ? 'اجازه سیستم خاموش است'
          : status === 'restricted'
            ? 'دسترسی محدود شده'
            : status === 'not-determined'
              ? 'هنوز اجازه داده نشده'
              : 'در حال بررسی دسترسی'
  const statusVariant: React.ComponentProps<typeof Badge>['variant'] =
    status === 'granted' || status === 'not-required'
      ? 'secondary'
      : status === 'denied' || status === 'restricted'
        ? 'destructive'
        : 'outline'
  const needsSystemPermission =
    platform === 'macos' && status !== 'granted' && status !== 'not-required'

  return (
    <Card size="sm" className="bg-card/30">
      <CardHeader>
        <CardTitle id="screen-access-label">دیدن صفحه</CardTitle>
        <CardDescription>
          فقط وقتی خودت مستقیم بخواهی، از نمایشگر فعال یک تصویر می‌گیرد و آن را برای تحلیل می‌فرستد
        </CardDescription>
        <CardAction>
          <Switch
            dir="ltr"
            checked={settings.screenAccessEnabled}
            aria-labelledby="screen-access-label"
            onCheckedChange={(enabled) => void window.api.settings.setScreenAccessEnabled(enabled)}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 p-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-background text-muted-foreground">
              <Monitor className="size-4" aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-xs font-medium">دسترسی ضبط صفحه در سیستم</span>
              <Badge variant={statusVariant}>{statusLabel}</Badge>
            </div>
          </div>
          {needsSystemPermission ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void window.api.settings.openScreenAccessSettings()}
            >
              <ExternalLink data-icon="inline-start" />
              تنظیمات سیستم
            </Button>
          ) : null}
        </div>
      </CardContent>
      <CardFooter className="gap-2 text-start">
        <LockKeyhole className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="text-xs leading-5 text-muted-foreground">
          تصویر ذخیره نمی‌شود و در هر درخواست فقط یک بار میکی می‌تواند صفحه را ببیند
        </p>
      </CardFooter>
    </Card>
  )
}

function VisionModelSetting({
  settings,
  llm
}: {
  settings: SettingsSnapshot
  llm: LlmSnapshot
}): React.JSX.Element {
  const models = llm.catalog.filter((model) => model.inputModalities.includes('image'))
  if (models.length === 0) return <></>
  return (
    <Card size="sm" className="bg-card/30">
      <CardHeader>
        <CardTitle>مدل دیدن صفحه</CardTitle>
        <CardDescription>تصویر صفحه فقط برای این مدل فرستاده می‌شود</CardDescription>
      </CardHeader>
      <CardContent>
        <Select
          value={settings.visionModelId}
          onValueChange={(value) => value && void window.api.settings.setVisionModel(value)}
        >
          <SelectTrigger className="w-full" aria-label="مدل دیدن صفحه">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {models.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  )
}

function HowMickyWorks(): React.JSX.Element {
  return (
    <Card size="sm" className="bg-card/30">
      <CardHeader>
        <CardTitle>یک چرخه ساده</CardTitle>
        <CardDescription>
          صدا همیشه جلوتر است؛ گفتگوهای قبلی فقط وقتی خودت بخواهی باز می‌شوند
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-4">
          {HOW_MICKY_WORKS.map(({ title, description, icon: Icon }, index) => (
            <li key={title} className="flex items-start gap-3 text-start">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <h3 className="text-sm font-medium">
                  <span className="sr-only">مرحله {index + 1}: </span>
                  {title}
                </h3>
                <p className="text-[0.68rem] leading-5 text-muted-foreground">{description}</p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

function DeveloperSettings(): React.JSX.Element {
  return (
    <Card size="sm" className="border-dashed bg-card/30">
      <CardHeader>
        <CardTitle>پیش‌نمایش راه‌اندازی</CardTitle>
        <CardDescription>
          راه‌اندازی را دوباره باز می‌کند. تنظیمات، مدل‌ها و اطلاعات فعلی پاک نمی‌شوند
        </CardDescription>
        <CardAction>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void window.api.soul.restartOnboarding()}
          >
            <RotateCcw data-icon="inline-start" />
            باز کردن راه‌اندازی
          </Button>
        </CardAction>
      </CardHeader>
    </Card>
  )
}

function TabIntro({ tab }: { tab: SettingsTab }): React.JSX.Element {
  return (
    <header className="flex flex-col gap-0.5 px-0.5 text-start">
      <h2 className="text-[0.95rem] font-medium tracking-[-0.02em]">{TAB_COPY[tab].title}</h2>
      <p className="text-[0.7rem] leading-5 text-muted-foreground">{TAB_COPY[tab].description}</p>
    </header>
  )
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} گیگابایت`
  return `${Math.round(bytes / 1_000_000)} مگابایت`
}

function ModelRow({
  model,
  active,
  sessionActive
}: {
  model: AsrModelView
  active: boolean
  sessionActive: boolean
}): React.JSX.Element {
  const progress =
    model.bytes > 0 ? Math.min(100, Math.round((model.bytesDownloaded / model.bytes) * 100)) : 0
  const installed = model.state === 'installed'
  const downloading = model.state === 'downloading'

  return (
    <article className="flex flex-col gap-2.5 rounded-xl border border-border/60 bg-card/30 px-3.5 py-3 text-start">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <h2 className="truncate text-sm font-medium">{model.label}</h2>
            {active && installed ? (
              <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="فعال" />
            ) : null}
          </div>
          <p className="text-[0.68rem] text-muted-foreground">
            {model.description} · دانلود {formatBytes(model.bytes)}
          </p>
          <p className="text-[0.64rem] text-muted-foreground/80">{model.systemHint}</p>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {downloading ? (
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              onClick={() => void window.api.models.cancel(model.id)}
              aria-label="لغو دانلود"
            >
              <X />
            </Button>
          ) : installed ? (
            <>
              {active ? null : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void window.api.models.setActive(model.id)}
                >
                  انتخاب
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                disabled={sessionActive && active}
                onClick={() => void window.api.models.remove(model.id)}
                aria-label="حذف مدل"
              >
                <Trash2 />
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => void window.api.models.download(model.id)}>
              <Download data-icon="inline-start" />
              {model.state === 'error' ? 'تلاش دوباره' : 'دانلود'}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            onClick={() => void window.api.models.openCard(model.cardUrl)}
            aria-label="صفحه مدل"
          >
            <ExternalLink />
          </Button>
        </div>
      </div>

      {downloading ? (
        <div className="flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[0.65rem] tabular-nums text-muted-foreground">{progress}٪</span>
        </div>
      ) : null}

      {model.error ? <p className="text-[0.7rem] text-destructive">{model.error}</p> : null}
    </article>
  )
}
