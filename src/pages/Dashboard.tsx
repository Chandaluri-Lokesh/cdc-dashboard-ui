import { useEffect, useRef, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts'
import {
  fetchMetricsSummary, fetchEventsByCollection,
  fetchSimulatorStatus, startSimulator, stopSimulator,
} from '../lib/api'
import { connectMetricsWs, MetricRow } from '../lib/ws'

type Summary = {
  latency: Record<string, number | null>
  table_counts: Record<string, number>
}

type CollectionStat = { collection: string; events: number; avg_e2e_ms: number }

function MetricCard({ label, value, unit = '' }: { label: string; value: string | number | null; unit?: string }) {
  return (
    <div className="card flex flex-col gap-1">
      <span className="text-xs text-gray-400 uppercase tracking-widest">{label}</span>
      <span className="text-2xl font-bold text-white">
        {value ?? '—'}{value !== null && unit ? <span className="text-sm text-gray-400 ml-1">{unit}</span> : null}
      </span>
    </div>
  )
}

export default function Dashboard() {
  const [summary, setSummary]         = useState<Summary | null>(null)
  const [colStats, setColStats]       = useState<CollectionStat[]>([])
  const [liveRows, setLiveRows]       = useState<MetricRow[]>([])
  const [chartData, setChartData]     = useState<{ t: string; e2e: number }[]>([])
  const [simRunning, setSimRunning]   = useState(false)
  const [simBusy, setSimBusy]         = useState(false)
  const disconnect = useRef<(() => void) | null>(null)

  // Poll summary every 5 s
  useEffect(() => {
    const load = () =>
      fetchMetricsSummary()
        .then(setSummary)
        .catch(() => {})
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [])

  // Poll collection stats every 10 s
  useEffect(() => {
    const load = () =>
      fetchEventsByCollection()
        .then(setColStats)
        .catch(() => {})
    load()
    const id = setInterval(load, 10000)
    return () => clearInterval(id)
  }, [])

  // Poll simulator status every 3 s
  useEffect(() => {
    const load = () =>
      fetchSimulatorStatus()
        .then(d => setSimRunning(d.running))
        .catch(() => {})
    load()
    const id = setInterval(load, 3000)
    return () => clearInterval(id)
  }, [])

  // WebSocket for live metrics
  useEffect(() => {
    disconnect.current = connectMetricsWs((rows, isInit) => {
      setLiveRows(prev => {
        const next = isInit ? rows : [...prev, ...rows].slice(-100)
        return next
      })
      setChartData(prev => {
        const pts = rows.map(r => ({
          t:   new Date(r.recorded_at).toLocaleTimeString(),
          e2e: r.e2e_lat_ms,
        }))
        return [...prev, ...pts].slice(-60)
      })
    })
    return () => disconnect.current?.()
  }, [])

  const handleSimToggle = async () => {
    setSimBusy(true)
    try {
      if (simRunning) {
        await stopSimulator()
        setSimRunning(false)
      } else {
        await startSimulator()
        setSimRunning(true)
      }
    } catch {
      // status poll will correct the state on next tick
    } finally {
      setSimBusy(false)
    }
  }

  const lat = summary?.latency ?? {}
  const counts = summary?.table_counts ?? {}

  return (
    <div className="space-y-6">
      {/* Header + simulator control */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Live Dashboard</h1>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-sm">
            <span className={`inline-block w-2 h-2 rounded-full ${simRunning ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`} />
            <span className={simRunning ? 'text-green-400' : 'text-gray-500'}>
              {simRunning ? 'Simulation running' : 'Simulation stopped'}
            </span>
          </span>
          <button
            onClick={handleSimToggle}
            disabled={simBusy}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors disabled:opacity-50 ${
              simRunning
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {simBusy ? '…' : simRunning ? 'Stop Simulation' : 'Start Simulation'}
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Total Events (10 min)"  value={lat.total_events ?? null} />
        <MetricCard label="Avg E2E Latency"        value={lat.avg_e2e_ms  ?? null} unit="ms" />
        <MetricCard label="P95 E2E Latency"        value={lat.p95_e2e_ms  ?? null} unit="ms" />
        <MetricCard label="Max E2E Latency"        value={lat.max_e2e_ms  ?? null} unit="ms" />
        <MetricCard label="Inserts"  value={lat.inserts  ?? null} />
        <MetricCard label="Updates"  value={lat.updates  ?? null} />
        <MetricCard label="Deletes"  value={lat.deletes  ?? null} />
        <MetricCard label="Avg Debezium Lat" value={lat.avg_debezium_ms ?? null} unit="ms" />
      </div>

      {/* Latency chart */}
      <div className="card">
        <h2 className="text-sm font-medium text-gray-400 mb-3">E2E Latency (live)</h2>
        {chartData.length === 0 ? (
          <p className="text-gray-500 text-sm">Waiting for events…</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid stroke="#374151" strokeDasharray="3 3" />
              <XAxis dataKey="t" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} unit="ms" />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151' }}
                labelStyle={{ color: '#e5e7eb' }}
              />
              <Line type="monotone" dataKey="e2e" stroke="#3b82f6" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Two columns: table counts + collection stats */}
      <div className="grid md:grid-cols-2 gap-4">

        {/* Table row counts */}
        <div className="card">
          <h2 className="text-sm font-medium text-gray-400 mb-3">Postgres Table Counts</h2>
          <div className="space-y-1">
            {Object.entries(counts).map(([table, count]) => (
              <div key={table} className="flex justify-between text-sm">
                <span className="text-gray-300 font-mono">{table}</span>
                <span className="text-blue-400 font-bold">{count < 0 ? 'N/A' : count.toLocaleString()}</span>
              </div>
            ))}
            {Object.keys(counts).length === 0 && (
              <p className="text-gray-500 text-sm">Loading…</p>
            )}
          </div>
        </div>

        {/* Collection event stats */}
        <div className="card">
          <h2 className="text-sm font-medium text-gray-400 mb-3">Events by Collection (1 h)</h2>
          <div className="space-y-1">
            {colStats.map(s => (
              <div key={s.collection} className="flex justify-between text-sm">
                <span className="text-gray-300 font-mono">{s.collection}</span>
                <span className="text-gray-400">
                  <span className="text-white font-medium mr-3">{s.events.toLocaleString()}</span>
                  <span className="text-gray-500">{s.avg_e2e_ms} ms avg</span>
                </span>
              </div>
            ))}
            {colStats.length === 0 && <p className="text-gray-500 text-sm">No events yet.</p>}
          </div>
        </div>
      </div>

      {/* Live event feed */}
      <div className="card">
        <h2 className="text-sm font-medium text-gray-400 mb-3">Live CDC Event Feed</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs uppercase border-b border-gray-800">
                <th className="py-2 text-left pr-4">Time</th>
                <th className="py-2 text-left pr-4">Collection</th>
                <th className="py-2 text-left pr-4">Op</th>
                <th className="py-2 text-left pr-4">Doc ID</th>
                <th className="py-2 text-right pr-4 whitespace-nowrap" title="MongoDB → Kafka">Debezium</th>
                <th className="py-2 text-right pr-4 whitespace-nowrap" title="Kafka → Consumer">Kafka</th>
                <th className="py-2 text-right pr-4 whitespace-nowrap" title="Consumer → DB write">Write</th>
                <th className="py-2 text-right whitespace-nowrap" title="MongoDB → DB total">E2E</th>
              </tr>
            </thead>
            <tbody>
              {[...liveRows].reverse().slice(0, 25).map(row => (
                <tr key={row.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="py-1.5 text-gray-500 font-mono text-xs pr-4 whitespace-nowrap">
                    {new Date(row.recorded_at).toLocaleTimeString()}
                  </td>
                  <td className="py-1.5 text-gray-300 pr-4">{row.collection}</td>
                  <td className="py-1.5 pr-4">
                    <OpBadge op={row.operation} />
                  </td>
                  <td className="py-1.5 text-gray-400 font-mono text-xs pr-4 max-w-[180px] truncate">
                    {row.doc_id}
                  </td>
                  <td className="py-1.5 text-right pr-4 text-gray-400 font-mono text-xs">
                    {row.debezium_lat_ms} ms
                  </td>
                  <td className="py-1.5 text-right pr-4 text-gray-400 font-mono text-xs">
                    {row.consumer_lat_ms} ms
                  </td>
                  <td className="py-1.5 text-right pr-4 text-gray-400 font-mono text-xs">
                    {row.write_lat_ms} ms
                  </td>
                  <td className="py-1.5 text-right font-mono text-xs font-medium">
                    <span className={
                      row.e2e_lat_ms < 500  ? 'text-green-400' :
                      row.e2e_lat_ms < 2000 ? 'text-yellow-400' : 'text-red-400'
                    }>
                      {row.e2e_lat_ms} ms
                    </span>
                  </td>
                </tr>
              ))}
              {liveRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-4 text-center text-gray-500">
                    Waiting for events via WebSocket…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-gray-600">
          Debezium = MongoDB→Kafka &nbsp;·&nbsp; Kafka = Kafka→Consumer &nbsp;·&nbsp; Write = Consumer→DB &nbsp;·&nbsp; E2E = total
        </p>
      </div>
    </div>
  )
}

function OpBadge({ op }: { op: string }) {
  const cls =
    op === 'c' ? 'badge badge-green'  :
    op === 'u' ? 'badge badge-blue'   :
    op === 'd' ? 'badge badge-red'    :
    op === 'r' ? 'badge badge-gray'   : 'badge badge-yellow'
  const label = op === 'c' ? 'INSERT' : op === 'u' ? 'UPDATE' : op === 'd' ? 'DELETE' : op.toUpperCase()
  return <span className={cls}>{label}</span>
}
