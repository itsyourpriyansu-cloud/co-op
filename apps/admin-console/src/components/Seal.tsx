import seal from '@/assets/seal.png';

// Society logo on prints (D-137). Rendered from apps/member-app/assets/logo/tgseccs-logo.png (docs/12 §6).
export function Seal({ size = 32, className = '' }: { size?: number; className?: string }) {
  return <img src={seal} width={size} height={size} alt="TGSECCSL seal" className={`shrink-0 select-none ${className}`} draggable={false} />;
}
