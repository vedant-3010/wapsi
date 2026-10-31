import { useCallback, useEffect, useRef } from 'react'

import { ANNOUNCEMENTS } from '@/lib/announce'
import type { Language } from '@/lib/types'

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices()
  const matching = voices.filter((v) => v.lang.replace('_', '-').startsWith(lang))
  // Network voices (e.g. Google हिन्दी) sound far better than the offline ones.
  return matching.find((v) => !v.localService) ?? matching[0]
}

/**
 * The Soundbox's voice: a two-note chime, then the amount in the merchant's language. Browsers
 * block audio until the first click on the page, so this primes the audio context on that click.
 */
export function useAnnouncer() {
  const context = useRef<AudioContext | null>(null)

  useEffect(() => {
    const unlock = () => {
      context.current ??= new AudioContext()
      void context.current.resume()
      window.speechSynthesis.getVoices() // loads the voice list early
    }
    window.addEventListener('pointerdown', unlock, { once: true })
    return () => window.removeEventListener('pointerdown', unlock)
  }, [])

  return useCallback((amount: number, language: Language) => {
    const audio = context.current
    if (audio) {
      ;[1318.5, 1760].forEach((frequency, i) => {
        const start = audio.currentTime + i * 0.14
        const tone = audio.createOscillator()
        const gain = audio.createGain()
        tone.type = 'sine'
        tone.frequency.value = frequency
        gain.gain.setValueAtTime(0.0001, start)
        gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5)
        tone.connect(gain).connect(audio.destination)
        tone.start(start)
        tone.stop(start + 0.55)
      })
    }
    if (!amount || !('speechSynthesis' in window)) return
    const phrase = ANNOUNCEMENTS[language] ?? ANNOUNCEMENTS.hi
    const speech = new SpeechSynthesisUtterance(phrase.text(amount))
    speech.lang = phrase.lang
    const voice = pickVoice(phrase.lang) ?? pickVoice('hi-IN')
    if (voice) speech.voice = voice
    window.setTimeout(() => window.speechSynthesis.speak(speech), 450)
  }, [])
}
