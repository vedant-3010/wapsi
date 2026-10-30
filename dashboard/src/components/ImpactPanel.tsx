import { Panel } from '@/components/Panel'
import { formatPercent, formatRupees, formatUsd } from '@/lib/format'
import type { Kpis } from '@/lib/types'
import { cn } from '@/lib/utils'

function Meter({ label, value, accent }: { label: string; value: number | null; accent: boolean }) {
  return (
    <div title={value === null ? 'No devices yet' : `${label}: ${formatPercent(value)} recovered`}>
      <div className="flex items-baseline justify-between text-sm">
        <span>{label}</span>
        <span className="text-lg font-semibold tabular-nums">{value === null ? '—' : formatPercent(value)}</span>
      </div>
      {/* The track is a lighter step of the fill's own colour. */}
      <div className={cn('mt-1 h-2.5 overflow-hidden rounded-full', accent ? 'bg-primary/20' : 'bg-muted-foreground/20')}>
        <div
          className={cn('h-full rounded-full transition-[width] duration-300', accent ? 'bg-primary' : 'bg-muted-foreground')}
          style={{ width: `${Math.round((value ?? 0) * 100)}%` }}
        />
      </div>
    </div>
  )
}

// F11 (SPEC §10): Wapsi vs the holdout it never called, and what each save is worth.
export function ImpactPanel({ kpis }: { kpis: Kpis }) {
  return (
    <Panel title="Impact" aside={<span className="text-xs text-muted-foreground">simulated</span>}>
      <div className="text-sm text-muted-foreground">Recovery rate</div>
      <div className="mt-2 flex flex-col gap-3">
        <Meter label={`Called by Wapsi · n=${kpis.wapsiCount}`} value={kpis.wapsiRate} accent />
        <Meter label={`Holdout, not called · n=${kpis.holdoutCount}`} value={kpis.holdoutRate} accent={false} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3">
        <div>
          <dt className="text-sm text-muted-foreground">₹ retained</dt>
          <dd className="text-xl font-semibold tabular-nums">{formatRupees(kpis.retained)}</dd>
          <dd className="text-xs text-muted-foreground">subscription a month</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Cost per verified save</dt>
          <dd className="text-xl font-semibold tabular-nums">
            {kpis.costPerSaveUsd === null ? '—' : formatUsd(kpis.costPerSaveUsd)}
          </dd>
          <dd className="text-xs text-muted-foreground">Bolna call cost</dd>
        </div>
      </dl>
    </Panel>
  )
}
