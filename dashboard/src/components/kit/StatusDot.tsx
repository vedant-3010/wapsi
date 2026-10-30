import { cn } from '@/lib/utils'

export type Tone = 'ok' | 'warn' | 'danger' | 'paytm' | 'idle'

const FILL: Record<Tone, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
  paytm: 'bg-paytm',
  idle: 'bg-fg-3',
}

/** A state dot. `live` adds a breathing halo (only while something is in progress). */
export function StatusDot({ tone, live = false, className }: { tone: Tone; live?: boolean; className?: string }) {
  return (
    <span className={cn('relative inline-flex size-2 shrink-0', className)}>
      {live && <span className={cn('absolute -inset-1 rounded-full opacity-40 animate-breathe', FILL[tone])} />}
      {/* key: a change of tone replays the pop */}
      <span key={tone} className={cn('relative size-2 rounded-full animate-status-pop', FILL[tone])} />
    </span>
  )
}
