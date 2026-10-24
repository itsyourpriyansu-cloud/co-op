import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      tone: {
        neutral: 'bg-background text-muted border border-border',
        primary: 'bg-primary-subtle text-primary',
        accent: 'bg-accent/15 text-accent-foreground',
        success: 'bg-success/12 text-success',
        warning: 'bg-warning/15 text-warning',
        danger: 'bg-danger/12 text-danger',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
