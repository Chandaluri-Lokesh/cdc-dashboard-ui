import { useState } from 'react'
import { insertDocument, simulateChain, simulateUpdate } from '../lib/api'

type DocType = 'rfq' | 'po' | 'asn' | 'grn' | 'invoice'

// ── Reference data ─────────────────────────────────────────────────────────────
const PLANTS   = ['Plant-Chennai-01', 'Plant-Mumbai-02', 'Plant-Delhi-03', 'Plant-Pune-04']
const CARRIERS = ['BlueDart Logistics', 'FedEx India', 'DHL Express', 'DTDC Courier']
const VENDORS  = [
  { id: 'V-1042', name: 'Ashford Industrial Supplies' },
  { id: 'V-1087', name: 'Meridian Components Ltd.' },
  { id: 'V-2031', name: 'Pinnacle Engineering Works' },
  { id: 'V-3007', name: 'Apex Fasteners Pvt. Ltd.' },
]
const MATERIALS = [
  { code: 'MAT-7734', desc: 'Stainless Steel Pipe Fittings, DN50', price: 18.75 },
  { code: 'MAT-8821', desc: 'Industrial Gasket Set',                price: 6.40  },
  { code: 'MAT-9002', desc: 'Hex Bolt M16x80 Grade 8.8',            price: 0.85  },
  { code: 'MAT-6611', desc: 'Pressure Relief Valve, 16 bar',        price: 142.00 },
  { code: 'MAT-5523', desc: 'PTFE Thread Seal Tape Roll',            price: 1.20  },
]
const CONDITIONS    = ['ACCEPTED', 'ACCEPTED_SHORT', 'REJECTED']
const RFQ_STATUSES  = ['OPEN', 'CLOSED', 'CANCELLED']
const PO_STATUSES   = ['OPEN', 'CONFIRMED', 'PARTIAL_DELIVERY', 'CLOSED']
const ASN_STATUSES  = ['IN_TRANSIT', 'DELIVERED', 'PARTIALLY_DELIVERED']
const GRN_STATUSES  = ['COMPLETED', 'PARTIAL', 'PENDING']
const INV_STATUSES  = ['PENDING_PAYMENT', 'APPROVED', 'PAID', 'DISPUTED']

// ── Helpers ────────────────────────────────────────────────────────────────────
const plusDays = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}
const genId = (prefix: string) =>
  `${prefix}-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`
const mat = (code: string) => MATERIALS.find(m => m.code === code) ?? MATERIALS[0]
const vendor = (id: string) => VENDORS.find(v => v.id === id) ?? VENDORS[0]

// ── Form state types ───────────────────────────────────────────────────────────
type RfqLineItem  = { line_no: number; material_code: string; description: string; quantity: number; uom: string; target_delivery_date: string }
type PoLineItem   = { line_no: number; material_code: string; description: string; quantity: number; uom: string; unit_price: number; line_total: number }
type AsnLineItem  = { line_no: number; material_code: string; quantity_shipped: number; uom: string }
type GrnLineItem  = { line_no: number; material_code: string; quantity_received: number; uom: string; condition: string; remarks: string }
type InvLineItem  = { line_no: number; material_code: string; quantity: number; unit_price: number; amount: number }

type RfqForm = { rfq_number: string; requested_date: string; requested_by: string; plant: string; status: string; response_due_date: string; invited_vendors: { vendor_id: string; vendor_name: string; invited_on: string }[]; line_items: RfqLineItem[] }
type PoForm  = { po_number: string; rfq_number: string; vendor_id: string; vendor_name: string; order_date: string; delivery_date: string; plant: string; currency: string; status: string; payment_terms: string; line_items: PoLineItem[] }
type AsnForm = { asn_number: string; po_number: string; vendor_id: string; ship_date: string; carrier: string; tracking_number: string; expected_arrival: string; status: string; line_items: AsnLineItem[] }
type GrnForm = { grn_number: string; po_number: string; asn_number: string; receipt_date: string; received_by: string; plant: string; status: string; line_items: GrnLineItem[] }
type InvForm = { invoice_number: string; po_number: string; grn_number: string; vendor_id: string; invoice_date: string; due_date: string; currency: string; status: string; tax_rate: number; line_items: InvLineItem[] }

