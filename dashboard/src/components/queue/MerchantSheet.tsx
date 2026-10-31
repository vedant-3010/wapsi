import { Phone } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/kit/Button'
import { TAG } from '@/lib/tones'
import { ScoreRing, SignalChips } from '@/components/queue/QueueRow'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { parseDetail } from '@/lib/feed'
import { formatDayTime, formatDuration, formatRupees, formatTime, utcToday } from '@/lib/format'
import { SPRING_PANEL } from '@/lib/motion'
import { supabase } from '@/lib/supabase'
import type { Action, RiskRow } from '@/lib/types'
import { LANGUAGE_NAMES } from '@/lib/types'
import { cn } from '@/lib/utils'

type Detail = {
  settlement: { settled_on: string; amount: number } | null
  tickets: { type: string; created_at: string }[]
  calls: { id: string; started_at: string; status: string; outcome: string | null; duration_s: number | null }[]
  actions: Action[]
  days: string[]
  txns: number[]
  lastAnnounced: string | null
}

const TICKETS: Record<string, string> = {
  settlement_query: 'Settlement query',
  device_issue: 'Device issue',
  rent_dispute: 'Rent dispute',
}

async function loadDetail(row: RiskRow): Promise<Detail> {
  const [settlement, tickets, calls, actions, series, device] = await Promise.all([
    supabase.from('settlements').select('settled_on, amount').eq('merchant_id', row.merchant_id)
      .order('settled_on', { ascending: false }).limit(1),
    supabase.from('tickets').select('type, created_at').eq('merchant_id', row.merchant_id).eq('status', 'open'),
    supabase.from('calls').select('id, started_at, status, outcome, duration_s').eq('merchant_id', row.merchant_id)
      .order('started_at', { ascending: false }).limit(3),
    supabase.from('actions').select('id,call_id,merchant_id,device_id,type,detail,actor,payload,created_at')
      .eq('merchant_id', row.merchant_id).order('id', { ascending: false }).limit(5),
    supabase.from('volume_series').select('days, txns').eq('device_id', row.device_id).limit(1),
    supabase.from('devices').select('last_announced_at').eq('id', row.device_id).limit(1),
  ])
  const volume = (series.data as { days: string[]; txns: number[] }[] | null)?.[0]
  return {
    settlement: (settlement.data as Detail['settlement'][] | null)?.[0] ?? null,
    tickets: (tickets.data as Detail['tickets'] | null) ?? [],
    calls: (calls.data as Detail['calls'] | null) ?? [],
    actions: (actions.data as Action[] | null) ?? [],
    days: volume?.days ?? [],
    txns: volume?.txns ?? [],
    lastAnnounced: (device.data as { last_announced_at: string }[] | null)?.[0]?.last_announced_at ?? null,
  }
}

const dayLabel = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' })

