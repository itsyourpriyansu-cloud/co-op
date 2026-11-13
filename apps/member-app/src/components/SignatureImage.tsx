// F-01 (D-096): a stored signature shown to staff (the applicant's or surety's, as signed). The image
// comes from the backend as a data URL; the read is audited there.
import { Image, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Skeleton, Text } from '@/ui';
import { color, radius, space } from '@/theme';

export function SignatureImage({ fileId, name }: { fileId: string; name: string }) {
  const q = useQuery({ queryKey: ['signature', fileId], queryFn: () => api.signatures.image(fileId), staleTime: Infinity, retry: false });
  if (q.isLoading) return <Skeleton height={64} radius={radius.card} />;
  if (!q.data) {
    return (
      <Text role="caption" tone="tertiary">
        Signature image not available.
      </Text>
    );
  }
  return (
    <View style={{ gap: space[2], padding: space[3], borderRadius: radius.card, backgroundColor: color.bg.surface, borderWidth: 1, borderColor: color.border.subtle }}>
      <Text role="caption" tone="tertiary">
        Signature of {name}
      </Text>
      <Image source={{ uri: q.data.dataUrl }} accessibilityLabel={`Signature of ${name}`} resizeMode="contain" style={{ height: 64, width: '100%' }} />
    </View>
  );
}
