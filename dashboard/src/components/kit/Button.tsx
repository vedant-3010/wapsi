import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/**
 * `pop` is the one main action on screen (Start Wapsi's run): ink with a hard edge that it presses
 * into. `primary` is plain ink for confirmations. `secondary` is a white card button. Every press dips.
 */
const buttonVariants = cva(
  'relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-control ' +
    'font-medium outline-none transition-[color,background-color,border-color,box-shadow,scale,transform] ' +
    'duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ink-1/25 focus-visible:ring-offset-2 ' +
    'focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        pop: 'pop',
        primary: 'bg-ink-1 text-white hover:bg-black active:scale-[0.97]',
        secondary:
          'border border-line bg-paper text-ink-1 shadow-card hover:-translate-y-px hover:border-line-strong ' +
          'hover:shadow-lift active:translate-y-0 active:scale-[0.97]',
        ghost: 'text-ink-2 hover:bg-paper-3 hover:text-ink-1 active:scale-[0.97]',
      },
      size: {
        sm: 'h-8 px-3 text-sm [&_svg]:size-4',
        md: 'h-10 px-4 text-[15px] [&_svg]:size-4',
        lg: 'h-12 px-6 text-[15px] [&_svg]:size-[18px]',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export type ButtonProps = ComponentProps<'button'> & VariantProps<typeof buttonVariants>

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
