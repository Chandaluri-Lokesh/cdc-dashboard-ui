import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import ForceGraph2D from 'react-force-graph-2d'
import { fetchSubgraph, fetchGraphOverview, fetchDocumentList } from '../lib/api'

type GraphData = {
  nodes: { id: string; label: string; properties: Record<string, unknown> }[]
  links: { source: string; target: string; type: string }[]
}

type Overview = {
  node_counts: { label: string; count: number }[]
  relationship_counts: { type: string; count: number }[]
}

const COLLECTION_MAP: Record<string, string> = {
  rfqs: 'rfqs', purchase_orders: 'purchase_orders',
  asns: 'asns', grns: 'grns', invoices: 'invoices',
}

const LABEL_COLORS: Record<string, string> = {
  RFQ:           '#f59e0b',
  PurchaseOrder: '#3b82f6',
  ASN:           '#8b5cf6',
  GRN:           '#10b981',
  Invoice:       '#ef4444',
  Vendor:        '#06b6d4',
  Material:      '#ec4899',
}

export default function Graph() {
  const location = useLocation()
  const navState = location.state as { collection?: string; docId?: string } | null

  const [collection, setCollection] = useState(navState?.collection ?? 'purchase_orders')
  const [docId, setDocId]           = useState(navState?.docId ?? '')
  const [depth, setDepth]           = useState(2)
  const [graphData, setGraphData]   = useState<GraphData | null>(null)
  const [overview, setOverview]     = useState<Overview | null>(null)
  const [selected, setSelected]     = useState<GraphData['nodes'][0] | null>(null)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const containerRef                = useRef<HTMLDivElement>(null)

  type DocRow = { id: string; key: string; status: string | null }
  const [docList, setDocList]       = useState<DocRow[]>([])
  const [listLoading, setListLoading] = useState(false)

  // Collection name → doc_type param mapping
  const COLL_TO_TYPE: Record<string, string> = {
    rfqs: 'rfq', purchase_orders: 'po', asns: 'asn', grns: 'grn', invoices: 'invoice',
  }

  const loadDocList = (col: string) => {
    const docType = COLL_TO_TYPE[col]
    if (!docType) return
    setListLoading(true)
    fetchDocumentList(docType)
      .then(setDocList)
      .catch(() => setDocList([]))
      .finally(() => setListLoading(false))
  }

  useEffect(() => { loadDocList(collection) }, [collection])

  useEffect(() => {
    fetchGraphOverview().then(setOverview).catch(() => {})
  }, [])

  // Auto-search when navigated from the live feed with a doc pre-selected
  useEffect(() => {
    if (navState?.docId) {
      handleSearch(navState.collection ?? 'purchase_orders', navState.docId, depth)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = async (col = collection, id = docId, hops = depth) => {
    if (!id.trim()) return
    setLoading(true)
    setError(null)
    setSelected(null)
    try {
      const data = await fetchSubgraph(col, id.trim(), hops)
      setGraphData(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Graph unavailable')
      setGraphData(null)
    } finally {
      setLoading(false)
    }
  }

  const handleNodeClick = useCallback((node: unknown) => {
    setSelected(node as GraphData['nodes'][0])
  }, [])

  const nodeColor = (node: { label?: string }) =>
    LABEL_COLORS[node.label ?? ''] ?? '#6b7280'

  const width  = containerRef.current?.clientWidth  ?? 700
  const height = 460

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-white">Neo4j Graph</h1>

      {/* Overview stats */}
      {overview && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="card">
            <h2 className="text-sm text-gray-400 mb-2">Node counts</h2>
            <div className="space-y-1">
              {overview.node_counts.map(n => (
                <div key={n.label} className="flex justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block"
                      style={{ background: LABEL_COLORS[n.label] ?? '#6b7280' }}
                    />
                    <span className="text-gray-300">{n.label}</span>
                  </span>
                  <span className="text-blue-400 font-medium">{n.count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <h2 className="text-sm text-gray-400 mb-2">Relationship counts</h2>
            <div className="space-y-1">
              {overview.relationship_counts.map(r => (
                <div key={r.type} className="flex justify-between text-sm">
                  <span className="text-gray-300 font-mono text-xs">{r.type}</span>
                  <span className="text-purple-400 font-medium">{r.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Search controls */}
      <div className="card">
        <h2 className="text-sm text-gray-400 mb-3">Explore Subgraph</h2>
        <div className="flex gap-3 flex-wrap">
          <select
            className="input-field w-48"
            value={collection}
            onChange={e => setCollection(e.target.value)}
          >
            {Object.keys(COLLECTION_MAP).map(c => (
              <option key={c} value={c}>{c.replace('_', ' ')}</option>
            ))}
          </select>
          <input
            className="input-field flex-1 min-w-[180px]"
            placeholder="Document ID e.g. PO-2026-05512"
            value={docId}
            onChange={e => setDocId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          {/* Hop selector */}
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4].map(h => (
              <button
                key={h}
                onClick={() => setDepth(h)}
                className={`w-9 h-9 rounded text-sm font-medium transition-colors ${
                  depth === h
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                }`}
                title={`${h} hop${h > 1 ? 's' : ''}`}
              >
                {h}
              </button>
            ))}
            <span className="text-xs text-gray-500 ml-1">hops</span>
          </div>
          <button className="btn-primary" onClick={() => handleSearch()} disabled={loading}>
            {loading ? 'Loading…' : 'Explore'}
          </button>
        </div>
        {error && <p className="text-red-400 text-sm mt-2">{error}</p>}

        {/* Doc list — full width below controls */}
        <div className="mt-4 pt-4 border-t border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              {collection.replace(/_/g, ' ')} — click to explore
            </h3>
            <button className="text-xs text-gray-500 hover:text-gray-300" onClick={() => loadDocList(collection)}>↻ Refresh</button>
          </div>
          {listLoading ? (
            <p className="text-xs text-gray-500">Loading…</p>
          ) : docList.length === 0 ? (
            <p className="text-xs text-gray-500">No documents found.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1.5 max-h-48 overflow-y-auto">
              {docList.map(d => (
                <button
                  key={d.id}
                  className="text-left px-2.5 py-2 rounded-lg bg-gray-800/60 hover:bg-gray-700 group flex flex-col gap-0.5 transition-colors"
                  onClick={() => { setDocId(d.key); handleSearch(collection, d.key, depth) }}
                  title={`Explore ${d.key}`}
                >
                  <span className="font-mono text-xs text-blue-400 group-hover:text-blue-300 truncate block">{d.key}</span>
                  {d.status && <span className="text-xs text-gray-500 truncate block">{d.status.replace(/_/g, ' ')}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Graph canvas + node inspector */}
      {graphData && (
        <div className="grid md:grid-cols-3 gap-4">
          <div className="md:col-span-2 card p-0 overflow-hidden rounded-xl" ref={containerRef}>
            {graphData.nodes.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-gray-500">
                No nodes found for this document ID.
              </div>
            ) : (
              <ForceGraph2D
                width={width}
                height={height}
                graphData={graphData}
                nodeLabel={(n: object) => (n as { id?: string }).id ?? ''}
                nodeColor={(n: object) => nodeColor(n as { label?: string })}
                nodeRelSize={6}
                linkLabel={(l: object) => (l as { type?: string }).type ?? ''}
                linkDirectionalArrowLength={5}
                linkDirectionalArrowRelPos={1}
                linkColor={() => '#4b5563'}
                onNodeClick={handleNodeClick}
                backgroundColor="#111827"
              />
            )}
          </div>

          <div className="card">
            <h2 className="text-sm text-gray-400 mb-3">
              {selected ? 'Node Properties' : 'Click a node to inspect'}
            </h2>
            {selected ? (
              <div className="space-y-2 text-sm">
                <div>
                  <span
                    className="badge text-xs"
                    style={{ background: nodeColor(selected) + '33', color: nodeColor(selected) }}
                  >
                    {selected.label}
                  </span>
                </div>
                {Object.entries(selected.properties || {}).map(([k, v]) => (
                  <div key={k}>
                    <span className="text-gray-500 text-xs">{k}</span>
                    <p className="text-gray-200 font-mono text-xs break-all">
                      {v === null ? 'null' : String(v)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">Select a node in the graph.</p>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="card">
        <h2 className="text-sm text-gray-400 mb-2">Node Legend</h2>
        <div className="flex flex-wrap gap-3">
          {Object.entries(LABEL_COLORS).map(([label, color]) => (
            <span key={label} className="flex items-center gap-1.5 text-sm text-gray-300">
              <span className="w-3 h-3 rounded-full" style={{ background: color }} />
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
