// Printable form twins live under /reports/print, but most are opened from a record (a loan, a deposit,
// a member). Opening one records where it came from, so the sidebar stays on that module and the form's
// back button returns to the record instead of to Reports.
import { useLocation, useNavigate } from 'react-router';

type FormState = { formFrom?: string } | null;

/** Open a form page, remembering the page it was opened from. */
export function useOpenForm() {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  return (to: string) => navigate(to, { state: { formFrom: pathname + search } });
}

/** The page a form was opened from, if it was opened from inside the console. */
export const formOrigin = (state: unknown): string | undefined => (state as FormState)?.formFrom;
