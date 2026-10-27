// Suppliers, purchase orders and bills that already exist before the session starts.
import type { Bill, PurchaseOrder, Supplier, TrackerRow } from './types'

export const SUPPLIERS: Supplier[] = [
  {
    id: 'SUP-001', name: 'Gulf Office Supplies LLC', email: 'ap@gulfofficesupplies.ae',
    trn: '100234567800003', address: 'Warehouse 7, Al Quoz Industrial 3, Dubai',
    paymentTermsDays: 30, defaultCategory: 'Office Supplies', iban: 'AE07 0331 2345 6789 0123 456',
    status: 'Active', contactName: 'Priya Nair',
  },
  {
    id: 'SUP-002', name: 'Desert Peak IT Services FZ-LLC', email: 'billing@desertpeak-it.ae',
    trn: '100552198400003', address: 'Office 412, Building 3, Dubai Internet City',
    paymentTermsDays: 30, defaultCategory: 'IT Services', iban: 'AE46 0260 0010 1534 7782 901',
    status: 'Active', contactName: 'Faisal Qureshi',
  },
  {
    id: 'SUP-003', name: 'Al Waha Catering LLC', email: 'accounts@alwahacatering.ae',
    trn: '100761234500003', address: 'Shop 3, Al Barsha 1, Dubai',
    paymentTermsDays: 15, defaultCategory: 'Catering & Events', iban: 'AE12 0350 0000 0123 4567 891',
    status: 'Active', contactName: 'Mariam Saeed',
  },
  {
    id: 'SUP-004', name: 'Skyline Facilities Management LLC', email: 'finance@skylinefm.ae',
    trn: '100329876100003', address: 'Office 2201, Prime Tower, Business Bay, Dubai',
    paymentTermsDays: 45, defaultCategory: 'Facilities', iban: 'AE58 0400 0002 2345 6712 345',
    status: 'Active', contactName: 'George Mathew',
  },
  {
    id: 'SUP-005', name: 'Nexa Legal Translation', email: 'invoices@nexatranslate.ae',
    trn: '100873456200003', address: 'Office 905, Al Ghurair Centre, Deira, Dubai',
    paymentTermsDays: 30, defaultCategory: 'Professional Fees', iban: 'AE90 0230 0000 0098 7654 321',
    status: 'Active', contactName: 'Hana Youssef',
  },
  {
    id: 'SUP-006', name: 'Cirrusbyte Software Ltd', email: 'billing@cirrusbyte-software.ae',
    trn: '100445566700003', address: 'Unit 1104, Dubai Silicon Oasis HQ, Dubai',
    paymentTermsDays: 30, defaultCategory: 'Software Subscriptions', iban: 'AE33 0860 0000 0912 3456 780',
    status: 'Active', contactName: 'Daniel Okafor',
  },
  {
    id: 'SUP-007', name: 'Marina Print House LLC', email: 'accounts@marinaprinthouse.ae',
    trn: '100612345900003', address: 'Shop 11, Dubai Marina Walk, Dubai',
    paymentTermsDays: 30, defaultCategory: 'Printing & Marketing', iban: 'AE21 0330 0000 1928 3746 550',
    status: 'Active', contactName: 'Ravi Menon',
  },
  {
    id: 'SUP-008', name: 'Falcon Courier Services LLC', email: 'billing@falconcourier.ae',
    trn: '100987654300003', address: 'Unit 5, Dubai Logistics City, Dubai South',
    paymentTermsDays: 30, defaultCategory: 'Courier & Logistics', iban: 'AE65 0440 0000 3344 5566 778',
    status: 'Active', contactName: 'Imran Sheikh',
  },
]

/** Suppliers that email us but are NOT registered in LedgerPoint. */
export const UNREGISTERED = {
  atlas: {
    name: 'Atlas Event Productions LLC', email: 'accounts@atlasevents.ae', contactName: 'Sofia Rinaldi',
    trn: '100734981200003', address: 'Warehouse 14, Al Quoz Industrial 4, Dubai',
    tradeLicense: '1048832', iban: 'AE70 0260 0001 0457 8823 116',
  },
  brightpath: {
    name: 'BrightPath Training Institute', email: 'finance@brightpath-training.ae', contactName: 'Thomas Reyes',
    trn: '100825017300003', address: 'Block 2, Office 310, Dubai Knowledge Park, Dubai',
    tradeLicense: '781204', iban: 'AE84 0350 0000 0201 5577 340',
  },
}

const PO = (
  number: string, supplierName: string, description: string, approvedNet: number,
  status: 'Open' | 'Closed', budgetOwner: string, costCentre: string, raisedOn: string,
  lines?: { description: string; amount: number }[],
): PurchaseOrder => ({
  number, supplierName, description, approvedNet, status, budgetOwner, costCentre, raisedOn,
  lines: lines ?? [{ description, amount: approvedNet }],
})

