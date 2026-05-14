# AgentChat — LangGraph + React + Vertex AI

A streaming chat client that connects to a LangGraph agent backed by **Google Vertex AI (Gemini)**.

## How it runs

`npm run dev` (from the root) uses `concurrently` to launch **two processes at once**:

| Process | Command | URL |
|---------|---------|-----|
| `AGENT` | `cd agent && langgraph dev --port 2024` | http://localhost:2024 |
| `CLIENT` | `npm run dev --prefix client` | http://localhost:8080 |

`langgraph dev` is a **Python CLI** installed via `pip install langgraph-cli[inmem]`. It reads `agent/langgraph.json`, loads `agent.py:graph`, and serves the LangGraph HTTP streaming API on port 2024. The React client proxies `/api/*` → `localhost:2024` via Vite, so there are no CORS issues.

---

## Project structure

```
agent-chat/
├── package.json          ← root: concurrently runs agent + client
├── agent/
│   ├── agent.py          ← LangGraph graph, calls Vertex AI
│   ├── langgraph.json    ← tells langgraph dev which graph to serve
│   ├── requirements.txt  ← Python deps (langgraph-cli, langchain-google-vertexai)
│   └── .env              ← This is what you should create, copy to .env, fill in GCP project
└── client/
    ├── vite.config.js    ← /api/* proxied to localhost:2024
    └── src/
        ├── App.jsx        ← chat UI with thread sidebar + streaming
        ├── langgraph.js   ← thin wrapper around LangGraph HTTP API
        ├── main.jsx
        └── index.css
```

---

## Setup & run

### 1. Authenticate with Google Cloud

```bash
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
```

### 2. Configure environment

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install langgraph-cli[inmem]
```

Open `agent/.env` and set:
```env
GOOGLE_CLOUD_PROJECT=your-gcp-project-id
GOOGLE_CLOUD_LOCATION=us-central1
```

### 3. Install all dependencies

```bash
# From the root agent-chat/ directory:
npm install          # installs concurrently
npm run install:all  # pip installs Python deps + npm installs client deps
```

### 4. Run everything

```bash
npm run dev
```

You'll see interleaved output from both processes:
```
[AGENT] Starting LangGraph API server...
[AGENT] Ready on http://localhost:2024
[CLIENT] VITE ready in Xms → http://localhost:8080
```

Open **http://localhost:8080**.

---

## Troubleshooting

**`langgraph: command not found`**
The `langgraph` CLI wasn't installed or isn't on your PATH. Fix:
```bash
pip install "langgraph-cli[inmem]"
# or if using a venv, activate it first
source .venv/bin/activate && pip install "langgraph-cli[inmem]"
```

**`google.auth.exceptions.DefaultCredentialsError`**
Run `gcloud auth application-default login` or set `GOOGLE_APPLICATION_CREDENTIALS` to a service-account key path.

**Vertex AI 403 / permission denied**
Make sure the Vertex AI API is enabled in your GCP project and your account has the `roles/aiplatform.user` role.

---

`langgraph dev` hot-reloads on file save, so no restart needed.
