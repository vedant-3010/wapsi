import { Phone } from 'lucide-react'
import { motion } from 'motion/react'
import { forwardRef } from 'react'

import { Button } from '@/components/kit/Button'
import { Sparkline } from '@/components/kit/Sparkline'
import { StatusDot, type Tone } from '@/components/kit/StatusDot'
import { Waveform } from '@/components/kit/Waveform'
import { SPRING_PANEL, STAGGER } from '@/lib/motion'
import { signalsOf } from '@/lib/signals'
import type { DeviceStatus, RiskRow } from '@/lib/types'
import { LANGUAGE_NAMES } from '@/lib/types'
import { cn } from '@/lib/utils'

const STATUS: Partial<Record<DeviceStatus, { label: string; tone: Tone }>> = {
  fix_scheduled: { label: 'Fix scheduled', tone: 'warn' },
  awaiting_verification: { label: 'Awaiting payments', tone: 'warn' },
  handed_off: { label: 'With a person', tone: 'idle' },
}

/** Risk score as a ring: how full is how risky. */
function ScoreRing({ score }: { score: number }) {
  const r = 15
  const length = 2 * Math.PI * r
  const tone = score >= 70 ? 'text-danger' : score >= 40 ? 'text-warn' : 'text-fg-3'
  return (
    <div className="relative grid size-10 shrink-0 place-items-center" title={`Risk score ${score} of 100`}>
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="2.5" className="stroke-surface-3" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          className={cn('stroke-current transition-[stroke-dasharray] duration-700', tone)}
          strokeDasharray={`${(score / 100) * length} ${length}`}
        />
      </svg>
      <span className="font-mono text-[13px] font-medium text-fg-1 tabular-nums">{score}</span>
    </div>
  )
}

type QueueRowProps = {
  row: RiskRow
  index: number
  series: number[] | undefined
  onCall: boolean
  onCallClick: () => void
}

export const QueueRow = forwardRef<HTMLLIElement, QueueRowProps>(function QueueRow(
  { row, index, series, onCall, onCallClick },
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
      className={cn(
        'group relative flex items-center gap-3 rounded-[14px] px-3 py-3 transition-colors duration-150',
        onCall ? 'bg-paytm/[0.07]' : 'hover:bg-surface-2',
        holdout && 'opacity-70 hover:opacity-100',
      )}
    >
      {onCall && <motion.span layoutId="on-call-bar" className="absolute top-3 bottom-3 left-0 w-[3px] rounded-full bg-paytm" />}
      <ScoreRing score={row.risk_score} />

      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium text-fg-1">{row.name}</div>
        <div className="mt-0.5 text-[13px] text-fg-3">
          {row.area} · {LANGUAGE_NAMES[row.language]}
          {status && (
            <span className="ml-2 inline-flex items-center gap-1.5 text-fg-2">
              <StatusDot tone={status.tone} /> {status.label}
            </span>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {signalsOf(row).map(({ key, icon: Icon, label, title }) => (
            <span
              key={key}
              title={title}
              className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-1 px-1.5 py-0.5 font-mono text-[11px] text-fg-2"
            >
              <Icon className="size-3 text-fg-3" />
              {label}
            </span>
          ))}
        </div>
      </div>

      {series && (
        <Sparkline
          values={series}
          className="hidden text-fg-3 2xl:block"
          label={`QR payments, last ${series.length} days`}
        />
      )}

      <div className="flex w-[76px] shrink-0 justify-end">
        {onCall ? (
          <span className="caption flex flex-col items-center gap-1 text-paytm">
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
            onClick={onCallClick}
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
