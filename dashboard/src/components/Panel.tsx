import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

type PanelProps = {
  title: string
  aside?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  /** Let the body scroll inside the panel (queue, feed). */
  scroll?: boolean
}

/** A white card on the paper, with a quiet title. */
export function Panel({ title, aside, children, className, bodyClassName, scroll = false }: PanelProps) {
  return (
    <section className={cn('card flex min-h-0 flex-col rounded-card', className)}>
      <header className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-6 pt-5 pb-2">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink-1">{title}</h2>
        {aside}
      </header>
      <div
        data-scroll={scroll || undefined}
        className={cn('px-6 pb-6', scroll && 'min-h-0 flex-1 overflow-y-auto', bodyClassName)}
      >
        {children}
      </div>
    </section>
  )
}
