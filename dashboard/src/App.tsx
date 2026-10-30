import { MotionConfig } from 'motion/react'
import { useState } from 'react'
import { Toaster, toast } from 'sonner'

import { LiveCall } from '@/components/call/LiveCall'
import { HandoffQueue } from '@/components/HandoffQueue'
import { ImpactPanel } from '@/components/ImpactPanel'
import { KpiStrip } from '@/components/KpiStrip'
import { QueuePanel } from '@/components/queue/QueuePanel'
import { SoundboxCard } from '@/components/SoundboxCard'
import { TopBar } from '@/components/TopBar'
import { isCallActive, useDashboard } from '@/hooks/useDashboard'
import { api } from '@/lib/api'
import type { Handoff, RiskRow } from '@/lib/types'

// One screen (SPEC §9). Reads come from Supabase; every button writes through the backend.
export default function App() {
  const dash = useDashboard()
  const [pending, setPending] = useState<string | null>(null)
  const [takingId, setTakingId] = useState<string | null>(null)
  const [failed, setFailed] = useState<{ key: string; at: number } | null>(null)

  async function act<T>(key: string, request: () => Promise<T>, message: (result: T) => string): Promise<boolean> {
    setPending(key)
    try {
      const result = await request()
      await dash.refresh() // confirm only once the screen shows it
      toast.success(message(result))
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
      setFailed({ key, at: Date.now() })
      return false
    } finally {
      setPending(null)
    }
  }

  const nameOf = (merchantId: string) => dash.queue.find((r) => r.merchant_id === merchantId)?.name ?? merchantId
  const callActive = isCallActive(dash.call)

  return (
    <MotionConfig reducedMotion="user">
      <div className="mx-auto flex min-h-svh max-w-[1720px] flex-col gap-4 px-4 pb-4 lg:h-svh lg:px-6 lg:pb-5">
        <TopBar
          pending={pending}
          failed={failed}
          callActive={callActive}
          realtime={dash.realtime}
          config={dash.config}
          onRun={() => void act('run', api.startRun, (r) => `Wapsi picked ${nameOf(r.merchant_id)} · ${r.reason}`)}
          onReset={() => void act('reset', api.resetDemo, () => 'Demo reset to the start')}
          onSimulate={() =>
            void act('simulate', api.simulateNextDay, (r) =>
              `Next day · ${r.recovered} verified save${r.recovered === 1 ? '' : 's'} · ` +
              `${r.holdout_recovered} holdout recovered on their own`)
          }
        />
        {dash.error && (
          <div className="rounded-control border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">
            Can’t read Supabase: {dash.error}
          </div>
        )}
        <KpiStrip kpis={dash.kpis} />
        <main className="grid flex-1 grid-cols-[minmax(0,1fr)] gap-4 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,0.92fr)]">
          <QueuePanel
            queue={dash.queue}
            series={dash.series}
            onCallMerchantId={callActive ? (dash.call?.merchant_id ?? null) : null}
            className="max-h-[75svh] lg:max-h-none"
            onCall={(row: RiskRow, phone: string) =>
              act('call', () => api.startCall(row.merchant_id, phone || undefined), () => `Calling ${row.name}`)
            }
          />
          <LiveCall call={dash.call} feed={dash.feed} active={callActive} className="min-h-[60svh] lg:min-h-0" />
          <div className="flex flex-col gap-4 lg:min-h-0 lg:overflow-y-auto [&>*]:shrink-0">
            <SoundboxCard
              device={dash.device}
              feed={dash.feed}
              series={dash.device ? dash.series[dash.device.id] : undefined}
              loaded={dash.loaded}
            />
            <HandoffQueue
              handoffs={dash.handoffs}
              takingId={takingId}
              onTake={async (h: Handoff) => {
                setTakingId(h.id)
                await act('take', () => api.takeHandoff(h.id), () => `You own ${h.merchants?.name ?? h.merchant_id} now`)
                setTakingId(null)
              }}
            />
            <ImpactPanel kpis={dash.kpis} />
          </div>
        </main>
      </div>
      <Toaster
        theme="dark"
        position="bottom-left"
        toastOptions={{
          classNames: {
            toast: '!glass-menu !rounded-card !border !border-line-strong !shadow-pop !text-fg-1 !font-sans !text-[15px]',
            description: '!text-fg-2',
          },
        }}
      />
    </MotionConfig>
  )
}
