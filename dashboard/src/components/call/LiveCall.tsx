import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef } from 'react'

import { CallEmpty } from '@/components/call/CallEmpty'
import { FeedItem } from '@/components/call/FeedItem'
import { Transcript } from '@/components/call/Transcript'
import { StatusDot, type Tone } from '@/components/kit/StatusDot'
import { Waveform } from '@/components/kit/Waveform'
import { Panel } from '@/components/Panel'
import { useElapsed } from '@/hooks/useElapsed'
import { formatDuration, formatTime } from '@/lib/format'
import type { Action, Call } from '@/lib/types'
import { LANGUAGE_NAMES } from '@/lib/types'
import { cn } from '@/lib/utils'

// Bolna call states. Every state has a word; colour only adds to it.
const STATUS: Record<string, { label: string; tone: Tone }> = {
  queued: { label: 'Queued', tone: 'idle' },
  initiated: { label: 'Dialling', tone: 'warn' },
  ringing: { label: 'Ringing', tone: 'warn' },
  'in-progress': { label: 'On the call', tone: 'ok' },
  'call-disconnected': { label: 'Wrapping up', tone: 'paytm' },
  completed: { label: 'Completed', tone: 'paytm' },
  'no-answer': { label: 'No answer', tone: 'danger' },
  busy: { label: 'Busy', tone: 'danger' },
}

const OUTCOMES: Record<string, { label: string; tone: string }> = {
  fix_scheduled: { label: 'Technician booked', tone: 'border-paytm/35 text-paytm' },
  fixed_live: { label: 'Fixed during the call', tone: 'border-ok/40 text-ok' },
  statement_sent: { label: 'Statement sent', tone: 'border-paytm/35 text-paytm' },
  credit_applied: { label: 'Credit applied', tone: 'border-paytm/35 text-paytm' },
  handed_off: { label: 'Handed to a person', tone: 'border-warn/40 text-warn' },
  no_answer: { label: 'No answer', tone: 'border-danger/40 text-danger' },
}

/** +91 98765 43210 → +91 ••••• •3210 */
function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, '')
  return digits.length < 4 ? phone : `+${digits.slice(0, 2)} ••••• •${digits.slice(-4)}`
}

type LiveCallProps = { call: Call | null; feed: Action[]; active: boolean; className?: string }

// F5 + F6: the latest call, every step as it happens, and the transcript after hang-up.
export function LiveCall({ call, feed, active, className }: LiveCallProps) {
  const end = useRef<HTMLDivElement>(null)
  const elapsed = useElapsed(call?.started_at ?? null, active)
  useEffect(() => {
    // Follow the newest step inside the panel only; never scroll the page itself.
    const box = end.current?.closest<HTMLElement>('[data-scroll]')
    if (box && box.scrollHeight > box.clientHeight) box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' })
  }, [feed.length, active])

  if (!call) {
    return (
      <Panel title="Live call" className={className} scroll>
        <CallEmpty />
      </Panel>
    )
  }

  const status = STATUS[call.status] ?? { label: call.status.replace(/-/g, ' '), tone: 'danger' as const }
  const outcome = call.outcome ? OUTCOMES[call.outcome] : null
  const dryRun = call.bolna_execution_id?.startsWith('dry-')
  const speaking = active && call.status === 'in-progress'
  const ownerFirstName = call.merchants?.owner_name.split(' ')[0] ?? 'Merchant'

  return (
    <Panel
      title="Live call"
      className={className}
      scroll
      aside={
        <div className="flex items-center gap-2">
          {dryRun && <span className="caption rounded-full border border-warn/40 px-2 py-0.5 text-warn">Dry run</span>}
          <span className="inline-flex h-7 items-center gap-2 rounded-full border border-line bg-surface-1 px-3 text-[13px]">
            {speaking ? <Waveform live className="text-ok" /> : <StatusDot tone={status.tone} live={active} />}
            {status.label}
          </span>
        </div>
      }
    >
      <motion.div
        key={call.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-10 -mx-5 mb-4 border-b border-line bg-[#0a1023] px-5 pb-4"
      >
        <h3 className="font-serif text-[40px] leading-[1.05] tracking-tight">{call.merchants?.name ?? call.merchant_id}</h3>
        <div className="caption mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          {call.merchants && <span>{LANGUAGE_NAMES[call.merchants.language]}</span>}
          {call.merchants?.area && <span>· {call.merchants.area}</span>}
          <span>· {maskPhone(call.phone)}</span>
          <span>· {formatTime(call.started_at)}</span>
          <span className={cn('tabular-nums', active && 'text-fg-1')}>
            · {active ? formatDuration(elapsed) : call.duration_s ? formatDuration(call.duration_s) : '—'}
          </span>
        </div>
        {outcome && (
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={cn('mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px]', outcome.tone)}
          >
            <span className="caption text-current opacity-70">Outcome</span> {outcome.label}
          </motion.span>
        )}
      </motion.div>

      <ol>
        <AnimatePresence initial={false}>
          {feed.map((action, i) => (
            <FeedItem key={`${action.id}@${action.created_at}`} action={action} last={i === feed.length - 1 && !active} />
          ))}
        </AnimatePresence>
      </ol>

      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-3 pl-12 text-sm text-fg-3"
        >
          <span className="flex gap-1" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-1.5 rounded-full bg-paytm animate-dot" style={{ animationDelay: `${i * 160}ms` }} />
            ))}
          </span>
          {call.status === 'in-progress' ? 'Wapsi is talking with the merchant' : 'Connecting the call'}
        </motion.div>
      )}
      <div ref={end} />

      {!active && (call.summary || call.transcript || call.recording_url) && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 space-y-3 rounded-[14px] border border-line bg-surface-1 p-4"
        >
          {call.summary && (
            <div>
              <div className="caption mb-1">Call summary</div>
              <p className="font-serif text-xl leading-snug text-fg-1 italic">“{call.summary}”</p>
            </div>
          )}
          {call.recording_url && (
            <audio controls preload="none" src={call.recording_url} className="h-9 w-full accent-paytm" />
          )}
          {call.transcript && <Transcript transcript={call.transcript} ownerFirstName={ownerFirstName} />}
        </motion.div>
      )}
    </Panel>
  )
}
