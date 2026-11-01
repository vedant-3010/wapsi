import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef } from 'react'

import { CallEmpty } from '@/components/call/CallEmpty'
import { FeedItem } from '@/components/call/FeedItem'
import { Transcript } from '@/components/call/Transcript'
import { StatusDot, type Tone } from '@/components/kit/StatusDot'
import { TAG } from '@/lib/tones'
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
  initiated: { label: 'Dialling', tone: 'amber' },
  ringing: { label: 'Ringing', tone: 'amber' },
  'in-progress': { label: 'On the call', tone: 'sage' },
  'call-disconnected': { label: 'Wrapping up', tone: 'idle' },
  completed: { label: 'Completed', tone: 'idle' },
  'no-answer': { label: 'No answer', tone: 'coral' },
  busy: { label: 'Busy', tone: 'coral' },
}

const OUTCOMES: Record<string, { label: string; tone: Tone }> = {
  fix_scheduled: { label: 'Technician booked', tone: 'sage' },
  fixed_live: { label: 'Fixed during the call', tone: 'sage' },
  statement_sent: { label: 'Statement sent', tone: 'sage' },
  credit_applied: { label: 'Credit applied', tone: 'sage' },
  handed_off: { label: 'Handed to a person', tone: 'amber' },
  no_answer: { label: 'No answer', tone: 'coral' },
}

const MOODS: Record<string, { label: string; tone: Tone }> = {
  calm: { label: 'Calm', tone: 'sage' },
  confused: { label: 'Confused', tone: 'amber' },
  upset: { label: 'Upset', tone: 'coral' },
  angry: { label: 'Angry', tone: 'coral' },
}

/** +91 98765 43210 → "phone ending 3210" (the full number never goes on screen). */
function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, '')
  return digits.length < 4 ? phone : `phone ending ${digits.slice(-4)}`
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

  const dryRun = call.bolna_execution_id?.startsWith('dry-')
  // Still "queued" after the grace period: a dry run, or Bolna never dialled.
  const status =
    !active && call.status === 'queued'
      ? { label: dryRun ? 'No call placed' : 'Not connected', tone: 'idle' as const }
      : (STATUS[call.status] ?? { label: call.status.replace(/-/g, ' '), tone: 'coral' as const })
  const outcome = call.outcome ? OUTCOMES[call.outcome] : null
  // Bolna's post-call mood extraction, as the backend logged it (F19).
  const moodValue = feed.find((a) => a.type === 'mood_detected' && a.call_id === call.id)?.payload?.mood
  const mood = typeof moodValue === 'string' ? MOODS[moodValue] : undefined
  const speaking = active && call.status === 'in-progress'
  const ownerFirstName = call.merchants?.owner_name.split(' ')[0] ?? 'Merchant'

  return (
    <Panel
      title="Live call"
      className={className}
      scroll
      aside={
        <div className="flex items-center gap-2">
          {dryRun && <span className={cn('tag', TAG.amber)}>Dry run</span>}
          <span className={cn('tag', TAG[status.tone])}>
            {speaking ? <Waveform live /> : <StatusDot tone={status.tone} live={active} />}
            {status.label}
          </span>
        </div>
      }
    >
      <motion.div
        key={call.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-10 -mx-6 mb-5 border-b border-line bg-paper px-6 pb-5"
      >
        <h3 className="font-display text-[36px] leading-[1.05] font-bold tracking-tight">{call.merchants?.name ?? call.merchant_id}</h3>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[14px] text-ink-3">
          <span>
            {[
              call.merchants && `${ownerFirstName}, ${LANGUAGE_NAMES[call.merchants.language]}`,
              call.merchants?.area,
              maskPhone(call.phone),
              `started ${formatTime(call.started_at)}`,
            ].filter(Boolean).join('  ·  ')}
          </span>
          <span
            className={cn(
              'rounded-full px-2 py-px font-mono text-[13px] tabular-nums',
              active ? 'bg-sage-soft font-semibold text-sage' : 'bg-paper-3 text-ink-2',
            )}
          >
            {active ? formatDuration(elapsed) : call.duration_s ? formatDuration(call.duration_s) : '—'}
          </span>
        </div>
        {outcome && (
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={cn('tag mt-3', TAG[outcome.tone])}
          >
            Outcome · {outcome.label}
          </motion.span>
        )}
        {mood && (
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={cn('tag mt-3', outcome && 'ml-2', TAG[mood.tone])}
          >
            Mood · {mood.label}
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
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 pl-[52px] text-[14px] text-ink-3">
          <span className="flex gap-1" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-1.5 rounded-full bg-ink-3 animate-dot" style={{ animationDelay: `${i * 160}ms` }} />
            ))}
          </span>
          {dryRun
            ? call.status === 'in-progress'
              ? `Simulated call with ${ownerFirstName} · no phone rings`
              : 'Dry run: no phone rings'
            : call.status === 'in-progress'
              ? `Wapsi is talking with ${ownerFirstName}`
              : 'Connecting the call'}
        </motion.div>
      )}
      <div ref={end} />

      {!active && (call.summary || call.transcript || call.recording_url) && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 space-y-3 rounded-[18px] bg-paper-2 p-5"
        >
          {call.summary && (
            <div>
              <div className="caption mb-1">Call summary</div>
              <p className="text-[19px] leading-snug font-medium text-ink-1">“{call.summary}”</p>
            </div>
          )}
          {call.recording_url && <audio controls preload="none" src={call.recording_url} className="h-9 w-full" />}
          {call.transcript && <Transcript transcript={call.transcript} ownerFirstName={ownerFirstName} />}
        </motion.div>
      )}
    </Panel>
  )
}
