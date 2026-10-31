// Writes go through the backend only; the dashboard's Supabase key is read-only. Shapes follow SPEC §7.

import type { PublicConfig } from '@/lib/types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export type StartCallResponse = { call_id: string; execution_id: string; status: string }
export type StartRunResponse = StartCallResponse & { merchant_id: string; reason: string }
export type SimulateResponse = { recovered: number; holdout_recovered: number }
export type TakeHandoffResponse = { id: string; status: 'taken' }

async function post<T>(path: string, body: unknown = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error(`Can't reach the backend at ${API_URL}`)
  }
  if (!response.ok) {
    // FastAPI errors look like {"detail": "Wapsi is already on a call with …"}.
    const text = await response.text()
    let detail = text
    try {
      const parsed = JSON.parse(text) as { detail?: unknown }
      if (typeof parsed.detail === 'string') detail = parsed.detail
    } catch {
      // not JSON: keep the raw text
    }
    throw new Error(detail || `${path} failed (${response.status})`)
  }
  return (await response.json()) as T
}

export const api = {
  config: async (): Promise<PublicConfig> => {
    const response = await fetch(`${API_URL}/api/config`)
    if (!response.ok) throw new Error(`/api/config failed (${response.status})`)
    return (await response.json()) as PublicConfig
  },
  startRun: () => post<StartRunResponse>('/api/runs/start'),
  startCall: (merchantId: string, phone?: string, bypassHours = false) =>
    post<StartCallResponse>('/api/calls/start', { merchant_id: merchantId, phone, bypass_hours: bypassHours }),
  simulateNextDay: () => post<SimulateResponse>('/api/simulate/next-day'),
  resetDemo: () => post<{ ok: boolean }>('/api/demo/reset'),
  takeHandoff: (id: string) => post<TakeHandoffResponse>(`/api/handoffs/${id}/take`),
  // The Soundbox's voice (Sarvam Bulbul WAV); fetched by useAnnouncer, cached by the browser.
  announcementUrl: (amount: number, language: string) =>
    `${API_URL}/api/soundbox/announce?${new URLSearchParams({ amount: String(amount), lang: language })}`,
}
