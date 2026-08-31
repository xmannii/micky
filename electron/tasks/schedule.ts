type CronFields = {
  minutes: Set<number>
  hours: Set<number>
  daysOfMonth: Set<number>
  months: Set<number>
  daysOfWeek: Set<number>
  dayOfMonthStar: boolean
  dayOfWeekStar: boolean
}

type ZonedParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  weekday: number
}

const WEEKDAYS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
}

export function computeNextRun(input: {
  scheduleType: 'once' | 'recurring'
  status: 'active' | 'paused' | 'done' | 'missed'
  runAt: number | null
  cron: string | null
  timezone: string
  from: number
}): number | null {
  if (input.status !== 'active') return null
  if (input.scheduleType === 'once') {
    return input.runAt
  }
  if (!input.cron) return null
  return nextCronOccurrence(input.cron, input.timezone, input.from)
}

export function nextCronOccurrence(expr: string, timeZone: string, fromMs: number): number {
  const cron = parseCron(expr)
  assertTimeZone(timeZone)
  let cursor = addMinute(partsInZone(fromMs, timeZone))
  const endYear = cursor.year + 5

  while (cursor.year <= endYear) {
    if (!cron.months.has(cursor.month)) {
      cursor = { ...cursor, month: cursor.month + 1, day: 1, hour: 0, minute: 0 }
      cursor = normalizeDate(cursor)
      continue
    }
    if (!dayMatches(cron, cursor.day, weekdayInZone(cursor, timeZone))) {
      cursor = { ...cursor, day: cursor.day + 1, hour: 0, minute: 0 }
      cursor = normalizeDate(cursor)
      continue
    }
    if (!cron.hours.has(cursor.hour)) {
      cursor = { ...cursor, hour: cursor.hour + 1, minute: 0 }
      cursor = normalizeDate(cursor)
      continue
    }
    if (!cron.minutes.has(cursor.minute)) {
      cursor = addMinute(cursor)
      continue
    }
    return zonedLocalToUtc(cursor, timeZone)
  }

  throw new Error(`No occurrence of cron "${expr}" in ${timeZone} within 5 years.`)
}

export function parseCron(expr: string): CronFields {
  const fields = expr.trim().split(/\s+/u)
  if (fields.length !== 5) {
    throw new Error('Cron must have 5 fields: minute hour day-of-month month day-of-week.')
  }
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields
  const daysOfWeek = parseField(dayOfWeek, 0, 7)
  if (daysOfWeek.has(7)) {
    daysOfWeek.add(0)
    daysOfWeek.delete(7)
  }
  return {
    minutes: parseField(minute, 0, 59),
    hours: parseField(hour, 0, 23),
    daysOfMonth: parseField(dayOfMonth, 1, 31),
    months: parseField(month, 1, 12),
    daysOfWeek,
    dayOfMonthStar: dayOfMonth === '*',
    dayOfWeekStar: dayOfWeek === '*'
  }
}

function parseField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>()
  for (const part of field.split(',')) {
    const [rangeRaw, stepRaw] = part.split('/')
    const step = stepRaw == null || stepRaw === '' ? 1 : Number(stepRaw)
    if (!Number.isInteger(step) || step < 1) {
      throw new Error(`Invalid cron step in "${field}".`)
    }
    let start = min
    let end = max
    if (rangeRaw !== '*') {
      if (rangeRaw.includes('-')) {
        const [fromRaw, toRaw] = rangeRaw.split('-')
        start = Number(fromRaw)
        end = Number(toRaw)
      } else {
        start = Number(rangeRaw)
        end = stepRaw == null ? start : max
      }
    }
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < min ||
      end > max ||
      start > end
    ) {
      throw new Error(`Invalid cron field "${field}".`)
    }
    for (let value = start; value <= end; value += step) values.add(value)
  }
  if (values.size === 0) throw new Error(`Invalid cron field "${field}".`)
  return values
}

function dayMatches(cron: CronFields, day: number, weekday: number): boolean {
  const dom = cron.daysOfMonth.has(day)
  const dow = cron.daysOfWeek.has(weekday)
  if (cron.dayOfMonthStar && cron.dayOfWeekStar) return true
  if (cron.dayOfMonthStar) return dow
  if (cron.dayOfWeekStar) return dom
  return dom || dow
}

function partsInZone(ms: number, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short'
  })
  const parts = formatter.formatToParts(new Date(ms))
  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? ''
  let hour = Number(read('hour'))
  if (hour === 24) hour = 0
  const weekdayName = read('weekday')
  const weekday = WEEKDAYS[weekdayName]
  if (weekday == null) throw new Error(`Unknown weekday ${weekdayName} in ${timeZone}.`)
  return {
    year: Number(read('year')),
    month: Number(read('month')),
    day: Number(read('day')),
    hour,
    minute: Number(read('minute')),
    weekday
  }
}

function weekdayInZone(parts: Omit<ZonedParts, 'weekday'>, timeZone: string): number {
  return partsInZone(zonedLocalToUtc(parts, timeZone), timeZone).weekday
}

function zonedLocalToUtc(
  parts: Pick<ZonedParts, 'year' | 'month' | 'day' | 'hour' | 'minute'>,
  timeZone: string
): number {
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
  const offset = zoneOffsetMs(asUtc, timeZone)
  const instant = asUtc - offset
  const shifted = zoneOffsetMs(instant, timeZone)
  if (shifted === offset) return instant
  return asUtc - shifted
}

function zoneOffsetMs(ms: number, timeZone: string): number {
  const local = partsInZone(ms, timeZone)
  const asUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute)
  return asUtc - ms
}

function addMinute(parts: ZonedParts): ZonedParts {
  return normalizeDate({ ...parts, minute: parts.minute + 1 })
}

function normalizeDate(parts: ZonedParts): ZonedParts {
  let { year, month, day, hour, minute } = parts
  if (minute >= 60) {
    hour += Math.floor(minute / 60)
    minute %= 60
  }
  if (hour >= 24) {
    day += Math.floor(hour / 24)
    hour %= 24
  }
  while (month > 12) {
    month -= 12
    year += 1
  }
  while (day > daysInMonth(year, month)) {
    day -= daysInMonth(year, month)
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return { year, month, day, hour, minute, weekday: parts.weekday }
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function assertTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format()
  } catch {
    throw new Error(`Unknown timezone "${timeZone}".`)
  }
}
