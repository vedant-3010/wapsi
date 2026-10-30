import { ChevronDown } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'

import { SPRING_PANEL } from '@/lib/motion'
import { cn } from '@/lib/utils'

type Turn = { speaker: 'agent' | 'merchant'; text: string }

/** Bolna transcripts are lines of "assistant: …" / "user: …". */
function parseTranscript(transcript: string): Turn[] {
  const turns: Turn[] = []
  for (const line of transcript.split('\n')) {
    const match = line.match(/^\s*(assistant|agent|bot|user|human|customer)\s*:\s*(.*)$/i)
    if (match) {
      turns.push({ speaker: /^(user|human|customer)$/i.test(match[1]) ? 'merchant' : 'agent', text: match[2] })
    } else if (line.trim() && turns.length) {
      turns[turns.length - 1].text += ` ${line.trim()}`
    }
  }
  return turns
}

export function Transcript({ transcript, ownerFirstName }: { transcript: string; ownerFirstName: string }) {
  const [open, setOpen] = useState(false)
  const turns = parseTranscript(transcript)
  if (!turns.length) return null
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-control py-1 text-left text-[14px] font-medium text-ink-2 transition-colors hover:text-ink-1"
        aria-expanded={open}
      >
        Transcript · {turns.length} turns
        <ChevronDown className={cn('size-4 transition-transform duration-200', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ol
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING_PANEL}
            className="flex flex-col gap-2.5 overflow-hidden pt-3"
          >
            {turns.map((turn, i) => (
              <li key={i} className={cn('flex flex-col', turn.speaker === 'merchant' ? 'items-end' : 'items-start')}>
                <span className="caption mb-1 text-[12px]">{turn.speaker === 'agent' ? 'Wapsi' : ownerFirstName}</span>
                <span
                  className={cn(
                    'max-w-[85%] rounded-[16px] px-3.5 py-2 text-[15px] leading-snug text-ink-1',
                    turn.speaker === 'agent' ? 'rounded-tl-[5px] bg-paper-3' : 'rounded-tr-[5px] bg-sky-soft',
                  )}
                >
                  {turn.text}
                </span>
              </li>
            ))}
          </motion.ol>
        )}
      </AnimatePresence>
    </div>
  )
}
