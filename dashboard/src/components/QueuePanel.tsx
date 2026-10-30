import { Phone } from 'lucide-react'
import { useState } from 'react'

import { Panel } from '@/components/Panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { DeviceStatus, RiskRow } from '@/lib/types'
import { LANGUAGE_NAMES } from '@/lib/types'

const STATUS_LABELS: Partial<Record<DeviceStatus, string>> = {
  fix_scheduled: 'Fix scheduled',
  awaiting_verification: 'Awaiting payments',
  handed_off: 'With a human',
}

type QueuePanelProps = {
  queue: RiskRow[]
  className?: string
  onCall: (row: RiskRow, phone: string) => Promise<boolean>
}

// F1. Sorted by risk_score, then days_silent (both desc). Call is the backup to Start Wapsi's run.
export function QueuePanel({ queue, className, onCall }: QueuePanelProps) {
  const [target, setTarget] = useState<RiskRow | null>(null)
  return (
    <Panel title="At-risk queue" aside={<Badge variant="secondary">{queue.length}</Badge>} className={className} scroll>
      {queue.length === 0 ? (
        <p className="text-muted-foreground">No device is at risk. Reset the demo to reseed.</p>
      ) : (
        <ul className="divide-y divide-border">
          {queue.map((row) => (
            <li key={row.device_id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-semibold">{row.name}</span>
                  {STATUS_LABELS[row.status] && <Badge variant="outline">{STATUS_LABELS[row.status]}</Badge>}
                </div>
                <div className="text-sm text-muted-foreground">
                  {row.area} · {LANGUAGE_NAMES[row.language]}
                </div>
                <div className="text-sm">{row.reason}</div>
              </div>
              <div className="w-10 text-right text-lg font-semibold tabular-nums text-primary" title="Risk score">
                {row.risk_score}
              </div>
              {row.cohort === 'holdout' ? (
                <span className="w-20 text-right text-xs leading-tight text-muted-foreground">Holdout · not called</span>
              ) : (
                <Button variant="outline" className="w-20" onClick={() => setTarget(row)}>
                  <Phone />
                  Call
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <CallDialog target={target} onClose={() => setTarget(null)} onCall={onCall} />
    </Panel>
  )
}

function CallDialog({
  target,
  onClose,
  onCall,
}: {
  target: RiskRow | null
  onClose: () => void
  onCall: (row: RiskRow, phone: string) => Promise<boolean>
}) {
  const [phone, setPhone] = useState(import.meta.env.VITE_DEMO_PHONE ?? '')
  const [sending, setSending] = useState(false)

  async function submit() {
    if (!target) return
    setSending(true)
    const ok = await onCall(target, phone.trim())
    setSending(false)
    if (ok) onClose()
  }

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-xl">Call {target?.name}</DialogTitle>
          <DialogDescription>{target?.reason}</DialogDescription>
        </DialogHeader>
        <label className="grid gap-2 text-sm">
          Phone (must be on the allowlist)
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-11 text-base"
            inputMode="tel"
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
          />
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={sending || !phone.trim()}>
            <Phone />
            Call now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
