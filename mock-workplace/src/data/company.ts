// Fixed facts about the fictional company and the "world" the recording happens in.

export const COMPANY = {
  name: 'Meridian Advisory LLC',
  trn: '100398472600003',
  address: 'Level 14, Crescent Business Tower, Business Bay, Dubai, UAE',
  apEmail: 'ap@meridian-advisory.ae',
}

export const MANAGER = {
  name: 'Rania Haddad',
  title: 'Finance Manager',
  email: 'rania.haddad@meridian-advisory.ae',
}

export const APPROVAL_LIMIT = 25000

export const WORLD_TODAY = '2026-10-20'
export const WORLD_TODAY_LABEL = 'Tuesday, 20 October 2026'

export const DEFAULT_REPLY_DELAY_MS = 35000
export const FAST_REPLY_DELAY_MS = 5000

export const CATEGORIES = [
  'Office Supplies',
  'IT Services',
  'IT Equipment',
  'Catering & Events',
  'Facilities',
  'Professional Fees',
  'Software Subscriptions',
  'Printing & Marketing',
  'Courier & Logistics',
  'Training',
] as const
