import { Image } from 'react-native';

// Official society seal (D-052). Generated from assets/brand/tgseccsl-seal-source.jpg (docs/12 §6).
const SEAL = require('../../assets/images/seal.png');

export function Logo({ size = 64 }: { size?: number }) {
  return <Image source={SEAL} style={{ width: size, height: size }} resizeMode="contain" accessibilityRole="image" accessibilityLabel="TGSECCSL seal" />;
}
