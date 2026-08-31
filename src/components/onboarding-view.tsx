import {
  BrainCircuit,
  Check,
  ClipboardPaste,
  Clock,
  Database,
  Download,
  Ear,
  Eye,
  ExternalLink,
  Globe2,
  Keyboard,
  MessageCircleQuestion,
  MicOff,
  MousePointer2,
  PanelRightOpen,
  Puzzle,
  Sparkles,
  Volume2,
  Wrench,
  X,
  type LucideIcon
} from 'lucide-react'
import { useState } from 'react'
import { ThinkingOrb } from 'thinking-orbs'
import type { AsrModelView, ModelsSnapshot } from '@/lib/asr'
import {
  EMPTY_USER_PROFILE,
  parseUserProfileDraft,
  type LanguageMix,
  type PersonalityProfile,
  type ReplyLength,
  type UserProfileDraft
} from '@/lib/soul'
import type { TtsSnapshot } from '@/lib/tts'
import { Button } from '@/components/ui/button'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { LlmSettings } from '@/components/llm-settings'
import { MickyLogo } from '@/components/micky-logo'
import { ShenavaModelHelp } from '@/components/shenava-model-help'
import { AudioDeviceSettings } from '@/components/audio-device-settings'
import { useLlm } from '@/hooks/use-llm'
import { useAudioDevices } from '@/hooks/use-audio-devices'
import { useSkills } from '@/hooks/use-skills'
import { useWebSearch } from '@/hooks/use-web-search'
import {
  DEFAULT_ASSISTANT_SHORTCUT,
  DEFAULT_DICTATION_SHORTCUT,
  DEFAULT_WAKE_WORD_SHORTCUT,
  type SettingsSnapshot
} from '@/lib/settings'
import { shortcutDisplayKeys } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'

type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6

const SETUP_STEPS = 6

const PERSONALITY_PROFILES: Array<{
  id: PersonalityProfile
  label: string
  description: string
}> = [
  { id: 'balanced', label: 'متعادل', description: 'گرم، روشن و عمل‌گرا' },
  { id: 'direct', label: 'رک و مستقیم', description: 'سریع، قاطع و بدون حاشیه' },
  { id: 'thoughtful', label: 'هم‌فکر کنجکاو', description: 'فکری، پرسشگر و اهل کشف' },
  { id: 'playful', label: 'شوخ و پرانرژی', description: 'سبک، بامزه و سرزنده' }
]

type OnboardingViewProps = {
  models: ModelsSnapshot | null
  ttsSnapshot: TtsSnapshot | null
  existingUserMarkdown: string
  settings: SettingsSnapshot | null
  onFinished: (name: string) => void
}

