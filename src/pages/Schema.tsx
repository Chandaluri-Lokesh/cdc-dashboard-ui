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

// ── Application CRUD queries (actual queries used by the pipeline) ─────────────
const MONGO_CRUD = [
  {
    label: 'INSERT / UPSERT document',
    desc:  'Used by documents.py when a user submits a form. replace_one with upsert=True triggers a Debezium CDC event.',
    code:  `db["purchase_orders"].replace_one(\n  { "_id": doc["_id"] },\n  doc,\n  upsert=True\n)`,
  },
  {
    label: 'DELETE document',
    desc:  'Used by DELETE /api/documents/{doc_type}/{doc_id}. Triggers a CDC delete event → Kafka → consumer → Postgres cascade delete + Neo4j DETACH DELETE.',
    code:  `db["purchase_orders"].delete_one({ "_id": "PO-2026-XXXXX" })`,
  },
  {
    label: 'READ one document',
    desc:  'Used by schema.py to infer field types from a sample document.',
    code:  `db["purchase_orders"].find_one({})`,
  },
  {
    label: 'LIST documents (paginated)',
    desc:  'Used by GET /api/documents/{doc_type} to populate the document list panels in the UI.',
    code:  `db["purchase_orders"].find(\n  {},\n  { "po_number": 1, "status": 1, "updated_at": 1 }\n).sort("updated_at", -1).limit(100)`,
  },
  {
    label: 'COUNT documents',
    desc:  'Used by schema.py to show per-collection document counts.',
    code:  `db["purchase_orders"].count_documents({})`,
  },
]

const MONGO_QUERIES = [
  { label: 'All Purchase Orders', code: `db.purchase_orders.find({}).pretty()` },
  { label: 'Open POs', code: `db.purchase_orders.find({ status: "OPEN" })` },
  { label: 'Invoices for a PO', code: `db.invoices.find({ po_number: "PO-2026-XXXXX" })` },
  { label: 'GRNs at a plant', code: `db.grns.find({ plant: "Plant-Chennai-01" })` },
  { label: 'Count by collection', code: `db.getCollectionNames().forEach(c => print(c, db[c].countDocuments({})))` },
]

