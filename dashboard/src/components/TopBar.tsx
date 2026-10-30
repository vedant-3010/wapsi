import { LoaderCircle, Play, RotateCcw, SunMoon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type TopBarProps = {
  pending: string | null
  callActive: boolean
  realtime: boolean
  onRun: () => void
  onReset: () => void
  onSimulate: () => void
}

function Spinner() {
  return <LoaderCircle className="animate-spin" />
}

export function TopBar({ pending, callActive, realtime, onRun, onReset, onSimulate }: TopBarProps) {
  const busy = pending !== null
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-baseline gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          Wapsi <span className="font-normal text-muted-foreground">· Merchant recovery</span>
        </h1>
        <span
          className="flex items-center gap-1.5 text-sm text-muted-foreground"
          title={realtime ? 'Realtime connected' : 'Realtime down: refreshing every 3 s'}
        >
          <span className={cn('size-2 rounded-full', realtime ? 'bg-good' : 'animate-pulse bg-warning')} />
          {realtime ? 'Live' : 'Reconnecting'}
        </span>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button
          size="lg"
          className="h-11 px-5 text-base font-semibold"
          disabled={busy || callActive}
          title={callActive ? 'Wapsi is on a call' : undefined}
          onClick={onRun}
        >
          {pending === 'run' ? <Spinner /> : <Play />}
          Start Wapsi’s run
        </Button>
        <Button size="lg" variant="outline" className="h-11 text-base" disabled={busy} onClick={onReset}>
          {pending === 'reset' ? <Spinner /> : <RotateCcw />}
          Reset demo
        </Button>
        <Button size="lg" variant="outline" className="h-11 text-base" disabled={busy} onClick={onSimulate}>
          {pending === 'simulate' ? <Spinner /> : <SunMoon />}
          Simulate next day
        </Button>
      </div>
    </header>
  )
}
