# Local Code Agent — Cursor-grade Web IDE for LM Studio

> **Your local AI engineer.** A production-quality, fully-functional coding agent that connects to **LM Studio** on your machine, streams real model output, and autonomously edits your workspace via tools — just like Cursor / Claude Code / OpenCode, but 100% local.

<p align="center">
  <img src="https://img.shields.io/badge/LM%20Studio-Connected-3FB950?style=flat-square" />
  <img src="https://img.shields.io/badge/Monaco-Editor-7C8CFF?style=flat-square" />
  <img src="https://img.shields.io/badge/WebSocket-Streaming-252A31?style=flat-square" />
  <img src="https://img.shields.io/badge/License-MIT-8B949E?style=flat-square" />
</p>

---

### ✨ Why this over a chatbot?

| Feature | Chatbot | **Local Code Agent** |
|---|---|---|
| Reads your repo | ❌ | ✅ real `read_file` / `list_directory` |
| Edits files | ❌ | ✅ `write_file` / `edit_file` with diff |
| Runs commands | ❌ | ✅ real `powershell` / `bash` |
| Fixes its own errors | ❌ | ✅ build → read error → fix loop |
| Streaming | fake | ✅ token-by-token from LM Studio |

---

### 🏗 Architecture

```
┌─────────────────────┐
│   Browser UI        │  Monaco · Terminal · Agent Chat
│  HTML/CSS/JS        │  (no build step, CDN)
└─────────┬───────────┘
          │ HTTP + WebSocket (/ws)
          ▼
┌─────────────────────┐
│  Local Backend      │  Agent Controller · Tool Registry
│  Node + Express     │  File / Terminal / Git Managers
│  SQLite / JSON      │  Context Builder (cached, 6k budget)
└─────────┬───────────┘
          │ OpenAI-compatible API
          ▼
┌─────────────────────┐
│  LM Studio          │  localhost:1234/v1  (configurable)
│  qwen3-coder ·      │  GET /v1/models
│  deepseek · devstral│  POST /v1/chat/completions (stream)
└─────────────────────┘
```

Browser **never** touches filesystem — all privileged ops are proxied by the backend and sandboxed to `WORKSPACE`.

---

### 🚀 Quick Start (2 min)

