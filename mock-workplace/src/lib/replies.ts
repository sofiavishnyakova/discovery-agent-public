// Auto-replies: the Finance Manager and suppliers "answer" emails the clerk sends,
// after a delay, so the recording contains realistic waiting and follow-up.
import { COMPANY, MANAGER } from '../data/company'
import { CONTACTS } from '../data/emails'
import { UNREGISTERED } from '../data/masterData'
import type { Email, WorldState } from '../data/types'
import { aed } from './money'
import { getWorld, newId, nowClock, update } from './store'

export const approvalCodeFor = (seq: number) => `APR-${((seq * 7919) % 9000) + 1000}`

const reSubject = (s: string) => (/^re:/i.test(s) ? s : `RE: ${s}`)

const quote = (e: Email) =>
  `\n\n-----\nFrom: ${e.fromName} <${e.fromEmail}>\nSubject: ${e.subject}\n\n` +
  e.body.split('\n').slice(0, 6).map((l) => `> ${l}`).join('\n')

const nameFor = (email: string) =>
  CONTACTS.find((c) => c.email === email)?.name.replace(/\s*\(.*\)$/, '') ?? email

interface Reply {
  body: string
  attachments?: string[]
}

function managerReply(w: WorldState, text: string): Reply {
  const pending = w.bills.filter((b) => b.status === 'Pending approval')
  const byRef = pending.filter((b) => text.includes(b.ref))
  if (byRef.length) {
    const lines = byRef.map((b) => {
      const sup = w.suppliers.find((s) => s.id === b.supplierId)?.name ?? ''
      return `• ${b.ref} — ${sup}, ${aed(b.total)}: approval code ${b.approvalCode}`
    })
    return { body: `Hi,\n\nApproved:\n${lines.join('\n')}\n\nPlease enter the code on the bill in LedgerPoint.\n\nRania` }
  }
  if (text.includes('MPH-7794') || text.includes('PO-2026-0423')) {
    return { body: `Hi,\n\nGood catch — that's well over what's left on PO-2026-0423. Please put MPH-7794 on hold and don't enter it yet. I'll ask Leila to raise a PO amendment.\n\nRania` }
  }
  const byInvoice = pending.filter((b) => text.includes(b.invoiceNumber.toUpperCase()))
  if (byInvoice.length) {
    return { body: `Hi,\n\nWhich LedgerPoint reference is this? I approve by LP number (LP-2026-xxxxx), not by invoice number — please resend with the LP ref.\n\nRania` }
  }
  if (text.includes('DPIT-2026-1192')) {
    return { body: `Hi,\n\nPlease enter DPIT-2026-1192 in LedgerPoint first. Once it shows "Pending approval", send me the LP reference and I'll give you the code.\n\nRania` }
  }
  if (text.includes('ATL-2026-061') || text.includes('ATLAS')) {
    return { body: `Hi,\n\nAtlas isn't set up as a supplier yet. Please request their trade licence, VAT certificate and bank letter, submit a New Supplier request, and keep the invoice on hold until they're verified.\n\nRania` }
  }
  if (text.includes('SFM-INV-55117')) {
    return { body: `Hi,\n\nIf the VAT doesn't match 5% of the net, don't enter it. Ask Skyline for a revised invoice.\n\nRania` }
  }
  if (text.includes('NLT-0941')) {
    return { body: `Hi,\n\nWe can't accept an invoice with the wrong legal name or TRN — please ask Nexa to re-issue it to Meridian Advisory LLC.\n\nRania` }
  }
  const otherRef = w.bills.find((b) => text.includes(b.ref))
  if (otherRef) {
    return { body: `Hi,\n\n${otherRef.ref} doesn't need my approval — it's currently "${otherRef.status}".\n\nRania` }
  }
  return { body: `Hi,\n\nThanks, noted. If something needs my approval, please include the LedgerPoint reference.\n\nRania` }
}

