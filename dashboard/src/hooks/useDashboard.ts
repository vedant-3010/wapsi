import { useCallback, useEffect, useReducer, useRef, useState } from 'react'

import { api } from '@/lib/api'
import { startOfTodayIst } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { Action, Call, Device, Handoff, Kpis, PublicConfig, RiskRow, VolumeSeries } from '@/lib/types'
import { TERMINAL_STATUSES } from '@/lib/types'

export type Dashboard = {
  queue: RiskRow[]
  call: Call | null
  feed: Action[]
  device: Device | null
  handoffs: Handoff[]
  series: Record<string, number[]>
  /** Missed merchants Wapsi will call again: merchant_id → retry time (F18). */
  retries: Record<string, string>
  kpis: Kpis
  loaded: boolean
  error: string | null
}

const EMPTY_KPIS: Kpis = {
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
}

const EMPTY: Dashboard = {
  queue: [],
  call: null,
  feed: [],
  device: null,
  handoffs: [],
  series: {},
  retries: {},
  kpis: EMPTY_KPIS,
  loaded: false,
  error: null,
}

const ACTION_COLUMNS = 'id,call_id,merchant_id,device_id,type,detail,actor,payload,created_at'
const CALL_COLUMNS =
  'id,merchant_id,device_id,phone,bolna_execution_id,status,started_at,ended_at,duration_s,transcript,summary,' +
  'outcome,recording_url:raw->telephony_data->>recording_url,merchants(name,owner_name,area,language)'
const FALLBACK_POLL_MS = 3000
const ACTIVE_WINDOW_MS = 15 * 60 * 1000
const QUEUED_GRACE_MS = 2 * 60 * 1000

/** Same rule as the backend (wapsi/context.py): not final, recent, and neither stuck in "queued" nor an
 *  abandoned dry run. */
export function isCallActive(call: Call | null): boolean {
  if (!call || TERMINAL_STATUSES.includes(call.status)) return false
  const age = Date.now() - new Date(call.started_at).getTime()
  const dryRun = call.bolna_execution_id?.startsWith('dry-') ?? false
  if ((call.status === 'queued' || dryRun) && age > QUEUED_GRACE_MS) return false
  return age < ACTIVE_WINDOW_MS
}

/**
 * isCallActive, re-checked when the clock ends it. A dry run, or a call Bolna never dialled, sends no
 * more events, so nothing else would re-render the page once its time in "queued" is up.
 */
export function useCallActive(call: Call | null): boolean {
  const [, recheck] = useReducer((n: number) => n + 1, 0)
  const active = isCallActive(call)
  useEffect(() => {
    if (!active || !call) return
    const dryRun = call.bolna_execution_id?.startsWith('dry-') ?? false
    const limit = call.status === 'queued' || dryRun ? QUEUED_GRACE_MS : ACTIVE_WINDOW_MS
    const left = new Date(call.started_at).getTime() + limit - Date.now()
    const id = window.setTimeout(recheck, left + 250)
    return () => window.clearTimeout(id)
  }, [active, call])
  return active
}

type FollowUp = { merchant_id: string; type: string; payload: Record<string, unknown> | null }