export function OnboardingView({
  models,
  ttsSnapshot,
  existingUserMarkdown,
  settings,
  onFinished
}: OnboardingViewProps): React.JSX.Element {
  const llm = useLlm()
  const audioDevices = useAudioDevices()
  const skills = useSkills()
  const webSearch = useWebSearch()
  const [step, setStep] = useState<Step>(0)
  const [draft, setDraft] = useState<UserProfileDraft>(() =>
    existingUserMarkdown ? parseUserProfileDraft(existingUserMarkdown) : { ...EMPTY_USER_PROFILE }
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const patch = (update: Partial<UserProfileDraft>): void => {
    setDraft((current) => ({ ...current, ...update }))
  }

  const finish = async (): Promise<void> => {
    if (!installedModel) {
      setStep(2)
      setError('برای شروع، اول یک مدل شنیدن دانلود کن.')
      return
    }
    if (!llmReady) {
      setStep(3)
      setError('برای شروع، یک مدل هوش مصنوعی را کامل وصل و انتخاب کن.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await window.api.soul.completeOnboarding(draft)
      onFinished(draft.name.trim())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'راه‌اندازی ذخیره نشد. دوباره تلاش کن.')
    } finally {
      setBusy(false)
    }
  }

  const installedModel = models?.models.some((model) => model.state === 'installed') ?? false
  const llmReady = llm?.configured === true && !llm.error
  const ttsReady = ttsSnapshot?.enabled !== false && ttsSnapshot?.configured === true
  const canContinue = (step !== 2 || installedModel) && (step !== 3 || llmReady)

  const runOptionalSetup = async (action: () => Promise<unknown>): Promise<void> => {
    setError(null)
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'این تنظیم ذخیره نشد. دوباره تلاش کن.')
    }
  }

  return (
    <main className="voice-shell flex h-full min-h-0 flex-col overflow-hidden">
      <header className="app-titlebar flex shrink-0 items-center justify-center" aria-hidden="true">
        <MickyLogo className="size-5 opacity-55" />
      </header>

      {step > 0 ? (
        <div className="flex shrink-0 items-center gap-1.5 px-5 pb-3" aria-hidden="true">
          {Array.from({ length: SETUP_STEPS }, (_, index) => (
            <span
              key={index}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors',
                index < step ? 'bg-foreground/80' : 'bg-foreground/15'
              )}
            />
          ))}
        </div>
      ) : (
        <div className="h-3 shrink-0" />
      )}

      <section className="settings-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-3">
        {step === 0 ? <Welcome onStart={() => setStep(1)} /> : null}

        {step === 1 ? (
          <StepBody
            eyebrow="اول ببین چطور کار می‌کنم"
            title="من ۴ بخش ساده دارم"
            description="هر بخش یه کار انجام می‌ده و هر کدوم رو هر وقت بخوای می‌تونی عوض کنی."
          >
            <div className="grid grid-cols-2 gap-2">
              <BuildingBlock
                icon={Ear}
                title="شنیدن"
                description="صدات رو همین‌جا روی دستگاه به متن تبدیل می‌کنم"
                status={installedModel ? 'آماده' : 'باید دانلود بشه'}
                ready={installedModel}
              />
              <BuildingBlock
                icon={BrainCircuit}
                title="مغز (مدل AI)"
                description="منظورت رو می‌فهمم و جواب رو آماده می‌کنم"
                status={llmReady ? 'آماده' : 'آماده نیست'}
                ready={llmReady}
              />
              <BuildingBlock
                icon={Volume2}
                title="حرف‌زدن"
                description="اگه بخوای، جوابم رو با صدا برات می‌خونم"
                status={ttsReady ? 'آماده' : 'اختیاری'}
                ready={ttsReady}
              />
              <BuildingBlock
                icon={Database}
                title="اطلاعات محلی"
                description="پروفایل و گفت‌وگوهات رو روی دستگاه نگه می‌دارم"
                status="روی دستگاه"
                ready
              />
            </div>
            <p className="rounded-lg bg-foreground/5 px-3 py-2 text-[0.68rem] leading-5 text-muted-foreground">
              حالا فقط شنیدن و مغزم رو آماده می‌کنیم. حرف‌زدن اختیاریه و هر وقت بخوای می‌تونی روشنش
              کنی.
            </p>
          </StepBody>
        ) : null}

        {step === 2 ? (
          <StepBody
            eyebrow="اول گوش‌هام رو آماده کنیم"
            title="مدل شنیدن رو انتخاب کن"
            description="این مدل صدات رو همین‌جا روی دستگاه به متن تبدیل می‌کنه. فقط یه بار دانلودش کن؛ بعدش بدون اینترنت هم صدات رو می‌شنوم."
            topAligned
          >
            <div className="flex flex-col gap-2">
              {(models?.models ?? []).map((model) => (
                <SpeechModel
                  key={model.id}
                  model={model}
                  active={models?.activeModelId === model.id}
                />
              ))}
              {!models ? (
                <p className="rounded-xl border border-dashed border-border/60 px-3 py-5 text-center text-xs text-muted-foreground">
                  یه لحظه، دارم مدل‌های شنیدن رو پیدا می‌کنم…
                </p>
              ) : null}
              <ShenavaModelHelp />
              <details className="group rounded-xl border border-border/55 bg-card/25">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3 text-xs font-medium select-none">
                  <span>تنظیمات پیشرفتهٔ صدا</span>
                  <span className="text-[0.62rem] font-normal text-muted-foreground">
                    میکروفن و خروجی صدا
                  </span>
                </summary>
                <div className="border-t border-border/45 p-3">
                  <p className="mb-3 text-[0.65rem] leading-5 text-muted-foreground">
                    اگه مطمئن نیستی، پیش‌فرض سیستم بهترین انتخابه.
                  </p>
                  <AudioDeviceSettings settings={settings} devices={audioDevices} compact />
                </div>
              </details>
            </div>
          </StepBody>
        ) : null}

        {step === 3 ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 text-start">
            <StepHeading
              eyebrow="حالا مغزم رو انتخاب کن"
              title="با کدوم هوش مصنوعی فکر کنم؟"
              description="این مدل درخواستت رو می‌فهمه و جواب رو می‌سازه. یه مدل ابری یا محلی انتخاب کن؛ بعداً هم هر وقت بخوای می‌تونی عوضش کنی."
            />
            <div className="flex min-h-0 flex-1 flex-col">
              <LlmSettings snapshot={llm} compact />
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <StepBody
            eyebrow="آخرین مرحله"
            title="شخصیت، ابزارها و زمان‌بندی"
            description="لحن من رو برای خودت تنظیم کن و ببین چطور قابلیت‌های بیشتری بهم می‌دی. همه‌شون بعداً هم از تنظیمات قابل تغییرن."
            topAligned
          >
            <CapabilityGuide
              icon={Sparkles}
              title="شخصیت و آشنایی"
              status="همین‌جا تنظیمش کن"
              description="اسم و سبک جواب‌هام رو انتخاب کن؛ با گفت‌وگوهای بعدی هم کم‌کم بهتر می‌شناسمت."
            >
              <Field label="اسمت، اگه دوست داری">
                <TextField
                  value={draft.name}
                  placeholder="مثلاً مانی"
                  autoFocus
                  onChange={(name) => patch({ name })}
                />
              </Field>
              <Field label="چیزی هست که بهتره درباره‌ت بدونم؟">
                <TextAreaField
                  value={draft.about}
                  placeholder="مثلاً روی چه چیزی کار می‌کنی، چه چیزهایی برات مهمه، یا دوست داری چطور کمکت کنم…"
                  onChange={(about) => patch({ about })}
                />
              </Field>
              <Field label="دوست داری چه شخصیتی داشته باشم؟">
                <Choice
                  horizontal
                  options={PERSONALITY_PROFILES}
                  value={draft.personalityProfile}
                  onSelect={(personalityProfile: PersonalityProfile) =>
                    patch({ personalityProfile })
                  }
                />
              </Field>
              <Field label="اندازهٔ جواب‌ها">
                <Choice
                  horizontal
                  options={[
                    { id: 'short', label: 'کوتاه و مستقیم' },
                    { id: 'medium', label: 'با یه کم توضیح' }
                  ]}
                  value={draft.replyLength}
                  onSelect={(replyLength: ReplyLength) => patch({ replyLength })}
                />
              </Field>
              <Field label="زبان جواب‌هام">
                <Choice
                  horizontal
                  options={[
                    { id: 'mixed', label: 'فارسی، با واژه‌های انگلیسی لازم' },
                    { id: 'persian', label: 'فقط فارسی' }
                  ]}
                  value={draft.languageMix}
                  onSelect={(languageMix: LanguageMix) => patch({ languageMix })}
                />
              </Field>
            </CapabilityGuide>

            <CapabilityGuide
              icon={Globe2}
              title="جستجوی وب و ابزارها"
              status={webSearch?.toolAvailable ? 'جستجوی وب آماده' : 'اختیاری'}
              description="برای سؤال‌های تازه وب رو می‌گردم. ابزارهای دستگاه هم فقط با اجازهٔ تو کار می‌کنن و کارهای حساس تأیید می‌خوان."
              guide="راه ساده: Google محلی کلید نمی‌خواد. برای نتیجه‌های پایدارتر می‌تونی بعداً در تنظیمات کلید Exa یا Firecrawl اضافه کنی."
              action={
                webSearch?.toolAvailable
                  ? undefined
                  : {
                      label: 'روشن‌کردن جستجوی ساده',
                      onClick: () =>
                        void runOptionalSetup(() =>
                          window.api.webSearch.setProviderEnabled('google', true)
                        )
                    }
              }
            />

            <CapabilityGuide
              icon={Clock}
              title="زمان‌بندی"
              status="از گفتگو ساخته می‌شه"
              description="بگو کی یادت بندازم یا کی کاری انجام بدم. یادآوری فقط خبر می‌ده؛ کار رو سر وقت خودم انجام می‌دم و نتیجه‌ش، با هر فایلی که لازم باشه، می‌ره تو کارها."
              guide="لازم نیست چیزی نصب کنی. میکی باید باز باشه — حتی تو سینی کافیه. کارها مغز می‌خوان. از تنظیمات → زمان‌بندی می‌تونی ببینی، متوقف کنی یا حذف کنی."
            />

            <CapabilityGuide
              icon={Puzzle}
              title="مهارت‌ها"
              status={
                skills?.skills.length
                  ? `${skills.skills.length.toLocaleString('fa-IR')} مهارت پیدا شد`
                  : 'قابل اضافه‌شدن'
              }
              description="مهارت‌ها راهنمای انجام کارهای تخصصی‌ان؛ فقط وقتی لازم باشن خونده می‌شن و ظاهر میکی رو شلوغ نمی‌کنن."
              guide="از skills.sh یک مهارت Universal نصب کن؛ میکی پوشه‌های استاندارد رو پیدا می‌کنه و مهارت تازه رو از تنظیمات فعال می‌کنی."
              action={{
                label: 'دیدن skills.sh',
                onClick: () => void window.api.skills.openCatalog()
              }}
            />
          </StepBody>
        ) : null}

        {step === 5 ? (
          <UseCasesStep
            assistantShortcut={settings?.assistantShortcut ?? DEFAULT_ASSISTANT_SHORTCUT}
            dictationShortcut={settings?.dictationShortcut ?? DEFAULT_DICTATION_SHORTCUT}
            theme={settings?.theme === 'light' ? 'light' : 'dark'}
          />
        ) : null}

        {step === 6 ? (
          <ReadyStep
            name={draft.name}
            assistantShortcut={settings?.assistantShortcut ?? DEFAULT_ASSISTANT_SHORTCUT}
            dictationShortcut={settings?.dictationShortcut ?? DEFAULT_DICTATION_SHORTCUT}
            wakeWordShortcut={settings?.wakeWordShortcut ?? DEFAULT_WAKE_WORD_SHORTCUT}
          />
        ) : null}
      </section>

      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border/40 px-5 pt-3 pb-4">
        <p className="max-w-40 text-[0.62rem] leading-4 text-muted-foreground">
          {step === 2 && !installedModel
            ? 'برای ادامه، دانلود مدل شنیدن لازمه.'
            : step === 3 && !llmReady
              ? 'وقتی اتصال و مدل آماده بشن می‌تونی ادامه بدی.'
              : 'بعداً هم از تنظیمات می‌تونی همه‌چیز رو عوض کنی.'}
        </p>
        <div className="flex items-center gap-1.5">
          {step > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setStep((step - 1) as Step)}
            >
              قبلی
            </Button>
          ) : null}
          {step > 0 && step < 6 ? (
            <Button
              size="sm"
              disabled={busy || !canContinue}
              onClick={() => {
                setError(null)
                setStep((step + 1) as Step)
              }}
            >
              ادامه
            </Button>
          ) : step === 6 ? (
            <Button
              size="sm"
              disabled={busy || !installedModel || !llmReady}
              onClick={() => void finish()}
            >
              شروع کنیم
            </Button>
          ) : null}
        </div>
        {error ? (
          <p className="absolute right-5 bottom-16 left-5 rounded-lg bg-destructive/15 px-3 py-2 text-center text-[0.68rem] text-destructive">
            {error}
          </p>
        ) : null}
      </footer>
    </main>
  )
}

