// Every document that can appear as an email attachment during a session.
// Some are attached from the start; others only arrive in auto-replies.
import { COMPANY } from './company'
import { SUPPLIERS, UNREGISTERED } from './masterData'
import type { CompanyDoc, Doc, InvoiceDoc, LineItem } from './types'

const sup = (id: string) => SUPPLIERS.find((s) => s.id === id)!

function inv(
  id: string, supplierId: string, invoiceNumber: string, invoiceDate: string, dueDate: string,
  poNumber: string | undefined, lines: LineItem[], extra: Partial<InvoiceDoc> = {},
): InvoiceDoc {
  const s = sup(supplierId)
  return {
    kind: 'invoice', id, filename: `${invoiceNumber.replace(/\//g, '-')}.pdf`,
    supplierName: s.name, supplierAddress: s.address, supplierTrn: s.trn, supplierIban: s.iban,
    invoiceNumber, invoiceDate, dueDate, poNumber,
    billToName: COMPANY.name, billToTrn: COMPANY.trn, lines, ...extra,
  }
}

const L = (description: string, qty: number, unitPrice: number): LineItem => ({ description, qty, unitPrice })

export const INVOICES: InvoiceDoc[] = [
  // ---- Clean invoices ----
  inv('d-gos-88213', 'SUP-001', 'INV-GOS-88213', '2026-10-18', '2026-11-17', 'PO-2026-0412', [
    L('A4 copy paper 80gsm, box of 5 reams', 40, 95), L('HP 59A toner cartridge', 6, 410),
  ]),
  inv('d-dpit-1187', 'SUP-002', 'DPIT-2026-1187', '2026-10-19', '2026-11-18', 'PO-2026-0398', [
    L('Managed IT support, November 2026', 1, 14500),
  ]),
  inv('d-awc-2291', 'SUP-003', 'AWC/10/2291', '2026-10-16', '2026-10-31', 'PO-2026-0430', [
    L('Client workshop lunch buffet (15 Oct)', 45, 85), L('Coffee break service', 45, 22),
  ]),
  inv('d-sfm-55102', 'SUP-004', 'SFM-INV-55102', '2026-10-18', '2026-12-02', 'PO-2026-0377', [
    L('Office cleaning, October 2026', 1, 9200), L('AC preventive maintenance, October 2026', 1, 1750),
  ]),
  inv('d-nlt-0934', 'SUP-005', 'NLT-0934', '2026-10-17', '2026-11-16', 'PO-2026-0441', [
    L('Legal translation EN→AR, service agreement (pages)', 18, 120), L('Certified translation stamp', 6, 75),
  ]),
  inv('d-cb-20261019', 'SUP-006', 'CB-INV-20261019', '2026-10-19', '2026-11-18', 'PO-2026-0355', [
    L('Project management licence, October 2026 (users)', 60, 38),
  ]),
  inv('d-mph-7781', 'SUP-007', 'MPH-7781', '2026-10-15', '2026-11-14', 'PO-2026-0446', [
    L('Business cards, box of 250', 12, 140), L('Service brochure, A4 tri-fold', 500, 6.5),
  ]),
  inv('d-fcs-30419', 'SUP-008', 'FCS-30419', '2026-10-01', '2026-10-31', 'PO-2026-0389', [
    L('Domestic document delivery, September', 64, 28), L('International express, September', 9, 165),
  ]),
  inv('d-gos-88247', 'SUP-001', 'INV-GOS-88247', '2026-10-19', '2026-11-18', 'PO-2026-0412', [
    L('Ergonomic mesh office chair', 4, 1150),
  ]),

  // ---- Planted problems ----
  // P1: VAT is wrong (5% of 12,400 is 620, not 680)
  inv('d-sfm-55117', 'SUP-004', 'SFM-INV-55117', '2026-10-17', '2026-12-01', 'PO-2026-0378', [
    L('Deep cleaning after office move, Level 14', 1, 12400),
  ], { vatOverride: 680 }),
  // P2: duplicate of LP-2026-04388, already in LedgerPoint
  inv('d-awc-2264', 'SUP-003', 'AWC/10/2264', '2026-10-08', '2026-10-23', 'PO-2026-0430', [
    L('Board meeting lunch (7 Oct)', 30, 85), L('Coffee break service', 30, 15),
  ]),
  // P3: over the AED 25,000 approval limit
  inv('d-dpit-1192', 'SUP-002', 'DPIT-2026-1192', '2026-10-19', '2026-11-18', 'PO-2026-0402', [
    L('Dell Latitude 7450 laptop', 18, 1850), L('Imaging & user setup', 18, 75), L('USB-C docking station', 18, 115),
  ]),
  // P4: over the PO's remaining balance (PO-0423 has 2,800 left)
  inv('d-mph-7794', 'SUP-007', 'MPH-7794', '2026-10-19', '2026-11-18', 'PO-2026-0423', [
    L('Annual report 2026, 64pp, perfect bound', 300, 24),
  ]),
  // P5: no PO number anywhere
  inv('d-fcs-30433', 'SUP-008', 'FCS-30433', '2026-10-16', '2026-11-15', undefined, [
    L('Same-day document delivery, 1–15 Oct', 22, 45),
  ]),
  // P7: billed to the wrong company name and TRN
  inv('d-nlt-0941', 'SUP-005', 'NLT-0941', '2026-10-18', '2026-11-17', 'PO-2026-0441', [
    L('Legal translation EN→AR, NDA & annexes (pages)', 15, 120),
  ], { billToName: 'Meridian Advisors', billToTrn: '100398472500003' }),

  // ---- Arrive only in auto-replies ----
  inv('d-sfm-55117-r1', 'SUP-004', 'SFM-INV-55117', '2026-10-17', '2026-12-01', 'PO-2026-0378', [
    L('Deep cleaning after office move, Level 14', 1, 12400),
  ], { filename: 'SFM-INV-55117-REV1.pdf', revisionNote: 'Revised invoice — replaces version issued 17 Oct 2026 (VAT corrected)' }),
  inv('d-nlt-0941-r1', 'SUP-005', 'NLT-0941', '2026-10-18', '2026-11-17', 'PO-2026-0441', [
    L('Legal translation EN→AR, NDA & annexes (pages)', 15, 120),
  ], { filename: 'NLT-0941-REISSUED.pdf', revisionNote: 'Re-issued with corrected customer name and TRN' }),
  inv('d-fcs-30388', 'SUP-008', 'FCS-30388', '2026-09-15', '2026-10-15', 'PO-2026-0389', [
    L('Domestic document delivery, 1–15 Sep', 70, 35),
  ], { filename: 'FCS-30388-COPY.pdf', revisionNote: 'COPY — originally sent 15 Sep 2026' }),
]

