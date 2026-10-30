import { IndianRupee, type LucideIcon, MessageSquareWarning, TrendingDown, VolumeX } from 'lucide-react'

import type { RiskRow } from '@/lib/types'

export type Signal = { key: string; icon: LucideIcon; label: string; title: string }

// The same thresholds as the risk_queue view (SPEC §4): silent ≥ 3 days, QR drop ≥ 60%.
export function signalsOf(row: RiskRow): Signal[] {
  const signals: Signal[] = []
  if (row.days_silent >= 3) {
    signals.push({ key: 'silent', icon: VolumeX, label: `Silent ${row.days_silent}d`,
      title: `No payment announced for ${row.days_silent} days` })
  }
  if (row.qr_drop_pct >= 60) {
    signals.push({ key: 'qr', icon: TrendingDown, label: `QR −${row.qr_drop_pct}%`,
      title: `QR payments down ${row.qr_drop_pct}% vs the 4 weeks before` })
  }
  if (row.rent_status === 'failed') {
    signals.push({ key: 'rent', icon: IndianRupee, label: 'Rent failed', title: 'The last rent debit failed' })
  }
  if (row.open_ticket) {
    signals.push({ key: 'ticket', icon: MessageSquareWarning, label: 'Complaint', title: 'An open complaint' })
  }
  return signals
}