function Welcome({ onStart }: { onStart: () => void }): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col justify-center gap-7 text-start">
      <div className="flex flex-col gap-3">
        <MickyLogo className="mb-2 size-16 drop-shadow-[0_10px_24px_rgba(0,0,0,0.28)]" />
        <p className="text-[0.7rem] tracking-[0.12em] text-muted-foreground">میکی</p>
        <h1 className="text-[1.55rem] leading-9 font-medium tracking-[-0.045em]">
          سلام، من میکی‌ام.
        </h1>
        <p className="max-w-[19rem] text-[0.9rem] leading-7 text-muted-foreground">
          قراره دستیار فارسی جدیدت باشم. می‌تونی باهام حرف بزنی، سؤال بپرسی یا ازم بخوای کاری برات
          انجام بدم؛ هرجا هم بخوای، حرف‌هات رو برات می‌نویسم.
        </p>
        <p className="max-w-[19rem] text-[0.78rem] leading-6 text-muted-foreground">
          اول یه راه‌اندازی کوتاه داریم تا مدل‌ها و لحن جواب‌هام رو برای خودت تنظیم کنی.
        </p>
      </div>
      <div className="flex flex-col gap-2 text-[0.72rem] text-muted-foreground">
        <WelcomeHint icon={Ear}>برای بیدار کردنم بگو «هی میکی» یا «میکی»</WelcomeHint>
        <WelcomeHint icon={MousePointer2}>یا روی گوی بزن و شروع کن</WelcomeHint>
        <WelcomeHint icon={Keyboard}>از هر برنامه‌ای هم با میانبر باز می‌شم</WelcomeHint>
      </div>
      <Button className="self-start" onClick={onStart}>
        راه‌اندازی رو شروع کنیم
      </Button>
    </div>
  )
}

