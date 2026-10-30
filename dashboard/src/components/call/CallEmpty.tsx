import { BadgeCheck, PhoneOutgoing, Radar, Wrench } from 'lucide-react'
import { motion } from 'motion/react'

import { SPRING_PANEL } from '@/lib/motion'

const LOOP = [
  { icon: Radar, title: 'Detect', text: 'Soundboxes that went quiet, ranked by risk.' },
  { icon: PhoneOutgoing, title: 'Call', text: 'A real phone call, in the merchant’s language.' },
  { icon: Wrench, title: 'Fix', text: 'Diagnose, book, resend, credit, or hand to a person.' },
  { icon: BadgeCheck, title: 'Verify', text: 'A save counts only when payments come back.' },
]

/** Before the first call: what Wapsi is about to do. */
export function CallEmpty() {
  return (
    <div className="flex h-full flex-col justify-center py-6">
      <motion.h3
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING_PANEL}
        className="font-serif text-[44px] leading-[1.05] tracking-tight text-fg-1"
      >
        Ready when you are.
      </motion.h3>
      <p className="mt-3 max-w-md text-[15px] text-fg-2">
        Press <span className="text-fg-1">Start Wapsi’s run</span>. Wapsi picks the merchant most at risk, calls them, and
        every decision it makes appears here with the reason.
      </p>
      <ol className="mt-8 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {LOOP.map(({ icon: Icon, title, text }, i) => (
          <motion.li
            key={title}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING_PANEL, delay: 0.12 + i * 0.07 }}
            className="rounded-[14px] border border-line bg-surface-1 p-3.5"
          >
            <div className="flex items-center justify-between">
              <Icon className="size-4 text-paytm" />
              <span className="caption">0{i + 1}</span>
            </div>
            <div className="mt-3 text-[15px] font-medium">{title}</div>
            <div className="mt-0.5 text-[13px] leading-snug text-fg-3">{text}</div>
          </motion.li>
        ))}
      </ol>
    </div>
  )
}
