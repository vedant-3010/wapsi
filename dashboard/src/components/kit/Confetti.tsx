import type { CSSProperties } from 'react'

// The Paytm palette: navy, cyan, and the state colours.
const COLORS = ['#172b75', '#00bcf1', '#4cc38a', '#f2b23e', '#7fd9f7', '#c9d5f5']

// Fixed, hand-spread pieces (no randomness: the burst looks the same every time).
const PIECES = Array.from({ length: 22 }, (_, i) => {
  const angle = (i / 22) * Math.PI * 2 + (i % 3) * 0.21
  const distance = 70 + ((i * 37) % 60)
  return {
    dx: Math.cos(angle) * distance,
    dy: Math.sin(angle) * distance - 30,
    spin: ((i * 97) % 540) - 270,
    color: COLORS[i % COLORS.length],
    round: i % 3 === 0,
    delay: (i % 5) * 18,
  }
})

/** A one-shot burst from the centre of its parent. Remount (new key) to fire again. */
export function Confetti() {
  return (
    <span className="pointer-events-none absolute top-1/2 left-1/2 z-10" aria-hidden>
      {PIECES.map((p, i) => (
        <span
          key={i}
          className={`absolute block animate-confetti ${p.round ? 'size-2 rounded-full' : 'h-2.5 w-1.5 rounded-[2px]'}`}
          style={
            {
              background: p.color,
              animationDelay: `${p.delay}ms`,
              '--dx': `${p.dx}px`,
              '--dy': `${p.dy}px`,
              '--spin': `${p.spin}deg`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  )
}
