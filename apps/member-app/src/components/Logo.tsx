import { Image } from 'react-native';

// Society logo on document cards (D-137). Rendered from assets/logo/tgseccs-logo.png (docs/12 §6).
const SEAL = require('../../assets/images/seal.png');

export function Logo({ size = 64 }: { size?: number }) {
  return <Image source={SEAL} style={{ width: size, height: size }} resizeMode="contain" accessibilityRole="image" accessibilityLabel="TGSECCSL seal" />;
}
