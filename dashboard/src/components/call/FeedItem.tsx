import {
  ArrowRight,
  BadgeCheck,
  BadgeIndianRupee,
  Ban,
  CircleDot,
  Crosshair,
  FileText,
  Hand,
  HardHat,
  type LucideIcon,
  PhoneOff,
  PhoneOutgoing,
  RotateCw,
  Stethoscope,
  UsersRound,
  Wrench,
} from 'lucide-react'
import { motion } from 'motion/react'
import { forwardRef } from 'react'

import { parseDetail } from '@/lib/feed'
import { formatClock } from '@/lib/format'
import { SPRING_POP } from '@/lib/motion'
import type { Action, Actor } from '@/lib/types'
import { cn } from '@/lib/utils'

type Tone = 'paytm' | 'ok' | 'warn' | 'neutral'

const KIND: Record<string, { icon: LucideIcon; tone: Tone }> = {
  merchant_picked: { icon: Crosshair, tone: 'paytm' },
  call_started: { icon: PhoneOutgoing, tone: 'neutral' },
  diagnostics: { icon: Stethoscope, tone: 'paytm' },
  technician_booked: { icon: Wrench, tone: 'paytm' },
  statement_sent: { icon: FileText, tone: 'paytm' },
  device_restarted: { icon: RotateCw, tone: 'paytm' },
  credit_applied: { icon: BadgeIndianRupee, tone: 'paytm' },
  credit_refused: { icon: Ban, tone: 'warn' },
  escalated: { icon: UsersRound, tone: 'warn' },
  call_ended: { icon: PhoneOff, tone: 'neutral' },
  technician_visited: { icon: HardHat, tone: 'neutral' },
  payments_resumed: { icon: BadgeCheck, tone: 'ok' },
  human_takeover: { icon: Hand, tone: 'warn' },
}

const NODE: Record<Tone, string> = {
  paytm: 'border-paytm/35 bg-paytm/10 text-paytm',
  ok: 'border-ok/40 bg-ok/12 text-ok',
  warn: 'border-warn/40 bg-warn/12 text-warn',
  neutral: 'border-line-strong bg-surface-2 text-fg-2',
}

const ACTOR: Record<Actor, string> = { agent: 'text-paytm', system: 'text-fg-3', human: 'text-warn' }

type FeedItemProps = { action: Action; last: boolean }

/** One step on the call timeline: what Wapsi found → what it decided, and why. */
export const FeedItem = forwardRef<HTMLLIElement, FeedItemProps>(function FeedItem({ action, last }, ref) {
  const kind = KIND[action.type] ?? { icon: CircleDot, tone: 'neutral' as const }
  const Icon = kind.icon
  const { title, finding, decision, why } = parseDetail(action.detail)

  return (
    <motion.li
      ref={ref}
      layout="position"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_POP}
      className="relative pl-12"
    >
      {!last && <span className="absolute top-9 bottom-0 left-[15px] w-px bg-line-strong" aria-hidden />}
      <motion.span
        initial={{ scale: 0.4 }}
        animate={{ scale: 1 }}
        transition={SPRING_POP}
        className={cn('absolute top-0.5 left-0 grid size-8 place-items-center rounded-full border', NODE[kind.tone])}
      >
        <Icon className="size-4" />
      </motion.span>

      <div className="relative rounded-[12px] pb-5">
        {/* A new step glows once, then settles. */}
        <motion.span
          className="pointer-events-none absolute -inset-x-2 -top-1 bottom-3 rounded-[12px] bg-paytm/[0.07]"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.8, delay: 0.3 }}
          aria-hidden
        />
        <div className="relative flex items-baseline justify-between gap-3">
          <span className="text-[15px] font-medium text-fg-1">{title}</span>
          <span className="caption shrink-0 tabular-nums">
            {formatClock(action.created_at)} · <span className={ACTOR[action.actor]}>{action.actor}</span>
          </span>
        </div>
        {(finding || decision) && (
          <p className="relative mt-1 text-[17px] leading-snug">
            {finding && <span className="text-fg-2">{finding}</span>}
            {decision && (
              <>
                <ArrowRight className="mx-1.5 inline size-4 -translate-y-px text-paytm" aria-label="so" />
                <span className="font-medium text-fg-1">{decision}</span>
              </>
            )}
          </p>
        )}
        {why && (
          <p className="relative mt-1 text-sm text-fg-3">
            <span className="caption mr-1.5 text-fg-3">Why</span>
            {why}
          </p>
        )}
      </div>
    </motion.li>
  )
})
