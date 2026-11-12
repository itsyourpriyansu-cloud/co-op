// G4 (D-114): account deletion request, as Google Play and the App Store require. It reaches the
// office as a member question; the office closes the app sign-in and removes what the law lets it.
// The same steps are on the public page /account-deletion of the console.
import { useState } from 'react';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { isApiError } from '@tgs/api-client';
import { ask } from '@/components/staff';
import { api } from '@/lib/api';
import { Alert, Button, Card, Header, Screen, Section, Text, TextField } from '@/ui';

export default function DeleteAccount() {
  const [reason, setReason] = useState('');
  const send = useMutation({
    mutationFn: () =>
      api.account.createTicket({
        subject: 'Delete my app account',
        message: `Please delete my TGSECCSL app account and the personal data the society does not have to keep.${reason.trim() ? `\nReason: ${reason.trim()}` : ''}`,
        category: 'APP',
      }),
  });
  const submit = async () => {
    if (await ask('Send the request?', 'The office will close your app sign-in. Your loans, deposits and shares stay with the society.', 'Send request')) send.mutate();
  };

  return (
    <Screen header={<Header title="Delete my account" onBack={() => router.back()} />} footer={send.isSuccess ? <Button text="Done" size="lg" fullWidth onPress={() => router.back()} /> : <Button text="Send deletion request" buttonType="danger" size="lg" fullWidth loading={send.isPending} onPress={() => void submit()} />}>
      {send.isSuccess ? (
        <Alert type="success" heading="Request sent" description="The office will reply under Help within two working days, and will tell you when your app account is closed." />
      ) : (
        <>
          <Section title="What is deleted">
            <Card>
              <Text role="body">Your app sign-in, the phones that get your notifications, your message settings and the photos you uploaded that the society does not need to keep.</Text>
            </Card>
          </Section>
          <Section title="What the society keeps">
            <Card>
              <Text role="body">Your membership, loan, deposit, share and payment records, with the forms you signed. A co-operative credit society must keep them for its audits and the law. Membership itself ends only when you leave the society at the office.</Text>
            </Card>
          </Section>
          <TextField label="Why are you leaving? (optional)" value={reason} onChangeText={setReason} multiline />
          {send.isError ? <Alert type="error" heading="Not sent" description={isApiError(send.error) ? send.error.message : 'Please try again.'} /> : null}
        </>
      )}
    </Screen>
  );
}
