import { Hand } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

import { Panel } from '@/components/Panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatTime } from '@/lib/format'
import type { Handoff } from '@/lib/types'

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
  pending: string | null
  onTake: (handoff: Handoff) => void
}

// F10. Open handoffs, newest first: what happened, why a human is needed, what to do next.
export function HandoffQueue({ handoffs, pending, onTake }: HandoffQueueProps) {
  return (
    <Panel title="Handoff queue" aside={<Badge variant="secondary">{handoffs.length} open</Badge>}>
      {handoffs.length === 0 ? (
        <p className="text-muted-foreground">Nothing needs a human right now.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {handoffs.map((h) => (
              <motion.li
                key={h.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="rounded-lg bg-secondary/60 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{h.merchants?.name ?? h.merchant_id}</span>
                  <span className="text-xs text-muted-foreground">{formatTime(h.created_at)}</span>
                </div>
                <Badge variant="outline" className="mt-1">
                  {REASONS[h.reason] ?? h.reason}
                </Badge>
                <p className="mt-2 text-sm">“{h.summary}”</p>
                {h.next_step && (
                  <p className="mt-1 text-sm">
                    <span className="text-muted-foreground">Next: </span>
                    {h.next_step}
                  </p>
                )}
                <Button className="mt-3 w-full" disabled={pending !== null} onClick={() => onTake(h)}>
                  <Hand />
                  Take over
                </Button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </Panel>
  )
}