// ── Default factories ──────────────────────────────────────────────────────────
const defRfq  = (): RfqForm => ({ rfq_number: genId('RFQ'), requested_date: plusDays(0), requested_by: '', plant: PLANTS[0], status: 'OPEN', response_due_date: plusDays(10), invited_vendors: [{ vendor_id: VENDORS[0].id, vendor_name: VENDORS[0].name, invited_on: plusDays(0) }], line_items: [{ line_no: 1, material_code: MATERIALS[0].code, description: MATERIALS[0].desc, quantity: 100, uom: 'EA', target_delivery_date: plusDays(30) }] })
const defPo   = (): PoForm  => ({ po_number: genId('PO'), rfq_number: '', vendor_id: VENDORS[0].id, vendor_name: VENDORS[0].name, order_date: plusDays(0), delivery_date: plusDays(30), plant: PLANTS[0], currency: 'USD', status: 'OPEN', payment_terms: 'NET-30', line_items: [{ line_no: 1, material_code: MATERIALS[0].code, description: MATERIALS[0].desc, quantity: 100, uom: 'EA', unit_price: MATERIALS[0].price, line_total: 100 * MATERIALS[0].price }] })
const defAsn  = (): AsnForm => ({ asn_number: genId('ASN'), po_number: '', vendor_id: '', ship_date: plusDays(0), carrier: CARRIERS[0], tracking_number: '', expected_arrival: plusDays(10), status: 'IN_TRANSIT', line_items: [{ line_no: 1, material_code: MATERIALS[0].code, quantity_shipped: 100, uom: 'EA' }] })
const defGrn  = (): GrnForm => ({ grn_number: genId('GRN'), po_number: '', asn_number: '', receipt_date: plusDays(0), received_by: '', plant: PLANTS[0], status: 'COMPLETED', line_items: [{ line_no: 1, material_code: MATERIALS[0].code, quantity_received: 100, uom: 'EA', condition: 'ACCEPTED', remarks: '' }] })
const defInv  = (): InvForm => ({ invoice_number: genId('INV'), po_number: '', grn_number: '', vendor_id: '', invoice_date: plusDays(0), due_date: plusDays(30), currency: 'USD', status: 'PENDING_PAYMENT', tax_rate: 0.08, line_items: [{ line_no: 1, material_code: MATERIALS[0].code, quantity: 100, unit_price: MATERIALS[0].price, amount: 100 * MATERIALS[0].price }] })

// ── Reusable field components ──────────────────────────────────────────────────
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-400 font-medium">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

function IdField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2">
      <input className="input-field font-mono text-sm flex-1" value={value} onChange={e => onChange(e.target.value)} />
      <button
        type="button"
        className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg whitespace-nowrap"
        onClick={() => onChange(value.split('-').slice(0, 2).join('-') + '-' + String(Math.floor(Math.random() * 90000) + 10000))}
        title="Re-generate ID"
      >
        ↻ New
      </button>
    </div>
  )
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select className="input-field text-sm" value={value} onChange={e => onChange(e.target.value)}>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

// ── Section label ──────────────────────────────────────────────────────────────
function Section({ title }: { title: string }) {
  return <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest col-span-2 mt-2 border-b border-gray-800 pb-1">{title}</h3>
}

// ── Forms ──────────────────────────────────────────────────────────────────────

