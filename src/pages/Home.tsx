import { useNavigate } from 'react-router-dom'

const STEPS = [
  {
    num: '01',
    title: 'Source — MongoDB',
    desc: 'P2P documents (RFQs, Purchase Orders, ASNs, GRNs, Invoices) are written to a MongoDB replica set as the system of record.',
    color: 'text-blue-400',
    border: 'border-blue-900',
  },
  {
    num: '02',
    title: 'Capture — Debezium',
    desc: 'Debezium MongoDB connector streams every insert, update, and delete as a structured CDC event onto dedicated Kafka topics — without any changes to the source application.',
    color: 'text-purple-400',
    border: 'border-purple-900',
  },
  {
    num: '03',
    title: 'Stream — Apache Kafka',
    desc: 'Five topics (rfqs, purchase_orders, asns, grns, invoices) carry the event stream. Kafka buffers and replays events durably, decoupling producers from consumers.',
    color: 'text-yellow-400',
    border: 'border-yellow-900',
  },
  {
    num: '04',
    title: 'Consume & Transform — Python Consumer',
    desc: 'A Python consumer parses Debezium envelopes, validates schema, routes each event through YAML-driven mapping rules, and writes to both target stores in a single pipeline pass.',
    color: 'text-orange-400',
    border: 'border-orange-900',
  },
  {
    num: '05',
    title: 'Relational Store — PostgreSQL',
    desc: 'Normalised tables (parent + child line-item tables) receive upserts and cascading deletes. Ideal for analytics queries, aggregations, and reporting.',
    color: 'text-green-400',
    border: 'border-green-900',
  },
  {
    num: '06',
    title: 'Graph Store — Neo4j',
    desc: 'Document nodes and their relationships (RFQ → PO → ASN → GRN → Invoice, vendor and material links) are maintained as a live property graph for chain tracing.',
    color: 'text-pink-400',
    border: 'border-pink-900',
  },
]

const FEATURES = [
  {
    icon: '▶',
    label: 'Live Dashboard',
    desc: 'Real-time latency metrics streamed over WebSocket. Start or stop the built-in P2P document simulator at any time.',
    to: '/dashboard',
  },
  {
    icon: '✦',
    label: 'Graph Explorer',
    desc: 'Visualise any document and its relationships in the Neo4j graph. Adjust hop depth from 1 to 4 to explore the full P2P chain.',
    to: '/graph',
  },
  {
    icon: '✎',
    label: 'Document Entry',
    desc: 'Insert RFQs, Purchase Orders, ASNs, GRNs, and Invoices directly into MongoDB through guided end-user forms — no JSON required.',
    to: '/documents',
  },
  {
    icon: '⬡',
    label: 'Pipeline Status',
    desc: 'Monitor Kafka Connect connector health and per-topic consumer lag in real time.',
    to: '/pipeline',
  },
]

