export type Tone = 'sage' | 'amber' | 'coral' | 'sky' | 'idle'

/** Soft tag styles per tone (pastel fill + deep text). */
export const TAG: Record<Tone, string> = {
  sage: 'bg-sage-soft text-sage',
  amber: 'bg-amber-soft text-amber',
  coral: 'bg-coral-soft text-coral',
  sky: 'bg-sky-soft text-sky',
  idle: 'bg-paper-3 text-ink-2',
}
