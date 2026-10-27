# Meridian Advisory — mock workplace

A fake accounts-payable job used to record "employees" at work for the discovery agent.
Fictional company: Meridian Advisory LLC (Dubai consulting firm). Fictional people and suppliers.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173 → pick a persona → **Reset data** → open the four apps in their own tabs.

## The apps

| App | URL | What happens there |
|---|---|---|
| Launcher | `/` | Persona, reset, task card, AP procedure, answer key |
| Meridian Mail | `/mail/inbox` | 25 emails, attachments open in an HTML "PDF" viewer, **Download** puts files in Downloads, reply/forward/compose |
| LedgerPoint | `/ledgerpoint/bills` | New bill (validation, VAT check, duplicate check, approval limit), bill detail (approval code, hold), suppliers, new supplier request |
| ProcureHub | `/procurehub` | PO search, PO detail with live invoiced/remaining balance |
| AP Tracker | `/tracker` | Editable team spreadsheet |

## How the world behaves

- State lives in `localStorage` (`meridian-world-v1`) and syncs across tabs. **Reset** restores the exact same starting data.
- Sending email triggers auto-replies (default ~35 s; tick "Fast replies" on the launcher for 5 s while testing):
  - **Rania (Finance Manager):** sends approval codes only when you quote a pending `LP-2026-xxxxx` ref; asks for the LP ref if you only quote the invoice number; tells you to hold MPH-7794; advises on Atlas / Skyline VAT / Nexa name issues.
  - **Skyline / Nexa / Falcon:** send a corrected invoice / re-issued invoice / resent copy when you mention the problem invoice.
  - **Atlas / BrightPath (unregistered):** send trade licence, VAT certificate and bank letter.
- Bills over AED 25,000 total go to *Pending approval*; others go straight to *Scheduled* (payment date = due date).

## The 10 things the agent should find

See the answer key on the launcher (`src/data/personas.ts` → `ANSWER_KEY`): wrong VAT, duplicate, over approval limit, over PO balance, missing PO, unregistered supplier, wrong company name, a bill stuck in approval, a "lost" invoice, and a new-supplier request.

## Recorder hooks

Every app root has `data-app` (`mail`, `ledgerpoint`, `procurehub`, `tracker`, `launcher`); screens have `data-screen`;
inputs have `data-field`; buttons and links have `data-action`; entities carry `data-email-id`, `data-doc-id`,
`data-bill-ref`, `data-po`, `data-row-id`. Typed values are never needed by the recorder: log the field name and value length.
Each page sets a descriptive `document.title` (e.g. `New bill – LedgerPoint`).

## Edit the scenario

All data is plain TypeScript in `src/data/`: `masterData.ts` (suppliers, POs, existing bills, tracker), `documents.ts`
(invoices + company docs), `emails.ts` (inbox), `personas.ts` (personas, procedure, answer key). Reply rules: `src/lib/replies.ts`.
