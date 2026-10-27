// The AP inbox at the start of every session (25 emails) plus a few old sent items.
import { COMPANY, MANAGER } from './company'
import type { Email } from './types'

const AP = COMPANY.apEmail

function mail(
  id: string, time: string, fromName: string, fromEmail: string, subject: string, body: string,
  attachments: string[] = [],
): Email {
  const [h, m] = time.split(':').map(Number)
  return { id, folder: 'inbox', fromName, fromEmail, to: AP, subject, body, time, sortKey: h * 60 + m, read: false, attachments }
}

const sign = (name: string, company: string) => `\n\nBest regards,\n${name}\n${company}`

export const INBOX: Email[] = [
  mail('e01', '07:45', MANAGER.name, MANAGER.email, 'Reminder: approval codes for bills over AED 25,000',
    `Hi team,\n\nQuick reminder ahead of month-end: any bill over AED 25,000 (incl. VAT) goes to "Pending approval" in LedgerPoint and needs my approval code before it can be scheduled.\n\nWhen you email me, please include the LedgerPoint reference (LP-2026-xxxxx) — I approve by LP number, not by invoice number.\n\nAlso, please don't enter invoices that exceed the remaining PO balance. Flag them to me and put them on hold.\n\nThanks,\nRania`),
  mail('e02', '07:58', 'IT Helpdesk', 'helpdesk@meridian-advisory.ae', 'Your password expires in 3 days',
    `Hello,\n\nYour Meridian network password will expire in 3 days. Please change it via the self-service portal before Friday to avoid being locked out.\n\nThis is an automated message.\nIT Helpdesk`),
  mail('e03', '08:02', 'Priya Nair', 'ap@gulfofficesupplies.ae', 'Invoice INV-GOS-88213 – Meridian Advisory',
    `Dear Accounts Payable,\n\nPlease find attached our invoice INV-GOS-88213 for the paper and toner delivered on 17 October against PO-2026-0412.${sign('Priya Nair', 'Gulf Office Supplies LLC')}`, ['d-gos-88213']),
  mail('e04', '08:10', 'Faisal Qureshi', 'billing@desertpeak-it.ae', 'DPIT-2026-1187 | Managed IT Support – November',
    `Hello,\n\nAttached is invoice DPIT-2026-1187 for managed IT support (November 2026), PO-2026-0398.\n\nPayment terms: 30 days.${sign('Faisal Qureshi', 'Desert Peak IT Services FZ-LLC')}`, ['d-dpit-1187']),
  mail('e05', '08:14', 'George Mathew', 'finance@skylinefm.ae', 'Invoice SFM-INV-55117 – deep cleaning',
    `Dear Sir/Madam,\n\nPlease see attached invoice SFM-INV-55117 for the deep cleaning completed after your move to Level 14 (PO-2026-0378).\n\nKind regards,\nGeorge Mathew\nSkyline Facilities Management LLC`, ['d-sfm-55117']),
  mail('e06', '08:21', 'Daniel Okafor', 'billing@cirrusbyte-software.ae', 'Payment status – CB-INV-20260919',
    `Hi,\n\nOur records show invoice CB-INV-20260919 (AED 2,394.00) was due on 19 October. Could you let us know when we can expect payment?\n\nThanks,\nDaniel\nCirrusbyte Software Ltd`),
  mail('e07', '08:26', 'Mariam Saeed', 'accounts@alwahacatering.ae', 'Al Waha Catering – Invoice AWC/10/2291',
    `Good morning,\n\nThank you for choosing Al Waha for your client workshop on 15 October. Our invoice AWC/10/2291 is attached (PO-2026-0430).${sign('Mariam Saeed', 'Al Waha Catering LLC')}`, ['d-awc-2291']),
  mail('e08', '08:33', 'Sofia Rinaldi', 'accounts@atlasevents.ae', 'Invoice ATL-2026-061 – Meridian Client Summit',
    `Dear Meridian team,\n\nIt was a pleasure producing your Client Summit last week! Please find our invoice ATL-2026-061 attached, referencing PO-2026-0450.\n\nThis is our first invoice to Meridian, so please let me know if you need anything from us.${sign('Sofia Rinaldi', 'Atlas Event Productions LLC')}`, ['d-atl-061']),
  mail('e09', '08:40', 'Hana Youssef', 'invoices@nexatranslate.ae', 'NLT-0934 – translation services',
    `Dear Accounts,\n\nAttached: invoice NLT-0934 for the service agreement translation (PO-2026-0441).${sign('Hana Youssef', 'Nexa Legal Translation')}`, ['d-nlt-0934']),
  mail('e10', '08:47', 'Gulf Finance Weekly', 'newsletter@gulffinanceweekly.ae', 'This week: e-invoicing deadlines in the UAE',
    `In this issue:\n• What the UAE e-invoicing rollout means for mid-size firms\n• 5 month-end close habits of high-performing AP teams\n• Webinar: automating supplier onboarding\n\nYou are receiving this because you subscribed to Gulf Finance Weekly.`),
  mail('e11', '08:52', 'Faisal Qureshi', 'billing@desertpeak-it.ae', 'DPIT-2026-1192 | Laptop refresh – 18 units',
    `Hello,\n\nThe 18 laptops for your refresh were delivered and set up on Friday. Our invoice DPIT-2026-1192 against PO-2026-0402 is attached.${sign('Faisal Qureshi', 'Desert Peak IT Services FZ-LLC')}`, ['d-dpit-1192']),
  mail('e12', '09:01', 'Imran Sheikh', 'billing@falconcourier.ae', 'Falcon Courier invoice FCS-30433',
    `Dear Customer,\n\nPlease find attached invoice FCS-30433 for same-day deliveries 1–15 October.\n\nRegards,\nFalcon Courier Services – Billing`, ['d-fcs-30433']),
  mail('e13', '09:05', 'Priya Nair', 'ap@gulfofficesupplies.ae', 'Has INV-GOS-88102 been paid?',
    `Hi,\n\nCould you please confirm whether invoice INV-GOS-88102 (AED 4,410.00) has been paid? Our finance team can't match a receipt.\n\nThanks,\nPriya`),
  mail('e14', '09:12', 'George Mathew', 'finance@skylinefm.ae', 'Invoice SFM-INV-55102 – October services',
    `Dear Sir/Madam,\n\nAttached is invoice SFM-INV-55102 for October cleaning and AC maintenance under PO-2026-0377.\n\nKind regards,\nGeorge Mathew\nSkyline Facilities Management LLC`, ['d-sfm-55102']),
  mail('e15', '09:18', 'Ravi Menon', 'accounts@marinaprinthouse.ae', 'MPH-7794 – Annual Report printing',
    `Hello,\n\nThe 300 copies of your Annual Report 2026 were delivered to your reception this morning. Invoice MPH-7794 (PO-2026-0423) attached.${sign('Ravi Menon', 'Marina Print House LLC')}`, ['d-mph-7794']),
  mail('e16', '09:24', 'Thomas Reyes', 'finance@brightpath-training.ae', 'Supplier registration – BrightPath Training Institute',
    `Dear Accounts Payable,\n\nNadia Rahman from your HR team has engaged us to run two leadership programme cohorts (PO-2026-0455). Before we can invoice, we understand we need to be registered as a supplier.\n\nCould you let us know what documents you need from us?${sign('Thomas Reyes', 'BrightPath Training Institute')}`),
  mail('e17', '09:30', 'Mariam Saeed', 'accounts@alwahacatering.ae', 'REMINDER: Invoice AWC/10/2264',
    `Good morning,\n\nGentle reminder of our invoice AWC/10/2264 for the board meeting lunch on 7 October. A copy is attached for your convenience.${sign('Mariam Saeed', 'Al Waha Catering LLC')}`, ['d-awc-2264']),
  mail('e18', '09:36', 'Daniel Okafor', 'billing@cirrusbyte-software.ae', 'Your Cirrusbyte invoice CB-INV-20261019',
    `Hi,\n\nYour monthly invoice for 60 project management licences is attached (PO-2026-0355).\n\nThanks,\nDaniel\nCirrusbyte Software Ltd`, ['d-cb-20261019']),
  mail('e19', '09:41', 'Faisal Qureshi', 'billing@desertpeak-it.ae', 'Follow-up: DPIT-2026-1149 (network switches)',
    `Hello,\n\nFollowing up on invoice DPIT-2026-1149 for the network switches, sent on 29 September. Could you confirm it's approved for payment? It's due on 29 October.${sign('Faisal Qureshi', 'Desert Peak IT Services FZ-LLC')}`),
  mail('e20', '09:47', 'Hana Youssef', 'invoices@nexatranslate.ae', 'NLT-0941 – NDA translation',
    `Dear Accounts,\n\nPlease find attached invoice NLT-0941 for the NDA and annexes translation.${sign('Hana Youssef', 'Nexa Legal Translation')}`, ['d-nlt-0941']),
  mail('e21', '09:52', 'Nadia Rahman', 'nadia.rahman@meridian-advisory.ae', 'Team lunch on Thursday 🍕',
    `Hi all,\n\nWe're doing a team lunch this Thursday at 1pm in the Level 14 pantry. Please reply by Wednesday if you have dietary requirements.\n\nNadia`),
  mail('e22', '09:58', 'Ravi Menon', 'accounts@marinaprinthouse.ae', 'MPH-7781 – business cards & brochures',
    `Hello,\n\nInvoice MPH-7781 for business cards and service brochures attached (PO-2026-0446).${sign('Ravi Menon', 'Marina Print House LLC')}`, ['d-mph-7781']),
  mail('e23', '10:03', 'Imran Sheikh', 'billing@falconcourier.ae', 'Overdue: FCS-30388',
    `Dear Customer,\n\nOur invoice FCS-30388 dated 15 September (AED 2,572.50) is now overdue. Please arrange payment or let us know if there is an issue.\n\nRegards,\nFalcon Courier Services – Billing`),
  mail('e24', '10:09', 'Imran Sheikh', 'billing@falconcourier.ae', 'Falcon Courier invoice FCS-30419',
    `Dear Customer,\n\nPlease find attached invoice FCS-30419 for September deliveries, PO-2026-0389.\n\nRegards,\nFalcon Courier Services – Billing`, ['d-fcs-30419']),
  mail('e25', '10:15', 'Priya Nair', 'ap@gulfofficesupplies.ae', 'Invoice INV-GOS-88247 – office chairs',
    `Dear Accounts Payable,\n\nAttached is invoice INV-GOS-88247 for the 4 ergonomic chairs delivered yesterday (PO-2026-0412).${sign('Priya Nair', 'Gulf Office Supplies LLC')}`, ['d-gos-88247']),
]

