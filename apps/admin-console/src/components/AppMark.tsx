import mark from '@/assets/logo.svg';

// App mark: the society logo (D-137), copy of apps/member-app/assets/logo/tgseccs-logo.svg.
export function AppMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return <img src={mark} width={size} height={size} alt="TGSECCSL" className={`shrink-0 select-none ${className}`} draggable={false} />;
}
