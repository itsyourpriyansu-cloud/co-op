import mark from '@/assets/app-mark.svg';

// App mark: TG monogram tile (D-094), from assets/brand/tgseccsl-mark-tile.svg. Prints keep the Seal.
export function AppMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return <img src={mark} width={size} height={size} alt="TGSECCSL" className={`shrink-0 select-none ${className}`} draggable={false} />;
}
