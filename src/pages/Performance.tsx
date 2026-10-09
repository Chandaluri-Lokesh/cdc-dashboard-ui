import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from 'recharts'
import { fetchBenchmarks } from '../lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────
type BenchmarkData = {
  total_events:   number
  throughput_rps: number | null
  latency: {
    min_ms: number; avg_ms: number; p50_ms: number
    p95_ms: number; p99_ms: number; max_ms: number
  }
  stages: {
    debezium_p50_ms: number
    consumer_p50_ms: number
    write_p50_ms:    number
  }
  by_operation: { operation: string; count: number; avg_e2e_ms: number; avg_write_ms: number }[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDuration(seconds: number): string {
  if (seconds < 0.001) return '< 1 ms'
  if (seconds < 1)     return `${Math.round(seconds * 1000)} ms`
  if (seconds < 60)    return `${seconds.toFixed(1)} s`
  if (seconds < 3600)  return `${(seconds / 60).toFixed(1)} min`
  return `${(seconds / 3600).toFixed(1)} hr`
}

const OP_LABELS: Record<string, string> = { c: 'Insert', u: 'Update', d: 'Delete' }

// ── Scale projection table ────────────────────────────────────────────────────
const SCALES = [
  { label: '1 record',           count: 1 },
  { label: '500 records',        count: 500 },
  { label: '1,000 records',      count: 1_000 },
  { label: '10,000 records',     count: 10_000 },
  { label: '100,000 records',    count: 100_000 },
  { label: '500,000 records',    count: 500_000 },
  { label: '1,000,000 records',  count: 1_000_000 },
]

// ── Industry reference data ───────────────────────────────────────────────────
// Sources: Debezium docs, Confluent benchmarks, Kafka perf reports
const INDUSTRY_REFS = [
  {
    tier:        'Local / Dev',
    hw:          '4-core, 8 GB RAM (single node)',
    throughput:  '50 – 500 events/s',
    e2e_latency: '50 – 500 ms',
    note:        'Typical laptop or single-VM setup. Matches this POC environment.',
    color:       'text-yellow-400',
  },
  {
    tier:        'Small Production',
    hw:          '8-core, 32 GB RAM',
    throughput:  '5 K – 20 K events/s',
    e2e_latency: '10 – 50 ms',
    note:        'Single-broker Kafka + dedicated Postgres. Suitable for most mid-size teams.',
    color:       'text-blue-400',
  },
  {
    tier:        'Medium Production',
    hw:          '32-core, 128 GB RAM (3-node Kafka cluster)',
    throughput:  '20 K – 100 K events/s',
    e2e_latency: '5 – 20 ms',
    note:        'Multi-broker cluster with replication. Debezium documented throughput range.',
    color:       'text-green-400',
  },
  {
    tier:        'Large / Cloud',
    hw:          'Confluent Cloud / AWS MSK (auto-scaled)',
    throughput:  '100 K – 1 M+ events/s',
    e2e_latency: '1 – 5 ms',
    note:        'Confluent published benchmarks. LinkedIn Kafka handles ~7 trillion messages/day.',
    color:       'text-purple-400',
  },
]

// ── Stage breakdown chart ─────────────────────────────────────────────────────
function StageChart({ stages }: { stages: BenchmarkData['stages'] }) {
  const data = [
    { stage: 'Debezium\n(Mongo→Kafka)', ms: +stages.debezium_p50_ms.toFixed(1) },
    { stage: 'Consumer\n(Kafka→App)',   ms: +stages.consumer_p50_ms.toFixed(1) },
    { stage: 'Write\n(App→PG+Neo4j)',  ms: +stages.write_p50_ms.toFixed(1) },
  ]
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="stage" tick={{ fill: '#9ca3af', fontSize: 11 }} />
        <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} unit=" ms" />
        <Tooltip
          contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
          labelStyle={{ color: '#f3f4f6' }}
          formatter={(v: number) => [`${v} ms`, 'p50 latency']}
        />
        <Bar dataKey="ms" fill="#3b82f6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Latency radar ─────────────────────────────────────────────────────────────
function LatencyRadar({ latency }: { latency: BenchmarkData['latency'] }) {
  const data = [
    { metric: 'Min',  value: latency.min_ms },
    { metric: 'p50',  value: latency.p50_ms },
    { metric: 'Avg',  value: latency.avg_ms },
    { metric: 'p95',  value: latency.p95_ms },
    { metric: 'p99',  value: latency.p99_ms },
    { metric: 'Max',  value: latency.max_ms },
  ]
  return (
    <ResponsiveContainer width="100%" height={220}>
      <RadarChart data={data}>
        <PolarGrid stroke="#374151" />
        <PolarAngleAxis dataKey="metric" tick={{ fill: '#9ca3af', fontSize: 11 }} />
        <Radar dataKey="value" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} />
        <Tooltip
          contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
          formatter={(v: number) => [`${v.toFixed(1)} ms`, 'E2E latency']}
        />
      </RadarChart>
    </ResponsiveContainer>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = 'text-white' }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="card text-center space-y-1">
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Performance() {
  const [data, setData]       = useState<BenchmarkData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    fetchBenchmarks()
      .then(setData)
      .catch(e => setError(e.message ?? 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  const rps = data?.throughput_rps ?? null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Performance</h1>
        <span className="text-xs text-gray-500">
          Measured from <span className="text-white">{data?.total_events?.toLocaleString() ?? '—'}</span> CDC events recorded in this session
        </span>
      </div>

      {loading && <p className="text-gray-500 text-sm">Loading measurements…</p>}
      {error   && <p className="text-red-400 text-sm">{error}</p>}

      {data && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard
              label="Throughput"
              value={rps != null ? `${rps.toLocaleString()} /s` : '—'}
              sub="events per second"
              color="text-blue-400"
            />
            <StatCard
              label="Avg E2E Latency"
              value={`${data.latency.avg_ms.toFixed(0)} ms`}
              sub="MongoDB → Postgres+Neo4j"
              color="text-green-400"
            />
            <StatCard
              label="p95 Latency"
              value={`${data.latency.p95_ms.toFixed(0)} ms`}
              sub="95th percentile"
              color="text-yellow-400"
            />
            <StatCard
              label="p99 Latency"
              value={`${data.latency.p99_ms.toFixed(0)} ms`}
              sub="99th percentile"
              color="text-orange-400"
            />
          </div>

          {/* Charts row */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="card">
              <h2 className="text-sm font-medium text-gray-400 mb-3">Pipeline Stage Latency (p50)</h2>
              <StageChart stages={data.stages} />
              <p className="text-xs text-gray-500 mt-2 text-center">
                Debezium: {data.stages.debezium_p50_ms.toFixed(0)} ms &nbsp;·&nbsp;
                Consumer: {data.stages.consumer_p50_ms.toFixed(0)} ms &nbsp;·&nbsp;
                Write: {data.stages.write_p50_ms.toFixed(0)} ms
              </p>
            </div>
            <div className="card">
              <h2 className="text-sm font-medium text-gray-400 mb-3">E2E Latency Distribution</h2>
              <LatencyRadar latency={data.latency} />
            </div>
          </div>

          {/* By operation */}
          {data.by_operation.length > 0 && (
            <div className="card">
              <h2 className="text-sm font-medium text-gray-400 mb-3">Latency by Operation</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 uppercase border-b border-gray-800">
                      <th className="py-2 text-left">Operation</th>
                      <th className="py-2 text-right">Event Count</th>
                      <th className="py-2 text-right">Avg E2E (ms)</th>
                      <th className="py-2 text-right">Avg Write (ms)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_operation.map(r => (
                      <tr key={r.operation} className="border-b border-gray-800/50">
                        <td className="py-2">
                          <span className={`badge ${r.operation === 'c' ? 'badge-green' : r.operation === 'u' ? 'badge-yellow' : 'badge-red'}`}>
                            {OP_LABELS[r.operation] ?? r.operation}
                          </span>
                        </td>
                        <td className="py-2 text-right text-gray-300">{r.count.toLocaleString()}</td>
                        <td className="py-2 text-right text-blue-400">{Number(r.avg_e2e_ms).toFixed(1)}</td>
                        <td className="py-2 text-right text-purple-400">{Number(r.avg_write_ms).toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Scale projection */}
      <div className="card">
        <h2 className="text-sm font-medium text-gray-400 mb-1">Projected Ingestion Time at Scale</h2>
        <p className="text-xs text-gray-500 mb-4">
          Based on {rps != null ? `measured throughput of ${rps} events/s` : 'throughput — run more events to measure'}.
          {rps == null && ' Projections shown use conservative local estimates.'}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase border-b border-gray-800">
                <th className="py-2 text-left">Scale</th>
                <th className="py-2 text-right">Records</th>
                <th className="py-2 text-right">This System</th>
                <th className="py-2 text-right">Small Production<span className="normal-case font-normal text-gray-600"> (5,000/s)</span></th>
                <th className="py-2 text-right">Medium Production<span className="normal-case font-normal text-gray-600"> (50,000/s)</span></th>
                <th className="py-2 text-right">Cloud<span className="normal-case font-normal text-gray-600"> (500,000/s)</span></th>
              </tr>
            </thead>
            <tbody>
              {SCALES.map(s => {
                const ourRps  = rps ?? 200          // fallback: conservative local estimate
                const ourTime = s.count / ourRps
                return (
                  <tr key={s.label} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="py-2.5 font-medium text-white">{s.label}</td>
                    <td className="py-2.5 text-right text-gray-400 font-mono text-xs">{s.count.toLocaleString()}</td>
                    <td className="py-2.5 text-right">
                      <span className="text-yellow-400 font-medium">{fmtDuration(ourTime)}</span>
                      {!rps && <span className="text-gray-600 text-xs ml-1">(est.)</span>}
                    </td>
                    <td className="py-2.5 text-right text-blue-400">{fmtDuration(s.count / 5_000)}</td>
                    <td className="py-2.5 text-right text-green-400">{fmtDuration(s.count / 50_000)}</td>
                    <td className="py-2.5 text-right text-purple-400">{fmtDuration(s.count / 500_000)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-600 mt-3">
          * Ingestion time = records ÷ sustained throughput. Does not account for initial bulk-load optimisations (snapshot mode, parallel consumers, batch commits).
        </p>
      </div>

      {/* Industry reference */}
      <div className="card">
        <h2 className="text-sm font-medium text-gray-400 mb-1">Industry Reference — Debezium + Kafka CDC</h2>
        <p className="text-xs text-gray-500 mb-4">
          Published figures from Debezium documentation, Confluent benchmarks, and independent studies.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {INDUSTRY_REFS.map(r => (
            <div key={r.tier} className="border border-gray-800 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className={`text-sm font-semibold ${r.color}`}>{r.tier}</span>
              </div>
              <p className="text-xs text-gray-500">{r.hw}</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-gray-500">Throughput</p>
                  <p className="text-white font-medium">{r.throughput}</p>
                </div>
                <div>
                  <p className="text-gray-500">E2E Latency</p>
                  <p className="text-white font-medium">{r.e2e_latency}</p>
                </div>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">{r.note}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Latency breakdown reference */}
      <div className="card">
        <h2 className="text-sm font-medium text-gray-400 mb-3">E2E Latency Breakdown — This System</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase border-b border-gray-800">
                <th className="py-2 text-left">Metric</th>
                <th className="py-2 text-right">Min</th>
                <th className="py-2 text-right">p50</th>
                <th className="py-2 text-right">Avg</th>
                <th className="py-2 text-right">p95</th>
                <th className="py-2 text-right">p99</th>
                <th className="py-2 text-right">Max</th>
              </tr>
            </thead>
            <tbody>
              {data ? (
                <tr className="border-b border-gray-800/50">
                  <td className="py-2 text-gray-300 font-medium">E2E (ms)</td>
                  {[data.latency.min_ms, data.latency.p50_ms, data.latency.avg_ms,
                    data.latency.p95_ms, data.latency.p99_ms, data.latency.max_ms].map((v, i) => (
                    <td key={i} className="py-2 text-right text-blue-400 font-mono">{v.toFixed(0)}</td>
                  ))}
                </tr>
              ) : (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-gray-500 text-xs">No data recorded yet — run the simulator to populate metrics.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
