import {
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
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef } from 'react'

import { Panel } from '@/components/Panel'
import { Badge } from '@/components/ui/badge'
import { formatClock, formatDuration, formatTime } from '@/lib/format'
import type { Action, Actor, Call } from '@/lib/types'
import { LANGUAGE_NAMES } from '@/lib/types'
import { cn } from '@/lib/utils'

const ICONS: Record<string, LucideIcon> = {
  merchant_picked: Crosshair,
  call_started: PhoneOutgoing,
  diagnostics: Stethoscope,
  technician_booked: Wrench,
  statement_sent: FileText,
  device_restarted: RotateCw,
  credit_applied: BadgeIndianRupee,
  credit_refused: Ban,
  escalated: UsersRound,
  call_ended: PhoneOff,
  technician_visited: HardHat,
  payments_resumed: BadgeCheck,
  human_takeover: Hand,
}

const ACTOR_STYLES: Record<Actor, string> = {
  agent: 'text-primary',
  system: 'text-muted-foreground',
  human: 'text-warning',
}

// Bolna call states → pill. Status colours always come with a dot and a word.
const STATUS: Record<string, { label: string; tone: 'idle' | 'warn' | 'good' | 'done' | 'bad'; pulse?: boolean }> = {
  queued: { label: 'Queued', tone: 'idle' },
  initiated: { label: 'Dialling', tone: 'warn', pulse: true },
  ringing: { label: 'Ringing', tone: 'warn', pulse: true },
  'in-progress': { label: 'Live', tone: 'good', pulse: true },
  'call-disconnected': { label: 'Wrapping up', tone: 'done' },
  completed: { label: 'Completed', tone: 'done' },
  'no-answer': { label: 'No answer', tone: 'bad' },
  busy: { label: 'Busy', tone: 'bad' },
}
const TONES = {
  idle: 'bg-muted-foreground',
  warn: 'bg-warning',
  good: 'bg-good',
  done: 'bg-primary',
  bad: 'bg-critical',
}

/** "Diagnostics: speaker fault → booking a technician (why)" → [main, why]. */
function splitWhy(detail: string): [string, string | null] {
  const match = detail.match(/^(.*) \(([^()]*)\)$/)
  return match ? [match[1], match[2]] : [detail, null]
}

function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: 'Failed', tone: 'bad' as const }
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-sm font-medium">
      <span className={cn('size-2.5 rounded-full', TONES[s.tone], s.pulse && 'animate-pulse')} />
      {s.label}
    </span>
  )
}

function FeedItem({ action }: { action: Action }) {
  const Icon = ICONS[action.type] ?? CircleDot
  const [main, why] = splitWhy(action.detail)
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex gap-3 rounded-lg bg-secondary/60 px-4 py-3"
    >
      <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="leading-snug font-medium">{main}</p>
        {why && <p className="mt-0.5 text-sm text-muted-foreground">Why: {why}</p>}
      </div>
      <div className="shrink-0 text-right text-xs leading-5">
        <div className="text-muted-foreground tabular-nums">{formatClock(action.created_at)}</div>
        <div className={cn('font-medium capitalize', ACTOR_STYLES[action.actor])}>{action.actor}</div>
      </div>
    </motion.li>
  )
}

// F5 + F6: the latest call, its actions as they happen, and the transcript after hang-up.
export function LiveCall({ call, feed, className }: { call: Call | null; feed: Action[]; className?: string }) {
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [feed.length])

  if (!call) {
    return (
      <Panel title="Live call" className={className}>
        <p className="text-muted-foreground">
          Press <span className="font-medium text-foreground">Start Wapsi’s run</span>: Wapsi picks the riskiest merchant,
          calls, and every action it takes appears here with the reason.
        </p>
      </Panel>
    )
  }

  const dryRun = call.bolna_execution_id?.startsWith('dry-')
  return (
    <Panel
      title="Live call"
      className={className}
      scroll
      aside={
        <div className="flex items-center gap-2">
          {dryRun && <Badge variant="outline">Dry run</Badge>}
          <StatusPill status={call.status} />
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-2xl font-semibold">{call.merchants?.name ?? call.merchant_id}</div>
          <div className="text-sm text-muted-foreground">
            {call.merchants ? LANGUAGE_NAMES[call.merchants.language] : ''} · started {formatTime(call.started_at)}
            {call.duration_s ? ` · ${formatDuration(call.duration_s)}` : ''}
          </div>
        </div>
        {call.outcome && <Badge className="text-sm">{call.outcome.replace('_', ' ')}</Badge>}
      </div>

      <ol className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {feed.map((action) => (
            <FeedItem key={action.id} action={action} />
          ))}
        </AnimatePresence>
      </ol>
      <div ref={end} />

      {(call.summary || call.transcript) && (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          {call.summary && <p className="text-sm">{call.summary}</p>}
          {call.transcript && (
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">Transcript</summary>
              <pre className="mt-2 font-sans whitespace-pre-wrap text-muted-foreground">{call.transcript}</pre>
            </details>
          )}
        </div>
      )}
    </Panel>
  )
}