export default function Home() {
  const navigate = useNavigate()

  return (
    <div className="max-w-5xl mx-auto space-y-16 py-4">

      {/* Hero */}
      <section className="text-center space-y-5 pt-6">
        <div className="inline-block px-3 py-1 rounded-full border border-blue-800 text-blue-400 text-xs font-medium tracking-widest uppercase">
          Minor Project — Database Management
        </div>
        <h1 className="text-4xl font-bold text-white leading-tight">
          P2P Change-Data-Capture<br />
          <span className="text-blue-400">Pipeline &amp; Dashboard</span>
        </h1>
        <p className="text-gray-400 max-w-2xl mx-auto text-base leading-relaxed">
          A full end-to-end proof-of-concept that captures every change in a
          Procure-to-Pay document workflow and propagates it in near real-time to
          a relational analytics store (PostgreSQL) and a property graph (Neo4j)
          — using Debezium, Apache Kafka, and a custom Python consumer.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            className="btn-primary px-6 py-2.5 text-sm font-medium"
            onClick={() => navigate('/dashboard')}
          >
            Open Dashboard
          </button>
          <button
            className="btn-secondary px-6 py-2.5 text-sm font-medium"
            onClick={() => navigate('/pipeline')}
          >
            Pipeline Status
          </button>
        </div>
      </section>

      {/* Pipeline flow */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-white">How it works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {STEPS.map(s => (
            <div key={s.num} className={`card border ${s.border} space-y-2`}>
              <div className={`text-xs font-mono font-bold ${s.color}`}>{s.num}</div>
              <div className="text-sm font-semibold text-white">{s.title}</div>
              <p className="text-xs text-gray-400 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>

        {/* Arrow flow summary */}
        <div className="card bg-gray-900/60 overflow-x-auto">
          <div className="flex items-center gap-2 text-xs font-mono text-gray-500 whitespace-nowrap">
            <span className="text-blue-400">MongoDB</span>
            <span>→</span>
            <span className="text-purple-400">Debezium</span>
            <span>→</span>
            <span className="text-yellow-400">Kafka</span>
            <span>→</span>
            <span className="text-orange-400">Python Consumer</span>
            <span>→</span>
            <span className="text-green-400">PostgreSQL</span>
            <span className="text-gray-600 mx-1">/</span>
            <span className="text-pink-400">Neo4j</span>
          </div>
        </div>
      </section>

      {/* Document types */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-white">P2P Document Types</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'RFQ',            sub: 'Request for Quotation', color: 'text-blue-400'   },
            { label: 'Purchase Order', sub: 'PO',                    color: 'text-purple-400' },
            { label: 'ASN',            sub: 'Advance Ship Notice',   color: 'text-yellow-400' },
            { label: 'GRN',            sub: 'Goods Receipt Note',    color: 'text-orange-400' },
            { label: 'Invoice',        sub: 'Vendor Invoice',        color: 'text-green-400'  },
          ].map(d => (
            <div key={d.label} className="card text-center space-y-1">
              <div className={`text-sm font-semibold ${d.color}`}>{d.label}</div>
              <div className="text-xs text-gray-500">{d.sub}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">
          Each document type is tracked through its full lifecycle. Relationships between documents
          (e.g. a GRN confirming a PO, or an Invoice billing against a PO) are persisted as edges
          in Neo4j, enabling end-to-end chain tracing from RFQ to payment.
        </p>
      </section>

      {/* Features / Nav cards */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Explore</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {FEATURES.map(f => (
            <button
              key={f.label}
              className="card text-left hover:border-gray-600 hover:bg-gray-800/60 transition-all group cursor-pointer"
              onClick={() => navigate(f.to)}
            >
              <div className="flex items-start gap-3">
                <span className="text-gray-500 text-lg mt-0.5 group-hover:text-blue-400 transition-colors">{f.icon}</span>
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-white group-hover:text-blue-300 transition-colors">{f.label}</div>
                  <p className="text-xs text-gray-400 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Tech stack */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Tech Stack</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { name: 'MongoDB',      role: 'Source DB',           color: 'text-green-400'  },
            { name: 'Debezium',     role: 'CDC Connector',       color: 'text-red-400'    },
            { name: 'Apache Kafka', role: 'Message Broker',      color: 'text-yellow-400' },
            { name: 'Python',       role: 'Consumer / Pipeline', color: 'text-blue-400'   },
            { name: 'PostgreSQL',   role: 'Analytics Store',     color: 'text-sky-400'    },
            { name: 'Neo4j',        role: 'Graph Store',         color: 'text-pink-400'   },
            { name: 'FastAPI',      role: 'Backend API',         color: 'text-teal-400'   },
            { name: 'React + Vite', role: 'Dashboard UI',        color: 'text-purple-400' },
          ].map(t => (
            <div key={t.name} className="card flex flex-col gap-0.5">
              <span className={`text-sm font-semibold ${t.color}`}>{t.name}</span>
              <span className="text-xs text-gray-500">{t.role}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="border-t border-gray-800 pt-4 pb-2 text-center text-xs text-gray-600">
        P2P CDC POC &mdash; Minor Project
      </div>
    </div>
  )
}
