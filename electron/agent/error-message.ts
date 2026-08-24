const EMPTY_RESPONSE_MESSAGE =
  'از مدل پاسخی نگرفتم. دوباره امتحان کن؛ اگر تکرار شد، از تنظیمات یک مدل دیگر انتخاب کن.'

export function emptyResponseMessage(): string {
  return EMPTY_RESPONSE_MESSAGE
}

export function agentErrorMessage(cause: unknown): string {
  const message = errorText(cause)
  const normalized = message.toLowerCase()

  if (
    !message ||
    normalized.includes('no output generated') ||
    normalized.includes('empty response')
  ) {
    return EMPTY_RESPONSE_MESSAGE
  }
  if (/\b(401|403)\b|unauthorized|forbidden|api key|invalid key/.test(normalized)) {
    return 'اتصال به مدل تأیید نشد. کلید OpenRouter را در تنظیمات بررسی کن.'
  }
  if (/\b(429|503)\b|rate limit|quota|overloaded|capacity/.test(normalized)) {
    return 'مدل فعلاً در دسترس نیست یا شلوغ است. کمی بعد دوباره امتحان کن.'
  }
  if (/timeout|timed out|network|fetch failed|econn|enotfound/.test(normalized)) {
    return 'به مدل وصل نشدم. اینترنت و اتصال OpenRouter را بررسی کن و دوباره امتحان کن.'
  }
  if (/model.*not found|unknown model|does not exist/.test(normalized)) {
    return 'این مدل دیگر در دسترس نیست. از تنظیمات یک مدل دیگر انتخاب کن.'
  }

  return 'این بار جواب آماده نشد. دوباره امتحان کن؛ اگر تکرار شد، مدل را در تنظیمات عوض کن.'
}

export function errorText(cause: unknown): string {
  return cause instanceof Error && cause.message.trim() ? cause.message.trim() : ''
}
