// Member profile hooks (MB-02, MB-19). The profile polls so a decision taken in the console
// (DDO certify, Accountant approve) shows up on the phone without a manual refresh.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChangeRequestInput, ContactUpdateInput, MyProfile } from '@tgs/types';
import { api } from './api';

export const profileKey = ['my-profile'] as const;

export function useMyProfile() {
  return useQuery({ queryKey: profileKey, queryFn: api.profile.get, refetchInterval: 5000 });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ContactUpdateInput) => api.profile.updateContact(input),
    onSuccess: (p: MyProfile) => qc.setQueryData(profileKey, p),
  });
}

export function useRequestChange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ChangeRequestInput) => api.profile.requestChange(input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: profileKey }),
  });
}