function RfqFormView({ form, setForm }: { form: RfqForm; setForm: (f: RfqForm) => void }) {
  const set = (k: keyof RfqForm, v: unknown) => setForm({ ...form, [k]: v })
  const setItem = (i: number, k: keyof RfqLineItem, v: unknown) => {
    const items = [...form.line_items]
    items[i] = { ...items[i], [k]: v }
    if (k === 'material_code') items[i].description = mat(v as string).desc
    setForm({ ...form, line_items: items })
  }
  const addItem = () => setForm({ ...form, line_items: [...form.line_items, { line_no: form.line_items.length + 1, material_code: MATERIALS[0].code, description: MATERIALS[0].desc, quantity: 100, uom: 'EA', target_delivery_date: plusDays(30) }] })
  const removeItem = (i: number) => setForm({ ...form, line_items: form.line_items.filter((_, idx) => idx !== i).map((r, idx) => ({ ...r, line_no: idx + 1 })) })

  const setVendor = (i: number, k: keyof typeof form.invited_vendors[0], v: string) => {
    const vs = [...form.invited_vendors]
    vs[i] = { ...vs[i], [k]: v }
    if (k === 'vendor_id') vs[i].vendor_name = vendor(v).name
    setForm({ ...form, invited_vendors: vs })
  }
  const addVendor = () => setForm({ ...form, invited_vendors: [...form.invited_vendors, { vendor_id: VENDORS[0].id, vendor_name: VENDORS[0].name, invited_on: plusDays(0) }] })
  const removeVendor = (i: number) => setForm({ ...form, invited_vendors: form.invited_vendors.filter((_, idx) => idx !== i) })

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
      <Section title="RFQ Details" />
      <Field label="RFQ Number" required>
        <IdField value={form.rfq_number} onChange={v => set('rfq_number', v)} />
      </Field>
      <Field label="Status" required>
        <Select value={form.status} onChange={v => set('status', v)} options={RFQ_STATUSES} />
      </Field>
      <Field label="Requested By" required>
        <input className="input-field text-sm" value={form.requested_by} onChange={e => set('requested_by', e.target.value)} placeholder="procurement@company.com" />
      </Field>
      <Field label="Plant">
        <Select value={form.plant} onChange={v => set('plant', v)} options={PLANTS} />
      </Field>
      <Field label="Requested Date">
        <input type="date" className="input-field text-sm" value={form.requested_date} onChange={e => set('requested_date', e.target.value)} />
      </Field>
      <Field label="Response Due Date">
        <input type="date" className="input-field text-sm" value={form.response_due_date} onChange={e => set('response_due_date', e.target.value)} />
      </Field>

      <Section title="Invited Vendors" />
      <div className="col-span-2 space-y-2">
        {form.invited_vendors.map((v, i) => (
          <div key={i} className="grid grid-cols-3 gap-3 items-end bg-gray-800/50 p-3 rounded-lg">
            <Field label="Vendor">
              <select className="input-field text-sm" value={v.vendor_id} onChange={e => setVendor(i, 'vendor_id', e.target.value)}>
                {VENDORS.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </Field>
            <Field label="Invited On">
              <input type="date" className="input-field text-sm" value={v.invited_on} onChange={e => setVendor(i, 'invited_on', e.target.value)} />
            </Field>
            <button className="text-red-400 hover:text-red-300 text-sm mb-0.5 text-left" onClick={() => removeVendor(i)} disabled={form.invited_vendors.length === 1}>Remove</button>
          </div>
        ))}
        <button className="text-blue-400 hover:text-blue-300 text-sm" onClick={addVendor}>+ Add Vendor</button>
      </div>

      <Section title="Line Items" />
      <div className="col-span-2 space-y-2">
        {form.line_items.map((item, i) => (
          <div key={i} className="grid grid-cols-5 gap-3 items-end bg-gray-800/50 p-3 rounded-lg">
            <Field label="Material">
              <select className="input-field text-sm" value={item.material_code} onChange={e => setItem(i, 'material_code', e.target.value)}>
                {MATERIALS.map(m => <option key={m.code} value={m.code}>{m.code} — {m.desc}</option>)}
              </select>
            </Field>
            <Field label="Quantity">
              <input type="number" className="input-field text-sm" value={item.quantity} min={1} onChange={e => setItem(i, 'quantity', Number(e.target.value))} />
            </Field>
            <Field label="UOM">
              <Select value={item.uom} onChange={v => setItem(i, 'uom', v)} options={['EA', 'KG', 'MT', 'PCS', 'BOX']} />
            </Field>
            <Field label="Target Delivery">
              <input type="date" className="input-field text-sm" value={item.target_delivery_date} onChange={e => setItem(i, 'target_delivery_date', e.target.value)} />
            </Field>
            <button className="text-red-400 hover:text-red-300 text-sm mb-0.5 text-left" onClick={() => removeItem(i)} disabled={form.line_items.length === 1}>Remove</button>
          </div>
        ))}
        <button className="text-blue-400 hover:text-blue-300 text-sm" onClick={addItem}>+ Add Line Item</button>
      </div>
    </div>
  )
}

