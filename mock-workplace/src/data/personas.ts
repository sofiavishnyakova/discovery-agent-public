// Who is being recorded, and the planted problems the analysis agent should find.

export interface Persona {
  id: string
  name: string
  tagline: string
  style: string[]
}

export const PERSONAS: Persona[] = [
  {
    id: 'sara', name: 'Sara', tagline: 'Senior AP clerk · 4 years in the role',
    style: [
      'Work fast and in inbox order, top to bottom.',
      'Trust the PO number on the invoice; only open ProcureHub if something looks off.',
      'Email Rania as soon as a bill goes to "Pending approval".',
      'Batch your tracker updates: log several invoices at once.',
    ],
  },
  {
    id: 'omar', name: 'Omar', tagline: 'AP clerk · careful double-checker',
    style: [
      'Before entering any bill, open the PO in ProcureHub and check the remaining balance.',
      'Re-calculate the VAT yourself (5% of the net amount).',
      'Update the AP Tracker straight after each invoice.',
      'Re-read emails before sending them.',
    ],
  },
  {
    id: 'lina', name: 'Lina', tagline: 'New AP clerk · second week on the job',
    style: [
      'You are still learning the systems. Read the AP procedure below as you go.',
      'Type the numbers by hand rather than copy-pasting (you will make some typos — fix them when LedgerPoint complains).',
      'If unsure, ask Rania by email.',
      'It is fine to skip an email you don\'t understand and come back to it.',
    ],
  },
]

export const AP_PROCEDURE = [
  'Open the next email in the AP inbox (ap@meridian-advisory.ae).',
  'Invoice? Open the attachment and click Download so you can attach it in LedgerPoint.',
  'In LedgerPoint → New Bill: pick the supplier, copy the invoice number, dates, PO number, net amount and VAT, choose the cost category, attach the file, submit.',
  'If the invoice has no PO number, search ProcureHub by supplier to find the right open PO.',
  'Totals over AED 25,000 go to "Pending approval": email Rania with the LP reference, then enter the approval code she sends on the bill page.',
  'Add a row to the AP Tracker: date, supplier, invoice number, total, LP reference, status.',
  'Problems (wrong VAT, wrong company name, duplicate, over PO balance): do not enter the bill. Email the supplier or Rania and log it in the tracker as "On hold" with a note.',
  'Supplier asking about payment? Look the invoice up in LedgerPoint → Bills and reply with its status and payment date.',
  'New supplier? Ask for their trade licence, VAT (TRN) certificate and bank letter, then submit a New Supplier request in LedgerPoint.',
]

export const ANSWER_KEY = [
  { email: 'e05', invoice: 'SFM-INV-55117', problem: 'VAT miscalculated: 680 instead of 620 (5% of 12,400).', expected: 'Do not enter. Email Skyline → revised invoice arrives → enter that one.' },
  { email: 'e17', invoice: 'AWC/10/2264', problem: 'Duplicate: already in LedgerPoint as LP-2026-04388 (scheduled 25 Oct).', expected: 'LedgerPoint rejects on submit. Reply to Al Waha that it is scheduled.' },
  { email: 'e11', invoice: 'DPIT-2026-1192', problem: 'Total AED 38,556 is over the AED 25,000 approval limit.', expected: 'Enter → Pending approval → email Rania with LP ref → enter approval code.' },
  { email: 'e15', invoice: 'MPH-7794', problem: 'AED 7,200 net exceeds PO-2026-0423 remaining balance (AED 2,800).', expected: 'Only visible in ProcureHub. Put on hold, flag to Rania.' },
  { email: 'e12', invoice: 'FCS-30433', problem: 'No PO number on email or invoice.', expected: 'Search ProcureHub by supplier: PO-2026-0389 is the open one (0301 is closed).' },
  { email: 'e08', invoice: 'ATL-2026-061', problem: 'Atlas Event Productions is not a registered supplier.', expected: 'Request documents → they arrive → New Supplier request → bill stays on hold.' },
  { email: 'e20', invoice: 'NLT-0941', problem: 'Billed to "Meridian Advisors" with the wrong TRN.', expected: 'Reject, ask Nexa to re-issue → corrected invoice arrives.' },
  { email: 'e19', invoice: 'DPIT-2026-1149', problem: 'Supplier chasing a bill stuck in "Pending approval" since 2 Oct.', expected: 'Chase Rania with LP-2026-04381 → code APR-4817 → approve → reply to supplier.' },
  { email: 'e23', invoice: 'FCS-30388', problem: 'Supplier says overdue, but the invoice was never received (not in LedgerPoint).', expected: 'Ask Falcon to resend → copy arrives → enter it.' },
  { email: 'e16', invoice: '—', problem: 'New supplier (BrightPath) asking to be registered.', expected: 'Request documents → New Supplier request.' },
]
