import type { Language } from '@/lib/types'

// What a Soundbox says when a payment lands, in the merchant's language. Spoken by useAnnouncer and
// shown in the 3D model's speech bubble, so both always say the same words. Amounts are digits;
// Indian voices read them in the language.
export const ANNOUNCEMENTS: Record<Language, { lang: string; text: (amount: number) => string }> = {
  hi: { lang: 'hi-IN', text: (n) => `Paytm पर ${n} रुपये प्राप्त हुए` },
  mr: { lang: 'mr-IN', text: (n) => `Paytm वर ${n} रुपये मिळाले` },
  en: { lang: 'en-IN', text: (n) => `Received ${n} rupees on Paytm` },
}

export function announcement(amount: number, language: Language): string {
  return (ANNOUNCEMENTS[language] ?? ANNOUNCEMENTS.hi).text(amount)
}
