import { LoaderCircle, Phone } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/kit/Button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { RiskRow } from '@/lib/types'
import { cn } from '@/lib/utils'

type CallDialogProps = {
  target: RiskRow | null
  onClose: () => void
  onCall: (row: RiskRow, phone: string) => Promise<boolean>
}

/** The manual path: call one merchant now, on a number from the allowlist. */
export function CallDialog({ target, onClose, onCall }: CallDialogProps) {
  const [phone, setPhone] = useState(import.meta.env.VITE_DEMO_PHONE ?? '')
  const [sending, setSending] = useState(false)
  const [failedAt, setFailedAt] = useState(0)

  async function submit() {
    if (!target || sending) return
    setSending(true)
    const ok = await onCall(target, phone.trim())
    setSending(false)
    if (ok) onClose()
    else setFailedAt(Date.now())
  }

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="rounded-dialog border border-line bg-paper p-7 shadow-pop sm:max-w-md">
        <DialogHeader>
          <div className="caption">Call now, as a backup to the run</div>
          <DialogTitle className="font-serif text-[36px] leading-tight font-normal tracking-tight">{target?.name}</DialogTitle>
          <DialogDescription className="text-[15px] text-ink-2">{target?.reason}</DialogDescription>
        </DialogHeader>
        <label className="mt-2 grid gap-2">
          <span className="caption">Phone (must be on the allowlist)</span>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-12 rounded-control border-line-strong bg-paper-2 font-mono text-base focus-visible:bg-paper"
            inputMode="tel"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
          />
        </label>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            key={failedAt}
            variant="primary"
            onClick={() => void submit()}
            disabled={sending || !phone.trim()}
            className={cn(failedAt > 0 && 'animate-shake')}
          >
            {sending ? <LoaderCircle className="animate-spin" /> : <Phone />}
            Call now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
