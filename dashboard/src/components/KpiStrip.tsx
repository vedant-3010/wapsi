import { motion } from 'motion/react'

import { formatRupees } from '@/lib/format'
import type { Kpis } from '@/lib/types'

// Definitions: SPEC §10. A value that changes ticks in, so judges see the KPI move.
export function KpiStrip({ kpis }: { kpis: Kpis }) {
  const tiles = [
    { label: 'At risk', value: String(kpis.atRisk) },
    { label: 'Calls today', value: String(kpis.callsToday) },
    { label: 'Verified saves', value: String(kpis.verifiedSaves) },
    { label: '₹ retained', value: formatRupees(kpis.retained), note: 'subscription a month' },
    { label: 'Handoffs', value: String(kpis.openHandoffs), note: 'open' },
  ]
  return (
    <section className="grid grid-cols-2 gap-4 md:grid-cols-5">
      {tiles.map(({ label, value, note }) => (
        <div key={label} className="rounded-xl bg-card px-5 py-4 ring-1 ring-foreground/10">
          <div className="text-sm text-muted-foreground">{label}</div>
          <motion.div
            key={value}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="mt-1 text-4xl font-semibold tabular-nums"
          >
            {value}
          </motion.div>
          {note && <div className="text-xs text-muted-foreground">{note}</div>}
        </div>
      ))}
    </section>
  )
}