function PoFormView({ form, setForm }: { form: PoForm; setForm: (f: PoForm) => void }) {
  const set = (k: keyof PoForm, v: unknown) => setForm({ ...form, [k]: v })
  const setItem = (i: number, k: keyof PoLineItem, v: unknown) => {
    const items = [...form.line_items]
    items[i] = { ...items[i], [k]: v }
    if (k === 'material_code') { items[i].description = mat(v as string).desc; items[i].unit_price = mat(v as string).price }
    if (k === 'quantity' || k === 'unit_price') items[i].line_total = items[i].quantity * items[i].unit_price
    setForm({ ...form, line_items: items })
  }
  const addItem = () => setForm({ ...form, line_items: [...form.line_items, { line_no: form.line_items.length + 1, material_code: MATERIALS[0].code, description: MATERIALS[0].desc, quantity: 100, uom: 'EA', unit_price: MATERIALS[0].price, line_total: 100 * MATERIALS[0].price }] })
  const removeItem = (i: number) => setForm({ ...form, line_items: form.line_items.filter((_, idx) => idx !== i).map((r, idx) => ({ ...r, line_no: idx + 1 })) })
  const orderTotal = form.line_items.reduce((s, r) => s + r.line_total, 0)

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
      <Section title="PO Details" />
      <Field label="PO Number" required>
        <IdField value={form.po_number} onChange={v => set('po_number', v)} />
      </Field>
      <Field label="RFQ Reference">
        <input className="input-field text-sm font-mono" value={form.rfq_number} onChange={e => set('rfq_number', e.target.value)} placeholder="RFQ-2026-XXXXX (optional)" />
      </Field>
      <Field label="Vendor" required>
        <select className="input-field text-sm" value={form.vendor_id} onChange={e => { set('vendor_id', e.target.value); setForm({ ...form, vendor_id: e.target.value, vendor_name: vendor(e.target.value).name }) }}>
          {VENDORS.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </Field>
      <Field label="Status" required>
        <Select value={form.status} onChange={v => set('status', v)} options={PO_STATUSES} />
      </Field>
      <Field label="Plant">
        <Select value={form.plant} onChange={v => set('plant', v)} options={PLANTS} />
      </Field>
      <Field label="Currency">
        <Select value={form.currency} onChange={v => set('currency', v)} options={['USD', 'EUR', 'INR', 'GBP']} />
      </Field>
      <Field label="Order Date">
        <input type="date" className="input-field text-sm" value={form.order_date} onChange={e => set('order_date', e.target.value)} />
      </Field>
      <Field label="Delivery Date">
        <input type="date" className="input-field text-sm" value={form.delivery_date} onChange={e => set('delivery_date', e.target.value)} />
      </Field>
      <Field label="Payment Terms">
        <Select value={form.payment_terms} onChange={v => set('payment_terms', v)} options={['NET-30', 'NET-60', 'NET-90', 'IMMEDIATE']} />
      </Field>

      <Section title="Line Items" />
      <div className="col-span-2 space-y-2">
        {form.line_items.map((item, i) => (
          <div key={i} className="grid grid-cols-6 gap-3 items-end bg-gray-800/50 p-3 rounded-lg">
            <Field label="Material">
              <select className="input-field text-sm" value={item.material_code} onChange={e => setItem(i, 'material_code', e.target.value)}>
                {MATERIALS.map(m => <option key={m.code} value={m.code}>{m.code}</option>)}
              </select>
            </Field>
            <Field label="Qty">
              <input type="number" className="input-field text-sm" value={item.quantity} min={1} onChange={e => setItem(i, 'quantity', Number(e.target.value))} />
            </Field>
            <Field label="UOM">
              <Select value={item.uom} onChange={v => setItem(i, 'uom', v)} options={['EA', 'KG', 'MT', 'PCS', 'BOX']} />
            </Field>
            <Field label="Unit Price">
              <input type="number" className="input-field text-sm" value={item.unit_price} step={0.01} onChange={e => setItem(i, 'unit_price', Number(e.target.value))} />
            </Field>
            <Field label="Line Total">
              <div className="input-field text-sm bg-gray-700/50 text-gray-400">{item.line_total.toFixed(2)}</div>
            </Field>
            <button className="text-red-400 hover:text-red-300 text-sm mb-0.5 text-left" onClick={() => removeItem(i)} disabled={form.line_items.length === 1}>Remove</button>
          </div>
        ))}
        <div className="flex items-center justify-between">
          <button className="text-blue-400 hover:text-blue-300 text-sm" onClick={addItem}>+ Add Line Item</button>
          <span className="text-sm text-gray-400">Order Total: <span className="text-white font-semibold">{orderTotal.toFixed(2)}</span></span>
        </div>
      </div>
    </div>
  )
}

