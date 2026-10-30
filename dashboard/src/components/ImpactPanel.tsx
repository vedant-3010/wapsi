import { motion } from 'motion/react'

import { AnimatedNumber } from '@/components/kit/AnimatedNumber'
import { Panel } from '@/components/Panel'
import { formatPercent, formatRupees, formatUsd } from '@/lib/format'
import type { Kpis } from '@/lib/types'
import { cn } from '@/lib/utils'

const rupees = (n: number) => formatRupees(Math.round(n))

function Meter({ label, n, value, accent }: { label: string; n: number; value: number | null; accent: boolean }) {
  return (
    <div title={value === null ? 'No devices yet' : `${formatPercent(value)} of ${n} recovered`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[14px] text-fg-2">
          {label} <span className="font-mono text-[11px] text-fg-3">n={n}</span>
        </span>
        <span className={cn('font-mono text-lg font-medium tabular-nums', accent ? 'text-paytm' : 'text-fg-1')}>
          {value === null ? '—' : formatPercent(value)}
        </span>
      </div>
      {/* The track is a lighter step of the fill's own colour. */}
      <div className={cn('mt-1.5 h-2 overflow-hidden rounded-full', accent ? 'bg-paytm/15' : 'bg-fg-3/15')}>
        <motion.div
          className={cn('h-full rounded-full', accent ? 'bg-paytm' : 'bg-fg-3')}
          initial={false}
          animate={{ width: `${Math.round((value ?? 0) * 100)}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </div>
    </div>
  )
}

// F11 (SPEC §10): merchants Wapsi called vs the holdout it never calls, and what a save is worth.
export function ImpactPanel({ kpis }: { kpis: Kpis }) {
  return (
    <Panel title="Impact" aside={<span className="caption">Simulated</span>}>
      <div className="flex flex-col gap-3.5">
        <Meter label="Called by Wapsi" n={kpis.wapsiCount} value={kpis.wapsiRate} accent />
        <Meter label="Holdout, not called" n={kpis.holdoutCount} value={kpis.holdoutRate} accent={false} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-3.5">
        <div>
          <dt className="caption">₹ retained</dt>
          <dd className="mt-1 text-2xl font-semibold">
            <AnimatedNumber value={kpis.retained} format={rupees} />
          </dd>
          <dd className="text-[12px] text-fg-3">subscription a month</dd>
        </div>
        <div>
          <dt className="caption">Cost per save</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">
            {kpis.costPerSaveUsd === null ? '—' : formatUsd(kpis.costPerSaveUsd)}
          </dd>
          <dd className="text-[12px] text-fg-3">Bolna call cost</dd>
        </div>
      </dl>
    </Panel>
  )
}
