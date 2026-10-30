// Writes go through the backend only; the dashboard's Supabase key is read-only. Shapes follow SPEC §7.

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export type StartCallResponse = { call_id: string; execution_id: string; status: string }
export type StartRunResponse = StartCallResponse & { merchant_id: string; reason: string }
export type SimulateResponse = { recovered: number; holdout_recovered: number }
export type TakeHandoffResponse = { id: string; status: 'taken' }

async function post<T>(path: string, body: unknown = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(`${path} failed (${response.status}): ${await response.text()}`)
  }
  return (await response.json()) as T
}

export const api = {
  startRun: () => post<StartRunResponse>('/api/runs/start'),
  startCall: (merchantId: string, phone?: string, bypassHours = false) =>
    post<StartCallResponse>('/api/calls/start', { merchant_id: merchantId, phone, bypass_hours: bypassHours }),
  simulateNextDay: () => post<SimulateResponse>('/api/simulate/next-day'),
  resetDemo: () => post<{ ok: boolean }>('/api/demo/reset'),
  takeHandoff: (id: string) => post<TakeHandoffResponse>(`/api/handoffs/${id}/take`),
}