function WelcomeHint({
  icon: Icon,
  children
}: {
  icon: LucideIcon
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span className="grid size-7 place-items-center rounded-full bg-foreground/6">
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
      <span>{children}</span>
    </div>
  )
}

function StepBody({
  eyebrow,
  title,
  description,
  topAligned = false,
  children
}: {
  eyebrow: string
  title: string
  description: string
  topAligned?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-1 flex-col gap-5 text-start',
        topAligned ? 'pt-1' : 'justify-center pb-6'
      )}
    >
      <StepHeading eyebrow={eyebrow} title={title} description={description} />
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  )
}

function StepHeading({
  eyebrow,
  title,
  description
}: {
  eyebrow: string
  title: string
  description: string
}): React.JSX.Element {
  return (
    <header className="flex shrink-0 flex-col gap-1.5 text-start">
      <p className="text-[0.66rem] font-medium text-muted-foreground">{eyebrow}</p>
      <h1 className="text-[1.15rem] font-medium tracking-[-0.035em]">{title}</h1>
      <p className="text-[0.72rem] leading-5 text-muted-foreground">{description}</p>
    </header>
  )
}

function BuildingBlock({
  icon: Icon,
  title,
  description,
  status,
  ready
}: {
  icon: LucideIcon
  title: string
  description: string
  status: string
  ready: boolean
}): React.JSX.Element {
  return (
    <article className="flex min-h-32 flex-col rounded-xl border border-border/60 bg-card/30 p-3 text-start">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="grid size-8 place-items-center rounded-lg bg-foreground/7 text-muted-foreground">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <span
          className={cn('text-[0.58rem]', ready ? 'text-foreground/70' : 'text-muted-foreground')}
        >
          {status}
        </span>
      </div>
      <h2 className="text-xs font-medium">{title}</h2>
      <p className="mt-1 text-[0.64rem] leading-4.5 text-muted-foreground">{description}</p>
    </article>
  )
}

