// Reference data for joining: required documents and the versioned agreement texts (D-031).
// Shared by the applicant flow (joining.ts) and the staff review (membership.ts).
import type { JoiningReference } from '@tgs/types';

export const TEXT_VERSION = 'F1+F6-2026.1';

export const REQUIRED_DOCUMENTS: JoiningReference['requiredDocuments'] = [
  { type: 'PHOTO', label: 'Passport photo', hint: 'Recent, plain background', required: true },
  { type: 'ID_PROOF', label: 'Government ID card', hint: 'Secretariat employee ID card', required: true },
  { type: 'APPOINTMENT_ORDER', label: 'Appointment order', hint: 'Order of regular appointment', required: true },
  { type: 'SERVICE_CERTIFICATE', label: 'Probation certificate', hint: 'Only for approved probationers', required: false },
];

export const AGREEMENTS: JoiningReference['agreements'] = [
  {
    key: 'byelaws',
    title: 'Bye-laws of the society',
    version: TEXT_VERSION,
    summary: ['You become a shareholder with voting rights at the general body.', 'Dues are recovered from your salary every month.', 'The society can recover unpaid dues from your deposits.'],
    text: 'I accept the Bye-laws of the society as binding upon me.',
  },
  {
    key: 'noOtherSociety',
    title: 'No other credit society',
    version: TEXT_VERSION,
    summary: ['You are not a member of any other co-operative credit society.', 'You have no dues payable to any such society.'],
    text: 'I hereby declare that I am not a member of any other Co-operative Credit Society and I have no dues payable to any such Society.',
  },
  {
    key: 'recoveryMandate',
    title: 'Salary recovery agreement',
    version: TEXT_VERSION,
    summary: [
      'Your pay disbursing officer (DDO) will deduct society dues from your salary each month.',
      'This covers your own dues and any dues you owe as a surety for another member.',
      'Unpaid dues at retirement or death may be recovered from gratuity.',
      'If you are transferred, the society will send this agreement to your new pay officer.',
    ],
    text:
      'I authorise my pay disbursing officer, and any pay disbursing officer under whom I may serve in future, to recover on demand by the society from my monthly salary any instalment of a loan, thrift deposit or other sum due by me to The Telangana Secretariat Employees Co-operative Credit Society Ltd., as borrower or as surety. I accept a demand certified by an officer of the society as conclusive evidence of my liability. Sums remaining unpaid at my retirement or earlier death may be recovered from the gratuity sanctioned to me or my dependants. I shall not ask for the suspension of the recovery. If I am transferred out of the Secretariat, the society may communicate this agreement to my new pay disbursing officer.',
  },
];
