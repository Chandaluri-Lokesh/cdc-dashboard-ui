import { useEffect, useState } from 'react'
import { fetchMongoSchema, fetchPostgresSchema, fetchNeo4jSchema } from '../lib/api'

type Tab = 'mongodb' | 'postgresql' | 'neo4j'

// ── MongoDB types ─────────────────────────────────────────────────────────────
type MongoField      = { name: string; type: string }
type MongoCollection = { name: string; count: number; fields: MongoField[] }

// ── PostgreSQL types ──────────────────────────────────────────────────────────
type PgColumn = { name: string; type: string; nullable: boolean; primary_key: boolean; foreign_key: string | null }
type PgTable  = { name: string; row_count: number; columns: PgColumn[] }

// ── Neo4j types ───────────────────────────────────────────────────────────────
type Neo4jLabel        = { label: string; count: number; properties: string[] }
type Neo4jRelationship = { type: string; count: number; from_label: string | null; to_label: string | null }
type Neo4jConstraint   = { name: string; type: string; entity: string[]; properties: string[] }
type Neo4jSchema       = { labels: Neo4jLabel[]; relationships: Neo4jRelationship[]; constraints: Neo4jConstraint[] }

// ── Shared sample queries ─────────────────────────────────────────────────────
const MONGO_QUERIES = [
  { label: 'All Purchase Orders', code: `db.purchase_orders.find({}).pretty()` },
  { label: 'Open POs', code: `db.purchase_orders.find({ status: "OPEN" })` },
  { label: 'Invoices for a PO', code: `db.invoices.find({ po_number: "PO-2026-XXXXX" })` },
  { label: 'GRNs at a plant', code: `db.grns.find({ plant: "Plant-Chennai-01" })` },
  { label: 'Count by collection', code: `db.getCollectionNames().forEach(c => print(c, db[c].countDocuments({})))` },
]

const PG_QUERIES = [
  { label: 'All Purchase Orders', code: `SELECT * FROM purchase_orders ORDER BY order_date DESC;` },
  { label: 'PO + line items', code: `SELECT po.*, li.*\nFROM purchase_orders po\nJOIN po_line_items li ON li.po_number = po.po_number\nWHERE po.po_number = 'PO-2026-XXXXX';` },
  { label: 'Invoice totals by vendor', code: `SELECT vendor_id, COUNT(*) AS invoices, SUM(total_amount) AS total\nFROM invoices\nGROUP BY vendor_id\nORDER BY total DESC;` },
  { label: 'End-to-end latency avg', code: `SELECT collection, ROUND(AVG(e2e_lat_ms)) AS avg_e2e_ms\nFROM cdc_metrics\nGROUP BY collection\nORDER BY avg_e2e_ms DESC;` },
  { label: 'Full P2P chain for a PO', code: `SELECT 'RFQ' AS doc, rfq_number AS id FROM rfqs WHERE rfq_number IN (SELECT rfq_number FROM purchase_orders WHERE po_number = 'PO-2026-XXXXX')\nUNION ALL\nSELECT 'PO', po_number FROM purchase_orders WHERE po_number = 'PO-2026-XXXXX'\nUNION ALL\nSELECT 'ASN', asn_number FROM asns WHERE po_number = 'PO-2026-XXXXX'\nUNION ALL\nSELECT 'GRN', grn_number FROM grns WHERE po_number = 'PO-2026-XXXXX'\nUNION ALL\nSELECT 'INV', invoice_number FROM invoices WHERE po_number = 'PO-2026-XXXXX';` },
]

const NEO4J_QUERIES = [
  { label: 'Full P2P chain from a PO', code: `MATCH path = (r:RFQ)-[:GENERATES]->(po:PurchaseOrder {po_number: 'PO-2026-XXXXX'})\n      -[:FULFILLED_BY*0..1]->(a:ASN)\n      -[:RECEIVED_BY*0..1]->(g:GRN)\n      -[:BILLED_BY*0..1]->(i:Invoice)\nRETURN path` },
  { label: 'All relationships for a doc', code: `MATCH (n {po_number: 'PO-2026-XXXXX'})-[r]-(m)\nRETURN n, r, m` },
  { label: 'Materials on a PO', code: `MATCH (po:PurchaseOrder {po_number: 'PO-2026-XXXXX'})-[:ORDERS]->(m:Material)\nRETURN m.material_code, m` },
  { label: 'Vendor invoice total', code: `MATCH (v:Vendor)<-[:ISSUED_TO]-(i:Invoice)\nRETURN v.vendor_id, COUNT(i) AS invoices, SUM(i.total_amount) AS total\nORDER BY total DESC` },
  { label: 'Node count by label', code: `MATCH (n)\nRETURN labels(n)[0] AS label, COUNT(n) AS count\nORDER BY count DESC` },
  { label: 'Shortest path between two docs', code: `MATCH p = shortestPath(\n  (a {rfq_number: 'RFQ-2026-XXXXX'})-[*]-(b {invoice_number: 'INV-2026-XXXXX'})\n)\nRETURN p` },
]

