// Row shapes the dashboard reads from Supabase (SPEC §4).

export type DeviceStatus =
  | 'healthy'
  | 'at_risk'
  | 'fix_scheduled'
  | 'awaiting_verification'
  | 'handed_off'
  | 'recovered'

export type Actor = 'agent' | 'human' | 'system'

export type RiskRow = {
  device_id: string
  merchant_id: string
  name: string
  owner_name: string
  area: string
  language: 'hi' | 'mr' | 'en'
  cohort: 'wapsi' | 'holdout'
  status: DeviceStatus
  days_silent: number
  risk_score: number
  reason: string
}

export type Call = {
  id: string
  merchant_id: string
  device_id: string | null
  bolna_execution_id: string | null
  status: string
  started_at: string
  ended_at: string | null
  duration_s: number | null
  transcript: string | null
  summary: string | null
  outcome: string | null
  merchants: { name: string; language: 'hi' | 'mr' | 'en' } | null
}

export type Action = {
  id: number
  call_id: string | null
  merchant_id: string
  device_id: string | null
  type: string
  detail: string
  actor: Actor
  created_at: string
}

export type Device = {
  id: string
  merchant_id: string
  status: DeviceStatus
  last_announced_at: string
  merchants: { name: string } | null
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

// Bolna's final call states (backend wapsi/context.py).
export const TERMINAL_STATUSES = ['completed', 'failed', 'no-answer', 'busy', 'canceled', 'error', 'stopped', 'balance-low']

export const LANGUAGE_NAMES = { hi: 'Hindi', mr: 'Marathi', en: 'English' } as const
