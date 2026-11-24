# Lyftr AI - LLM Chatbot with Key Failover and Response Caching

A resilient, production-ready Full-Stack AI Chatbot application built with **React**, **FastAPI**, **LiteLLM**, and **SQLite**. Designed for high availability, cost efficiency, and sub-millisecond response caching.

---

## 1. Live URLs

| Service | Environment | URL |
| :--- | :--- | :--- |
| **Frontend** | Production (e.g., Vercel / Netlify / Render) | `https://your-frontend-deployment.vercel.app` *(Replace with your live frontend URL)* |
| **Backend API** | Production (e.g., Render / Railway / Fly.io) | `https://your-backend-deployment.onrender.com` *(Replace with your live backend URL)* |
| **API Docs (Swagger)** | Production | `https://your-backend-deployment.onrender.com/docs` |

---

## 2. Run Locally: With Docker and Without

### Method A: With Docker (Recommended)

Make sure [Docker Desktop](https://www.docker.com/) is installed and running.

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd "Lyftr AI"
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` to supply your API keys (e.g., Gemini or OpenAI keys). If left at default placeholders, the backend runs in test/demo simulation mode.

3. **Start the whole stack with Make:**
   ```bash
   make up
   ```
   *Frontend starts at:* `http://localhost:3000`  
   *Backend starts at:* `http://localhost:8000`  
   *SQLite database is persisted in Docker named volume `lyftr_sqlite_data` mounted at `/data`.*

4. **Stop the stack:**
   ```bash
   make down
   ```

---

### Method B: Without Docker (Local Dev Runtimes)

#### Prerequisites
- **Python**: 3.10+ (Tested on 3.11 & 3.14)
- **Node.js**: 18+ (Tested on v20 & v24) & npm

#### 1. Backend Setup:
```bash
# In project root
python -m venv backend_venv

# Activate venv:
# On Windows PowerShell:
.\backend_venv\Scripts\Activate.ps1
# On Linux/macOS:
source backend_venv/bin/activate

# Install requirements:
pip install -r backend/requirements.txt

# Configure environment variables (or export them):
export LLM_API_KEYS="your_key_1,your_key_2"
export DATABASE_URL="sqlite:///./data/app.db"
export ENABLE_FAILURE_SIMULATION="true"

# Run FastAPI server:
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### 2. Frontend Setup:
```bash
# In a new terminal
cd frontend
npm install
npm run dev
```
Open `http://localhost:3000` in your browser.

#### 3. Run Backend Automated Tests:
```bash
# From repository root with backend_venv activated
$env:PYTHONPATH="backend"
pytest backend/tests -v
```

---

## 3. Design Decisions

### A. Key Fallback & Resilience Strategy
- **Sequential Pool Architecture**: The gateway accepts a comma-separated list of keys via `LLM_API_KEYS`. Keys are assigned sequential identifiers (`key_1`, `key_2`, ...).
- **Graceful Failover**: When any key triggers an HTTP 429 (rate-limit), quota exhaustion, or 5xx error (including 500, 502, 503), the gateway catches the exception, increments `fallback_attempts`, and automatically retries with the subsequent key in the pool.
- **Fail-Safe Exhaustion (HTTP 503)**: If every key in the pool fails or is forced to fail via simulation, the API returns a clean JSON error response:
  ```json
  { "detail": "all providers unavailable" }
  ```
  Critically, no failed request or partial state is ever written to the SQLite session history, preventing corruption of the multi-turn context.
- **Security by Design**: Neither client requests nor error payloads ever expose raw API keys or provider secrets. Only the safe identifier (`key_id`, e.g. `key_1`, `key_2`) is returned.

### B. High-Performance LiteLLM Caching
- **Cache Key Composition**: In strict accordance with the assignment requirements, the cache key evaluates:
  $$\text{Cache Key} = \text{Model} + \text{Full Message History (System Prompt + History + User Message)}$$
- **Exact Behavior**:
  - The first time a message is sent in a new session, it generates a `LIVE_INFERENCE` reply with the active `key_id` and server latency.
  - Sending the exact same first message in a second session hits `LLM_CACHE`.
  - Cache hits return identical reply text, original token counts, `key_id = null`, and `fallback_attempts = 0`, with significantly lower latency ($\approx 1\text{--}5\text{ ms}$).
  - A differing message or distinct multi-turn context bypasses the cache and generates fresh live inference.

### C. SQLite Session Storage
- **Self-Contained & Serverless**: SQLite requires zero external services (no Redis, no Postgres) and minimal overhead.
- **Data Persistence**: In Docker, the database path is `/data/app.db` backed by a persistent named volume `lyftr_sqlite_data`, surviving container restarts and image rebuilds.
- **Schema & Indexes**:
  ```sql
  CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL, -- 'user' or 'assistant'
    content TEXT NOT NULL,
    metadata TEXT,      -- JSON string with resolution_source, tokens
    created_at TEXT NOT NULL -- server time, ISO-8601
  );
  CREATE INDEX idx_messages_session_id ON messages (session_id);
  ```
- **Session Isolation**: `GET /sessions/{session_id}/messages` retrieves chronological history for that session only. Querying a non-existent session returns an exact HTTP 404: `{"detail": "session not found"}`.

---

## 4. Verification: How to See Failover, Cache Hits and Token Usage

### Verification 1: Cache Hit Accuracy
1. Send `"What is the capital of France?"` in the chat UI.
2. Observe metadata:
   - `Resolution Source`: `LIVE_INFERENCE`
   - `Latency`: $\approx 800\text{--}1200\text{ ms}$
   - `Key ID`: `key_1`
3. Refresh the page (generating a fresh `session_id`).
4. Send the identical query: `"What is the capital of France?"`.
5. Observe metadata:
   - `Resolution Source`: `LLM_CACHE`
   - `Latency`: $\approx 1\text{--}15\text{ ms}$
   - `Key ID`: `null` (badge hidden)
   - `Input/Output Tokens`: matches the cached values.

### Verification 2: Key Failover via `X-Simulate-Failure`
The gateway exposes test header simulation when `ENABLE_FAILURE_SIMULATION=true`.

In the UI, click **Controls** in the top bar:
- Select **`key_1=429`**: Sends `X-Simulate-Failure: key_1=429`. Key 1 simulates a rate limit; the gateway catches it and transparently resolves via `key_2`. Notice `key_id: key_2 (after 1 fallback)` in the UI.
- Select **`key_1=500`**: Simulates provider internal server error on Key 1; automatically succeeds with `key_2`.
- Select **`*=429`**: Simulates exhaustion across all keys. The backend returns HTTP 503 `{"detail": "all providers unavailable"}` and displays a clean error banner in the chat without breaking the UI.

Using cURL:
```bash
# 1. Simulate key_1 failure (succeeds on key_2)
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -H "X-Simulate-Failure: key_1=429" \
  -d '{"session_id": "test-failover", "message": "Testing automatic failover"}'

# 2. Simulate all keys failing (clean 503)
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -H "X-Simulate-Failure: *=429" \
  -d '{"session_id": "test-exhaustion", "message": "Testing all failed"}'
```

### Verification 3: Token Tracking
- Tokens are reported **per-request**, not as a running total.
- Two first messages of equal length in two separate sessions will report the identical input token count ($\approx 15\text{--}40$ tokens including the system prompt).

---

## 5. Setup Used: Editor and AI Tools

- **IDE & Development Environment**: Antigravity Studio (VS Code based IDE) on Windows 11.
- **Runtimes**: Python 3.14 / 3.11, Node.js v24 / v20, Docker & Docker Compose.
- **AI Assistive Tooling**: Google DeepMind Antigravity AI Agent with official Gemini API documentation MCP integration.
- **Testing & Verification Tools**: Pytest, Asyncio, HTTPX ASGI client, Playwright / Chrome DevTools.

---

## 6. Bonus Features (Beyond Minimum Requirements)

1. **Interactive Failover & Caching Sandbox UI**: Built-in control panel with a single-click dropdown to trigger `key_1=429`, `key_1=500`, `*=429`, or custom simulation rules directly inside the web UI without needing Postman or terminal commands.
2. **Real-Time Gateway Status Monitor**: Live health indicator badge tracking DB connectivity, number of loaded API keys, and cache operational status.
3. **Session Custom System Prompt Control**: Accessible field directly with `data-testid="system-prompt-input"` allowing dynamic session-level prompt steering.
4. **Resilient Production Multi-Stage Docker Builds**: Lean Alpine and Slim containers with unprivileged user sandboxing, health checks, and optimized Nginx caching for static frontend assets.
5. **Comprehensive Automated Pytest Suite**: 7 end-to-end integration tests verifying health, schema validation, 404 session handling, live inference, response caching, key failover, and total failure handling.

---

## 7. Public Deployment Guide

### Deploying the Backend (Render.com / Railway / Fly.io)

1. Create a new **Web Service** on [Render](https://render.com).
2. Connect your GitHub repository.
3. Configure the service:
   - **Environment**: Python
   - **Root Directory**: `backend`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port 10000`
4. Add Environment Variables:
   - `LLM_API_KEYS`: `<key1>,<key2>`
   - `LLM_MODEL`: `gemini/gemini-2.0-flash` (or your model of choice)
   - `DATABASE_URL`: `sqlite:///./data/app.db` (or mount a persistent disk at `/data`)
   - `ENABLE_FAILURE_SIMULATION`: `true`
   - `ALLOWED_ORIGINS`: `*` (or your frontend Vercel URL)
5. Deploy and copy your backend live URL.

### Deploying the Frontend (Vercel / Netlify)

1. Import the repository on [Vercel](https://vercel.com).
2. Set **Root Directory** to `frontend`.
3. Add Environment Variable:
   - `VITE_API_URL`: `https://your-backend-deployment.onrender.com`
4. Deploy. The frontend is immediately live and connected to the backend API.
