import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium ring-offset-background transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-gradient-to-b from-primary to-primary/95 text-primary-foreground shadow-[0_1px_2px_rgba(15,23,42,0.14),inset_0_1px_0_rgba(255,255,255,0.18)] hover:brightness-105 hover:shadow-[0_4px_12px_rgba(37,99,235,0.22)]',
        destructive:
          'bg-gradient-to-b from-destructive to-destructive/95 text-destructive-foreground shadow-[0_1px_2px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.14)] hover:brightness-105',
        outline:
          'border border-border/90 bg-card/95 text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-accent/70 hover:text-accent-foreground hover:border-primary/30',
        secondary:
          'bg-secondary/90 text-secondary-foreground hover:bg-secondary border border-transparent hover:border-border/60',
        ghost: 'hover:bg-accent/70 hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline active:scale-100',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-lg px-3 text-xs sm:text-sm',
        lg: 'h-11 rounded-xl px-7 text-base',
        icon: 'h-9 w-9 rounded-lg sm:h-10 sm:w-10 sm:rounded-xl',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
