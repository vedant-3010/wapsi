import type { Transition } from 'motion/react'

// Springs for the "lively on change" motion system (one-shot CSS keyframes live in index.css).

/** Panels, rows, dialogs: quick with a hint of overshoot. */
export const SPRING_PANEL: Transition = { type: 'spring', stiffness: 420, damping: 32, mass: 0.8 }

/** Things that appear (feed steps, chips): a visible, short overshoot. */
export const SPRING_POP: Transition = { type: 'spring', stiffness: 520, damping: 24, mass: 0.7 }

/** Delay between siblings entering one after another, in seconds. */
export const STAGGER = 0.035
