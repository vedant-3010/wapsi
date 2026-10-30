import { useEffect, useState } from 'react'

/** Seconds since `start`, ticking once a second while `running` (0 otherwise). */
export function useElapsed(start: string | null, running: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [running])
  if (!start || !running) return 0
  return Math.max(0, Math.floor((now - new Date(start).getTime()) / 1000))
}
