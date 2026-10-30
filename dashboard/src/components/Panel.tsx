import type { ReactNode } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type PanelProps = {
  title: string
  aside?: ReactNode
  children?: ReactNode
  className?: string
  /** Let the body scroll inside the panel (queue, feed). */
  scroll?: boolean
}

export function Panel({ title, aside, children, className, scroll = false }: PanelProps) {
  return (
    <Card className={cn('min-h-0', className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-lg">{title}</CardTitle>
        {aside}
      </CardHeader>
      <CardContent className={cn('text-base', scroll && 'min-h-0 flex-1 overflow-y-auto')}>
        {children ?? <p className="text-muted-foreground">Nothing yet.</p>}
      </CardContent>
    </Card>
  )
}
