import type { Action } from '@/lib/types'

export type FeedParts = {
  title: string
  finding: string | null
  decision: string | null
  why: string | null
}

/**
 * Feed details are written as `<Step>: <finding> → <decision> (<why>)` (backend messages.py).
 * Split them so the screen can show the decision and the reason on their own lines.
 */
export function parseDetail(detail: string): FeedParts {
  let title = detail
  let body = ''
  const step = detail.match(/^([^:→]{2,60}): (.+)$/)
  if (step) {
    title = step[1]
    body = step[2]
  } else if (detail.includes(' → ')) {
    const at = detail.indexOf(' → ')
    title = detail.slice(0, at)
    body = detail.slice(at)
  }

  let why: string | null = null
  const reason = body.match(/^(.*) \(([^()]*)\)$/)
  if (reason) {
    body = reason[1]
    why = reason[2]
  }

  const arrow = body.indexOf(' → ')
  if (arrow < 0) return { title, finding: body.trim() || null, decision: null, why }
  return {
    title,
    finding: body.slice(0, arrow).trim() || null,
    decision: body.slice(arrow + 3).trim() || null,
    why,
  }
}

/** The amount a payments_resumed action announces, if the backend sent one. */
export function paymentAmount(action: Action): number {
  const amount = action.payload?.amount
  return typeof amount === 'number' ? amount : 0
}
