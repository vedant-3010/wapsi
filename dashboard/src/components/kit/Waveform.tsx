import { cn } from '@/lib/utils'

const BARS = [0.5, 0.9, 0.65, 1, 0.7, 0.45]

/** Voice bars: they move only while the call is live, and rest flat otherwise. */
export function Waveform({ live, className }: { live: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex h-4 items-center gap-[3px]', className)} aria-hidden>
      {BARS.map((height, i) => (
        <span
          key={i}
          className={cn('w-[3px] origin-center rounded-full bg-current', live ? 'animate-eq' : 'scale-y-[0.25]')}
          style={{ height: `${height * 100}%`, animationDelay: `${i * 110}ms` }}
        />
      ))}
    </span>
  )
}
