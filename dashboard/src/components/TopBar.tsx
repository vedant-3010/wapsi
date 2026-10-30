import { Clock, IndianRupee, ListChecks, LoaderCircle, Play, RotateCcw, ShieldCheck, SunMoon, Undo2 } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/kit/Button'
import { StatusDot } from '@/components/kit/StatusDot'
import { Waveform } from '@/components/kit/Waveform'
import { formatRupees } from '@/lib/format'
import type { PublicConfig } from '@/lib/types'
import { cn } from '@/lib/utils'

type TopBarProps = {
  pending: string | null
  failed: { key: string; at: number } | null
  callActive: boolean
  realtime: boolean
  config: PublicConfig | null
  onRun: () => void
  onReset: () => void
  onSimulate: () => void
}

function Spinner() {
  return <LoaderCircle className="animate-spin" />
}

function Wordmark() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-9 place-items-center rounded-[11px] bg-paytm text-paytm-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.35)]">
        <Undo2 className="size-5" strokeWidth={2.4} />
      </span>
      <div className="leading-none">
        <div className="font-serif text-[30px] leading-none tracking-tight">Wapsi</div>
        <div className="caption mt-1">Merchant recovery</div>
      </div>
    </div>
  )
}

function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex h-7 items-center gap-2 rounded-full border border-line px-3 text-[13px] text-fg-2', className)}>
      {children}
    </span>
  )
}

/** F15: what keeps real calls safe, always on screen. Never shows the numbers themselves. */
function SafetyStrip({ config }: { config: PublicConfig }) {
  const hours = config.calling_hours.replace('-', '–')
  const items = [
    { icon: ShieldCheck, text: `Calls only to ${config.allowed_numbers} allowlisted ${config.allowed_numbers === 1 ? 'number' : 'numbers'}` },
    { icon: Clock, text: `${hours} IST · ${config.within_calling_hours ? 'open now' : 'closed now'}`, warn: !config.within_calling_hours },
    { icon: IndianRupee, text: `Credit cap ${formatRupees(config.goodwill_cap)}` },
    { icon: ListChecks, text: 'Every action logged, with who did it' },
  ]
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
      <span className="caption text-fg-2">Safety</span>
      {items.map(({ icon: Icon, text, warn }) => (
        <span key={text} className={cn('caption inline-flex items-center gap-1.5', warn && 'text-warn')}>
          <Icon className="size-3.5" />
          {text}
        </span>
      ))}
    </div>
  )
}

export function TopBar({ pending, failed, callActive, realtime, config, onRun, onReset, onSimulate }: TopBarProps) {
  const busy = pending !== null
  return (
    <header className="glass-bar sticky top-0 z-20 -mx-4 border-b border-line px-4 pt-3 pb-2.5 lg:-mx-6 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-center gap-5">
          <Wordmark />
          <div className="flex items-center gap-2">
            <Pill>
              <StatusDot tone={realtime ? 'ok' : 'warn'} live={!realtime} />
              {realtime ? 'Live updates' : 'Reconnecting'}
            </Pill>
            {config && (
              <Pill className={config.dry_run ? 'border-warn/40 text-warn' : 'border-paytm/40 text-paytm'}>
                {config.dry_run ? 'Dry run · no real calls' : 'Real calls'}
              </Pill>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="ghost"
            disabled={busy}
            onClick={onReset}
            className={cn(failed?.key === 'reset' && 'animate-shake')}
            key={failed?.key === 'reset' ? failed.at : 'reset'}
          >
            {pending === 'reset' ? <Spinner /> : <RotateCcw />}
            Reset demo
          </Button>
          <Button
            disabled={busy}
            onClick={onSimulate}
            className={cn(failed?.key === 'simulate' && 'animate-shake')}
            key={failed?.key === 'simulate' ? failed.at : 'simulate'}
          >
            {pending === 'simulate' ? <Spinner /> : <SunMoon />}
            Simulate next day
          </Button>
          <Button
            variant="brand"
            size="lg"
            disabled={busy || callActive}
            onClick={onRun}
            className={cn('min-w-[200px]', failed?.key === 'run' && 'animate-shake')}
            key={failed?.key === 'run' ? failed.at : 'run'}
          >
            {pending === 'run' ? <Spinner /> : callActive ? <Waveform live /> : <Play className="fill-current" />}
            {callActive ? 'Wapsi is on a call' : 'Start Wapsi’s run'}
          </Button>
        </div>
      </div>
      {config && (
        <div className="mt-2.5 border-t border-line pt-2">
          <SafetyStrip config={config} />
        </div>
      )}
    </header>
  )
}
