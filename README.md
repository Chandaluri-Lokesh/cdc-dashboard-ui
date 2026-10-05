# CDC Dashboard UI

React + Vite frontend for the [Change-Data-Capture-POC](https://github.com/Chandaluri-Lokesh/Change-Data-Capture-POC) backend.

## Stack
- React 18 + TypeScript
- Vite 5
- Tailwind CSS
- Recharts (latency chart)
- react-force-graph-2d (Neo4j graph viz)
- Axios + React Router v6

## Pages
| Route | Description |
|---|---|
| `/` | Live dashboard — KPI cards, E2E latency chart, event feed (WebSocket) |
| `/documents` | Insert P2P documents into MongoDB; trigger CDC manually |
| `/graph` | Neo4j force-graph explorer with node inspector |
| `/pipeline` | Kafka Connect connector state + consumer lag table |

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