function SpeechModel({
  model,
  active
}: {
  model: AsrModelView
  active: boolean
}): React.JSX.Element {
  const progress =
    model.bytes > 0 ? Math.min(100, Math.round((model.bytesDownloaded / model.bytes) * 100)) : 0
  const installed = model.state === 'installed'
  const downloading = model.state === 'downloading'

  return (
    <article
      className={cn(
        'flex flex-col gap-2.5 rounded-xl border px-3.5 py-3 text-start',
        active && installed ? 'border-foreground/35 bg-foreground/7' : 'border-border/60 bg-card/30'
      )}
    >
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
          <Ear className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h2 className="truncate text-sm font-medium">{model.label}</h2>
            {model.isDefault ? (
              <span className="text-[0.58rem] text-muted-foreground">پیشنهاد من</span>
            ) : null}
          </div>
          <p className="text-[0.66rem] text-muted-foreground">
            {model.description} · دانلود {formatBytes(model.bytes)}
          </p>
          <p className="mt-0.5 text-[0.62rem] text-muted-foreground/80">{model.systemHint}</p>
        </div>
        {downloading ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="لغو دانلود"
            onClick={() => void window.api.models.cancel(model.id)}
          >
            <X />
          </Button>
        ) : installed ? (
          active ? (
            <Check className="size-4 text-foreground/70" aria-label="فعال" />
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void window.api.models.setActive(model.id)}
            >
              انتخاب
            </Button>
          )
        ) : (
          <Button size="sm" onClick={() => void window.api.models.download(model.id)}>
            <Download data-icon="inline-start" />
            {model.state === 'error' ? 'تلاش دوباره' : 'دانلود'}
          </Button>
        )}
      </div>
      {downloading ? (
        <div className="flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[0.62rem] tabular-nums text-muted-foreground">{progress}٪</span>
        </div>
      ) : null}
      {model.error ? <p className="text-[0.65rem] text-destructive">{model.error}</p> : null}
    </article>
  )
}

