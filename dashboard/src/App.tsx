import { KpiStrip } from '@/components/KpiStrip'
import { Panel } from '@/components/Panel'
import { TopBar } from '@/components/TopBar'

// Empty layout from SPEC §9. Panels fill in during PLAN Phases 4–5 (P1: Impact in Phase 7).
export default function App() {
  return (
    <div className="flex min-h-svh flex-col gap-4 p-6">
      <TopBar />
      <KpiStrip />
      <main className="grid flex-1 items-start gap-4 lg:grid-cols-[1fr_1.4fr_1fr]">
        {/* F1 */}
        <Panel title="At-risk queue" />
        {/* F5, F6 */}
        <Panel title="Live call" />
        <div className="flex flex-col gap-4">
          {/* F9 */}
          <Panel title="Virtual Soundbox" />
          {/* F10 */}
          <Panel title="Handoff queue" />
          {/* F11 */}
          <Panel title="Impact" />
        </div>
      </main>
    </div>
  )
}
