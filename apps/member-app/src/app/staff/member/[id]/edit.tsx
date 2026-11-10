// ST-11m
import { useLocalSearchParams } from 'expo-router';
import { StaffMemberForm } from '@/components/StaffMemberForm';

export default function EditMember() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <StaffMemberForm id={id} />;
}