/** A merchant's latest retry counts only if no call has started since (rows come newest first). */
function pendingRetries(rows: FollowUp[]): Record<string, string> {
  const seen = new Set<string>()
  const retries: Record<string, string> = {}
  for (const row of rows) {
    if (seen.has(row.merchant_id)) continue
    seen.add(row.merchant_id)
    const at = row.payload?.retry_at
    if (row.type === 'retry_scheduled' && typeof at === 'string') retries[row.merchant_id] = at
  }
  return retries
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
  // Guardrails from the backend (Safety strip). Fetched apart from the Supabase reads so a cold
  // backend never slows the live feed.
  const [config, setConfig] = useState<PublicConfig | null>(null)
  const loadConfig = useCallback(() => api.config().then(setConfig, () => undefined), [])
  const callRef = useRef<Call | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const load = useCallback(async () => {
    const [queue, calls, handoffs, cohortDevices, costs, today, followUps] = await Promise.all([
      supabase.from('risk_queue').select('*').order('risk_score', { ascending: false })
        .order('days_silent', { ascending: false }),
      supabase.from('calls').select(CALL_COLUMNS).order('started_at', { ascending: false }).limit(1),
      supabase.from('handoffs').select('*, merchants(name)').eq('status', 'open')
        .order('created_at', { ascending: false }),
      supabase.from('devices').select('id, status, monthly_rent, merchants!inner(cohort)')
        .not('at_risk_since', 'is', null),
      supabase.from('calls').select('cost_cents, device_id'),
      supabase.from('calls').select('id', { count: 'exact', head: true }).gte('started_at', startOfTodayIst()),
      supabase.from('actions').select('merchant_id, type, payload').in('type', ['retry_scheduled', 'call_started'])
        .order('created_at', { ascending: false }).limit(200),
    ])
    const failed = [queue, calls, handoffs, cohortDevices, costs, today, followUps].find((r) => r.error)
    if (failed?.error) {
      console.error('Supabase read failed', failed.error)
      setData((prev) => ({ ...prev, loaded: true, error: failed.error.message }))
      return
    }

    const call = ((calls.data as unknown as Call[] | null) ?? [])[0] ?? null
    callRef.current = call
    const queueRows = (queue.data as RiskRow[] | null) ?? []
    const deviceIds = [...new Set([...queueRows.map((r) => r.device_id), ...(call?.device_id ? [call.device_id] : [])])]

    const [actions, devices, volumes] = await Promise.all([
      call
        ? // This call's actions, plus system actions after it started (technician visit, payments resumed).
          supabase.from('actions').select(ACTION_COLUMNS)
            .or(`call_id.eq.${call.id},and(call_id.is.null,created_at.gte."${call.started_at}")`)
            .order('id').limit(100)
        : Promise.resolve({ data: [] }),
      call?.device_id
        ? supabase.from('devices').select('id, merchant_id, status, last_announced_at, merchants(name, language)')
            .eq('id', call.device_id).limit(1)
        : Promise.resolve({ data: [] }),
      deviceIds.length
        ? supabase.from('volume_series').select('device_id, days, txns').in('device_id', deviceIds)
        : Promise.resolve({ data: [] }),
    ])

    const handoffRows = (handoffs.data as Handoff[] | null) ?? []
    setData({
      queue: queueRows,
      call,
      feed: (actions.data as Action[] | null) ?? [],
      device: ((devices.data as Device[] | null) ?? [])[0] ?? null,
      handoffs: handoffRows,
      series: Object.fromEntries(((volumes.data as VolumeSeries[] | null) ?? []).map((v) => [v.device_id, v.txns])),
      retries: pendingRetries((followUps.data as FollowUp[] | null) ?? []),
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
    void loadConfig()
    const channel = supabase
      .channel('wapsi')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'actions' }, (payload) => {
        const action = payload.new as Action
        const call = callRef.current
        // Append straight away so the feed moves during the call; the refetch fills in the rest.
        if (call && (action.call_id === call.id || action.call_id === null)) {
          setData((prev) =>
            prev.feed.some((a) => a.id === action.id && a.created_at === action.created_at)
              ? prev
              : { ...prev, feed: [...prev.feed, action] },
          )
        }
        refresh()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'handoffs' }, refresh)
      .subscribe((status) => {
        const live = status === 'SUBSCRIBED'
        setRealtime(live)
        if (live) refresh() // catch up on anything missed while disconnected
      })
    return () => {
      window.clearTimeout(timer.current)
      void supabase.removeChannel(channel)
    }
  }, [load, loadConfig, refresh])

  // No polling while Realtime is up. If the venue network blocks the websocket, keep the demo moving.
  useEffect(() => {
    if (realtime) return
    const id = window.setInterval(() => void load(), FALLBACK_POLL_MS)
    return () => window.clearInterval(id)
  }, [realtime, load])

  const reload = useCallback(async () => {
    await Promise.all([load(), loadConfig()])
  }, [load, loadConfig])

  return { ...data, config, realtime, refresh: reload }
}
