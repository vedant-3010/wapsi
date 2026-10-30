import { useId } from 'react'

import { cn } from '@/lib/utils'

type SparklineProps = {
  values: number[]
  /** How many of the last points are the "recent" segment, drawn in the alert colour. */
  recent?: number
  /** Marks the last point as today (after Simulate next day). */
  today?: boolean
  width?: number
  height?: number
  /** Fill the container's width instead of a fixed size. */
  stretch?: boolean
  area?: boolean
  className?: string
  label: string
}

/** One series, no axes: the shape of 30 days of QR payments. The drop is the story. */
export function Sparkline({
  values,
  recent = 3,
  today = false,
  width = 88,
  height = 28,
  stretch = false,
  area = false,
  className,
  label,
}: SparklineProps) {
  const gradient = useId()
  if (values.length < 2) return <span className={cn('inline-block', className)} style={{ width, height }} />

  const max = Math.max(...values, 1)
  const pad = 3
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2)
  const y = (v: number) => height - pad - (v / max) * (height - pad * 2)
  const points = values.map((v, i) => [x(i), y(v)] as const)
  const path = (from: number, to: number) =>
    points.slice(from, to).map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('')

  const lastIndex = values.length - 1
  const historyEnd = today ? lastIndex : values.length
  const recentStart = Math.max(0, historyEnd - recent - 1)
  const [lastX, lastY] = points[lastIndex]
  const stroke = { vectorEffect: 'non-scaling-stroke' as const }

  return (
    <span
      className={cn('relative inline-block shrink-0', className)}
      style={stretch ? { height, width: '100%' } : { width, height }}
      role="img"
      aria-label={label}
      title={label}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="absolute inset-0 size-full overflow-visible"
        aria-hidden
      >
        {area && (
          <>
            <defs>
              <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="currentColor" stopOpacity="0.18" />
                <stop offset="1" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`${path(0, values.length)}L${lastX},${height}L${pad},${height}Z`} fill={`url(#${gradient})`} />
          </>
        )}
        <path d={path(0, recentStart + 1)} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" {...stroke} />
        <path
          d={path(recentStart, historyEnd)}
          fill="none"
          className="stroke-coral-mid"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          {...stroke}
        />
        {today && (
          <path d={path(lastIndex - 1, values.length)} fill="none" className="stroke-sage" strokeWidth="2" strokeDasharray="3 3" {...stroke} />
        )}
      </svg>
      {/* An HTML dot stays round when the line stretches. */}
      {today && (
        <span
          className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper bg-sage animate-status-pop"
          style={{ left: `${(lastX / width) * 100}%`, top: `${(lastY / height) * 100}%` }}
        />
      )}
    </span>
  )
}
