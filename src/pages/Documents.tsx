import { useState } from 'react'
import { insertDocument, simulateChain, simulateUpdate } from '../lib/api'

type DocType = 'rfq' | 'po' | 'asn' | 'grn' | 'invoice'

// Mirror of schema_guard.py — required fields per collection
const REQUIRED_FIELDS: Record<DocType, string[]> = {
  rfq:     ['rfq_number', 'status'],
  po:      ['po_number', 'vendor_id', 'status'],
  asn:     ['asn_number', 'po_number', 'status'],
  grn:     ['grn_number', 'po_number', 'status'],
  invoice: ['invoice_number', 'po_number', 'status'],
}

// All known top-level fields per doc type (from schema_guard.py KNOWN_FIELDS)
const KNOWN_FIELDS: Record<DocType, string[]> = {
  rfq:     ['rfq_number', 'requested_date', 'requested_by', 'plant', 'status', 'response_due_date', 'invited_vendors', 'line_items'],
  po:      ['po_number', 'rfq_number', 'vendor_id', 'vendor_name', 'order_date', 'delivery_date', 'plant', 'currency', 'status', 'payment_terms', 'order_total', 'line_items'],
  asn:     ['asn_number', 'po_number', 'vendor_id', 'ship_date', 'carrier', 'tracking_number', 'expected_arrival', 'status', 'line_items'],
  grn:     ['grn_number', 'po_number', 'asn_number', 'receipt_date', 'received_by', 'plant', 'status', 'line_items'],
  invoice: ['invoice_number', 'po_number', 'grn_number', 'vendor_id', 'invoice_date', 'due_date', 'currency', 'status', 'subtotal', 'tax_rate', 'tax_amount', 'total_amount', 'line_items'],
}

const TEMPLATES: Record<DocType, Record<string, string | number | unknown[]>> = {
  rfq: {
    rfq_number: 'RFQ-2026-XXXXX',
    requested_date: '2026-09-06',
    requested_by: 'procurement@buyerco.com',
    plant: 'Plant-Chennai-01',
    status: 'OPEN',
    response_due_date: '2026-09-16',
    invited_vendors: [
      { vendor_id: 'V-1042', vendor_name: 'Ashford Industrial Supplies', invited_on: '2026-09-06' }
    ],
    line_items: [
      { line_no: 1, material_code: 'MAT-7734', description: 'Stainless Steel Pipe Fittings', quantity: 100, unit_of_measure: 'EA', target_delivery_date: '2026-10-06' }
    ],
  },
  po: {
    po_number: 'PO-2026-XXXXX',
    rfq_number: 'RFQ-2026-XXXXX',
    vendor_id: 'V-1042',
    vendor_name: 'Ashford Industrial Supplies',
    order_date: '2026-09-08',
    delivery_date: '2026-10-08',
    plant: 'Plant-Chennai-01',
    currency: 'USD',
    status: 'OPEN',
    payment_terms: 'NET-30',
    order_total: 1875.00,
    line_items: [
      { line_no: 1, material_code: 'MAT-7734', description: 'Stainless Steel Pipe Fittings', quantity: 100, unit_of_measure: 'EA', unit_price: 18.75, line_total: 1875.00 }
    ],
  },
  asn: {
    asn_number: 'ASN-2026-XXXXX',
    po_number: 'PO-2026-XXXXX',
    vendor_id: 'V-1042',
    ship_date: '2026-09-18',
    carrier: 'BlueDart Logistics',
    tracking_number: 'BD0000000001',
    expected_arrival: '2026-09-28',
    status: 'IN_TRANSIT',
    line_items: [
      { line_no: 1, material_code: 'MAT-7734', quantity_shipped: 100, unit_of_measure: 'EA' }
    ],
  },
  grn: {
    grn_number: 'GRN-2026-XXXXX',
    po_number: 'PO-2026-XXXXX',
    asn_number: 'ASN-2026-XXXXX',
    receipt_date: '2026-09-29',
    received_by: 'warehouse.chennai@buyerco.com',
    plant: 'Plant-Chennai-01',
    status: 'COMPLETED',
    line_items: [
      { line_no: 1, material_code: 'MAT-7734', quantity_received: 100, unit_of_measure: 'EA', condition: 'ACCEPTED', remarks: null }
    ],
  },
  invoice: {
    invoice_number: 'INV-2026-XXXXX',
    po_number: 'PO-2026-XXXXX',
    grn_number: 'GRN-2026-XXXXX',
    vendor_id: 'V-1042',
    invoice_date: '2026-10-01',
    due_date: '2026-10-31',
    currency: 'USD',
    status: 'PENDING_PAYMENT',
    subtotal: 1875.00,
    tax_rate: 0.08,
    tax_amount: 150.00,
    total_amount: 2025.00,
    line_items: [
      { line_no: 1, material_code: 'MAT-7734', quantity: 100, unit_price: 18.75, amount: 1875.00 }
    ],
  },
}

