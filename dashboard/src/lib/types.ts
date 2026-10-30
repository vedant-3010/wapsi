// Row shapes the dashboard reads from Supabase (SPEC §4) and the backend's public config.

export type DeviceStatus =
  | 'healthy'
  | 'at_risk'
  | 'fix_scheduled'
  | 'awaiting_verification'
  | 'handed_off'
  | 'recovered'

export type Actor = 'agent' | 'human' | 'system'

export type Language = 'hi' | 'mr' | 'en'

export type RiskRow = {
  device_id: string
  merchant_id: string
  name: string
  owner_name: string
  area: string
  language: Language
  cohort: 'wapsi' | 'holdout'
  status: DeviceStatus
  rent_status: 'paid' | 'failed'
  days_silent: number
  qr_drop_pct: number
  open_ticket: boolean
  risk_score: number
  reason: string
}

export type Call = {
  id: string
  merchant_id: string
  device_id: string | null
  phone: string
  bolna_execution_id: string | null
  status: string
  started_at: string
  ended_at: string | null
  duration_s: number | null
  transcript: string | null
  summary: string | null
  outcome: string | null
  recording_url: string | null
  merchants: { name: string; owner_name: string; area: string; language: Language } | null
}

export type Action = {
  id: number
  call_id: string | null
  merchant_id: string
  device_id: string | null
  type: string
  detail: string
  actor: Actor
  payload: Record<string, unknown> | null
  created_at: string
}

export type Device = {
  id: string
  merchant_id: string
  status: DeviceStatus
  last_announced_at: string
  merchants: { name: string; language: Language } | null
}

export type Handoff = {
  id: string
  merchant_id: string
  reason: string
  summary: string
  next_step: string | null
  created_at: string
  merchants: { name: string } | null
}

export type Kpis = {
  atRisk: number
  callsToday: number
  verifiedSaves: number
  retained: number
  openHandoffs: number
  wapsiRate: number | null
  wapsiCount: number
  holdoutRate: number | null
  holdoutCount: number
  costPerSaveUsd: number | null
}

/** GET /api/config: guardrails for the Safety strip (F15). */
export type PublicConfig = {
  dry_run: boolean
  calling_hours: string
  within_calling_hours: boolean
  allowed_numbers: number
  goodwill_cap: number
}

/** 30 days of QR payments per device (view volume_series), oldest first; may end with today. */
export type VolumeSeries = { device_id: string; days: string[]; txns: number[] }

// Bolna's final call states (backend wapsi/context.py).
export const TERMINAL_STATUSES = ['completed', 'failed', 'no-answer', 'busy', 'canceled', 'error', 'stopped', 'balance-low']

export const LANGUAGE_NAMES: Record<Language, string> = { hi: 'Hindi', mr: 'Marathi', en: 'English' }
