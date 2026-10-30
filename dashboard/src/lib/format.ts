const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
const clock = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' })
const clockSeconds = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
})
const dayMonth = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' })
const isoDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }) // 2026-10-31

/** ₹18,450 — Indian digit grouping. */
export const formatRupees = (amount: number) => rupees.format(amount)

export const formatUsd = (amount: number) => usd.format(amount)

/** 2:05 pm — always Asia/Kolkata, whatever the laptop's timezone. */
export const formatTime = (value: string | Date) => clock.format(new Date(value))

/** 2:05:09 pm, for the live feed. */
export const formatClock = (value: string | Date) => clockSeconds.format(new Date(value))

/** 26 Oct, 7:42 pm */
export const formatDayTime = (value: string | Date) => `${dayMonth.format(new Date(value))}, ${formatTime(value)}`

/** 1:42 */
export const formatDuration = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`

export const formatPercent = (ratio: number) => `${Math.round(ratio * 100)}%`

/** Midnight in Asia/Kolkata today, as an ISO timestamp ("Calls today", SPEC §10). */
export const startOfTodayIst = () => new Date(`${isoDay.format(new Date())}T00:00:00+05:30`).toISOString()

/** Whole days since a timestamp (like risk_queue's days_silent). */
export const daysSince = (value: string) => Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000))
