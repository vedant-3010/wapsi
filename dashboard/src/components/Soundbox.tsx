import { BadgeCheck, Clock, type LucideIcon, UsersRound, Volume2, VolumeX, Wrench } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Panel } from '@/components/Panel'
import { formatDayTime } from '@/lib/format'
import type { Action, Device, DeviceStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

const LIGHT: Record<DeviceStatus, { label: string; icon: LucideIcon; color: string }> = {
  at_risk: { label: 'Silent', icon: VolumeX, color: 'bg-critical shadow-critical/60' },
  fix_scheduled: { label: 'Fix scheduled', icon: Wrench, color: 'bg-warning shadow-warning/60' },
  awaiting_verification: { label: 'Awaiting payments', icon: Clock, color: 'bg-warning shadow-warning/60' },
  handed_off: { label: 'With a human', icon: UsersRound, color: 'bg-muted-foreground shadow-muted-foreground/40' },
  recovered: { label: 'Recovered (verified)', icon: BadgeCheck, color: 'bg-good shadow-good/60' },
  healthy: { label: 'Healthy', icon: Volume2, color: 'bg-good shadow-good/60' },
}

function speakFallback() {
  // No clip yet (scripts/make_soundbox_clip.py makes it): say it with the browser's Hindi voice.
  const speech = new SpeechSynthesisUtterance('पचास रुपये प्राप्त हुए')
  speech.lang = 'hi-IN'
  window.speechSynthesis.speak(speech)
}

/** Browsers block audio until the first click; this primes it on any click on the page. */
function useAnnouncer() {
  const audio = useRef<HTMLAudioElement | null>(null)
  useEffect(() => {
    const clip = new Audio('/sounds/received.wav')
    audio.current = clip
    const unlock = () => {
      clip.muted = true
      clip.play().then(() => clip.pause()).catch(() => undefined).finally(() => {
        clip.muted = false
        clip.currentTime = 0
      })
    }
    window.addEventListener('pointerdown', unlock, { once: true })
    return () => window.removeEventListener('pointerdown', unlock)
  }, [])

  return useCallback(() => {
    const clip = audio.current
    if (!clip) return speakFallback()
    clip.currentTime = 0
    clip.play().catch(speakFallback)
  }, [])
}

// F9. The device of the latest call; it lights up and speaks when payments resume.
export function Soundbox({ device, feed, loaded }: { device: Device | null; feed: Action[]; loaded: boolean }) {
  const announce = useAnnouncer()
  // Keyed by id + created_at: a demo reset restarts action ids at 1, so ids alone repeat.
  const seen = useRef<Set<string> | null>(null)
  const [ding, setDing] = useState<{ deviceId: string; at: number } | null>(null)

  useEffect(() => {
    if (!loaded) return
    const key = (a: Action) => `${a.id}@${a.created_at}`
    if (seen.current === null) {
      seen.current = new Set(feed.map(key)) // don't replay what happened before the page opened
      return
    }
    const known = seen.current
    const fresh = feed.some((a) => !known.has(key(a)) && a.type === 'payments_resumed' && a.device_id === device?.id)
    feed.forEach((a) => known.add(key(a)))
    if (fresh && device) {
      announce()
      setDing({ deviceId: device.id, at: Date.now() })
    }
  }, [feed, loaded, device, announce])

  useEffect(() => {
    if (!ding) return
    const id = window.setTimeout(() => setDing(null), 5000)
    return () => window.clearTimeout(id)
  }, [ding])

  if (!device) {
    return (
      <Panel title="Virtual Soundbox">
        <p className="text-muted-foreground">Shows the Soundbox of the merchant Wapsi is calling.</p>
      </Panel>
    )
  }

  const light = LIGHT[device.status]
  const Icon = light.icon
  return (
    <Panel title="Virtual Soundbox" aside={<span className="text-sm text-muted-foreground">{device.id}</span>}>
      <div className="flex items-center gap-5">
        <div className="relative grid size-20 shrink-0 place-items-center rounded-2xl bg-secondary">
          <motion.span
            key={device.status}
            initial={{ scale: 0.6 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.25 }}
            className={cn('size-9 rounded-full shadow-[0_0_24px]', light.color)}
          />
        </div>
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold">{device.merchants?.name}</div>
          <div className="flex items-center gap-1.5 font-medium">
            <Icon className="size-4" />
            {light.label}
          </div>
          <div className="text-sm text-muted-foreground">Last spoke {formatDayTime(device.last_announced_at)}</div>
        </div>
      </div>
      <AnimatePresence>
        {ding?.deviceId === device.id && (
          <motion.div
            key={ding.at}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-good py-2 text-xl font-semibold text-background">
              <Volume2 className="size-5" />
              ₹50 received
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Panel>
  )
}
