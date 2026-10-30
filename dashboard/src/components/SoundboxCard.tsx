import { BadgeCheck, Clock, type LucideIcon, UsersRound, Volume2, VolumeX, Wrench } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

import { Confetti } from '@/components/kit/Confetti'
import { Sparkline } from '@/components/kit/Sparkline'
import { type Tone } from '@/components/kit/StatusDot'
import { TAG } from '@/lib/tones'
import { Panel } from '@/components/Panel'
import { useAnnouncer } from '@/hooks/useAnnouncer'
import { paymentAmount } from '@/lib/feed'
import { daysSince, formatDayTime, formatRupees } from '@/lib/format'
import { SPRING_POP } from '@/lib/motion'
import type { Action, Device, DeviceStatus, Language } from '@/lib/types'
import { cn } from '@/lib/utils'

type Look = { label: string; icon: LucideIcon; tone: Tone; led: string; screen: string; display: (days: number) => string }

const LOOKS: Record<DeviceStatus, Look> = {
  at_risk: { label: 'Silent', icon: VolumeX, tone: 'coral', led: 'bg-coral-mid', screen: 'text-coral-mid', display: (d) => `Silent · ${d} days` },
  fix_scheduled: {
    label: 'Fix scheduled', icon: Wrench, tone: 'amber', led: 'bg-amber-mid', screen: 'text-amber-mid', display: () => 'Technician booked',
  },
  awaiting_verification: {
    label: 'Awaiting payments', icon: Clock, tone: 'amber', led: 'bg-amber-mid', screen: 'text-amber-mid',
    display: () => 'Waiting for payments',
  },
  handed_off: { label: 'With a person', icon: UsersRound, tone: 'idle', led: 'bg-ink-4', screen: 'text-ink-4', display: () => 'Senior callback' },
  recovered: {
    label: 'Recovered, verified', icon: BadgeCheck, tone: 'sage', led: 'bg-sage-mid', screen: 'text-sage-mid', display: () => 'Payments back',
  },
  healthy: { label: 'Healthy', icon: Volume2, tone: 'sage', led: 'bg-sage-mid', screen: 'text-sage-mid', display: () => 'Speaking' },
}

/** The device itself: a soft porcelain speaker with an LED and a small screen. */
function Device({ look, ding, days }: { look: Look; ding: { amount: number; at: number } | null; days: number }) {
  return (
    <div className="relative flex flex-col items-center gap-3">
      <motion.div
        key={ding?.at ?? 'idle'}
        animate={ding ? { rotate: [0, -4, 4, -2, 0], y: [0, -4, 0] } : {}}
        transition={{ duration: 0.6 }}
        className={cn(
          'relative grid size-[118px] place-items-center rounded-[32px] border border-line-strong',
          'bg-[linear-gradient(160deg,#ffffff_0%,#efebe3_100%)]',
          'shadow-[inset_0_2px_0_#fff,inset_0_-8px_16px_rgb(34_32_29/0.06),0_20px_34px_-18px_rgb(34_32_29/0.45)]',
          ding && 'animate-flash-ok',
        )}
      >
        <span className={cn('absolute top-3.5 h-1.5 w-10 rounded-full transition-colors duration-500', look.led)} />
        <span className="relative size-[70px] rounded-full bg-paper-3 grille shadow-[inset_0_2px_6px_rgb(34_32_29/0.12)]">
          {ding &&
            [0, 1, 2].map((i) => (
              <span
                key={i}
                className="absolute inset-0 rounded-full border-2 border-sage-mid animate-ripple"
                style={{ animationDelay: `${i * 260}ms` }}
              />
            ))}
        </span>
        <span className="absolute bottom-2.5 text-[8px] font-semibold tracking-[0.25em] text-ink-4">SOUNDBOX</span>
        {ding && <Confetti key={ding.at} />}
      </motion.div>
      <div className="h-8 w-max min-w-[132px] rounded-[10px] bg-ink-1 px-3 text-center shadow-[inset_0_1px_3px_rgb(0_0_0/0.4)]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={ding ? `paid-${ding.at}` : look.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className={cn('block font-mono text-[12px] leading-8 whitespace-nowrap', ding ? 'text-sage-mid' : look.screen)}
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

// F9. The Soundbox of the latest call. When its payments resume it chimes, says the amount and celebrates.
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
        <p className="text-[15px] leading-relaxed text-ink-3">
          The Soundbox of the merchant Wapsi calls appears here, and speaks when their payments come back.
        </p>
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
    <Panel title="Virtual Soundbox" aside={<span className="font-mono text-[12px] text-ink-3">{device.id}</span>}>
      <div className="flex items-center gap-6">
        <Device look={look} ding={live} days={days} />
        <div className="min-w-0">
          <div className="line-clamp-2 font-serif text-[30px] leading-[1.05]">{device.merchants?.name}</div>
          <motion.span key={device.status} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={SPRING_POP} className={cn('tag mt-2', TAG[look.tone])}>
            <Icon className="size-3.5" />
            {look.label}
          </motion.span>
          <div className="mt-2 text-[13px] text-ink-3">Last spoke {formatDayTime(device.last_announced_at)}</div>
        </div>
      </div>

      {series && series.length > 1 && (
        <div className="mt-5 border-t border-line pt-4">
          <div className="flex items-baseline justify-between">
            <span className="caption">QR payments, last {series.length} days</span>
            {before !== null && after !== null && (
              <span className="text-[13px] text-ink-2 tabular-nums">
                {before}/day → <span className={cn('font-semibold', today ? 'text-sage' : 'text-coral')}>{after}</span>
              </span>
            )}
          </div>
          <Sparkline
            values={series}
            today={today}
            area
            stretch
            width={320}
            height={60}
            className="mt-2 text-ink-4"
            label={`QR payments per day over ${series.length} days`}
          />
        </div>
      )}
    </Panel>
  )
}
