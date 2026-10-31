import { AnimatedNumber } from '@/components/kit/AnimatedNumber'
import { formatRupees } from '@/lib/format'
import type { Kpis } from '@/lib/types'
import { cn } from '@/lib/utils'

const plain = (n: number) => String(Math.round(n))
const rupees = (n: number) => formatRupees(Math.round(n))

// SPEC §10. Editorial numerals; the two outcome figures turn sage once they're above zero.
export function KpiStrip({ kpis }: { kpis: Kpis }) {
  const tiles = [
    { label: 'At risk', value: kpis.atRisk, note: 'Soundboxes in the queue', format: plain },
    { label: 'Calls today', value: kpis.callsToday, note: 'India time', format: plain },
    { label: 'Verified saves', value: kpis.verifiedSaves, note: 'payments resumed', format: plain, outcome: true },
    { label: '₹ retained', value: kpis.retained, note: 'subscription a month', format: rupees, outcome: true },
    { label: 'Handoffs', value: kpis.openHandoffs, note: 'waiting for a person', format: plain },
  ]
  return (
    <section className="card grid grid-cols-2 overflow-hidden rounded-card sm:grid-cols-3 lg:grid-cols-5 lg:divide-x lg:divide-line">
      {tiles.map((tile) => (
        <div key={tile.label} className="px-6 py-5">
          <div className="caption">{tile.label}</div>
          <AnimatedNumber
            value={tile.value}
            format={tile.format}
            className={cn(
              'mt-1 font-display text-[44px] leading-none font-bold tracking-tight transition-colors duration-500',
              tile.outcome && tile.value > 0 ? 'text-sage' : 'text-ink-1',
            )}
          />
          <div className="mt-1.5 text-[13px] text-ink-3">{tile.note}</div>
        </div>
      ))}
    </section>
  )
}