export const PURCHASE_ORDERS: PurchaseOrder[] = [
  PO('PO-2026-0301', 'Falcon Courier Services LLC', 'Courier services Jan–Aug 2026 (blanket)', 22000, 'Closed', 'Yusuf Al Amiri', 'CC-200 Operations', '2026-01-05'),
  PO('PO-2026-0355', 'Cirrusbyte Software Ltd', 'Project management licences, 60 users, 2026 (billed monthly)', 27360, 'Open', 'Karim Mansour', 'CC-310 IT', '2026-01-12',
    [{ description: '60 users × AED 38 × 12 months', amount: 27360 }]),
  PO('PO-2026-0360', 'Gulf Office Supplies LLC', 'Office consumables Q3 2026', 12000, 'Closed', 'Yusuf Al Amiri', 'CC-200 Operations', '2026-06-28'),
  PO('PO-2026-0366', 'Al Waha Catering LLC', 'Client workshop catering, September', 6000, 'Closed', 'Leila Farouk', 'CC-420 Client Events', '2026-08-25'),
  PO('PO-2026-0377', 'Skyline Facilities Management LLC', 'Cleaning & maintenance FY2026 (blanket)', 132000, 'Open', 'Yusuf Al Amiri', 'CC-200 Operations', '2026-01-03',
    [{ description: 'Monthly office cleaning × 12', amount: 110400 }, { description: 'AC preventive maintenance × 12', amount: 21000 }, { description: 'Contingency', amount: 600 }]),
  PO('PO-2026-0378', 'Skyline Facilities Management LLC', 'Deep cleaning after Level 14 office move', 12400, 'Open', 'Yusuf Al Amiri', 'CC-200 Operations', '2026-09-20'),
  PO('PO-2026-0389', 'Falcon Courier Services LLC', 'Courier services Sep–Dec 2026 (blanket)', 15000, 'Open', 'Yusuf Al Amiri', 'CC-200 Operations', '2026-08-30'),
  PO('PO-2026-0398', 'Desert Peak IT Services FZ-LLC', 'Managed IT support Q4 2026', 43500, 'Open', 'Karim Mansour', 'CC-310 IT', '2026-09-15',
    [{ description: 'Managed IT support × 3 months @ 14,500', amount: 43500 }]),
  PO('PO-2026-0402', 'Desert Peak IT Services FZ-LLC', 'Laptop refresh, 18 units incl. setup & docks', 36720, 'Open', 'Karim Mansour', 'CC-310 IT', '2026-09-18',
    [{ description: 'Dell Latitude laptops × 18', amount: 33300 }, { description: 'Imaging & setup × 18', amount: 1350 }, { description: 'Docking stations × 18', amount: 2070 }]),
  PO('PO-2026-0405', 'Desert Peak IT Services FZ-LLC', 'Network switches, Level 14 fit-out', 26000, 'Open', 'Karim Mansour', 'CC-310 IT', '2026-09-10'),
  PO('PO-2026-0412', 'Gulf Office Supplies LLC', 'Office consumables & furniture Q4 2026', 18000, 'Open', 'Yusuf Al Amiri', 'CC-200 Operations', '2026-09-28'),
  PO('PO-2026-0418', 'Cirrusbyte Software Ltd', 'CRM add-on module, annual', 9600, 'Open', 'Karim Mansour', 'CC-310 IT', '2026-10-01'),
  PO('PO-2026-0423', 'Marina Print House LLC', 'Annual report & marketing print 2026', 8000, 'Open', 'Leila Farouk', 'CC-410 Marketing', '2026-09-02'),
  PO('PO-2026-0430', 'Al Waha Catering LLC', 'Client workshop catering, October', 9000, 'Open', 'Leila Farouk', 'CC-420 Client Events', '2026-09-29'),
  PO('PO-2026-0436', 'Skyline Facilities Management LLC', 'AC compressor repair, server room', 4200, 'Open', 'Yusuf Al Amiri', 'CC-200 Operations', '2026-10-02'),
  PO('PO-2026-0438', 'Nexa Legal Translation', 'Arabic translation of tender documents', 3500, 'Closed', 'Rania Haddad', 'CC-110 Legal', '2026-07-14'),
  PO('PO-2026-0441', 'Nexa Legal Translation', 'Legal translation, Q4 client contracts', 6000, 'Open', 'Rania Haddad', 'CC-110 Legal', '2026-10-01'),
  PO('PO-2026-0446', 'Marina Print House LLC', 'Business cards & service brochures', 5000, 'Open', 'Leila Farouk', 'CC-410 Marketing', '2026-10-05'),
  PO('PO-2026-0450', 'Atlas Event Productions LLC', 'Stage & AV, Meridian Client Summit 2026', 14000, 'Open', 'Leila Farouk', 'CC-420 Client Events', '2026-10-06'),
  PO('PO-2026-0455', 'BrightPath Training Institute', 'Leadership programme, 2 cohorts', 32000, 'Open', 'Nadia Rahman', 'CC-150 HR', '2026-10-12'),
]

