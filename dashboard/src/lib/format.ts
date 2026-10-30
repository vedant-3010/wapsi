const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const clock = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' })

/** ₹18,450 — Indian digit grouping. */
export const formatRupees = (amount: number) => rupees.format(amount)

/** 2:05 pm — always Asia/Kolkata, whatever the laptop's timezone. */
export const formatTime = (value: string | Date) => clock.format(new Date(value))