const PG_CRUD = [
  {
    label: 'UPSERT — INSERT … ON CONFLICT DO UPDATE',
    desc:  'Core write in pg_writer.upsert_table(). Used for every CDC insert/update event. Columns and conflict keys are driven by YAML mapping rules.',
    code:  `INSERT INTO purchase_orders (po_number, rfq_number, vendor_id, status, order_date, …)\nVALUES ($1, $2, $3, $4, $5, …)\nON CONFLICT (po_number)\nDO UPDATE SET\n  rfq_number = EXCLUDED.rfq_number,\n  vendor_id  = EXCLUDED.vendor_id,\n  status     = EXCLUDED.status,\n  order_date = EXCLUDED.order_date`,
  },
  {
    label: 'UPSERT — INSERT … ON CONFLICT DO NOTHING',
    desc:  'Used when all columns are part of the upsert key (e.g. junction/mapping tables with no updatable columns).',
    code:  `INSERT INTO po_line_items (po_number, line_no, material_code, quantity, unit_price, line_total)\nVALUES ($1, $2, $3, $4, $5, $6)\nON CONFLICT (po_number, line_no) DO NOTHING`,
  },
  {
    label: 'DELETE CASCADE',
    desc:  'Used by pg_writer.delete_cascade() on CDC delete events. Child rows (line items) are removed automatically by FK ON DELETE CASCADE constraints.',
    code:  `DELETE FROM purchase_orders\nWHERE "po_number" = $1\nRETURNING "po_number"`,
  },
  {
    label: 'INSERT pipeline metric',
    desc:  'Written by pg_writer.write_metric() for every processed CDC event to track per-stage latency.',
    code:  `INSERT INTO cdc_pipeline_metrics (\n  doc_id, collection, operation, doc_size_bytes,\n  mongo_ts_ms, kafka_ts_ms, consumer_recv_ms, pg_stored_ms,\n  debezium_lat_ms, consumer_lat_ms, write_lat_ms, e2e_lat_ms\n) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
  },
  {
    label: 'CREATE metrics table',
    desc:  'Run once at startup by pg_writer.ensure_metrics_table().',
    code:  `CREATE TABLE IF NOT EXISTS cdc_pipeline_metrics (\n  id               SERIAL PRIMARY KEY,\n  doc_id           TEXT,\n  collection       TEXT,\n  operation        TEXT,\n  doc_size_bytes   INT,\n  mongo_ts_ms      BIGINT,\n  kafka_ts_ms      BIGINT,\n  consumer_recv_ms BIGINT,\n  pg_stored_ms     BIGINT,\n  debezium_lat_ms  INT,\n  consumer_lat_ms  INT,\n  write_lat_ms     INT,\n  e2e_lat_ms       INT,\n  recorded_at      TIMESTAMPTZ DEFAULT now()\n)`,
  },
  {
    label: 'Latency summary (Dashboard)',
    desc:  'Used by GET /api/metrics/summary — powers the stat cards on the Dashboard page.',
    code:  `SELECT\n  COUNT(*)                           AS total_events,\n  AVG(e2e_lat_ms)::NUMERIC(10,1)     AS avg_e2e_ms,\n  PERCENTILE_CONT(0.95) WITHIN GROUP\n    (ORDER BY e2e_lat_ms)            AS p95_e2e_ms,\n  MAX(e2e_lat_ms)                    AS max_e2e_ms,\n  AVG(debezium_lat_ms)::NUMERIC(10,1) AS avg_debezium_ms,\n  AVG(write_lat_ms)::NUMERIC(10,1)   AS avg_write_ms,\n  COUNT(*) FILTER (WHERE operation = 'c') AS inserts,\n  COUNT(*) FILTER (WHERE operation = 'u') AS updates,\n  COUNT(*) FILTER (WHERE operation = 'd') AS deletes\nFROM cdc_pipeline_metrics\nWHERE recorded_at > now() - INTERVAL '10 minutes'`,
  },
  {
    label: 'WebSocket live feed poll',
    desc:  'Polled every 2 s by the WebSocket endpoint to push new metric rows to the Dashboard live feed.',
    code:  `SELECT id, doc_id, collection, operation, e2e_lat_ms,\n       debezium_lat_ms, consumer_lat_ms, write_lat_ms, recorded_at\nFROM cdc_pipeline_metrics\nWHERE id > $1\nORDER BY id ASC\nLIMIT 50`,
  },
  {
    label: 'Events by collection (last 1 hr)',
    desc:  'Used by GET /api/metrics/collections — powers the bar chart on the Dashboard.',
    code:  `SELECT collection,\n       COUNT(*) AS events,\n       AVG(e2e_lat_ms)::NUMERIC(10,1) AS avg_e2e_ms\nFROM cdc_pipeline_metrics\nWHERE recorded_at > now() - INTERVAL '1 hour'\nGROUP BY collection\nORDER BY events DESC`,
  },
]

const PG_QUERIES = [
  { label: 'All Purchase Orders', code: `SELECT * FROM purchase_orders ORDER BY order_date DESC;` },
  { label: 'PO + line items', code: `SELECT po.*, li.*\nFROM purchase_orders po\nJOIN po_line_items li ON li.po_number = po.po_number\nWHERE po.po_number = 'PO-2026-XXXXX';` },
  { label: 'Invoice totals by vendor', code: `SELECT vendor_id, COUNT(*) AS invoices, SUM(total_amount) AS total\nFROM invoices\nGROUP BY vendor_id\nORDER BY total DESC;` },
  { label: 'Full P2P chain for a PO', code: `SELECT 'RFQ' AS doc, rfq_number AS id FROM rfqs WHERE rfq_number IN (SELECT rfq_number FROM purchase_orders WHERE po_number = 'PO-2026-XXXXX')\nUNION ALL SELECT 'PO', po_number FROM purchase_orders WHERE po_number = 'PO-2026-XXXXX'\nUNION ALL SELECT 'ASN', asn_number FROM asns WHERE po_number = 'PO-2026-XXXXX'\nUNION ALL SELECT 'GRN', grn_number FROM grns WHERE po_number = 'PO-2026-XXXXX'\nUNION ALL SELECT 'INV', invoice_number FROM invoices WHERE po_number = 'PO-2026-XXXXX';` },
]

const NEO4J_CRUD = [
  {
    label: 'MERGE node (upsert)',
    desc:  'Used for every CDC insert/update. Creates or updates a node. Driven by merge_cypher in each YAML mapping file.',
    code:  `MERGE (p:PurchaseOrder {po_number: $po_number})\nSET p.vendor_id     = $vendor_id,\n    p.status        = $status,\n    p.order_date    = $order_date,\n    p.delivery_date = $delivery_date,\n    p.currency      = $currency`,
  },
  {
    label: 'MERGE relationship',
    desc:  'Creates a relationship between two nodes. Uses MERGE on the target node to handle out-of-order inserts (stub nodes are enriched when the actual document arrives).',
    code:  `MATCH (p:PurchaseOrder {po_number: $po_number})\nMERGE (r:RFQ {rfq_number: $rfq_number})\nMERGE (p)-[:ISSUED_AGAINST]->(r)`,
  },
  {
    label: 'MERGE relationship with properties',
    desc:  'Used for array line-item relationships (e.g. PO → Material). Sets quantity and price on the relationship itself.',
    code:  `MATCH (p:PurchaseOrder {po_number: $po_number})\nMERGE (m:Material {material_code: $material_code})\nMERGE (p)-[r:ORDERS]->(m)\nSET r.quantity   = $quantity,\n    r.unit_price = $unit_price,\n    r.line_total = $line_total`,
  },
  {
    label: 'DETACH DELETE node',
    desc:  'Used on CDC delete events. Removes the node and all its relationships.',
    code:  `MATCH (p:PurchaseOrder {po_number: $po_number})\nDETACH DELETE p`,
  },
  {
    label: 'CREATE CONSTRAINT (startup)',
    desc:  'Run once at consumer startup via neo4j_writer.apply_constraints(). Ensures uniqueness on all P2P node key fields.',
    code:  `CREATE CONSTRAINT rfq_unique      IF NOT EXISTS FOR (r:RFQ)           REQUIRE r.rfq_number      IS UNIQUE;\nCREATE CONSTRAINT po_unique       IF NOT EXISTS FOR (p:PurchaseOrder)  REQUIRE p.po_number       IS UNIQUE;\nCREATE CONSTRAINT asn_unique      IF NOT EXISTS FOR (a:ASN)            REQUIRE a.asn_number      IS UNIQUE;\nCREATE CONSTRAINT grn_unique      IF NOT EXISTS FOR (g:GRN)            REQUIRE g.grn_number      IS UNIQUE;\nCREATE CONSTRAINT invoice_unique  IF NOT EXISTS FOR (i:Invoice)        REQUIRE i.invoice_number  IS UNIQUE;\nCREATE CONSTRAINT vendor_unique   IF NOT EXISTS FOR (v:Vendor)         REQUIRE v.vendor_id       IS UNIQUE;\nCREATE CONSTRAINT material_unique IF NOT EXISTS FOR (m:Material)       REQUIRE m.material_code   IS UNIQUE;`,
  },
  {
    label: 'Graph overview — node counts',
    desc:  'Used by GET /api/graph/stats/overview to power the Graph page stat panel.',
    code:  `CALL () {\n  MATCH (n) RETURN labels(n)[0] AS label, COUNT(*) AS count\n}\nRETURN label, count\nORDER BY count DESC`,
  },
  {
    label: 'Subgraph traversal',
    desc:  'Used by GET /api/graph/{collection}/{doc_id}?depth=N to render the force-directed graph.',
    code:  `MATCH path = (start {po_number: $doc_id})-[*1..2]-()\nRETURN path`,
  },
]

const NEO4J_QUERIES = [
  { label: 'All relationships for a doc', code: `MATCH (n {po_number: 'PO-2026-XXXXX'})-[r]-(m)\nRETURN n, r, m` },
  { label: 'Materials on a PO', code: `MATCH (po:PurchaseOrder {po_number: 'PO-2026-XXXXX'})-[:ORDERS]->(m:Material)\nRETURN m.material_code, m` },
  { label: 'Vendor invoice total', code: `MATCH (i:Invoice)-[:BILLS]->(po:PurchaseOrder)\nRETURN po.vendor_id, COUNT(i) AS invoices, SUM(i.total_amount) AS total\nORDER BY total DESC` },
  { label: 'Node count by label', code: `MATCH (n)\nRETURN labels(n)[0] AS label, COUNT(n) AS count\nORDER BY count DESC` },
  { label: 'Shortest path between two docs', code: `MATCH p = shortestPath(\n  (a {rfq_number: 'RFQ-2026-XXXXX'})-[*]-(b {invoice_number: 'INV-2026-XXXXX'})\n)\nRETURN p` },
]

// ── Reusable components ───────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className="text-xs text-gray-500 hover:text-gray-300 transition-colors shrink-0"
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  )
}

type QueryEntry = { label: string; code: string; desc?: string }

function QueryBlock({ q, color }: { q: QueryEntry; color: string }) {
  return (
    <div className="bg-gray-900 rounded-lg p-3 border border-gray-800">
      <div className="flex items-start justify-between gap-3 mb-1">
        <span className="text-xs text-gray-300 font-medium">{q.label}</span>
        <CopyButton text={q.code} />
      </div>
      {q.desc && <p className="text-xs text-gray-500 mb-2 leading-relaxed">{q.desc}</p>}
      <pre className={`text-xs font-mono whitespace-pre-wrap ${color}`}>{q.code}</pre>
    </div>
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

      {/* Application CRUD */}
      <div className="card">
        <h2 className="text-sm font-medium text-gray-400 mb-3">Application CRUD Operations</h2>
        <div className="space-y-3">
          {MONGO_CRUD.map(q => <QueryBlock key={q.label} q={q} color="text-green-300" />)}
        </div>
      </div>

      {/* Exploration queries */}
      <div className="card">
        <h2 className="text-sm font-medium text-gray-400 mb-3">Exploration Queries (mongosh)</h2>
        <div className="space-y-3">
          {MONGO_QUERIES.map(q => <QueryBlock key={q.label} q={q} color="text-green-300" />)}
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

      {/* Application CRUD */}
      <div className="card">
        <h2 className="text-sm font-medium text-gray-400 mb-3">Application CRUD Operations</h2>
        <div className="space-y-3">
          {PG_CRUD.map(q => <QueryBlock key={q.label} q={q} color="text-sky-300" />)}
        </div>
      </div>

      {/* Exploration queries */}
      <div className="card">
        <h2 className="text-sm font-medium text-gray-400 mb-3">Exploration Queries (SQL)</h2>
        <div className="space-y-3">
          {PG_QUERIES.map(q => <QueryBlock key={q.label} q={q} color="text-sky-300" />)}
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

      {/* Application CRUD */}
      <div className="card">
        <h2 className="text-sm font-medium text-gray-400 mb-3">Application CRUD Operations</h2>
        <div className="space-y-3">
          {NEO4J_CRUD.map(q => <QueryBlock key={q.label} q={q} color="text-pink-300" />)}
        </div>
      </div>

      {/* Exploration queries */}
      <div className="card">
        <h2 className="text-sm font-medium text-gray-400 mb-3">Exploration Queries (Cypher)</h2>
        <div className="space-y-3">
          {NEO4J_QUERIES.map(q => <QueryBlock key={q.label} q={q} color="text-pink-300" />)}
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