function UseCasesStep({
  assistantShortcut,
  dictationShortcut,
  theme
}: {
  assistantShortcut: string
  dictationShortcut: string
  theme: 'light' | 'dark'
}): React.JSX.Element {
  const assistantKeys = shortcutDisplayKeys(assistantShortcut, window.api.app.platform)
  const dictationKeys = shortcutDisplayKeys(dictationShortcut, window.api.app.platform)

  return (
    <StepBody
      eyebrow="میکی همه‌جا همراهته"
      title="هرجا هستی، صدام کن"
      description="لازم نیست برگردی به پنجرهٔ میکی. با میانبر منو روی برنامه‌ای که توش هستی بیار و همون‌جا حرفت رو بزن."
      topAligned
    >
      <div
        className="relative min-h-56 overflow-hidden rounded-2xl border border-white/10 bg-[#17191f]"
        aria-label="نمونهٔ بازشدن میکی روی یک برنامه"
      >
        <div className="absolute top-3 left-3 flex items-center gap-2 rounded-xl border border-white/15 bg-black/55 px-2.5 py-2 text-white shadow-lg backdrop-blur-lg">
          <Keyboard className="size-3.5 opacity-75" aria-hidden="true" />
          <span className="text-[0.61rem]">از هر برنامه‌ای بازش کن</span>
          <KbdGroup dir="ltr">
            {assistantKeys.map((key) => (
              <Kbd key={key} className="bg-white/15 text-white/80">
                {key}
              </Kbd>
            ))}
          </KbdGroup>
        </div>

        <section className="flyover-surface absolute right-2 bottom-2 left-2 flex flex-col gap-3 rounded-[1.5rem] border border-border/70 bg-card/95 px-3.5 py-3.5 shadow-2xl backdrop-blur-xl">
          <div className="flex w-full items-start gap-3.5">
            <span
              className="flyover-orb-well grid size-20 shrink-0 place-items-center rounded-full bg-foreground/10"
              data-active="true"
            >
              <ThinkingOrb
                state="listening"
                size={64}
                theme={theme}
                speed={1.2}
                aria-hidden="true"
              />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5 text-start">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[0.68rem] font-medium tracking-wide text-muted-foreground">
                  میکی
                </span>
                <span
                  className="flyover-status-dot size-1.5 shrink-0 rounded-full bg-foreground"
                  data-active="true"
                  aria-hidden="true"
                />
              </div>
              <p className="text-[0.9rem] leading-6">گوش می‌دم…</p>
              <p className="text-[0.66rem] text-muted-foreground">هر وقت آماده‌ای شروع کن</p>
            </div>
          </div>
        </section>
      </div>

      <section className="flex items-start gap-3 rounded-xl border border-border/55 bg-card/30 px-3.5 py-3 text-start">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-foreground/7 text-muted-foreground">
          <PanelRightOpen className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-medium">متن کامل گفتگو، هر وقت لازم داشتی</h2>
            <span className="shrink-0 text-[0.58rem] text-muted-foreground">جمع‌شدنی</span>
          </div>
          <p className="mt-1 text-[0.65rem] leading-5 text-muted-foreground">
            پنل گفتگو اول بسته‌ست. از دستگیرهٔ وسط لبه بازش کن تا جواب‌های کامل، کارها، جدول‌ها و
            تاریخچه رو بخونی یا تایپ کنی؛ بعد هم با همون دستگیره جمعش کن.
          </p>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <UseCaseCard icon={MessageCircleQuestion} title="سؤال بپرس" example="«فردا هوا چطوره؟»" />
        <UseCaseCard icon={Eye} title="صفحه رو نشونم بده" example="«ببین اینجا چه اتفاقی افتاده»" />
        <UseCaseCard icon={Wrench} title="یه کار بسپر" example="«این فایل رو برام پیدا کن»" />
        <UseCaseCard
          icon={Clock}
          title="سر وقت بسپار"
          example="«هر شب خبرها رو خلاصه کن»"
        />
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/55 bg-card/30 px-3.5 py-3">
        <div className="min-w-0 text-start">
          <h2 className="text-xs font-medium">دیکته در هر کادر متنی</h2>
          <p className="mt-1 text-[0.65rem] leading-5 text-muted-foreground">
            جای نوشتن رو انتخاب کن، میانبر رو بزن و طبیعی حرف بزن؛ میکی متن رو تمیز می‌کنه و همون‌جا
            می‌نویسه.
          </p>
        </div>
        <KbdGroup dir="ltr" className="shrink-0">
          {dictationKeys.map((key) => (
            <Kbd key={key}>{key}</Kbd>
          ))}
        </KbdGroup>
      </div>

      <p className="px-1 text-[0.63rem] leading-5 text-muted-foreground">
        دیدن صفحه فقط وقتی انجام می‌شه که خودت واضح از میکی بخوای نگاه کنه.
      </p>
    </StepBody>
  )
}

