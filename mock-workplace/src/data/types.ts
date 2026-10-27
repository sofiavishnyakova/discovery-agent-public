// Shared types for the Meridian Advisory mock workplace.

export type Category =
  | 'Office Supplies'
  | 'IT Services'
  | 'IT Equipment'
  | 'Catering & Events'
  | 'Facilities'
  | 'Professional Fees'
  | 'Software Subscriptions'
  | 'Printing & Marketing'
  | 'Courier & Logistics'
  | 'Training'

export interface Supplier {
  id: string
  name: string
  email: string
  trn: string
  address: string
  paymentTermsDays: number
  defaultCategory: Category
  iban: string
  status: 'Active' | 'Pending verification'
  tradeLicense?: string
  contactName?: string
}

export interface PurchaseOrder {
  number: string
  supplierName: string
  description: string
  approvedNet: number
  status: 'Open' | 'Closed'
  budgetOwner: string
  costCentre: string
  raisedOn: string
  lines: { description: string; amount: number }[]
}

export type BillStatus = 'Pending approval' | 'Approved' | 'Scheduled' | 'Paid' | 'On hold'

export interface Bill {
  ref: string
  supplierId: string
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  poNumber: string
  net: number
  vat: number
  total: number
  category: Category
  status: BillStatus
  paymentDate?: string
  attachment?: string
  notes?: string
  createdAt: string
  createdBy: string
  approvalCode?: string
}

export interface LineItem {
  description: string
  qty: number
  unitPrice: number
}

export type DocKind = 'invoice' | 'trade_license' | 'trn_certificate' | 'bank_letter'

export interface InvoiceDoc {
  kind: 'invoice'
  id: string
  filename: string
  supplierName: string
  supplierAddress: string
  supplierTrn: string
  supplierIban: string
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  poNumber?: string
  billToName: string
  billToTrn: string
  lines: LineItem[]
  /** If set, overrides the computed 5% VAT (used for planted errors). */
  vatOverride?: number
  revisionNote?: string
}

export interface CompanyDoc {
  kind: 'trade_license' | 'trn_certificate' | 'bank_letter'
  id: string
  filename: string
  companyName: string
  fields: { label: string; value: string }[]
}

export type Doc = InvoiceDoc | CompanyDoc

export interface Email {
  id: string
  folder: 'inbox' | 'sent'
  fromName: string
  fromEmail: string
  to: string
  subject: string
  body: string
  /** Display time, e.g. "08:12" or "Yesterday". Real clock time for generated mail. */
  time: string
  sortKey: number
  read: boolean
  attachments: string[] // doc ids
  inReplyTo?: string
  generated?: boolean
}

export interface TrackerRow {
  id: string
  date: string
  supplier: string
  invoiceNumber: string
  amount: string
  ledgerRef: string
  status: string
  notes: string
}

export interface ScheduledEmail {
  deliverAt: number
  email: Email
  docs?: Doc[]
}

export interface WorldState {
  version: number
  persona: string
  sessionStartedAt: number
  replyDelayMs: number
  suppliers: Supplier[]
  pos: PurchaseOrder[]
  bills: Bill[]
  emails: Email[]
  docs: Doc[]
  downloads: string[] // doc ids saved to "Downloads"
  tracker: TrackerRow[]
  scheduled: ScheduledEmail[]
  nextBillSeq: number
  /** Ids of rules already triggered, so auto-replies fire once. */
  firedRules: string[]
}
