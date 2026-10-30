// Definitions: SPEC §10. Values load from Supabase in PLAN Phase 4.
const KPIS = ['At risk', 'Calls today', 'Verified saves', '₹ retained', 'Handoffs'] as const

export function KpiStrip() {
  return (
    <section className="grid grid-cols-2 gap-4 md:grid-cols-5">
      {KPIS.map((label) => (
        <div key={label} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="mt-1 text-3xl font-semibold tabular-nums">—</div>
        </div>
      ))}
    </section>
  )
}