#### 1. Start LM Studio
- Install [LM Studio](https://lmstudio.ai) → Download a coding model (`qwen2.5-coder`, `deepseek-coder`, `devstral`…)
- **Load model** → **Local Server** tab → **Start Server** → verify `http://localhost:1234/v1` shows `Running`
- Tip: CLI `lms server start` also works

#### 2. Start the Agent
**Windows (double-click):**
```
START.bat
```
**Any OS:**
```bash
cd local-code-agent
npm --prefix backend install --ignore-scripts
node backend/node_modules/typescript/bin/tsc -p backend/tsconfig.json
node backend/dist/index.js
# Open http://localhost:3101
```

#### 3. Use it
1. Open `http://localhost:3101`
2. **Settings** → **Test Connection** → `● Connected` → select model
3. Enter workspace path (e.g. `C:\Projects\my-app` or `/home/user/app`) → **Open**
4. Try: *“Inspect this project and explain its architecture”* — model will actually `list_directory` + `read_file`
5. Then: *“Create a test file and run tests, fix failures”* — agent edits, executes, iterates

> Your LM Studio IP is persisted to `.env` + SQLite — no need to re-enter. Change anytime in Settings.

---

### ⚙️ Configuration

Copy `.env.example` → `.env`:

| Var | Default | Description |
|---|---|---|
| `LM_STUDIO_BASE_URL` | `http://localhost:1234/v1` | LM Studio endpoint (supports LAN IP like `10.88.238.129:1234`) |
| `LM_STUDIO_API_KEY` | `lm-studio` | LM Studio accepts any string |
| `DEFAULT_MODEL` | `` | Auto-selected after fetching `/v1/models` |
| `PORT` | `3101` | Backend + static frontend |
| `AGENT_MAX_ITERATIONS` | `30` | Tool loop limit |
| `TEMPERATURE` | `0.2` | Lower = more deterministic coding |
| `MAX_TOKENS` | `4096` | Per turn |

All settings also editable live in **Settings → LM Studio** and persisted via API.

---

### 🧰 Tools (model-callable)

| Tool | Purpose |
|---|---|
| `read_file` | Read file (sandboxed, 8k cap) |
| `write_file` | Create/overwrite file |
| `edit_file` | Surgical `old_text → new_text` |
| `list_directory` | List dir (`"."` = workspace root) |
| `search_files` | Fast JS-native search (2.5s budget, no `grep` dependency) |
| `execute_command` | Run shell in workspace (25s timeout, approval for dangerous) |
| `get_file_info` | Stat file |
| `git_status` / `git_diff` | Real git |
| `run_tests` | `npm test` / custom |

Fallback format if model lacks native tool calling:
```xml
<tool_call>{"name":"read_file","arguments":{"path":"src/App.tsx"}}</tool_call>
```

---

### 🔌 API & WebSocket

**REST:**
```
GET  /api/health, /api/diagnostics
GET  /api/lmstudio/models, POST /api/lmstudio/test, GET|POST /api/lmstudio/config
GET  /api/workspace/files?path=., /api/workspace/file?path=, POST /api/workspace/file, POST /api/workspace/execute, GET /api/workspace/search?q=
GET  /api/sessions, POST /api/sessions, GET /api/sessions/:id
```

**WS (`ws://host/ws`):**
```json
// client →
{"type":"agent:run","model":"qwen2.5-vl-7b-instruct","userMessage":"fix bug","history":[],"openFiles":[],"currentFile":"src/index.ts"}
// server ← streams
{"type":"token","content":"I'll inspect..."}
{"type":"tool_start","name":"read_file","args":{"path":"src/index.ts"}}
{"type":"tool_result","name":"read_file","result":"..."}
{"type":"done"}
```

---

### 🎨 UI — Simple HTML/CSS, Premium Dark

- **Three panels:** Explorer | Monaco | Agent+Terminal — resizable, `#0B0D0F` / `#111418` / `#7C8CFF` theme
- **Monaco** via CDN (TS/JS/Python/C++/HTML/CSS/JSON/MD/YAML/SQL), multi-tab, auto-refresh on agent edit
- **Terminal** (real PTY) + chat with slash commands: `/fix /explain /refactor /test /review /run /help` and `@file` mentions
- No Vite/Next build — `frontend/index.html + style.css + app.js` served by backend for instant startup

---

### 🔒 Security

- Workspace sandbox — blocks `../../` traversal
- Dangerous commands (`rm -rf`, `git push --force`…) require manual approval
- Localhost-only by default, no `file://` access from browser, no secrets exposed
- `.env` + `data.json` gitignored

---

### ⚡ Performance (Optimized)

- **Parallel** readonly tool calls (read/search/list together)
- Cached project tree + model list (5–10s TTL), 6k context budget (truncated)
- JS-native search (no spawn overhead), 3s LM Studio probe with abort, 25s tool timeout
- Token streaming with incremental tool-call parsing

---

### 🛠 Troubleshooting

| Symptom | Fix |
|---|---|
| `LM Studio Offline` | Ensure LM Studio Local Server is **Running** and port `1234` open; try `curl http://localhost:1234/v1/models`; update Base URL in Settings to your LAN IP if needed |
| `No model` | Load a model in LM Studio first, then **↻ Refresh** |
| `Path traversal denied` | Path must be inside opened workspace |
| `Port 3101 in use` | `PORT=3102 node backend/dist/index.js` or kill old `node` |
| `better-sqlite3 build fail` | Auto-falls back to `data.json` — no action needed |

**Diagnostics:** `GET /api/diagnostics` and header status dot (`● Connected` / `○ Offline`).

---

### 📁 Structure

```
local-code-agent/
├── START.bat              ← double-click launcher (Windows)
├── .env.example / .env
├── backend/
│   ├── src/
│   │   ├── providers/lmstudio.ts
│   │   ├── agent/controller.ts + contextBuilder.ts
│   │   ├── managers/fileManager.ts, terminalManager.ts, gitManager.ts
│   │   ├── tools/, routes/, db/, websocket.ts
│   │   └── index.ts
│   └── dist/              ← compiled
└── frontend/
    ├── index.html
    ├── style.css
    └── app.js
```

---

### 🤝 Contributing & License

PRs welcome. Keep it local-first, no telemetry, no cloud.

MIT — build your own Cursor, locally.

<p align="center"><sub>Built for developers who want to own their AI.</sub></p>
