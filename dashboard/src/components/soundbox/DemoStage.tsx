import { LoaderCircle, Play, SunMoon, Volume2, X } from 'lucide-react'
import type { ReactNode } from 'react'

import { LiveCall } from '@/components/call/LiveCall'
import { Button } from '@/components/kit/Button'
import { Waveform } from '@/components/kit/Waveform'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { Action, Call } from '@/lib/types'

type DemoStageProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The 3D Soundbox (or its 2D stand-in) and the confetti that goes with it. */
  model: ReactNode
  confetti: ReactNode
  deviceId: string
  name: string
  subtitle: string
  statusTag: ReactNode
  call: Call | null
  feed: Action[]
  callActive: boolean
  pending: string | null
  onRun: () => void
  onSimulate: () => void
  onReplay: (() => void) | null
}

/**
 * The demo view: the whole flagship in one place. The Soundbox turns on the left; the call plays out on
 * the right, every step with its reason; the run, the next day and the replay are buttons under the device.
 */
export function DemoStage({
  open, onOpenChange, model, confetti, deviceId, name, subtitle, statusTag,
  call, feed, callActive, pending, onRun, onSimulate, onReplay,
}: DemoStageProps) {
  const busy = pending !== null
  const spinner = <LoaderCircle className="animate-spin" />
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="h-[94vh] max-h-[94vh] w-[97vw] max-w-[1560px] gap-0 overflow-hidden rounded-dialog border border-line bg-paper p-0 shadow-pop sm:max-w-[1560px]">
        <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:grid-rows-1">
          <div className="relative flex min-h-0 flex-col bg-[radial-gradient(circle_at_50%_45%,#ffffff_0%,var(--color-canvas)_75%)]">
            <div className="flex items-start justify-between gap-4 px-8 pt-7">
              <div className="min-w-0">
                <div className="caption">Virtual Soundbox · {deviceId}</div>
                <DialogTitle className="mt-1 font-display text-[34px] leading-[1.1] font-bold tracking-tight">{name}</DialogTitle>
                <DialogDescription className="mt-1 text-[14px] text-ink-3">{subtitle}</DialogDescription>
              </div>
              <div className="mt-2 shrink-0 whitespace-nowrap">{statusTag}</div>
            </div>

            <div className="relative min-h-0 flex-1">
              {model}
              {confetti}
              <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-[13px] text-ink-3">
                Drag to turn · scroll to zoom
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-line bg-paper/80 px-8 py-5 backdrop-blur">
              {callActive ? (
                <span
                  role="status"
                  className="inline-flex h-12 min-w-[210px] items-center justify-center gap-2 rounded-control bg-sage-soft px-6 text-[15px] font-medium text-sage shadow-[4px_4px_0_0_var(--color-sage-mid)]"
                >
                  <Waveform live />
                  Wapsi is on a call
                </span>
              ) : (
                <Button variant="pop" size="lg" disabled={busy} onClick={onRun} className="min-w-[210px]">
                  {pending === 'run' ? spinner : <Play className="fill-current" />}
                  Start Wapsi’s run
                </Button>
              )}
              <Button size="lg" disabled={busy} onClick={onSimulate}>
                {pending === 'simulate' ? spinner : <SunMoon />}
                Simulate next day
              </Button>
              {onReplay && (
                <Button variant="ghost" size="lg" onClick={onReplay} title="Replay the announcement" aria-label="Replay the announcement">
                  <Volume2 />
                  Replay
                </Button>
              )}
              <DialogClose asChild>
                <Button variant="ghost" size="lg" className="ml-auto">
                  <X />
                  Close
                </Button>
              </DialogClose>
            </div>
          </div>

          <div className="min-h-0 border-t border-line md:border-t-0 md:border-l">
            <LiveCall call={call} feed={feed} active={callActive} className="h-full !rounded-none !border-0 !shadow-none" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
