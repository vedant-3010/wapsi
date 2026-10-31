import { CalendarClock, Phone } from 'lucide-react'
import { motion } from 'motion/react'
import { forwardRef } from 'react'

import { Button } from '@/components/kit/Button'
import { Sparkline } from '@/components/kit/Sparkline'
import { type Tone } from '@/components/kit/StatusDot'
import { TAG } from '@/lib/tones'
import { Waveform } from '@/components/kit/Waveform'
import { formatTime } from '@/lib/format'
import { SPRING_PANEL, STAGGER } from '@/lib/motion'
import { signalsOf } from '@/lib/signals'
import type { DeviceStatus, RiskRow } from '@/lib/types'
import { LANGUAGE_NAMES } from '@/lib/types'
import { cn } from '@/lib/utils'

const STATUS: Partial<Record<DeviceStatus, { label: string; tone: Tone }>> = {
  fix_scheduled: { label: 'Fix scheduled', tone: 'amber' },
  awaiting_verification: { label: 'Awaiting payments', tone: 'amber' },
  handed_off: { label: 'With a person', tone: 'idle' },
}

/** Risk score as a ring: how full is how risky. */
export function ScoreRing({ score, size = 40 }: { score: number; size?: number }) {
  const r = 15
  const length = 2 * Math.PI * r
  const tone = score >= 70 ? 'text-coral-mid' : score >= 40 ? 'text-amber-mid' : 'text-ink-4'
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} title={`Risk score ${score} of 100`}>
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3" className="stroke-paper-3" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          className={cn('stroke-current transition-[stroke-dasharray] duration-700', tone)}
          strokeDasharray={`${(score / 100) * length} ${length}`}
        />
      </svg>
      <span className="text-[13px] font-semibold text-ink-1 tabular-nums">{score}</span>
    </div>
  )
}

/** The warning signs as small chips; risk in coral, money matters in amber. */
export function SignalChips({ row }: { row: RiskRow }) {
  return (
    <div className="flex flex-wrap gap-1">
      {signalsOf(row).map(({ key, icon: Icon, label, title }) => (
        <span
          key={key}
          title={title}
          className="inline-flex items-center gap-1 rounded-full border border-line bg-paper px-2 py-0.5 text-[12px] text-ink-2"
        >
          <Icon className={cn('size-3', key === 'silent' || key === 'qr' ? 'text-coral' : 'text-amber')} />
          {label}
        </span>
      ))}
    </div>
  )
}

type QueueRowProps = {
  row: RiskRow
  index: number
  series: number[] | undefined
  onCall: boolean
  /** When Wapsi will call again after a missed call (F18). */
  retryAt?: string
  onOpen: () => void
  onCallClick: () => void
}

export const QueueRow = forwardRef<HTMLLIElement, QueueRowProps>(function QueueRow(
  { row, index, series, onCall, retryAt, onOpen, onCallClick },
  ref,
) {
  const status = STATUS[row.status]
  const holdout = row.cohort === 'holdout'
  return (
    <motion.li
      ref={ref}
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0, transition: { ...SPRING_PANEL, delay: Math.min(index, 12) * STAGGER } }}
      exit={{ opacity: 0, x: -16, transition: { duration: 0.2 } }}
      transition={SPRING_PANEL}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      tabIndex={0}
      aria-label={`${row.name}, risk ${row.risk_score}. Open details`}
      className={cn(
        'group relative flex cursor-pointer items-center gap-3.5 rounded-[16px] px-3 py-3 outline-none',
        'transition-[background-color,transform] duration-150 focus-visible:ring-2 focus-visible:ring-ink-1/20',
        onCall ? 'bg-sage-soft/70' : 'hover:bg-paper-2 active:scale-[0.99]',
      )}
    >
      {onCall && <motion.span layoutId="on-call-bar" className="absolute top-3 bottom-3 left-0 w-[3px] rounded-full bg-sage" />}
      <ScoreRing score={row.risk_score} />

      <div className={cn('min-w-0 flex-1', holdout && 'opacity-70')}>
        <div className="truncate text-[15px] font-semibold text-ink-1">{row.name}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-ink-3">
          {row.area} · {LANGUAGE_NAMES[row.language]}
          {status && <span className={cn('tag px-2 py-0 text-[12px] leading-5', TAG[status.tone])}>{status.label}</span>}
          {retryAt && (
            <span className={cn('tag gap-1 px-2 py-0 text-[12px] leading-5', TAG.sky)}>
              <CalendarClock className="size-3" />
              Retry {formatTime(retryAt)}
            </span>
          )}
        </div>
        <div className="mt-1.5">
          <SignalChips row={row} />
        </div>
      </div>

      {series && (
        <Sparkline values={series} className="hidden text-ink-4 2xl:block" label={`QR payments, last ${series.length} days`} />
      )}

      <div className="flex w-[78px] shrink-0 justify-end">
        {onCall ? (
          <span className="flex flex-col items-center gap-1 text-[12px] font-medium text-sage">
            <Waveform live />
            On call
          </span>
        ) : holdout ? (
          <span className="caption" title="Held out to measure what happens without Wapsi">
            Holdout
          </span>
        ) : (
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              onCallClick()
            }}
            className="pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 focus-visible:opacity-100"
            aria-label={`Call ${row.name}`}
          >
            <Phone />
            Call
          </Button>
        )}
      </div>
    </motion.li>
  )
})