function UseCaseCard({
  icon: Icon,
  title,
  example
}: {
  icon: LucideIcon
  title: string
  example: string
}): React.JSX.Element {
  return (
    <article className="flex min-h-24 flex-col rounded-xl border border-border/55 bg-card/25 p-3 text-start">
      <Icon className="mb-3 size-4 text-muted-foreground" aria-hidden="true" />
      <h2 className="text-xs font-medium">{title}</h2>
      <p className="mt-1 text-[0.62rem] leading-4.5 text-muted-foreground">{example}</p>
    </article>
  )
}

function ReadyStep({
  name,
  assistantShortcut,
  dictationShortcut,
  wakeWordShortcut
}: {
  name: string
  assistantShortcut: string
  dictationShortcut: string
  wakeWordShortcut: string
}): React.JSX.Element {
  const assistantKeys = shortcutDisplayKeys(assistantShortcut, window.api.app.platform)
  const dictationKeys = shortcutDisplayKeys(dictationShortcut, window.api.app.platform)
  const wakeWordKeys = shortcutDisplayKeys(wakeWordShortcut, window.api.app.platform)
  return (
    <div className="flex flex-1 flex-col justify-center gap-6 pb-6 text-start">
      <div className="flex flex-col gap-3">
        <span className="grid size-12 place-items-center rounded-full bg-foreground text-background">
          <Check className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="mb-1 text-[0.66rem] text-muted-foreground">همه‌چی آماده‌ست</p>
          <h1 className="text-[1.35rem] font-medium tracking-[-0.04em]">
            {name.trim() ? `${name.trim()}، من آماده‌م.` : 'من آماده‌م.'}
          </h1>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <ReadyHint icon={Ear} title="با صدا بیدارم کن">
          بگو «هی میکی» یا «میکی». روی گوی هم می‌تونی بزنی.
        </ReadyHint>
        <ReadyHint icon={Keyboard} title="هرجا هستی، با میانبر بازَم کن">
          <span className="flex flex-wrap items-center gap-2">
            این میانبر منو باز می‌کنه
            <KbdGroup dir="ltr">
              {assistantKeys.map((key) => (
                <Kbd key={key}>{key}</Kbd>
              ))}
            </KbdGroup>
          </span>
        </ReadyHint>
        <ReadyHint icon={ClipboardPaste} title="به‌جای تایپ، دیکته کن">
          <span className="flex flex-wrap items-center gap-2">
            جای نوشتن رو انتخاب کن و این میانبر رو بزن
            <KbdGroup dir="ltr">
              {dictationKeys.map((key) => (
                <Kbd key={key}>{key}</Kbd>
              ))}
            </KbdGroup>
            حرفت به متن تبدیل می‌شه، کپی می‌شه و همون‌جا می‌چسبه.
          </span>
        </ReadyHint>
        <ReadyHint icon={MicOff} title="وقتی نمی‌خوای گوش کنم">
          <span className="flex flex-wrap items-center gap-2">
            شنیدن اسمم رو خاموش یا روشن کن
            <KbdGroup dir="ltr">
              {wakeWordKeys.map((key) => (
                <Kbd key={key}>{key}</Kbd>
              ))}
            </KbdGroup>
            میانبرهای دیگه هنوز کار می‌کنن.
          </span>
        </ReadyHint>
        <ReadyHint icon={Clock} title="سر وقت بگو یا کار بسپار">
          بگو کی یادت بندازم یا کی خلاصه و چک کنم. نتیجهٔ کارها تو پنل کارهاست؛ لیستش هم تو تنظیمات →
          زمان‌بندی.
        </ReadyHint>
        <ReadyHint icon={Volume2} title="بعداً نظرت عوض شد؟">
          تنظیمات همیشه در دسترسه؛ مدل‌ها، صدام و اطلاعاتی که ذخیره کردم همون‌جاست.
        </ReadyHint>
      </div>
    </div>
  )
}

