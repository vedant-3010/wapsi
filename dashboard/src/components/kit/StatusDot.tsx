import type { Tone } from '@/lib/tones'
import { cn } from '@/lib/utils'

export type { Tone }

const FILL: Record<Tone, string> = {
  sage: 'bg-sage-mid',
  amber: 'bg-amber-mid',
  coral: 'bg-coral-mid',
  sky: 'bg-sky',
  idle: 'bg-ink-4',
}

/** A state dot. `live` adds a breathing halo (only while something is in progress). */
export function StatusDot({ tone, live = false, className }: { tone: Tone; live?: boolean; className?: string }) {
  return (
    <span className={cn('relative inline-flex size-2 shrink-0', className)}>
      {live && <span className={cn('absolute -inset-1 rounded-full opacity-50 animate-breathe', FILL[tone])} />}
      {/* key: a change of tone replays the pop */}
      <span key={tone} className={cn('relative size-2 rounded-full animate-status-pop', FILL[tone])} />
    </span>
  )
}
