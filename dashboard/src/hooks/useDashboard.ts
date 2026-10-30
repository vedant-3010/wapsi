import { useCallback, useEffect, useRef, useState } from 'react'

import { startOfTodayIst } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { Action, Call, Device, Handoff, Kpis, RiskRow } from '@/lib/types'
import { TERMINAL_STATUSES } from '@/lib/types'

export type Dashboard = {
  queue: RiskRow[]
  call: Call | null
  feed: Action[]
  device: Device | null
  handoffs: Handoff[]
  kpis: Kpis
  loaded: boolean
  error: string | null
}

const EMPTY: Dashboard = {
  queue: [],
  call: null,
  feed: [],
  device: null,
  handoffs: [],
  kpis: {
    atRisk: 0,
    callsToday: 0,
    verifiedSaves: 0,
    retained: 0,
    openHandoffs: 0,
    wapsiRate: null,
    wapsiCount: 0,
    holdoutRate: null,
    holdoutCount: 0,
    costPerSaveUsd: null,
  },
  loaded: false,
  error: null,
}

const ACTION_COLUMNS = 'id,call_id,merchant_id,device_id,type,detail,actor,created_at'
const FALLBACK_POLL_MS = 3000

/** The live call is the latest call that hasn't finished (and isn't stale). */
export function isCallActive(call: Call | null): boolean {
  if (!call || TERMINAL_STATUSES.includes(call.status)) return false
  return Date.now() - new Date(call.started_at).getTime() < 15 * 60 * 1000
}

type CohortDevice = {
  id: string
  status: string
  monthly_rent: number
  merchants: { cohort: 'wapsi' | 'holdout' } | null
}

function computeKpis(
  queue: RiskRow[],
  callsToday: number,
  cohortDevices: CohortDevice[],
  calls: { cost_cents: number | null; device_id: string | null }[],
  openHandoffs: number,
): Kpis {
  // SPEC §10. Recovery rate: devices Wapsi called vs the holdout it never calls (both ever at risk).
  const called = new Set(calls.map((c) => c.device_id))
  const rate = (devices: CohortDevice[]) =>
    devices.length ? devices.filter((d) => d.status === 'recovered').length / devices.length : null
  const wapsiCalled = cohortDevices.filter((d) => d.merchants?.cohort === 'wapsi' && called.has(d.id))
  const holdout = cohortDevices.filter((d) => d.merchants?.cohort === 'holdout')
  const saves = cohortDevices.filter((d) => d.status === 'recovered' && d.merchants?.cohort === 'wapsi')
  const totalCostUsd = calls.reduce((sum, c) => sum + (Number(c.cost_cents) || 0), 0) / 100
  return {
    atRisk: queue.length,
    callsToday,
    verifiedSaves: saves.length,
    retained: saves.reduce((sum, d) => sum + d.monthly_rent, 0),
    openHandoffs,
    wapsiRate: rate(wapsiCalled),
    wapsiCount: wapsiCalled.length,
    holdoutRate: rate(holdout),
    holdoutCount: holdout.length,
    costPerSaveUsd: saves.length && totalCostUsd ? totalCostUsd / saves.length : null,
  }
}

/** Everything the dashboard shows. Reads straight from Supabase; refetches on Realtime events. */
export function useDashboard() {
  const [data, setData] = useState<Dashboard>(EMPTY)
  const [realtime, setRealtime] = useState(false)
  const callRef = useRef<Call | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const load = useCallback(async () => {
    const [queue, calls, handoffs, cohortDevices, costs, today] = await Promise.all([
      supabase.from('risk_queue').select('*').order('risk_score', { ascending: false })
        .order('days_silent', { ascending: false }),
      supabase.from('calls').select('*, merchants(name, language)').order('started_at', { ascending: false }).limit(1),
      supabase.from('handoffs').select('*, merchants(name)').eq('status', 'open')
        .order('created_at', { ascending: false }),
      supabase.from('devices').select('id, status, monthly_rent, merchants!inner(cohort)')
        .not('at_risk_since', 'is', null),
      supabase.from('calls').select('cost_cents, device_id'),
      supabase.from('calls').select('id', { count: 'exact', head: true }).gte('started_at', startOfTodayIst()),
    ])
    const failed = [queue, calls, handoffs, cohortDevices, costs, today].find((r) => r.error)
    if (failed?.error) {
      console.error('Supabase read failed', failed.error)
      setData((prev) => ({ ...prev, loaded: true, error: failed.error.message }))
      return
    }

    const call = (calls.data?.[0] as Call | undefined) ?? null
    callRef.current = call
    let feed: Action[] = []
    let device: Device | null = null
    if (call) {
      // This call's actions, plus system actions after it started (technician visit, payments resumed).
      const [actions, devices] = await Promise.all([
        supabase.from('actions').select(ACTION_COLUMNS)
          .or(`call_id.eq.${call.id},and(call_id.is.null,created_at.gte."${call.started_at}")`)
          .order('id').limit(100),
        call.device_id
          ? supabase.from('devices').select('id, merchant_id, status, last_announced_at, merchants(name)')
            .eq('id', call.device_id).limit(1)
          : Promise.resolve({ data: [], error: null }),
      ])
      feed = (actions.data as Action[] | null) ?? []
      device = ((devices.data as Device[] | null) ?? [])[0] ?? null
    }

    const queueRows = (queue.data as RiskRow[] | null) ?? []
    const handoffRows = (handoffs.data as Handoff[] | null) ?? []
    setData({
      queue: queueRows,
      call,
      feed,
      device,
      handoffs: handoffRows,
      kpis: computeKpis(queueRows, today.count ?? 0, (cohortDevices.data as CohortDevice[] | null) ?? [],
        costs.data ?? [], handoffRows.length),
      loaded: true,
      error: null,
    })
  }, [])

  // Events come in bursts (a reset inserts 205 devices): refetch once per burst.
  const refresh = useCallback(() => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void load(), 150)
  }, [load])

  useEffect(() => {
    void load()
    const channel = supabase
      .channel('wapsi')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'actions' }, (payload) => {
        const action = payload.new as Action
        const call = callRef.current
        // Append straight away so the feed moves during the call; the refetch fills in the rest.
        if (call && (action.call_id === call.id || action.call_id === null)) {
          setData((prev) =>
            prev.feed.some((a) => a.id === action.id) ? prev : { ...prev, feed: [...prev.feed, action] },
          )
        }
        refresh()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'handoffs' }, refresh)
      .subscribe((status) => setRealtime(status === 'SUBSCRIBED'))
    return () => {
      window.clearTimeout(timer.current)
      void supabase.removeChannel(channel)
    }
  }, [load, refresh])

  // No polling while Realtime is up. If the venue network blocks the websocket, keep the demo moving.
  useEffect(() => {
    if (realtime) return
    const id = window.setInterval(() => void load(), FALLBACK_POLL_MS)
    return () => window.clearInterval(id)
  }, [realtime, load])

  return { ...data, realtime, refresh: load }
}
