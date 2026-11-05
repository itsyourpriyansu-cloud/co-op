import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';

// App mark: TG monogram tile (D-094). Copy of assets/brand/tgseccsl-mark-tile.svg; keep them in sync.
// The seal (Logo.tsx) stays on documents only.
const TILE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#0561E2"/><g fill="none" stroke="#FFFFFF" stroke-width="12" transform="translate(50 50) scale(.62) translate(-52 -56)"><path d="M12 36H66A20 20 0 1 0 86 56H70"/><path d="M28 36V82"/></g></svg>`;

export function AppMark({ size = 48 }: { size?: number }) {
  // The View carries the a11y props: react-native-svg passes `accessible` to the web DOM as an invalid attribute.
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="TGSECCSL" style={{ width: size, height: size }}>
      <SvgXml xml={TILE} width={size} height={size} />
    </View>
  );
}
