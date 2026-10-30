import { Button } from '@/components/ui/button'

// Wired in PLAN Phase 4 (Start Wapsi's run, F16) and Phase 5 (Reset demo, Simulate next day).
export function TopBar() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        Wapsi <span className="font-normal text-muted-foreground">· Merchant recovery</span>
      </h1>
      <div className="flex flex-wrap gap-3">
        <Button size="lg" className="px-5 text-base" disabled>
          Start Wapsi’s run
        </Button>
        <Button size="lg" variant="outline" className="text-base" disabled>
          Reset demo
        </Button>
        <Button size="lg" variant="outline" className="text-base" disabled>
          Simulate next day
        </Button>
      </div>
    </header>
  )
}
