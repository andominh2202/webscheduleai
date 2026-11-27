import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium leading-tight transition-colors duration-fast focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground shadow-soft hover:bg-primary/90',
        secondary:
          'border-border/60 bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'border-transparent bg-destructive/12 text-destructive border-destructive/20 dark:bg-destructive/20',
        success:
          'border-success/20 bg-success/12 text-success dark:bg-success/20',
        warning:
          'border-warning/25 bg-warning/15 text-warning-foreground dark:text-warning dark:bg-warning/20',
        info:
          'border-info/20 bg-info/12 text-info dark:bg-info/20',
        outline: 'border-border bg-card text-foreground',
        subtle: 'border-transparent bg-muted text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
