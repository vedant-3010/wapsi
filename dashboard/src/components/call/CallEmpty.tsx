import { BadgeCheck, PhoneOutgoing, Radar, Wrench } from 'lucide-react'
import { motion } from 'motion/react'

import { SPRING_PANEL } from '@/lib/motion'

const LOOP = [
  { icon: Radar, title: 'Detect', text: 'Soundboxes that went quiet, ranked by risk.', tone: 'bg-coral-soft text-coral' },
  { icon: PhoneOutgoing, title: 'Call', text: 'A real phone call, in the merchant’s language.', tone: 'bg-sky-soft text-sky' },
  { icon: Wrench, title: 'Fix', text: 'Diagnose, book, resend, credit, or hand to a person.', tone: 'bg-amber-soft text-amber' },
  { icon: BadgeCheck, title: 'Verify', text: 'A save counts only when payments come back.', tone: 'bg-sage-soft text-sage' },
]

/** Before the first call: what Wapsi is about to do. */
export function CallEmpty() {
  return (
    <div className="flex h-full flex-col justify-center py-4">
      <motion.h3
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING_PANEL}
        className="font-display text-[44px] leading-[1.05] font-bold tracking-tight text-ink-1"
      >
        Ready when <span className="italic">you</span> are.
      </motion.h3>
      <p className="mt-4 max-w-md text-[16px] leading-relaxed text-ink-2">
        Press <span className="font-semibold text-ink-1">Start Wapsi’s run</span>. Wapsi picks the merchant most at risk,
        calls them, and every decision it makes appears here with the reason.
      </p>
      <ol className="mt-9 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {LOOP.map(({ icon: Icon, title, text, tone }, i) => (
          <motion.li
            key={title}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING_PANEL, delay: 0.12 + i * 0.07 }}
            whileHover={{ y: -3 }}
            className="rounded-[18px] border border-line bg-paper-2 p-4 transition-shadow hover:shadow-lift"
          >
            <div className="flex items-center justify-between">
              <span className={`grid size-8 place-items-center rounded-full ${tone}`}>
                <Icon className="size-4" />
              </span>
              <span className="font-display text-lg font-bold text-ink-4">{i + 1}</span>
            </div>
            <div className="mt-3 text-[15px] font-semibold">{title}</div>
            <div className="mt-0.5 text-[13px] leading-snug text-ink-3">{text}</div>
          </motion.li>
        ))}
      </ol>
    </div>
  )
}