function AsnFormView({ form, setForm }: { form: AsnForm; setForm: (f: AsnForm) => void }) {
  const set = (k: keyof AsnForm, v: unknown) => setForm({ ...form, [k]: v })
  const setItem = (i: number, k: keyof AsnLineItem, v: unknown) => {
    const items = [...form.line_items]; items[i] = { ...items[i], [k]: v }; setForm({ ...form, line_items: items })
  }
  const addItem = () => setForm({ ...form, line_items: [...form.line_items, { line_no: form.line_items.length + 1, material_code: MATERIALS[0].code, quantity_shipped: 100, uom: 'EA' }] })
  const removeItem = (i: number) => setForm({ ...form, line_items: form.line_items.filter((_, idx) => idx !== i).map((r, idx) => ({ ...r, line_no: idx + 1 })) })

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
      <Section title="Shipment Details" />
      <Field label="ASN Number" required>
        <IdField value={form.asn_number} onChange={v => set('asn_number', v)} />
      </Field>
      <Field label="PO Reference" required>
        <input className="input-field text-sm font-mono" value={form.po_number} onChange={e => set('po_number', e.target.value)} placeholder="PO-2026-XXXXX" />
      </Field>
      <Field label="Vendor ID">
        <select className="input-field text-sm" value={form.vendor_id} onChange={e => set('vendor_id', e.target.value)}>
          <option value="">— select vendor —</option>
          {VENDORS.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </Field>
      <Field label="Status" required>
        <Select value={form.status} onChange={v => set('status', v)} options={ASN_STATUSES} />
      </Field>
      <Field label="Carrier">
        <Select value={form.carrier} onChange={v => set('carrier', v)} options={CARRIERS} />
      </Field>
      <Field label="Tracking Number">
        <input className="input-field text-sm" value={form.tracking_number} onChange={e => set('tracking_number', e.target.value)} placeholder="e.g. BD0000000001" />
      </Field>
      <Field label="Ship Date">
        <input type="date" className="input-field text-sm" value={form.ship_date} onChange={e => set('ship_date', e.target.value)} />
      </Field>
      <Field label="Expected Arrival">
        <input type="date" className="input-field text-sm" value={form.expected_arrival} onChange={e => set('expected_arrival', e.target.value)} />
      </Field>

      <Section title="Line Items" />
      <div className="col-span-2 space-y-2">
        {form.line_items.map((item, i) => (
          <div key={i} className="grid grid-cols-4 gap-3 items-end bg-gray-800/50 p-3 rounded-lg">
            <Field label="Material">
              <select className="input-field text-sm" value={item.material_code} onChange={e => setItem(i, 'material_code', e.target.value)}>
                {MATERIALS.map(m => <option key={m.code} value={m.code}>{m.code}</option>)}
              </select>
            </Field>
            <Field label="Qty Shipped">
              <input type="number" className="input-field text-sm" value={item.quantity_shipped} min={1} onChange={e => setItem(i, 'quantity_shipped', Number(e.target.value))} />
            </Field>
            <Field label="UOM">
              <Select value={item.uom} onChange={v => setItem(i, 'uom', v)} options={['EA', 'KG', 'MT', 'PCS', 'BOX']} />
            </Field>
            <button className="text-red-400 hover:text-red-300 text-sm mb-0.5 text-left" onClick={() => removeItem(i)} disabled={form.line_items.length === 1}>Remove</button>
          </div>
        ))}
        <button className="text-blue-400 hover:text-blue-300 text-sm" onClick={addItem}>+ Add Line Item</button>
      </div>
    </div>
  )
}