export const SENT: Email[] = [
  {
    id: 's01', folder: 'sent', fromName: 'AP Team', fromEmail: AP, to: MANAGER.email,
    subject: 'Approval needed: LP-2026-04381 (DPIT-2026-1149)',
    body: 'Hi Rania,\n\nCould you please approve LP-2026-04381 — Desert Peak network switches, AED 27,300.00?\n\nThanks,\nAP Team',
    time: 'Yesterday', sortKey: -100, read: true, attachments: [],
  },
  {
    id: 's02', folder: 'sent', fromName: 'AP Team', fromEmail: AP, to: 'accounts@alwahacatering.ae',
    subject: 'RE: Invoice AWC/10/2264',
    body: 'Dear Mariam,\n\nThank you — AWC/10/2264 has been entered and is scheduled for payment on 25 October.\n\nBest regards,\nAP Team\nMeridian Advisory LLC',
    time: 'Yesterday', sortKey: -200, read: true, attachments: [],
  },
]

export const CONTACTS = [
  { name: MANAGER.name, email: MANAGER.email },
  { name: 'Priya Nair (Gulf Office Supplies)', email: 'ap@gulfofficesupplies.ae' },
  { name: 'Faisal Qureshi (Desert Peak IT)', email: 'billing@desertpeak-it.ae' },
  { name: 'Mariam Saeed (Al Waha Catering)', email: 'accounts@alwahacatering.ae' },
  { name: 'George Mathew (Skyline FM)', email: 'finance@skylinefm.ae' },
  { name: 'Hana Youssef (Nexa Legal Translation)', email: 'invoices@nexatranslate.ae' },
  { name: 'Daniel Okafor (Cirrusbyte)', email: 'billing@cirrusbyte-software.ae' },
  { name: 'Ravi Menon (Marina Print House)', email: 'accounts@marinaprinthouse.ae' },
  { name: 'Falcon Courier Billing', email: 'billing@falconcourier.ae' },
  { name: 'Sofia Rinaldi (Atlas Event Productions)', email: 'accounts@atlasevents.ae' },
  { name: 'Thomas Reyes (BrightPath Training)', email: 'finance@brightpath-training.ae' },
  { name: 'Nadia Rahman (HR)', email: 'nadia.rahman@meridian-advisory.ae' },
  { name: 'Leila Farouk (Marketing)', email: 'leila.farouk@meridian-advisory.ae' },
  { name: 'Karim Mansour (IT)', email: 'karim.mansour@meridian-advisory.ae' },
]