const bill = (
  seq: number, supplierId: string, invoiceNumber: string, invoiceDate: string, dueDate: string,
  poNumber: string, net: number, category: Bill['category'], status: Bill['status'],
  createdAt: string, paymentDate?: string, approvalCode?: string,
): Bill => {
  const vat = Math.round(net * 5) / 100
  return {
    ref: `LP-2026-0${seq}`, supplierId, invoiceNumber, invoiceDate, dueDate, poNumber,
    net, vat, total: Math.round((net + vat) * 100) / 100, category, status, paymentDate,
    attachment: `${invoiceNumber.replace(/\//g, '-')}.pdf`, createdAt, createdBy: 'AP Team', approvalCode,
  }
}

export const EXISTING_BILLS: Bill[] = [
  bill(4371, 'SUP-001', 'INV-GOS-88102', '2026-09-10', '2026-10-10', 'PO-2026-0412', 4200, 'Office Supplies', 'Paid', '2026-09-12', '2026-10-12'),
  bill(4374, 'SUP-004', 'SFM-INV-55088', '2026-09-30', '2026-11-14', 'PO-2026-0377', 10950, 'Facilities', 'Paid', '2026-10-01', '2026-10-08'),
  bill(4376, 'SUP-008', 'FCS-30371', '2026-09-30', '2026-10-30', 'PO-2026-0389', 2960, 'Courier & Logistics', 'Paid', '2026-10-02', '2026-10-10'),
  bill(4379, 'SUP-005', 'NLT-0921', '2026-10-03', '2026-11-02', 'PO-2026-0441', 1500, 'Professional Fees', 'Paid', '2026-10-05', '2026-10-14'),
  bill(4381, 'SUP-002', 'DPIT-2026-1149', '2026-09-29', '2026-10-29', 'PO-2026-0405', 26000, 'IT Equipment', 'Pending approval', '2026-10-02', undefined, 'APR-4817'),
  bill(4383, 'SUP-007', 'MPH-7752', '2026-09-18', '2026-10-18', 'PO-2026-0423', 5200, 'Printing & Marketing', 'Paid', '2026-09-21', '2026-10-15'),
  bill(4385, 'SUP-001', 'INV-GOS-88150', '2026-10-01', '2026-10-31', 'PO-2026-0412', 2800, 'Office Supplies', 'Paid', '2026-10-03', '2026-10-15'),
  bill(4386, 'SUP-002', 'DPIT-2026-1160', '2026-10-01', '2026-10-31', 'PO-2026-0398', 14500, 'IT Services', 'Scheduled', '2026-10-04', '2026-10-24'),
  bill(4388, 'SUP-003', 'AWC/10/2264', '2026-10-08', '2026-10-23', 'PO-2026-0430', 3000, 'Catering & Events', 'Scheduled', '2026-10-09', '2026-10-25'),
  bill(4390, 'SUP-006', 'CB-INV-20260919', '2026-09-19', '2026-10-19', 'PO-2026-0355', 2280, 'Software Subscriptions', 'Scheduled', '2026-09-22', '2026-10-22'),
  bill(4391, 'SUP-004', 'SFM-INV-55096', '2026-10-06', '2026-11-20', 'PO-2026-0436', 4200, 'Facilities', 'Approved', '2026-10-08'),
  bill(4393, 'SUP-006', 'CB-INV-20260819', '2026-08-19', '2026-09-18', 'PO-2026-0355', 2280, 'Software Subscriptions', 'Paid', '2026-08-21', '2026-09-21'),
]

export const FIRST_NEW_BILL_SEQ = 4401

export const TRACKER_ROWS: TrackerRow[] = [
  { id: 't1', date: '19/10/2026', supplier: 'Skyline Facilities Management LLC', invoiceNumber: 'SFM-INV-55096', amount: '4,410.00', ledgerRef: 'LP-2026-04391', status: 'Approved', notes: '' },
  { id: 't2', date: '19/10/2026', supplier: 'Al Waha Catering LLC', invoiceNumber: 'AWC/10/2264', amount: '3,150.00', ledgerRef: 'LP-2026-04388', status: 'Scheduled', notes: 'Pay 25/10' },
  { id: 't3', date: '19/10/2026', supplier: 'Desert Peak IT Services FZ-LLC', invoiceNumber: 'DPIT-2026-1160', amount: '15,225.00', ledgerRef: 'LP-2026-04386', status: 'Scheduled', notes: '' },
  { id: 't4', date: '18/10/2026', supplier: 'Desert Peak IT Services FZ-LLC', invoiceNumber: 'DPIT-2026-1149', amount: '27,300.00', ledgerRef: 'LP-2026-04381', status: 'Pending approval', notes: 'Waiting for Rania' },
  { id: 't5', date: '18/10/2026', supplier: 'Cirrusbyte Software Ltd', invoiceNumber: 'CB-INV-20260919', amount: '2,394.00', ledgerRef: 'LP-2026-04390', status: 'Scheduled', notes: '' },
]
