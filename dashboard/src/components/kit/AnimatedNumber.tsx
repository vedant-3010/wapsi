import { animate } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

type AnimatedNumberProps = {
  value: number
  format?: (n: number) => string
  className?: string
}

/** Counts to a new value instead of jumping, and floats a "+n" when it goes up. */
export function AnimatedNumber({ value, format = (n) => String(Math.round(n)), className }: AnimatedNumberProps) {
  const node = useRef<HTMLSpanElement>(null)
  const shown = useRef(value)
  // React renders the first value only; after that the animation owns the text.
  const [initial] = useState(() => format(value))
  const [gain, setGain] = useState<{ amount: number; at: number } | null>(null)

  useEffect(() => {
    const from = shown.current
    if (from === value) return
    if (value > from) setGain({ amount: value - from, at: Date.now() })
    const controls = animate(from, value, {
      duration: 0.7,
      ease: [0.2, 0, 0, 1],
      onUpdate: (n) => {
        shown.current = n
        if (node.current) node.current.textContent = format(n)
      },
    })
    return () => controls.stop()
  }, [value, format])

  return (
    <span className={cn('relative inline-block tabular-nums', className)}>
      <span ref={node}>{initial}</span>
      {gain && (
        <span
          key={gain.at}
          className="absolute -top-1 left-full ml-1.5 font-mono text-sm font-medium text-ok animate-float-up"
          onAnimationEnd={() => setGain(null)}
        >
          +{format(gain.amount)}
        </span>
      )}
    </span>
  )
}