// P6: invoice from a supplier that is not registered in LedgerPoint
const atlas = UNREGISTERED.atlas
INVOICES.push({
  kind: 'invoice', id: 'd-atl-061', filename: 'ATL-2026-061.pdf',
  supplierName: atlas.name, supplierAddress: atlas.address, supplierTrn: atlas.trn, supplierIban: atlas.iban,
  invoiceNumber: 'ATL-2026-061', invoiceDate: '2026-10-18', dueDate: '2026-11-17', poNumber: 'PO-2026-0450',
  billToName: COMPANY.name, billToTrn: COMPANY.trn,
  lines: [L('Stage build & LED wall, Client Summit (16 Oct)', 1, 9800), L('AV crew, 2 days', 4, 1050)],
})

function companyDocs(key: 'atlas' | 'brightpath', prefix: string): CompanyDoc[] {
  const c = UNREGISTERED[key]
  return [
    {
      kind: 'trade_license', id: `d-${prefix}-tl`, filename: `${prefix.toUpperCase()}_Trade_Licence.pdf`, companyName: c.name,
      fields: [
        { label: 'Licence No.', value: c.tradeLicense },
        { label: 'Trade Name', value: c.name },
        { label: 'Legal Form', value: key === 'atlas' ? 'Limited Liability Company' : 'Free Zone Establishment' },
        { label: 'Address', value: c.address },
        { label: 'Issue Date', value: '14 Mar 2024' },
        { label: 'Expiry Date', value: '13 Mar 2027' },
        { label: 'Activities', value: key === 'atlas' ? 'Event management; audio-visual equipment rental' : 'Management & leadership training' },
      ],
    },
    {
      kind: 'trn_certificate', id: `d-${prefix}-trn`, filename: `${prefix.toUpperCase()}_VAT_Certificate.pdf`, companyName: c.name,
      fields: [
        { label: 'Tax Registration Number (TRN)', value: c.trn },
        { label: 'Legal Name', value: c.name },
        { label: 'Registered Address', value: c.address },
        { label: 'Effective Registration Date', value: '01 Apr 2024' },
      ],
    },
    {
      kind: 'bank_letter', id: `d-${prefix}-bank`, filename: `${prefix.toUpperCase()}_Bank_Letter.pdf`, companyName: c.name,
      fields: [
        { label: 'Account Name', value: c.name },
        { label: 'Bank', value: 'Emirates Union Bank PJSC' },
        { label: 'IBAN', value: c.iban },
        { label: 'SWIFT', value: 'EUBKAEADXXX' },
        { label: 'Currency', value: 'AED' },
      ],
    },
  ]
}

export const COMPANY_DOCS: CompanyDoc[] = [...companyDocs('atlas', 'atlas'), ...companyDocs('brightpath', 'brightpath')]

export const ALL_DOCS: Doc[] = [...INVOICES, ...COMPANY_DOCS]