function GrnFormView({ form, setForm }: { form: GrnForm; setForm: (f: GrnForm) => void }) {
  const set = (k: keyof GrnForm, v: unknown) => setForm({ ...form, [k]: v })
  const setItem = (i: number, k: keyof GrnLineItem, v: unknown) => {
    const items = [...form.line_items]; items[i] = { ...items[i], [k]: v }; setForm({ ...form, line_items: items })
  }
  const addItem = () => setForm({ ...form, line_items: [...form.line_items, { line_no: form.line_items.length + 1, material_code: MATERIALS[0].code, quantity_received: 100, uom: 'EA', condition: 'ACCEPTED', remarks: '' }] })
  const removeItem = (i: number) => setForm({ ...form, line_items: form.line_items.filter((_, idx) => idx !== i).map((r, idx) => ({ ...r, line_no: idx + 1 })) })

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
      <Section title="Receipt Details" />
      <Field label="GRN Number" required>
        <IdField value={form.grn_number} onChange={v => set('grn_number', v)} />
      </Field>
      <Field label="PO Reference" required>
        <input className="input-field text-sm font-mono" value={form.po_number} onChange={e => set('po_number', e.target.value)} placeholder="PO-2026-XXXXX" />
      </Field>
      <Field label="ASN Reference">
        <input className="input-field text-sm font-mono" value={form.asn_number} onChange={e => set('asn_number', e.target.value)} placeholder="ASN-2026-XXXXX (optional)" />
      </Field>
      <Field label="Status" required>
        <Select value={form.status} onChange={v => set('status', v)} options={GRN_STATUSES} />
      </Field>
      <Field label="Received By">
        <input className="input-field text-sm" value={form.received_by} onChange={e => set('received_by', e.target.value)} placeholder="warehouse@company.com" />
      </Field>
      <Field label="Plant">
        <Select value={form.plant} onChange={v => set('plant', v)} options={PLANTS} />
      </Field>
      <Field label="Receipt Date">
        <input type="date" className="input-field text-sm" value={form.receipt_date} onChange={e => set('receipt_date', e.target.value)} />
      </Field>

      <Section title="Line Items" />
      <div className="col-span-2 space-y-2">
        {form.line_items.map((item, i) => (
          <div key={i} className="grid grid-cols-5 gap-3 items-end bg-gray-800/50 p-3 rounded-lg">
            <Field label="Material">
              <select className="input-field text-sm" value={item.material_code} onChange={e => setItem(i, 'material_code', e.target.value)}>
                {MATERIALS.map(m => <option key={m.code} value={m.code}>{m.code}</option>)}
              </select>
            </Field>
            <Field label="Qty Received">
              <input type="number" className="input-field text-sm" value={item.quantity_received} min={0} onChange={e => setItem(i, 'quantity_received', Number(e.target.value))} />
            </Field>
            <Field label="UOM">
              <Select value={item.uom} onChange={v => setItem(i, 'uom', v)} options={['EA', 'KG', 'MT', 'PCS', 'BOX']} />
            </Field>
            <Field label="Condition">
              <Select value={item.condition} onChange={v => setItem(i, 'condition', v)} options={CONDITIONS} />
            </Field>
            <button className="text-red-400 hover:text-red-300 text-sm mb-0.5 text-left" onClick={() => removeItem(i)} disabled={form.line_items.length === 1}>Remove</button>
          </div>
        ))}
        <button className="text-blue-400 hover:text-blue-300 text-sm" onClick={addItem}>+ Add Line Item</button>
      </div>
    </div>
  )
}

