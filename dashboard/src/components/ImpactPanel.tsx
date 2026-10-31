import { motion } from 'motion/react'

import { AnimatedNumber } from '@/components/kit/AnimatedNumber'
import { Panel } from '@/components/Panel'
import { formatPercent, formatRupees, formatUsd } from '@/lib/format'
import type { Kpis } from '@/lib/types'
import { cn } from '@/lib/utils'

const rupees = (n: number) => formatRupees(Math.round(n))

function Meter({ label, n, value, strong }: { label: string; n: number; value: number | null; strong: boolean }) {
  return (
    <div title={value === null ? 'No devices yet' : `${formatPercent(value)} of ${n} recovered`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[14px] text-ink-2">
          {label} <span className="text-[12px] text-ink-3">n={n}</span>
        </span>
        <span className={cn('font-display text-[26px] leading-none font-bold', strong ? 'text-ink-1' : 'text-ink-3')}>
          {value === null ? '—' : formatPercent(value)}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper-3">
        <motion.div
          className={cn('h-full rounded-full', strong ? 'bg-navy' : 'bg-ink-4')}
          initial={false}
          animate={{ width: `${Math.round((value ?? 0) * 100)}%` }}
          transition={{ type: 'spring', stiffness: 110, damping: 20 }}
        />
      </div>
    </div>
  )
}

// F11 (SPEC §10): merchants Wapsi called vs the holdout it never calls, and what a save is worth.
export function ImpactPanel({ kpis }: { kpis: Kpis }) {
  return (
    <Panel title="Impact" aside={<span className="caption">Simulated</span>}>
      <div className="flex flex-col gap-4">
        <Meter label="Called by Wapsi" n={kpis.wapsiCount} value={kpis.wapsiRate} strong />
        <Meter label="Holdout, not called" n={kpis.holdoutCount} value={kpis.holdoutRate} strong={false} />
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4">
        <div>
          <dt className="caption">₹ retained</dt>
          <dd className="mt-1 font-display text-[28px] leading-none font-bold">
            <AnimatedNumber value={kpis.retained} format={rupees} />
          </dd>
          <dd className="mt-1 text-[12px] text-ink-3">subscription a month</dd>
        </div>
        <div>
          <dt className="caption">Cost per save</dt>
          <dd className="mt-1 font-display text-[28px] leading-none font-bold tabular-nums">
            {kpis.costPerSaveUsd === null ? '—' : formatUsd(kpis.costPerSaveUsd)}
          </dd>
          <dd className="mt-1 text-[12px] text-ink-3">Bolna call cost</dd>
        </div>
      </dl>
    </Panel>
  )
}
