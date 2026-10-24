import { StyleSheet, View } from 'react-native';
import { Landmark } from 'lucide-react-native';
import { c, radius } from '@/theme';

/** Placeholder mark until the society logo arrives (Q-008). */
export function Logo({ size = 64 }: { size?: number }) {
  return (
    <View style={[styles.box, { width: size, height: size }]}>
      <Landmark size={size * 0.5} color={c.primaryForeground} strokeWidth={1.75} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: c.primary,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
