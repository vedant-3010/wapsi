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

/** A glass card with a mono caption header. */
export function Panel({ title, aside, children, className, bodyClassName, scroll = false }: PanelProps) {
  return (
    <section className={cn('glass flex min-h-0 flex-col rounded-card border border-line', className)}>
      <header className="flex min-h-12 flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-2">
        <h2 className="caption text-fg-2">{title}</h2>
        {aside}
      </header>
      <div
        data-scroll={scroll || undefined}
        className={cn('px-5 pb-5', scroll && 'min-h-0 flex-1 overflow-y-auto', bodyClassName)}
      >
        {children}
      </div>
    </section>
  )
}
