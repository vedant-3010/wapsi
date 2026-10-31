import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'

import { Panel } from '@/components/Panel'
import { CallDialog } from '@/components/queue/CallDialog'
import { MerchantSheet } from '@/components/queue/MerchantSheet'
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
  retries: Record<string, string>
  className?: string
  onCall: (row: RiskRow, phone: string) => Promise<boolean>
}

function Segmented({ value, counts, onChange }: { value: Filter; counts: Record<Filter, number>; onChange: (f: Filter) => void }) {
  return (
    <div className="flex rounded-full bg-paper-3 p-1" role="tablist">
      {FILTERS.map((f) => (
        <button
          key={f.key}
          role="tab"
          aria-selected={value === f.key}
          onClick={() => onChange(f.key)}
          className={cn(
            'relative rounded-full px-3 py-1 text-[13px] font-medium transition-colors duration-150 active:scale-[0.97]',
            value === f.key ? 'text-ink-1' : 'text-ink-3 hover:text-ink-2',
          )}
        >
          {value === f.key && (
            <motion.span layoutId="queue-filter" transition={SPRING_PANEL} className="absolute inset-0 rounded-full bg-paper shadow-card" />
          )}
          <span className="relative">
            {f.label} <span className="text-ink-3 tabular-nums">{counts[f.key]}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

// F1. Sorted by risk score, then days silent. A row opens the merchant; Call is the backup to the run.
export function QueuePanel({ queue, series, onCallMerchantId, retries, className, onCall }: QueuePanelProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const [target, setTarget] = useState<RiskRow | null>(null)
  const [open, setOpen] = useState<RiskRow | null>(null)
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
      bodyClassName="px-3"
      scroll
    >
      {rows.length === 0 ? (
        <div className="px-3 py-12 text-center">
          <p className="font-display text-2xl font-bold text-ink-1">Nothing at risk.</p>
          <p className="mt-1 text-[15px] text-ink-3">Every Soundbox in this view is speaking. Reset the demo to reseed.</p>
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
                retryAt={retries[row.merchant_id]}
                onOpen={() => setOpen(row)}
                onCallClick={() => setTarget(row)}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}
      <MerchantSheet
        row={open}
        onClose={() => setOpen(null)}
        onCall={(row) => {
          setOpen(null)
          setTarget(row)
        }}
      />
      <CallDialog target={target} onClose={() => setTarget(null)} onCall={onCall} />
    </Panel>
  )
}
