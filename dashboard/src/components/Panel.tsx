import type { ReactNode } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type PanelProps = { title: string; children?: ReactNode }

export function Panel({ title, children }: PanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground">{children ?? 'Nothing yet.'}</CardContent>
    </Card>
  )
}
