import { BadgeCheck, Clock, type LucideIcon, UsersRound, Volume2, VolumeX, Wrench } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

import { Sparkline } from '@/components/kit/Sparkline'
import { Panel } from '@/components/Panel'
import { useAnnouncer } from '@/hooks/useAnnouncer'
import { paymentAmount } from '@/lib/feed'
import { daysSince, formatDayTime, formatRupees } from '@/lib/format'
import { SPRING_POP } from '@/lib/motion'
import type { Action, Device, DeviceStatus, Language } from '@/lib/types'
import { cn } from '@/lib/utils'

type Look = { label: string; icon: LucideIcon; led: string; text: string; display: (days: number) => string }

const LOOKS: Record<DeviceStatus, Look> = {
  at_risk: { label: 'Silent', icon: VolumeX, led: 'bg-danger', text: 'text-danger', display: (d) => `Silent · ${d} days` },
  fix_scheduled: { label: 'Fix scheduled', icon: Wrench, led: 'bg-warn', text: 'text-warn', display: () => 'Technician booked' },
  awaiting_verification: {
    label: 'Awaiting payments', icon: Clock, led: 'bg-warn', text: 'text-warn', display: () => 'Waiting for payments',
  },
  handed_off: { label: 'With a person', icon: UsersRound, led: 'bg-fg-3', text: 'text-fg-2', display: () => 'Senior callback' },
  recovered: { label: 'Recovered (verified)', icon: BadgeCheck, led: 'bg-ok', text: 'text-ok', display: () => 'Payments back' },
  healthy: { label: 'Healthy', icon: Volume2, led: 'bg-ok', text: 'text-ok', display: () => 'Speaking' },
}

/** The device itself: grille, LED and a little display. It rings when a payment lands. */
function Device({ look, ding, days }: { look: Look; ding: { amount: number; at: number } | null; days: number }) {
  return (
    <div className="flex flex-col items-center gap-2.5">
      <div
        className={cn(
          'relative grid size-[112px] place-items-center rounded-[28px] border border-line-strong',
          'bg-[linear-gradient(160deg,#1a2440_0%,#0b1124_70%)]',
          'shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_18px_36px_-14px_rgb(0_0_0/0.9)]',
          ding && 'animate-flash-ok',
        )}
        key={ding?.at ?? 'idle'}
      >
        <span className={cn('absolute top-3 h-1 w-9 rounded-full transition-colors duration-500', look.led)} />
        <span className="relative size-[68px] rounded-full border border-line bg-black/30 grille">
          {ding &&
            [0, 1, 2].map((i) => (
              <span
                key={i}
                className="absolute inset-0 rounded-full border-2 border-ok animate-ripple"
                style={{ animationDelay: `${i * 260}ms` }}
              />
            ))}
        </span>
        <span className="absolute bottom-2 font-mono text-[8px] tracking-[0.2em] text-fg-4">SOUNDBOX</span>
      </div>
      <div className="h-7 w-max min-w-[120px] rounded-md border border-line bg-black/40 px-2.5 text-center">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={ding ? `paid-${ding.at}` : look.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className={cn('block font-mono text-[12px] leading-7 whitespace-nowrap uppercase', ding ? 'text-ok' : look.text)}
          >
            {ding ? (ding.amount ? `${formatRupees(ding.amount)} received` : 'Payment received') : look.display(days)}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  )
}

type SoundboxCardProps = {
  device: Device | null
  feed: Action[]
  series: number[] | undefined
  loaded: boolean
}

// F9. The Soundbox of the latest call. When its payments resume it chimes and says the amount.
export function SoundboxCard({ device, feed, series, loaded }: SoundboxCardProps) {
  const announce = useAnnouncer()
  // Keyed by id + created_at: a demo reset restarts action ids at 1, so ids alone repeat.
  const seen = useRef<Set<string> | null>(null)
  const [ding, setDing] = useState<{ deviceId: string; amount: number; at: number } | null>(null)
  const language: Language = device?.merchants?.language ?? 'hi'

  useEffect(() => {
    if (!loaded) return
    const key = (a: Action) => `${a.id}@${a.created_at}`
    if (seen.current === null) {
      seen.current = new Set(feed.map(key)) // don't replay what happened before the page opened
      return
    }
    const known = seen.current
    const paid = feed.find((a) => !known.has(key(a)) && a.type === 'payments_resumed' && a.device_id === device?.id)
    feed.forEach((a) => known.add(key(a)))
    if (paid && device) {
      const amount = paymentAmount(paid)
      announce(amount, language)
      setDing({ deviceId: device.id, amount, at: Date.now() })
    }
  }, [feed, loaded, device, language, announce])

  useEffect(() => {
    if (!ding) return
    const id = window.setTimeout(() => setDing(null), 6000)
    return () => window.clearTimeout(id)
  }, [ding])

  if (!device) {
    return (
      <Panel title="Virtual Soundbox">
        <p className="text-[15px] text-fg-3">The Soundbox of the merchant Wapsi calls appears here, and speaks when payments return.</p>
      </Panel>
    )
  }

  const look = LOOKS[device.status]
  const Icon = look.icon
  const days = daysSince(device.last_announced_at)
  const live = ding?.deviceId === device.id ? ding : null
  const today = device.status === 'recovered'
  const before = series && series.length > 4 ? Math.round(series.slice(0, -4).reduce((a, b) => a + b, 0) / (series.length - 4)) : null
  const after = series?.length ? series[series.length - 1] : null

  return (
    <Panel title="Virtual Soundbox" aside={<span className="caption">{device.id}</span>}>
      <div className="flex items-center gap-5">
        <Device look={look} ding={live} days={days} />
        <div className="min-w-0">
          <div className="line-clamp-2 font-serif text-[26px] leading-[1.1]">{device.merchants?.name}</div>
          <motion.div
            key={device.status}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={SPRING_POP}
            className={cn('mt-1 flex items-center gap-1.5 text-[15px] font-medium', look.text)}
          >
            <Icon className="size-4" />
            {look.label}
          </motion.div>
          <div className="mt-1 text-[13px] text-fg-3">Last spoke {formatDayTime(device.last_announced_at)}</div>
        </div>
      </div>

      {series && series.length > 1 && (
        <div className="mt-4 border-t border-line pt-3">
          <div className="flex items-baseline justify-between">
            <span className="caption">QR payments · {series.length} days</span>
            {before !== null && after !== null && (
              <span className="font-mono text-[12px] text-fg-2 tabular-nums">
                {before}/day → <span className={today ? 'text-ok' : 'text-danger'}>{after}</span>
              </span>
            )}
          </div>
          <Sparkline
            values={series}
            today={today}
            area
            stretch
            width={320}
            height={56}
            className="mt-2 text-fg-3"
            label={`QR payments per day over ${series.length} days`}
          />
        </div>
      )}
    </Panel>
  )
}