/** Returns [ruleId, reply] or null. ruleId makes one-off replies fire only once. */
function supplierReply(w: WorldState, to: string, text: string): [string, Reply] | null {
  const signoff = (n: string, c: string) => `\n\nBest regards,\n${n}\n${c}`
  if (to === 'finance@skylinefm.ae' && text.includes('55117')) {
    return ['skyline-revised', { body: `Dear AP team,\n\nApologies for the error — please find the revised invoice SFM-INV-55117 attached with the VAT corrected to AED 620.00. Please disregard the earlier version.${signoff('George Mathew', 'Skyline Facilities Management LLC')}`, attachments: ['d-sfm-55117-r1'] }]
  }
  if (to === 'invoices@nexatranslate.ae' && text.includes('0941')) {
    return ['nexa-reissue', { body: `Dear Accounts,\n\nSorry about that — the re-issued invoice NLT-0941 with the correct company name and TRN is attached.${signoff('Hana Youssef', 'Nexa Legal Translation')}`, attachments: ['d-nlt-0941-r1'] }]
  }
  if (to === 'billing@falconcourier.ae' && text.includes('30388')) {
    return ['falcon-resend', { body: `Dear Customer,\n\nPlease find a copy of invoice FCS-30388 attached (PO-2026-0389).\n\nRegards,\nFalcon Courier Services – Billing`, attachments: ['d-fcs-30388'] }]
  }
  if (to === 'accounts@marinaprinthouse.ae' && text.includes('7794')) {
    return ['marina-hold', { body: `Hello,\n\nUnderstood — we'll wait for the amended PO and you can process MPH-7794 once it's through.${signoff('Ravi Menon', 'Marina Print House LLC')}`, attachments: [] }]
  }
  for (const [key, c] of Object.entries(UNREGISTERED)) {
    if (to === c.email) {
      if (w.firedRules.includes(`${key}-docs`)) {
        return [`${key}-docs-again-${Date.now()}`, { body: `Hello,\n\nWe sent our trade licence, VAT certificate and bank letter earlier today — please check your inbox. Happy to help if anything else is needed.${signoff(c.contactName, c.name)}` }]
      }
      return [`${key}-docs`, {
        body: `Dear Accounts Payable,\n\nThank you. Please find attached our trade licence, VAT (TRN) certificate and bank confirmation letter.\n\nOur details:\nTRN: ${c.trn}\nTrade licence: ${c.tradeLicense}\nAddress: ${c.address}${signoff(c.contactName, c.name)}`,
        attachments: [`d-${key}-tl`, `d-${key}-trn`, `d-${key}-bank`],
      }]
    }
  }
  if (to === 'accounts@alwahacatering.ae' && text.includes('2264')) {
    return ['alwaha-thanks', { body: `Thank you for confirming, much appreciated!${signoff('Mariam Saeed', 'Al Waha Catering LLC')}` }]
  }
  const contact = CONTACTS.find((c) => c.email === to)
  if (contact && to !== MANAGER.email) {
    return [`thanks-${to}`, { body: `Thank you for the update.\n\n${nameFor(to)}` }]
  }
  return null
}

/** Call inside update() after adding a sent email. Schedules any replies it triggers. */
export function scheduleReplies(draft: WorldState, sent: Email) {
  const text = `${sent.subject}\n${sent.body}`.toUpperCase()
  const recipients = sent.to.split(/[;,]/).map((s) => s.trim().toLowerCase()).filter(Boolean)
  for (const to of recipients) {
    let reply: Reply | null = null
    let ruleId = ''
    if (to === MANAGER.email) {
      reply = managerReply(draft, text)
    } else {
      const r = supplierReply(draft, to, text)
      if (r && !draft.firedRules.includes(r[0])) [ruleId, reply] = r
    }
    if (!reply) continue
    if (ruleId) draft.firedRules.push(ruleId)
    const fromName = to === MANAGER.email ? MANAGER.name : nameFor(to)
    draft.scheduled.push({
      deliverAt: Date.now() + draft.replyDelayMs * (to === MANAGER.email ? 1.15 : 0.85),
      email: {
        id: newId('r'), folder: 'inbox', fromName, fromEmail: to, to: COMPANY.apEmail,
        subject: reSubject(sent.subject), body: reply.body + quote(sent),
        time: '', sortKey: 0, read: false, attachments: reply.attachments ?? [],
        inReplyTo: sent.id, generated: true,
      },
    })
  }
}

/** Moves due scheduled replies into the inbox. Safe to call from every tab. */
export function deliverDueReplies() {
  const now = Date.now()
  if (!getWorld().scheduled.some((s) => s.deliverAt <= now)) return
  update((d) => {
    const due = d.scheduled.filter((s) => s.deliverAt <= now)
    d.scheduled = d.scheduled.filter((s) => s.deliverAt > now)
    for (const s of due) {
      if (d.emails.some((e) => e.id === s.email.id)) continue
      d.emails.push({ ...s.email, time: nowClock(), sortKey: 1000 + (now - d.sessionStartedAt) / 1000 })
    }
  })
}
