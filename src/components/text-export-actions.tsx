import { Check, Copy, Download } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function TextExportActions({
  content,
  defaultName
}: {
  content: string
  defaultName: string
}): React.JSX.Element | null {
  const [copied, setCopied] = useState(false)
  const text = content.trim()
  if (!text) return null

  const copy = async (): Promise<void> => {
    try {
      const result = await window.api.app.copyText(content)
      if (!result.copied) return
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1_400)
    } catch {
      setCopied(false)
    }
  }

  const save = async (): Promise<void> => {
    await window.api.app.saveText({ content, defaultName })
  }

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => void copy()}
              aria-label="کپی متن"
            >
              {copied ? <Check /> : <Copy />}
            </Button>
          }
        />
        <TooltipContent side="bottom" dir="rtl">
          {copied ? 'کپی شد' : 'کپی'}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => void save()}
              aria-label="ذخیره مارک‌داون"
            >
              <Download />
            </Button>
          }
        />
        <TooltipContent side="bottom" dir="rtl">
          ذخیره مارک‌داون
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
