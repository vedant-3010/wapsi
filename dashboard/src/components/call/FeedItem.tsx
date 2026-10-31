import {
  ArrowRight,
  BadgeCheck,
  BadgeIndianRupee,
  Ban,
  BellRing,
  CalendarClock,
  CircleDot,
  Crosshair,
  FileText,
  Hand,
  HardHat,
  HeartPulse,
  type LucideIcon,
  MessageCircle,
  PhoneOff,
  PhoneOutgoing,
  RotateCw,
  ShieldCheck,
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

type Look = 'agent' | 'system' | 'good' | 'person'

const KIND: Record<string, { icon: LucideIcon; look: Look }> = {
  merchant_picked: { icon: Crosshair, look: 'agent' },
  call_started: { icon: PhoneOutgoing, look: 'system' },
  diagnostics: { icon: Stethoscope, look: 'agent' },
  technician_booked: { icon: Wrench, look: 'agent' },
  statement_sent: { icon: FileText, look: 'agent' },
  device_restarted: { icon: RotateCw, look: 'agent' },
  credit_applied: { icon: BadgeIndianRupee, look: 'agent' },
  credit_refused: { icon: Ban, look: 'person' },
  soundbox_tested: { icon: BellRing, look: 'agent' },
  escalated: { icon: UsersRound, look: 'person' },
  // the backend's rules held back something the AI asked for (backend wapsi/guardrails.py)
  guardrail: { icon: ShieldCheck, look: 'system' },
  call_ended: { icon: PhoneOff, look: 'system' },
  // after the call, on Wapsi's own initiative (backend wapsi/followups.py)
  whatsapp_sent: { icon: MessageCircle, look: 'agent' },
  retry_scheduled: { icon: CalendarClock, look: 'agent' },
  mood_detected: { icon: HeartPulse, look: 'system' },
  technician_visited: { icon: HardHat, look: 'system' },
  payments_resumed: { icon: BadgeCheck, look: 'good' },
  human_takeover: { icon: Hand, look: 'person' },
}

// Wapsi's own decisions are solid ink; everything else is a soft tag.
const NODE: Record<Look, string> = {
  agent: 'bg-navy text-white',
  system: 'bg-paper-3 text-ink-2',
  good: 'bg-sage-soft text-sage ring-1 ring-sage-mid/50',
  person: 'bg-amber-soft text-amber ring-1 ring-amber-mid/50',
}

const ACTOR: Record<Actor, string> = { agent: 'Wapsi', system: 'System', human: 'Person' }

type FeedItemProps = { action: Action; last: boolean }

/** One step on the call timeline: what Wapsi found → what it decided, and why. */
export const FeedItem = forwardRef<HTMLLIElement, FeedItemProps>(function FeedItem({ action, last }, ref) {
  const kind = KIND[action.type] ?? { icon: CircleDot, look: 'system' as const }
  const Icon = kind.icon
  const { title, finding, decision, why } = parseDetail(action.detail)

  return (
    <motion.li
      ref={ref}
      layout="position"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_POP}
      className="relative pl-[52px]"
    >
      {!last && <span className="absolute top-10 bottom-0 left-[17px] w-px bg-line-strong" aria-hidden />}
      <motion.span
        initial={{ scale: 0.4, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={SPRING_POP}
        className={cn('absolute top-0 left-0 grid size-9 place-items-center rounded-full', NODE[kind.look])}
      >
        <Icon className="size-4" />
      </motion.span>

      <div className="relative pb-6">
        {/* A new step is highlighted once, like a marker pen, then settles. */}
        <motion.span
          className="pointer-events-none absolute -inset-x-3 -top-1.5 bottom-3.5 rounded-[14px] bg-butter"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 2, delay: 0.4 }}
          aria-hidden
        />
        <div className="relative flex items-baseline justify-between gap-3">
          <span className="text-[15px] font-semibold text-ink-1">{title}</span>
          <span className="shrink-0 text-[12px] text-ink-3">
            <span className="font-mono tabular-nums">{formatClock(action.created_at)}</span> · {ACTOR[action.actor]}
          </span>
        </div>
        {(finding || decision) && (
          <p className="relative mt-1 text-[17px] leading-snug">
            {finding && <span className="text-ink-2">{finding}</span>}
            {decision && (
              <>
                <ArrowRight className="mx-1.5 inline size-4 -translate-y-px text-ink-4" aria-label="so" />
                <span className="font-semibold text-ink-1">{decision}</span>
              </>
            )}
          </p>
        )}
        {why && (
          <p className="relative mt-1.5 flex items-baseline gap-2 text-[14.5px] text-ink-2">
            <span className="rounded-md bg-paper-3 px-1.5 py-px text-[12px] font-medium text-ink-2">Why</span>
            {why}
          </p>
        )}
      </div>
    </motion.li>
  )
})
