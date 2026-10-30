import { useState } from 'react'
import { Toaster, toast } from 'sonner'

import { HandoffQueue } from '@/components/HandoffQueue'
import { ImpactPanel } from '@/components/ImpactPanel'
import { KpiStrip } from '@/components/KpiStrip'
import { LiveCall } from '@/components/LiveCall'
import { QueuePanel } from '@/components/QueuePanel'
import { Soundbox } from '@/components/Soundbox'
import { TopBar } from '@/components/TopBar'
import { isCallActive, useDashboard } from '@/hooks/useDashboard'
import { api } from '@/lib/api'
import type { Handoff, RiskRow } from '@/lib/types'

// One screen (SPEC §9). Reads come from Supabase; every button writes through the backend.
export default function App() {
  const dash = useDashboard()
  const [pending, setPending] = useState<string | null>(null)

  async function act<T>(key: string, request: () => Promise<T>, message: (result: T) => string): Promise<boolean> {
    setPending(key)
    try {
      const result = await request()
      toast.success(message(result))
      await dash.refresh()
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
      return false
    } finally {
      setPending(null)
    }
  }

  const nameOf = (merchantId: string) => dash.queue.find((r) => r.merchant_id === merchantId)?.name ?? merchantId

  return (
    <div className="flex min-h-svh flex-col gap-4 p-4 lg:h-svh lg:p-6">
      <TopBar
        pending={pending}
        callActive={isCallActive(dash.call)}
        realtime={dash.realtime}
        onRun={() => void act('run', api.startRun, (r) => `Wapsi picked ${nameOf(r.merchant_id)}: ${r.reason}`)}
        onReset={() => void act('reset', api.resetDemo, () => 'Demo reset')}
        onSimulate={() =>
          void act('simulate', api.simulateNextDay, (r) =>
            `Next day: ${r.recovered} verified save${r.recovered === 1 ? '' : 's'}, ` +
            `${r.holdout_recovered} holdout recovered on their own`)
        }
      />
      {dash.error && (
        <div className="rounded-lg bg-critical/15 px-4 py-2 text-sm text-critical">Can’t read Supabase: {dash.error}</div>
      )}
      <KpiStrip kpis={dash.kpis} />
      <main className="grid flex-1 gap-4 lg:min-h-0 lg:grid-cols-[1fr_1.35fr_1fr]">
        <QueuePanel
          queue={dash.queue}
          className="max-h-[70svh] lg:max-h-none"
          onCall={(row: RiskRow, phone: string) =>
            act('call', () => api.startCall(row.merchant_id, phone || undefined), () => `Calling ${row.name}`)
          }
        />
        <LiveCall call={dash.call} feed={dash.feed} className="max-h-[80svh] lg:max-h-none" />
        <div className="flex flex-col gap-4 lg:min-h-0 lg:overflow-y-auto">
          <Soundbox device={dash.device} feed={dash.feed} loaded={dash.loaded} />
          <HandoffQueue
            handoffs={dash.handoffs}
            pending={pending}
            onTake={(h: Handoff) =>
              void act('take', () => api.takeHandoff(h.id), () => `You took over ${h.merchants?.name ?? h.merchant_id}`)
            }
          />
          <ImpactPanel kpis={dash.kpis} />
        </div>
      </main>
      <Toaster theme="dark" position="top-center" richColors toastOptions={{ className: 'text-base' }} />
    </div>
  )
}