function InvoiceFormView({ form, setForm }: { form: InvForm; setForm: (f: InvForm) => void }) {
  const set = (k: keyof InvForm, v: unknown) => setForm({ ...form, [k]: v })
  const setItem = (i: number, k: keyof InvLineItem, v: unknown) => {
    const items = [...form.line_items]; items[i] = { ...items[i], [k]: v }
    if (k === 'material_code') items[i].unit_price = mat(v as string).price
    if (k === 'quantity' || k === 'unit_price') items[i].amount = items[i].quantity * items[i].unit_price
    setForm({ ...form, line_items: items })
  }
  const addItem = () => setForm({ ...form, line_items: [...form.line_items, { line_no: form.line_items.length + 1, material_code: MATERIALS[0].code, quantity: 100, unit_price: MATERIALS[0].price, amount: 100 * MATERIALS[0].price }] })
  const removeItem = (i: number) => setForm({ ...form, line_items: form.line_items.filter((_, idx) => idx !== i).map((r, idx) => ({ ...r, line_no: idx + 1 })) })

  const subtotal     = form.line_items.reduce((s, r) => s + r.amount, 0)
  const tax_amount   = subtotal * form.tax_rate
  const total_amount = subtotal + tax_amount

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
      <Section title="Invoice Details" />
      <Field label="Invoice Number" required>
        <IdField value={form.invoice_number} onChange={v => set('invoice_number', v)} />
      </Field>
      <Field label="PO Reference" required>
        <input className="input-field text-sm font-mono" value={form.po_number} onChange={e => set('po_number', e.target.value)} placeholder="PO-2026-XXXXX" />
      </Field>
      <Field label="GRN Reference">
        <input className="input-field text-sm font-mono" value={form.grn_number} onChange={e => set('grn_number', e.target.value)} placeholder="GRN-2026-XXXXX (optional)" />
      </Field>
      <Field label="Vendor">
        <select className="input-field text-sm" value={form.vendor_id} onChange={e => set('vendor_id', e.target.value)}>
          <option value="">— select vendor —</option>
          {VENDORS.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </Field>
      <Field label="Status" required>
        <Select value={form.status} onChange={v => set('status', v)} options={INV_STATUSES} />
      </Field>
      <Field label="Currency">
        <Select value={form.currency} onChange={v => set('currency', v)} options={['USD', 'EUR', 'INR', 'GBP']} />
      </Field>
      <Field label="Invoice Date">
        <input type="date" className="input-field text-sm" value={form.invoice_date} onChange={e => set('invoice_date', e.target.value)} />
      </Field>
      <Field label="Due Date">
        <input type="date" className="input-field text-sm" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
      </Field>
      <Field label="Tax Rate (e.g. 0.08 for 8%)">
        <input type="number" className="input-field text-sm" value={form.tax_rate} step={0.01} min={0} max={1} onChange={e => set('tax_rate', Number(e.target.value))} />
      </Field>

      <Section title="Line Items" />
      <div className="col-span-2 space-y-2">
        {form.line_items.map((item, i) => (
          <div key={i} className="grid grid-cols-5 gap-3 items-end bg-gray-800/50 p-3 rounded-lg">
            <Field label="Material">
              <select className="input-field text-sm" value={item.material_code} onChange={e => setItem(i, 'material_code', e.target.value)}>
                {MATERIALS.map(m => <option key={m.code} value={m.code}>{m.code}</option>)}
              </select>
            </Field>
            <Field label="Qty">
              <input type="number" className="input-field text-sm" value={item.quantity} min={1} onChange={e => setItem(i, 'quantity', Number(e.target.value))} />
            </Field>
            <Field label="Unit Price">
              <input type="number" className="input-field text-sm" value={item.unit_price} step={0.01} onChange={e => setItem(i, 'unit_price', Number(e.target.value))} />
            </Field>
            <Field label="Amount">
              <div className="input-field text-sm bg-gray-700/50 text-gray-400">{item.amount.toFixed(2)}</div>
            </Field>
            <button className="text-red-400 hover:text-red-300 text-sm mb-0.5 text-left" onClick={() => removeItem(i)} disabled={form.line_items.length === 1}>Remove</button>
          </div>
        ))}
        <button className="text-blue-400 hover:text-blue-300 text-sm" onClick={addItem}>+ Add Line Item</button>
      </div>

      <Section title="Totals" />
      <div className="col-span-2 grid grid-cols-3 gap-4">
        {[['Subtotal', subtotal.toFixed(2)], ['Tax Amount', tax_amount.toFixed(2)], ['Total Amount', total_amount.toFixed(2)]].map(([l, v]) => (
          <div key={l} className="bg-gray-800/50 rounded-lg p-3">
            <p className="text-xs text-gray-500">{l}</p>
            <p className="text-lg font-semibold text-white">{v}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Build document objects ─────────────────────────────────────────────────────
function buildDoc(type: DocType, form: RfqForm | PoForm | AsnForm | GrnForm | InvForm): Record<string, unknown> {
  if (type === 'rfq') {
    const f = form as RfqForm
    return { ...f, document_type: 'RFQ', _id: f.rfq_number }
  }
  if (type === 'po') {
    const f = form as PoForm
    const order_total = f.line_items.reduce((s, r) => s + r.line_total, 0)
    return { ...f, document_type: 'PO', _id: f.po_number, order_total: parseFloat(order_total.toFixed(2)) }
  }
  if (type === 'asn') {
    const f = form as AsnForm
    return { ...f, document_type: 'ASN', _id: f.asn_number }
  }
  if (type === 'grn') {
    const f = form as GrnForm
    return { ...f, document_type: 'GRN', _id: f.grn_number }
  }
  // invoice
  const f = form as InvForm
  const subtotal = f.line_items.reduce((s, r) => s + r.amount, 0)
  const tax_amount = subtotal * f.tax_rate
  return { ...f, document_type: 'INVOICE', _id: f.invoice_number, subtotal: parseFloat(subtotal.toFixed(2)), tax_amount: parseFloat(tax_amount.toFixed(2)), total_amount: parseFloat((subtotal + tax_amount).toFixed(2)) }
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function Documents() {
  const [docType, setDocType]   = useState<DocType>('po')
  const [rfq, setRfq]           = useState<RfqForm>(defRfq)
  const [po, setPo]             = useState<PoForm>(defPo)
  const [asn, setAsn]           = useState<AsnForm>(defAsn)
  const [grn, setGrn]           = useState<GrnForm>(defGrn)
  const [inv, setInv]           = useState<InvForm>(defInv)
  const [status, setStatus]     = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [chainResult, setChainResult] = useState<Record<string, string> | null>(null)
  const [copied, setCopied]     = useState<string | null>(null)

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(text); setTimeout(() => setCopied(null), 1500) })
  }

  const getCurrentForm = () => {
    if (docType === 'rfq')     return rfq
    if (docType === 'po')      return po
    if (docType === 'asn')     return asn
    if (docType === 'grn')     return grn
    return inv
  }

  const handleInsert = async () => {
    setStatus(null); setError(null)
    try {
      const doc = buildDoc(docType, getCurrentForm())
      const result = await insertDocument(docType, doc)
      setStatus(`✓ ${docType.toUpperCase()} ${result._id} submitted — CDC pipeline will propagate it to Postgres & Neo4j`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleReset = () => {
    if (docType === 'rfq') setRfq(defRfq())
    else if (docType === 'po') setPo(defPo())
    else if (docType === 'asn') setAsn(defAsn())
    else if (docType === 'grn') setGrn(defGrn())
    else setInv(defInv())
    setStatus(null); setError(null)
  }

  const handleSimulateChain = async () => {
    setChainResult(null); setError(null)
    try { setChainResult(await simulateChain()) }
    catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)) }
  }

  const handleSimulateUpdate = async () => {
    setStatus(null); setError(null)
    try {
      const r = await simulateUpdate()
      setStatus(`Updated PO ${r.po_id} → status = ${r.new_status}`)
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)) }
  }

  const DOC_LABELS: Record<DocType, string> = { rfq: 'RFQ', po: 'Purchase Order', asn: 'Shipment Notice', grn: 'Goods Receipt', invoice: 'Invoice' }

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-xl font-semibold text-white">Documents</h1>

      {/* Quick actions */}
      <div className="card">
        <h2 className="text-sm font-medium text-gray-400 mb-3">Quick Simulation</h2>
        <div className="flex gap-3">
          <button className="btn-primary" onClick={handleSimulateChain}>Insert Full P2P Chain</button>
          <button className="btn-secondary" onClick={handleSimulateUpdate}>Random PO Status Update</button>
        </div>
        {chainResult && (
          <div className="mt-3 p-3 bg-green-950 border border-green-800 rounded-lg text-sm space-y-1.5">
            <p className="text-green-300 font-medium">Chain inserted — click any ID to copy</p>
            {Object.entries(chainResult).filter(([k]) => k.endsWith('_id')).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2">
                <span className="text-gray-500 w-20 shrink-0">{k}:</span>
                <button className="font-mono text-blue-300 hover:text-blue-200 hover:underline" onClick={() => copyToClipboard(v as string)} title="Click to copy">{v as string}</button>
                {copied === v && <span className="text-green-400 text-xs">Copied!</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manual insert */}
      <div className="card">
        <h2 className="text-sm font-medium text-gray-400 mb-4">New Document</h2>

        {/* Doc type selector */}
        <div className="flex gap-2 mb-6">
          {(Object.keys(DOC_LABELS) as DocType[]).map(t => (
            <button
              key={t}
              onClick={() => { setDocType(t); setStatus(null); setError(null) }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${docType === t ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}
            >
              {DOC_LABELS[t]}
            </button>
          ))}
        </div>

        {/* Active form */}
        <div className="mb-6">
          {docType === 'rfq'     && <RfqFormView     form={rfq} setForm={setRfq} />}
          {docType === 'po'      && <PoFormView       form={po}  setForm={setPo} />}
          {docType === 'asn'     && <AsnFormView      form={asn} setForm={setAsn} />}
          {docType === 'grn'     && <GrnFormView      form={grn} setForm={setGrn} />}
          {docType === 'invoice' && <InvoiceFormView  form={inv} setForm={setInv} />}
        </div>

        <div className="flex items-center gap-3 pt-4 border-t border-gray-800">
          <button className="btn-primary" onClick={handleInsert}>Submit to MongoDB</button>
          <button className="btn-secondary text-sm" onClick={handleReset}>Reset Form</button>
        </div>

        {status && <p className="mt-3 text-green-400 text-sm">{status}</p>}
        {error  && <p className="mt-3 text-red-400 text-sm">{error}</p>}
      </div>

      <div className="card text-sm text-gray-400 space-y-1">
        <p className="text-gray-300 font-medium">How it works</p>
        <p>Each submitted document writes directly to MongoDB. Debezium detects the change, produces a Kafka event, and the consumer propagates it to Postgres and Neo4j in real time. Watch the Dashboard feed to see it arrive.</p>
      </div>
    </div>
  )
}