export default function Documents() {
  const [docType, setDocType]         = useState<DocType>('po')
  const [jsonText, setJsonText]       = useState(() => JSON.stringify(TEMPLATES['po'], null, 2))
  const [status, setStatus]           = useState<string | null>(null)
  const [error, setError]             = useState<string | null>(null)
  const [jsonError, setJsonError]     = useState<string | null>(null)
  const [jsonValid, setJsonValid]     = useState(false)
  const [showRef, setShowRef]         = useState(false)
  const [copied, setCopied]           = useState<string | null>(null)
  const [chainResult, setChainResult] = useState<Record<string, string> | null>(null)

  const handleTypeChange = (t: DocType) => {
    setDocType(t)
    setJsonText(JSON.stringify(TEMPLATES[t], null, 2))
    setStatus(null)
    setError(null)
    setJsonError(null)
    setJsonValid(false)
  }

  const validateJson = (): Record<string, unknown> | null => {
    setJsonError(null)
    setJsonValid(false)
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(jsonText)
    } catch (e: unknown) {
      setJsonError(e instanceof Error ? e.message : 'Invalid JSON')
      return null
    }
    const missing = REQUIRED_FIELDS[docType].filter(f => parsed[f] == null)
    if (missing.length > 0) {
      setJsonError(`Missing required fields: ${missing.join(', ')}`)
      return null
    }
    setJsonValid(true)
    return parsed
  }

  const handleInsert = async () => {
    setStatus(null)
    setError(null)
    const parsed = validateJson()
    if (!parsed) return
    try {
      const result = await insertDocument(docType, parsed)
      setStatus(`Inserted ${result._id} into ${result.collection}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(text)
      setTimeout(() => setCopied(null), 1500)
    })
  }

  const handleSimulateChain = async () => {
    setChainResult(null)
    setError(null)
    try {
      const r = await simulateChain()
      setChainResult(r)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleSimulateUpdate = async () => {
    setStatus(null)
    setError(null)
    try {
      const r = await simulateUpdate()
      setStatus(`Updated PO ${r.po_id} → status=${r.new_status}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-xl font-semibold text-white">Documents</h1>

      {/* Quick actions */}
      <div className="card">
        <h2 className="text-sm font-medium text-gray-400 mb-3">Quick Simulation</h2>
        <div className="flex gap-3">
          <button className="btn-primary" onClick={handleSimulateChain}>
            Insert Full P2P Chain
          </button>
          <button className="btn-secondary" onClick={handleSimulateUpdate}>
            Random PO Status Update
          </button>
        </div>
        {chainResult && (
          <div className="mt-3 p-3 bg-green-950 border border-green-800 rounded-lg text-sm space-y-1.5">
            <p className="text-green-300 font-medium">Chain inserted — click any ID to copy</p>
            {Object.entries(chainResult)
              .filter(([k]) => k.endsWith('_id'))
              .map(([k, v]) => (
                <div key={k} className="flex items-center gap-2">
                  <span className="text-gray-500 w-20 shrink-0">{k}:</span>
                  <button
                    className="font-mono text-blue-300 hover:text-blue-200 hover:underline text-left"
                    onClick={() => copyToClipboard(v as string)}
                    title="Click to copy"
                  >
                    {v as string}
                  </button>
                  {copied === v && (
                    <span className="text-green-400 text-xs">Copied!</span>
                  )}
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Manual insert */}
      <div className="card">
        <h2 className="text-sm font-medium text-gray-400 mb-3">Manual Document Insert</h2>

        {/* Doc type tabs */}
        <div className="flex gap-2 mb-4">
          {(['rfq', 'po', 'asn', 'grn', 'invoice'] as DocType[]).map(t => (
            <button
              key={t}
              onClick={() => handleTypeChange(t)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                docType === t
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="flex gap-4">
          {/* JSON editor */}
          <div className="flex-1 min-w-0">
            <textarea
              className={`input-field font-mono text-xs h-72 resize-none w-full ${
                jsonError ? 'border-red-500' : jsonValid ? 'border-green-600' : ''
              }`}
              value={jsonText}
              onChange={e => { setJsonText(e.target.value); setJsonError(null); setJsonValid(false) }}
              spellCheck={false}
            />
            {jsonError && (
              <p className="mt-1 text-red-400 text-xs font-mono">{jsonError}</p>
            )}
            {jsonValid && !jsonError && (
              <p className="mt-1 text-green-400 text-xs">JSON is valid ✓</p>
            )}
          </div>

          {/* Field reference panel */}
          <div className="w-56 shrink-0">
            <button
              className="w-full flex justify-between items-center text-xs text-gray-400 hover:text-white mb-2"
              onClick={() => setShowRef(r => !r)}
            >
              <span className="font-medium uppercase tracking-wide">Field Reference</span>
              <span>{showRef ? '▲' : '▼'}</span>
            </button>
            {showRef && (
              <div className="space-y-1 text-xs max-h-64 overflow-y-auto pr-1">
                {KNOWN_FIELDS[docType].map(f => {
                  const isRequired = REQUIRED_FIELDS[docType].includes(f)
                  return (
                    <div key={f} className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isRequired ? 'bg-red-400' : 'bg-gray-600'}`} />
                      <span className={`font-mono ${isRequired ? 'text-gray-200' : 'text-gray-500'}`}>{f}</span>
                      {isRequired && <span className="text-red-400 text-[10px]">req</span>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 mt-3">
          <button className="btn-primary" onClick={handleInsert}>
            Insert into MongoDB
          </button>
          <button className="btn-secondary text-sm" onClick={validateJson}>
            Validate JSON
          </button>
          <button
            className="btn-secondary text-sm"
            onClick={() => { setJsonText(JSON.stringify(TEMPLATES[docType], null, 2)); setJsonError(null); setJsonValid(false) }}
          >
            Reset Template
          </button>
        </div>

        {status && <p className="mt-3 text-green-400 text-sm">{status}</p>}
        {error  && <p className="mt-3 text-red-400 text-sm">{error}</p>}
      </div>

      <div className="card text-sm text-gray-400 space-y-1">
        <p className="text-gray-300 font-medium">How it works</p>
        <p>Inserting a document writes directly to MongoDB. Debezium detects the change,
           produces a Kafka message, and the consumer propagates it to Postgres and Neo4j.
           Check the Dashboard to see the event appear in real time.</p>
      </div>
    </div>
  )
}
