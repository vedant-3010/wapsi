import { Clock, IndianRupee, ListChecks, LoaderCircle, Play, RotateCcw, Scale, ShieldCheck, SunMoon, Undo2 } from 'lucide-react'

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
      <span className="relative grid size-10 place-items-center rounded-[13px] bg-ink-1 text-white">
        <Undo2 className="size-5" strokeWidth={2.4} />
        {/* the one fixed hint of Paytm blue */}
        <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-canvas bg-paytm" />
      </span>
      <div>
        <div className="font-serif text-[32px] leading-none tracking-tight">Wapsi</div>
        <div className="caption mt-0.5">Merchant recovery</div>
      </div>
    </div>
  )
}

/** F15: what keeps real calls safe, always on screen. Never shows the numbers themselves. */
function SafetyStrip({ config }: { config: PublicConfig }) {
  const hours = config.calling_hours.replace('-', '–')
  const items = [
    { icon: ShieldCheck, text: `Calls only ${config.allowed_numbers} allowlisted ${config.allowed_numbers === 1 ? 'number' : 'numbers'}` },
    { icon: Clock, text: `${hours} IST, ${config.within_calling_hours ? 'open now' : 'closed now'}`, warn: !config.within_calling_hours },
    { icon: IndianRupee, text: `Credit cap ${formatRupees(config.goodwill_cap)} a month` },
    { icon: Scale, text: 'Every AI step checked by fixed rules' },
    { icon: ListChecks, text: 'Every action logged with who did it' },
  ]
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-ink-3">
      <span className="font-semibold text-ink-2">Safety</span>
      {items.map(({ icon: Icon, text, warn }) => (
        <span key={text} className={cn('inline-flex items-center gap-1.5', warn && 'text-amber')}>
          <Icon className="size-3.5" />
          {text}
        </span>
      ))}
    </div>
  )
}

export function TopBar({ pending, failed, callActive, realtime, config, onRun, onReset, onSimulate }: TopBarProps) {
  const busy = pending !== null
  const shake = (key: string) => (failed?.key === key ? 'animate-shake' : '')
  return (
    <header className="sticky top-0 z-20 -mx-4 bg-canvas/85 px-4 pt-4 pb-3 backdrop-blur-md lg:-mx-8 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-center gap-6">
          <Wordmark />
          <div className="flex items-center gap-2">
            <span className="tag border border-line bg-paper text-ink-2">
              <StatusDot tone={realtime ? 'sage' : 'amber'} live={!realtime} />
              {realtime ? 'Live' : 'Reconnecting'}
            </span>
            {config && (
              <span className={cn('tag', config.dry_run ? 'bg-amber-soft text-amber' : 'bg-sage-soft text-sage')}>
                {config.dry_run ? 'Dry run · no real calls' : 'Real calls'}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" disabled={busy} onClick={onReset} className={shake('reset')} key={`reset-${failed?.at}`}>
            {pending === 'reset' ? <Spinner /> : <RotateCcw />}
            Reset demo
          </Button>
          <Button disabled={busy} onClick={onSimulate} className={shake('simulate')} key={`simulate-${failed?.at}`}>
            {pending === 'simulate' ? <Spinner /> : <SunMoon />}
            Simulate next day
          </Button>
          {callActive ? (
            <span
              role="status"
              className="ml-1 inline-flex h-12 min-w-[210px] items-center justify-center gap-2 rounded-control bg-sage-soft px-6 text-[15px] font-medium text-sage shadow-[4px_4px_0_0_var(--color-sage-mid)]"
            >
              <Waveform live />
              Wapsi is on a call
            </span>
          ) : (
            <Button
              variant="pop"
              size="lg"
              disabled={busy}
              onClick={onRun}
              className={cn('ml-1 min-w-[210px]', shake('run'))}
              key={`run-${failed?.at}`}
            >
              {pending === 'run' ? <Spinner /> : <Play className="fill-current" />}
              Start Wapsi’s run
            </Button>
          )}
        </div>
      </div>
      {config && (
        <div className="mt-3">
          <SafetyStrip config={config} />
        </div>
      )}
    </header>
  )
}
