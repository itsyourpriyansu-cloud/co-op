import seal from '@/assets/seal.png';

// Official society seal (D-052). Generated from assets/brand/tgseccsl-seal-source.jpg (docs/12 §6).
export function Seal({ size = 32, className = '' }: { size?: number; className?: string }) {
  return <img src={seal} width={size} height={size} alt="TGSECCSL seal" className={`shrink-0 select-none ${className}`} draggable={false} />;
}
