// Renders an invoice or company document as an A4 "PDF" page (HTML, so the recorder can see clicks and copies).
import { COMPANY } from '../data/company'
import type { CompanyDoc, Doc, InvoiceDoc } from '../data/types'
import { fmt, formatDate, invoiceTotals } from '../lib/money'

function Invoice({ doc }: { doc: InvoiceDoc }) {
  const { net, vat, total } = invoiceTotals(doc)
  return (
    <div className="a4 invoice" data-doc-id={doc.id} data-invoice-no={doc.invoiceNumber} data-redact="content">
      {doc.revisionNote && <div className="inv-revision">{doc.revisionNote}</div>}
      <div className="inv-head">
        <div>
          <div className="inv-supplier">{doc.supplierName}</div>
          <div className="inv-muted">{doc.supplierAddress}</div>
          <div className="inv-muted">TRN: {doc.supplierTrn}</div>
        </div>
        <div className="inv-title">TAX INVOICE</div>
      </div>
      <div className="inv-meta">
        <div>
          <div className="inv-label">Bill to</div>
          <div className="inv-strong">{doc.billToName}</div>
          <div className="inv-muted">{COMPANY.address}</div>
          <div className="inv-muted">TRN: {doc.billToTrn}</div>
        </div>
        <table className="inv-meta-table">
          <tbody>
            <tr><td>Invoice No.</td><td data-field="invoice-number">{doc.invoiceNumber}</td></tr>
            <tr><td>Invoice Date</td><td data-field="invoice-date">{formatDate(doc.invoiceDate)}</td></tr>
            <tr><td>Due Date</td><td data-field="due-date">{formatDate(doc.dueDate)}</td></tr>
            <tr><td>PO Reference</td><td data-field="po-number">{doc.poNumber ?? '—'}</td></tr>
          </tbody>
        </table>
      </div>
      <table className="inv-lines">
        <thead>
          <tr><th>Description</th><th>Qty</th><th>Unit price (AED)</th><th>Amount (AED)</th></tr>
        </thead>
        <tbody>
          {doc.lines.map((l, i) => (
            <tr key={i}>
              <td>{l.description}</td><td>{l.qty}</td><td>{fmt(l.unitPrice)}</td><td>{fmt(l.qty * l.unitPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="inv-totals">
        <tbody>
          <tr><td>Subtotal (excl. VAT)</td><td data-field="net">{fmt(net)}</td></tr>
          <tr><td>VAT 5%</td><td data-field="vat">{fmt(vat)}</td></tr>
          <tr className="inv-grand"><td>Total due (AED)</td><td data-field="total">{fmt(total)}</td></tr>
        </tbody>
      </table>
      <div className="inv-foot">
        <div className="inv-label">Payment details</div>
        <div>Account name: {doc.supplierName}</div>
        <div>IBAN: {doc.supplierIban}</div>
        <div className="inv-muted">Please quote the invoice number with your payment.</div>
      </div>
    </div>
  )
}

const TITLES: Record<CompanyDoc['kind'], string> = {
  trade_license: 'Commercial Licence',
  trn_certificate: 'VAT Registration Certificate',
  bank_letter: 'Bank Account Confirmation',
}

const ISSUERS: Record<CompanyDoc['kind'], string> = {
  trade_license: 'Department of Economy & Tourism — Dubai',
  trn_certificate: 'Federal Tax Authority — United Arab Emirates',
  bank_letter: 'Emirates Union Bank PJSC',
}

function Company({ doc }: { doc: CompanyDoc }) {
  return (
    <div className="a4 certificate" data-doc-id={doc.id} data-redact="content">
      <div className="cert-issuer">{ISSUERS[doc.kind]}</div>
      <div className="cert-title">{TITLES[doc.kind]}</div>
      <table className="cert-table">
        <tbody>
          {doc.fields.map((f) => (
            <tr key={f.label}><td>{f.label}</td><td data-field={f.label}>{f.value}</td></tr>
          ))}
        </tbody>
      </table>
      {doc.kind === 'bank_letter' && (
        <p className="cert-note">
          This is to confirm that the above account is held with us in the name of {doc.companyName} and is in good standing.
        </p>
      )}
      <div className="cert-stamp">VERIFIED COPY</div>
    </div>
  )
}

export function DocView({ doc }: { doc: Doc }) {
  return doc.kind === 'invoice' ? <Invoice doc={doc} /> : <Company doc={doc} />
}