/** 30 days of QR payments as bars. Hovering a bar reads that day out in the header. */
function VolumeBars({ days, txns }: { days: string[]; txns: number[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(...txns, 1)
  const today = utcToday()
  const historyEnd = days[days.length - 1] === today ? days.length - 1 : days.length
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-semibold">QR payments, last 30 days</h3>
        <span className={cn('text-[13px] tabular-nums transition-colors', hover === null ? 'text-ink-3' : 'font-medium text-ink-1')}>
          {hover === null ? 'Hover a day' : `${dayLabel.format(new Date(days[hover]))} · ${txns[hover]} payments`}
        </span>
      </div>
      <div className="flex h-28 items-end gap-[3px]" onMouseLeave={() => setHover(null)}>
        {txns.map((n, i) => {
          const tone = i >= historyEnd ? 'bg-sage-mid' : i >= historyEnd - 3 ? 'bg-coral-mid' : 'bg-ink-4'
          return (
            <motion.button
              key={days[i]}
              type="button"
              aria-label={`${dayLabel.format(new Date(days[i]))}: ${n} payments`}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ ...SPRING_PANEL, delay: i * 0.012 }}
              style={{ height: `${Math.max(4, (n / max) * 100)}%`, transformOrigin: 'bottom' }}
              className={cn('flex-1 rounded-t-[4px] transition-opacity', tone, hover !== null && hover !== i && 'opacity-35')}
            />
          )
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[12px] text-ink-3">
        <span>{days[0] ? dayLabel.format(new Date(days[0])) : ''}</span>
        <span>{days.length ? dayLabel.format(new Date(days[days.length - 1])) : ''}</span>
      </div>
    </div>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[14px] bg-paper-2 px-4 py-3">
      <div className="caption">{label}</div>
      <div className="mt-0.5 text-[15px] font-medium text-ink-1">{children}</div>
    </div>
  )
}

function Body({ row, onCall }: { row: RiskRow; onCall: (row: RiskRow) => void }) {
  const [detail, setDetail] = useState<Detail | null>(null)
  useEffect(() => {
    let live = true
    void loadDetail(row).then((d) => live && setDetail(d))
    return () => {
      live = false
    }
  }, [row])

  return (
    <div className="flex h-full flex-col overflow-y-auto px-7 pt-8 pb-7">
      <div className="flex items-start gap-4">
        <ScoreRing score={row.risk_score} size={52} />
        <div className="min-w-0">
          <SheetTitle className="font-display text-[30px] leading-[1.1] font-bold tracking-tight text-ink-1">{row.name}</SheetTitle>
          <SheetDescription className="mt-1 text-[15px] text-ink-3">
            {row.owner_name} · {row.area} · {LANGUAGE_NAMES[row.language]}
          </SheetDescription>
        </div>
      </div>
      <div className="mt-4">
        <SignalChips row={row} />
      </div>

      <section className="mt-7">
        {detail ? <VolumeBars days={detail.days} txns={detail.txns} /> : <div className="h-40 animate-pulse rounded-[14px] bg-paper-3" />}
      </section>

      <section className="mt-7 grid grid-cols-2 gap-2.5">
        <Fact label="Last settlement">
          {detail?.settlement ? `${formatRupees(detail.settlement.amount)} · ${dayLabel.format(new Date(detail.settlement.settled_on))}` : '—'}
        </Fact>
        <Fact label="Rent">
          <span className={cn('tag', row.rent_status === 'failed' ? TAG.coral : TAG.sage)}>
            {row.rent_status === 'failed' ? 'Debit failed' : 'Paid'}
          </span>
        </Fact>
        <Fact label="Open complaints">
          {detail ? (detail.tickets.length ? detail.tickets.map((t) => TICKETS[t.type] ?? t.type).join(', ') : 'None') : '—'}
        </Fact>
        <Fact label="Soundbox last spoke">{detail?.lastAnnounced ? formatDayTime(detail.lastAnnounced) : '—'}</Fact>
      </section>

      <section className="mt-7">
        <h3 className="mb-2 text-[15px] font-semibold">What Wapsi did</h3>
        {detail && detail.actions.length === 0 && <p className="text-[15px] text-ink-3">Nothing yet. This merchant hasn’t been called.</p>}
        <ol className="flex flex-col gap-2">
          {detail?.actions.map((a) => {
            const { title, decision } = parseDetail(a.detail)
            return (
              <li key={`${a.id}@${a.created_at}`} className="flex items-baseline justify-between gap-3 text-[14px]">
                <span className="text-ink-2">
                  <span className="font-medium text-ink-1">{title}</span>
                  {decision && <> → {decision}</>}
                </span>
                <span className="shrink-0 font-mono text-[12px] text-ink-3">{formatTime(a.created_at)}</span>
              </li>
            )
          })}
        </ol>
        {detail && detail.calls.length > 0 && (
          <p className="mt-3 text-[13px] text-ink-3">
            {detail.calls.length} call{detail.calls.length === 1 ? '' : 's'}; latest {formatDayTime(detail.calls[0].started_at)}
            {detail.calls[0].duration_s ? `, ${formatDuration(detail.calls[0].duration_s)}` : ''}
          </p>
        )}
      </section>

      <div className="mt-auto pt-8">
        {row.cohort === 'holdout' ? (
          <p className="rounded-[14px] bg-paper-2 px-4 py-3 text-[14px] text-ink-2">
            In the holdout: Wapsi never calls these merchants, so we can measure what happens without it.
          </p>
        ) : (
          <Button variant="primary" size="lg" className="w-full" onClick={() => onCall(row)}>
            <Phone />
            Call {row.owner_name.split(' ')[0]} now
          </Button>
        )}
      </div>
    </div>
  )
}

/** The merchant's file: why they're at risk, 30 days of payments, money matters, what Wapsi did. */
export function MerchantSheet({ row, onClose, onCall }: { row: RiskRow | null; onClose: () => void; onCall: (row: RiskRow) => void }) {
  return (
    <Sheet open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="gap-0 border-line bg-paper p-0 shadow-pop data-[side=right]:w-full data-[side=right]:sm:max-w-[500px] sm:rounded-l-[26px]"
      >
        {row && <Body key={row.device_id} row={row} onCall={onCall} />}
      </SheetContent>
    </Sheet>
  )
}