function ReadyHint({
  icon: Icon,
  title,
  children
}: {
  icon: LucideIcon
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex gap-3 rounded-xl border border-border/50 bg-card/25 px-3 py-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="flex flex-col gap-0.5">
        <h2 className="text-xs font-medium">{title}</h2>
        <div className="text-[0.67rem] leading-5 text-muted-foreground">{children}</div>
      </div>
    </div>
  )
}

function CapabilityGuide({
  icon: Icon,
  title,
  status,
  description,
  guide,
  action,
  children
}: {
  icon: LucideIcon
  title: string
  status: string
  description: string
  guide?: string
  action?: { label: string; onClick: () => void }
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border/55 bg-card/25 p-3">
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-foreground/7 text-muted-foreground">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-medium">{title}</h2>
            <span className="shrink-0 text-[0.58rem] text-muted-foreground">{status}</span>
          </div>
          <p className="mt-1 text-[0.65rem] leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
      {children ? (
        <div className="flex flex-col gap-3 border-t border-border/40 pt-3">{children}</div>
      ) : null}
      {guide || action ? (
        <div className="flex items-end justify-between gap-3 border-t border-border/40 pt-2.5">
          {guide ? (
            <details className="group min-w-0 flex-1 text-[0.63rem] text-muted-foreground">
              <summary className="cursor-pointer select-none font-medium text-foreground/75">
                راهنمای راه‌اندازی
              </summary>
              <p className="mt-1.5 leading-5">{guide}</p>
            </details>
          ) : (
            <span />
          )}
          {action ? (
            <Button variant="outline" size="xs" className="shrink-0" onClick={action.onClick}>
              {action.label}
              {action.label.includes('skills.sh') ? <ExternalLink data-icon="inline-end" /> : null}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function Field({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2 text-start">
      <h2 className="text-xs font-medium">{label}</h2>
      {children}
    </div>
  )
}

function TextField({
  value,
  placeholder,
  autoFocus,
  onChange
}: {
  value: string
  placeholder: string
  autoFocus?: boolean
  onChange: (value: string) => void
}): React.JSX.Element {
  return (
    <input
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 rounded-lg border border-border/70 bg-background/40 px-3 text-sm outline-none focus-visible:border-ring"
    />
  )
}

function TextAreaField({
  value,
  placeholder,
  onChange
}: {
  value: string
  placeholder: string
  onChange: (value: string) => void
}): React.JSX.Element {
  return (
    <textarea
      value={value}
      placeholder={placeholder}
      maxLength={500}
      rows={3}
      onChange={(event) => onChange(event.target.value)}
      className="min-h-20 resize-none rounded-lg border border-border/70 bg-background/40 px-3 py-2.5 text-sm leading-6 outline-none focus-visible:border-ring"
    />
  )
}

function Choice<T extends string>({
  options,
  value,
  horizontal = false,
  onSelect
}: {
  options: Array<{ id: T; label: string; description?: string }>
  value: T
  horizontal?: boolean
  onSelect: (id: T) => void
}): React.JSX.Element {
  return (
    <div className={cn('grid gap-1.5', horizontal ? 'grid-cols-2' : 'grid-cols-1')}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onSelect(option.id)}
          className={cn(
            'min-h-9 rounded-lg border px-2.5 py-2 text-start text-[0.7rem] transition-colors',
            value === option.id
              ? 'border-foreground/40 bg-foreground/10 text-foreground'
              : 'border-border/60 bg-card/20 text-muted-foreground hover:bg-foreground/5'
          )}
        >
          <span className="block">{option.label}</span>
          {option.description ? (
            <span className="mt-0.5 block text-[0.6rem] leading-4 opacity-70">
              {option.description}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  )
}

function formatBytes(bytes: number): string {
  return `${Math.round(bytes / 1_000_000).toLocaleString('fa-IR')} مگابایت`
}
