import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'

import { Panel } from '@/components/Panel'
import { CallDialog } from '@/components/queue/CallDialog'
import { QueueRow } from '@/components/queue/QueueRow'
import { SPRING_PANEL } from '@/lib/motion'
import type { RiskRow } from '@/lib/types'
import { cn } from '@/lib/utils'

type Filter = 'all' | 'wapsi' | 'holdout'
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'wapsi', label: 'Wapsi' },
  { key: 'holdout', label: 'Holdout' },
]

type QueuePanelProps = {
  queue: RiskRow[]
  series: Record<string, number[]>
  onCallMerchantId: string | null
  className?: string
  onCall: (row: RiskRow, phone: string) => Promise<boolean>
}

function Segmented({ value, counts, onChange }: { value: Filter; counts: Record<Filter, number>; onChange: (f: Filter) => void }) {
  return (
    <div className="flex rounded-control border border-line bg-surface-1 p-0.5" role="tablist">
      {FILTERS.map((f) => (
        <button
          key={f.key}
          role="tab"
          aria-selected={value === f.key}
          onClick={() => onChange(f.key)}
          className={cn(
            'relative rounded-[8px] px-2.5 py-1 text-[13px] transition-colors duration-150 active:scale-[0.97]',
            value === f.key ? 'text-fg-1' : 'text-fg-3 hover:text-fg-2',
          )}
        >
          {value === f.key && (
            <motion.span layoutId="queue-filter" transition={SPRING_PANEL} className="absolute inset-0 rounded-[8px] bg-surface-3" />
          )}
          <span className="relative">
            {f.label} <span className="font-mono text-[11px] text-fg-3">{counts[f.key]}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

// F1. Sorted by risk score, then days silent. Call on a row is the backup to Start Wapsi's run.
export function QueuePanel({ queue, series, onCallMerchantId, className, onCall }: QueuePanelProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const [target, setTarget] = useState<RiskRow | null>(null)
  const counts = {
    all: queue.length,
    wapsi: queue.filter((r) => r.cohort === 'wapsi').length,
    holdout: queue.filter((r) => r.cohort === 'holdout').length,
  }
  const rows = filter === 'all' ? queue : queue.filter((r) => r.cohort === filter)

  return (
    <Panel
      title="At-risk queue"
      aside={<Segmented value={filter} counts={counts} onChange={setFilter} />}
      className={className}
      bodyClassName="px-2"
      scroll
    >
      {rows.length === 0 ? (
        <div className="px-3 py-10 text-center">
          <p className="font-serif text-2xl text-fg-1">Nothing at risk.</p>
          <p className="mt-1 text-sm text-fg-3">Every Soundbox in this view is speaking. Reset the demo to reseed.</p>
        </div>
      ) : (
        <ul>
          <AnimatePresence initial={false} mode="popLayout">
            {rows.map((row, i) => (
              <QueueRow
                key={row.device_id}
                row={row}
                index={i}
                series={series[row.device_id]}
                onCall={row.merchant_id === onCallMerchantId}
                onCallClick={() => setTarget(row)}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}
      <CallDialog target={target} onClose={() => setTarget(null)} onCall={onCall} />
    </Panel>
  )
}
