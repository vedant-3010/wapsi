import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/**
 * `brand` (Paytm blue) is the one main action on screen: Start Wapsi's run. `primary` is inverted
 * (light on dark) for confirmations. `secondary` is glass. Every press dips.
 */
const buttonVariants = cva(
  'relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-control ' +
    'font-medium outline-none transition-[color,background-color,border-color,box-shadow,scale,filter] ' +
    'duration-150 ease-out active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-paytm/60 ' +
    'disabled:pointer-events-none disabled:opacity-40 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        brand:
          'bg-paytm text-paytm-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_10px_28px_-10px_rgb(0_186_242/0.7)] ' +
          'hover:brightness-110',
        primary: 'bg-inverse text-inverse-fg hover:bg-white',
        secondary: 'glass-control border border-line text-fg-1 hover:border-line-strong hover:bg-surface-3',
        ghost: 'text-fg-2 hover:bg-surface-2 hover:text-fg-1',
      },
      size: {
        sm: 'h-8 px-3 text-sm [&_svg]:size-4',
        md: 'h-10 px-4 text-[15px] [&_svg]:size-4',
        lg: 'h-11 px-5 text-[15px] [&_svg]:size-[18px]',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export type ButtonProps = ComponentProps<'button'> & VariantProps<typeof buttonVariants>

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
