import { Image } from 'react-native';

// App mark: the society logo (D-137). Rendered from assets/logo/tgseccs-logo.png.
const MARK = require('../../assets/images/app-mark.png');

export function AppMark({ size = 48 }: { size?: number }) {
  return <Image source={MARK} style={{ width: size, height: size }} resizeMode="contain" accessibilityRole="image" accessibilityLabel="TGSECCSL" />;
}
