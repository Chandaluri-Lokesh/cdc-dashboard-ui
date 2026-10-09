import axios from 'axios'

const api = axios.create({ baseURL: 'http://127.0.0.1:8000/api' })

// ── Metrics ──────────────────────────────────────────────────────────────────
export const fetchMetricsSummary = () =>
  api.get('/metrics/summary').then(r => r.data)

export const fetchMetricsRecent = (limit = 50) =>
  api.get('/metrics/recent', { params: { limit } }).then(r => r.data)

export const fetchEventsByCollection = () =>
  api.get('/metrics/collections').then(r => r.data)

// ── Pipeline ─────────────────────────────────────────────────────────────────
export const fetchPipelineStatus = () =>
  api.get('/pipeline/status').then(r => r.data)

// ── Graph ────────────────────────────────────────────────────────────────────
export const fetchSubgraph = (collection: string, docId: string, depth = 2) =>
  api.get(`/graph/${collection}/${encodeURIComponent(docId)}`, { params: { depth } }).then(r => r.data)

export const fetchGraphOverview = () =>
  api.get('/graph/stats/overview').then(r => r.data)

// ── Documents ────────────────────────────────────────────────────────────────
export const insertDocument = (docType: string, fields: Record<string, unknown>) =>
  api.post(`/documents/${docType}`, { fields }).then(r => r.data)

export const deleteDocument = (docType: string, docId: string) =>
  api.delete(`/documents/${docType}/${encodeURIComponent(docId)}`).then(r => r.data)

export const fetchDocumentList = (docType: string) =>
  api.get(`/documents/${docType}`).then(r => r.data as { id: string; key: string; status: string | null; updated_at: string | null }[])

// ── Simulator ────────────────────────────────────────────────────────────────
export const simulateChain = () =>
  api.post('/simulate/chain').then(r => r.data)

export const simulateUpdate = () =>
  api.post('/simulate/update').then(r => r.data)

export const fetchSimulatorStatus = () =>
  api.get('/simulate/status').then(r => r.data as { running: boolean })

// ── Schema ────────────────────────────────────────────────────────────────────
export const fetchMongoSchema     = () => api.get('/schema/mongodb').then(r => r.data)
export const fetchPostgresSchema  = () => api.get('/schema/postgresql').then(r => r.data)
export const fetchNeo4jSchema     = () => api.get('/schema/neo4j').then(r => r.data)

export const startSimulator = () =>
  api.post('/simulate/start').then(r => r.data)

export const stopSimulator = () =>
  api.post('/simulate/stop').then(r => r.data)
