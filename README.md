# CDC Dashboard UI

React + Vite frontend for the [Change-Data-Capture-POC](https://github.com/Chandaluri-Lokesh/Change-Data-Capture-POC) backend.

## Stack

- React 18 + TypeScript
- Vite 5
- Tailwind CSS
- Recharts (latency charts, radar chart)
- react-force-graph-2d (Neo4j graph visualisation)
- Axios + React Router v6

## Pages

| Route | Description |
|---|---|
| `/` | Home — pipeline overview, P2P chain walkthrough, tech stack, feature navigation |
| `/dashboard` | Live dashboard — KPI cards, E2E latency chart, event feed (WebSocket) |
| `/documents` | Insert P2P documents into MongoDB; view existing documents per type |
| `/graph` | Neo4j force-graph explorer with node inspector and document list |
| `/pipeline` | Kafka Connect connector state + consumer lag table |
| `/schema` | Live schema browser — MongoDB collections, PostgreSQL tables, Neo4j graph model |
| `/performance` | Measured latency stats, stage breakdown charts, scale projections |

## Dev setup

```bash
npm install
npm run dev      # starts at http://localhost:5173
```

Requires the FastAPI backend running at `http://localhost:8000`.
Vite proxies `/api` and `/ws` to the backend automatically.

## Build

```bash
npm run build    # output in dist/
```

## API dependencies

The frontend calls the following backend endpoints:

| Endpoint | Used By |
|---|---|
| `GET /api/metrics/summary` | Dashboard KPI cards |
| `GET /api/metrics/recent` | Dashboard event feed |
| `GET /api/metrics/benchmarks` | Performance page |
| `GET /api/metrics/collections` | Dashboard collection breakdown |
| `WS  /ws/metrics` | Dashboard real-time stream |
| `GET /api/pipeline/status` | Pipeline page |
| `GET /api/documents/{type}` | Documents list panel, Graph doc list |
| `POST /api/documents/{type}` | Documents insert form |
| `DELETE /api/documents/{type}/{id}` | Documents delete |
| `GET /api/graph/{collection}/{id}` | Graph subgraph explorer |
| `GET /api/graph/stats/overview` | Graph overview stats |
| `GET /api/schema/mongodb` | Schema — MongoDB tab |
| `GET /api/schema/postgresql` | Schema — PostgreSQL tab |
| `GET /api/schema/neo4j` | Schema — Neo4j tab |
| `POST /api/simulate/chain` | Dashboard chain simulator |
| `POST /api/simulate/start` | Pipeline simulator controls |
| `POST /api/simulate/stop` | Pipeline simulator controls |
