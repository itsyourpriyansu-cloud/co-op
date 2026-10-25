// Decorative initials for a person shown next to their name (D-064). Replaces Blend AvatarV2's
// name-hashed rainbow fills, several of which fail WCAG contrast; this uses the brand tint like
// the member app. Hidden from assistive tech because the name is always beside it.
import { cn } from '@/lib/utils';

const SIZE = { sm: 'size-8 text-caption-strong', md: 'size-10 text-label', lg: 'size-14 text-card-title' } as const;

export function Initials({ name, size = 'sm', className }: { name: string; size?: keyof typeof SIZE; className?: string }) {
  const letters = name.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span aria-hidden className={cn('inline-flex shrink-0 items-center justify-center rounded-pill bg-brand-subtle text-brand-text', SIZE[size], className)}>
      {letters}
    </span>
  );
}
