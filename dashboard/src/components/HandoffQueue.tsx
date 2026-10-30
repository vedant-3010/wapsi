import { ArrowRight, Hand, LoaderCircle } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

import { Button } from '@/components/kit/Button'
import { TAG } from '@/lib/tones'
import { Panel } from '@/components/Panel'
import { formatTime } from '@/lib/format'
import { SPRING_PANEL } from '@/lib/motion'
import type { Handoff } from '@/lib/types'
import { cn } from '@/lib/utils'

const REASONS: Record<string, string> = {
  hardship: 'Hardship',
  angry: 'Still upset',
  asked_for_person: 'Asked for a person',
  above_cap: 'Credit above cap',
  fraud_kyc: 'Fraud / KYC',
  fixes_failed: 'Fixes failed',
}

type HandoffQueueProps = {
  handoffs: Handoff[]
  takingId: string | null
  onTake: (handoff: Handoff) => void
}

// F10. What Wapsi couldn't or shouldn't decide alone: why, what happened, what to do next.
export function HandoffQueue({ handoffs, takingId, onTake }: HandoffQueueProps) {
  return (
    <Panel
      title="Handoff queue"
      aside={<span className={cn('tag', handoffs.length ? TAG.amber : TAG.idle)}>{handoffs.length} open</span>}
    >
      {handoffs.length === 0 ? (
        <p className="text-[15px] leading-relaxed text-ink-3">
          Nothing needs a person right now. Wapsi hands off hardship, anger, fraud and anything above its limits.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {handoffs.map((h) => (
              <motion.li
                key={h.id}
                layout
                initial={{ opacity: 0, y: 14, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 30, height: 0, marginTop: 0, transition: { duration: 0.3 } }}
                transition={SPRING_PANEL}
                className="overflow-hidden rounded-[18px] bg-amber-soft/60 ring-1 ring-amber-mid/40"
              >
                <div className="p-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn('tag', TAG.amber)}>{REASONS[h.reason] ?? h.reason}</span>
                    <span className="font-mono text-[12px] text-ink-3">{formatTime(h.created_at)}</span>
                  </div>
                  <div className="mt-3 text-[16px] font-semibold">{h.merchants?.name ?? h.merchant_id}</div>
                  <p className="mt-1 font-serif text-[22px] leading-snug text-ink-1 italic">“{h.summary}”</p>
                  {h.next_step && (
                    <p className="mt-2 flex items-start gap-1.5 text-[14px] text-ink-2">
                      <ArrowRight className="mt-0.5 size-4 shrink-0 text-amber" />
                      {h.next_step}
                    </p>
                  )}
                  <Button variant="primary" className="mt-4 w-full" disabled={takingId !== null} onClick={() => onTake(h)}>
                    {takingId === h.id ? <LoaderCircle className="animate-spin" /> : <Hand />}
                    Take over
                  </Button>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </Panel>
  )
}