// ── Reusable copy button ──────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  )
}

// ── MongoDB tab ───────────────────────────────────────────────────────────────
function MongoTab() {
  const [data, setData]       = useState<MongoCollection[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [open, setOpen]       = useState<string | null>(null)

  useEffect(() => {
    fetchMongoSchema()
      .then(setData)
      .catch(e => setError(e.message ?? 'Failed'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-gray-500 text-sm">Loading…</p>
  if (error)   return <p className="text-red-400 text-sm">{error}</p>

  return (
    <div className="space-y-6">
      {/* Collections */}
      <div className="card">
        <h2 className="text-sm font-medium text-gray-400 mb-3">Collections</h2>
        <div className="space-y-2">
          {data!.map(col => (
            <div key={col.name} className="border border-gray-800 rounded-lg overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/50 transition-colors"
                onClick={() => setOpen(open === col.name ? null : col.name)}
              >
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-white font-mono text-sm">{col.name}</span>
                  <span className="text-xs text-gray-500">{col.fields.length} fields</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-blue-400 font-medium text-sm">{col.count.toLocaleString()} docs</span>
                  <span className="text-gray-600">{open === col.name ? '▲' : '▼'}</span>
                </div>
              </button>
              {open === col.name && (
                <div className="border-t border-gray-800 px-4 py-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 uppercase border-b border-gray-800">
                        <th className="py-1.5 text-left">Field</th>
                        <th className="py-1.5 text-left">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {col.fields.map(f => (
                        <tr key={f.name} className="border-b border-gray-800/40">
                          <td className="py-1.5 font-mono text-gray-300 text-xs">{f.name}</td>
                          <td className="py-1.5">
                            <span className="badge badge-gray text-xs">{f.type}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Sample queries */}
      <div className="card">
        <h2 className="text-sm font-medium text-gray-400 mb-3">Sample Queries (mongosh)</h2>
        <div className="space-y-3">
          {MONGO_QUERIES.map(q => (
            <div key={q.label} className="bg-gray-900 rounded-lg p-3 border border-gray-800">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-gray-400 font-medium">{q.label}</span>
                <CopyButton text={q.code} />
              </div>
              <pre className="text-xs text-green-300 font-mono whitespace-pre-wrap">{q.code}</pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── PostgreSQL tab ────────────────────────────────────────────────────────────
function PostgresTab() {
  const [data, setData]       = useState<PgTable[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [open, setOpen]       = useState<string | null>(null)

  useEffect(() => {
    fetchPostgresSchema()
      .then(setData)
      .catch(e => setError(e.message ?? 'Failed'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-gray-500 text-sm">Loading…</p>
  if (error)   return <p className="text-red-400 text-sm">{error}</p>

  return (
    <div className="space-y-6">
      {/* Tables */}
      <div className="card">
        <h2 className="text-sm font-medium text-gray-400 mb-3">Tables</h2>
        <div className="space-y-2">
          {data!.map(tbl => (
            <div key={tbl.name} className="border border-gray-800 rounded-lg overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/50 transition-colors"
                onClick={() => setOpen(open === tbl.name ? null : tbl.name)}
              >
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-sky-500" />
                  <span className="text-white font-mono text-sm">{tbl.name}</span>
                  <span className="text-xs text-gray-500">{tbl.columns.length} columns</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sky-400 font-medium text-sm">{tbl.row_count.toLocaleString()} rows</span>
                  <span className="text-gray-600">{open === tbl.name ? '▲' : '▼'}</span>
                </div>
              </button>
              {open === tbl.name && (
                <div className="border-t border-gray-800 px-4 py-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 uppercase border-b border-gray-800">
                        <th className="py-1.5 text-left">Column</th>
                        <th className="py-1.5 text-left">Type</th>
                        <th className="py-1.5 text-left">Constraints</th>
                        <th className="py-1.5 text-left">Foreign Key</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tbl.columns.map(c => (
                        <tr key={c.name} className="border-b border-gray-800/40">
                          <td className="py-1.5 font-mono text-gray-300 text-xs">{c.name}</td>
                          <td className="py-1.5 text-xs text-gray-400">{c.type}</td>
                          <td className="py-1.5">
                            <div className="flex gap-1 flex-wrap">
                              {c.primary_key && <span className="badge badge-yellow text-xs">PK</span>}
                              {!c.nullable   && !c.primary_key && <span className="badge badge-gray text-xs">NOT NULL</span>}
                              {c.foreign_key && <span className="badge badge-green text-xs">FK</span>}
                            </div>
                          </td>
                          <td className="py-1.5 font-mono text-xs text-purple-400">{c.foreign_key ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Sample queries */}
      <div className="card">
        <h2 className="text-sm font-medium text-gray-400 mb-3">Sample Queries (SQL)</h2>
        <div className="space-y-3">
          {PG_QUERIES.map(q => (
            <div key={q.label} className="bg-gray-900 rounded-lg p-3 border border-gray-800">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-gray-400 font-medium">{q.label}</span>
                <CopyButton text={q.code} />
              </div>
              <pre className="text-xs text-sky-300 font-mono whitespace-pre-wrap">{q.code}</pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Neo4j tab ─────────────────────────────────────────────────────────────────
const LABEL_COLORS: Record<string, string> = {
  RFQ: '#f59e0b', PurchaseOrder: '#3b82f6', ASN: '#8b5cf6',
  GRN: '#10b981', Invoice: '#ef4444', Vendor: '#06b6d4', Material: '#ec4899',
}

function Neo4jTab() {
  const [data, setData]       = useState<Neo4jSchema | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    fetchNeo4jSchema()
      .then(setData)
      .catch(e => setError(e.message ?? 'Failed'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-gray-500 text-sm">Loading…</p>
  if (error)   return <p className="text-red-400 text-sm">{error}</p>

  return (
    <div className="space-y-6">

      {/* Labels */}
      <div className="card">
        <h2 className="text-sm font-medium text-gray-400 mb-3">Node Labels</h2>
        <div className="space-y-3">
          {data!.labels.map(l => (
            <div key={l.label} className="border border-gray-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ background: LABEL_COLORS[l.label] ?? '#6b7280' }} />
                  <span className="text-white font-semibold text-sm">{l.label}</span>
                </div>
                <span className="text-pink-400 font-medium text-sm">{l.count.toLocaleString()} nodes</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {l.properties.map(p => (
                  <span key={p} className="font-mono text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-300">{p}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Relationships */}
      <div className="card">
        <h2 className="text-sm font-medium text-gray-400 mb-3">Relationship Types</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 uppercase border-b border-gray-800">
              <th className="py-2 text-left">Type</th>
              <th className="py-2 text-left">From</th>
              <th className="py-2 text-left">To</th>
              <th className="py-2 text-right">Count</th>
            </tr>
          </thead>
          <tbody>
            {data!.relationships.map(r => (
              <tr key={r.type} className="border-b border-gray-800/50">
                <td className="py-2 font-mono text-purple-400 text-xs">{r.type}</td>
                <td className="py-2 text-xs">
                  {r.from_label && (
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full" style={{ background: LABEL_COLORS[r.from_label] ?? '#6b7280' }} />
                      <span className="text-gray-300">{r.from_label}</span>
                    </span>
                  )}
                </td>
                <td className="py-2 text-xs">
                  {r.to_label && (
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full" style={{ background: LABEL_COLORS[r.to_label] ?? '#6b7280' }} />
                      <span className="text-gray-300">{r.to_label}</span>
                    </span>
                  )}
                </td>
                <td className="py-2 text-right text-purple-400 font-medium">{r.count.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Constraints */}
      {data!.constraints.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-medium text-gray-400 mb-3">Constraints</h2>
          <div className="space-y-1">
            {data!.constraints.map((c, i) => (
              <div key={i} className="flex items-center gap-3 text-xs py-1.5 border-b border-gray-800/40">
                <span className="badge badge-gray">{c.type}</span>
                <span className="text-gray-300 font-medium">{c.name}</span>
                <span className="text-gray-500">{c.entity.join(', ')} · {c.properties.join(', ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sample queries */}
      <div className="card">
        <h2 className="text-sm font-medium text-gray-400 mb-3">Sample Queries (Cypher)</h2>
        <div className="space-y-3">
          {NEO4J_QUERIES.map(q => (
            <div key={q.label} className="bg-gray-900 rounded-lg p-3 border border-gray-800">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-gray-400 font-medium">{q.label}</span>
                <CopyButton text={q.code} />
              </div>
              <pre className="text-xs text-pink-300 font-mono whitespace-pre-wrap">{q.code}</pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Schema() {
  const [tab, setTab] = useState<Tab>('mongodb')

  const TABS: { id: Tab; label: string; color: string }[] = [
    { id: 'mongodb',    label: 'MongoDB',    color: 'text-green-400' },
    { id: 'postgresql', label: 'PostgreSQL', color: 'text-sky-400'   },
    { id: 'neo4j',      label: 'Neo4j',      color: 'text-pink-400'  },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-white">Database Explorer</h1>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-800 pb-0">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-5 py-2.5 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? `border-blue-500 bg-gray-800/60 ${t.color}`
                : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-800/30'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'mongodb'    && <MongoTab />}
      {tab === 'postgresql' && <PostgresTab />}
      {tab === 'neo4j'      && <Neo4jTab />}
    </div>
  )
}
