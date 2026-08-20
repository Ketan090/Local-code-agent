# Security
- LM Studio API Key: [REDACTED]
- DEFAULT_MODEL:# Local Code Agent — Web IDE with LM Studio

Production-quality local coding agent inspired by Cursor / Claude Code / OpenCode. Connects to **LM Studio** (`http://localhost:1234/v1`) via OpenAI-compatible API, streams responses, and lets the model use real tools to edit your workspace.

### Architecture
```
Browser (Monaco + Chat + Terminal) ──HTTP/WS──> Node Backend (Agent + Tools + Git + SQLite) ──> LM Studio :1234
```

### Features
- **LM Studio** real integration: `GET /v1/models`, `POST /v1/chat/completions` streaming, dynamic model selector, test connection
- **Agent loop**: tool calling + fallback `<tool_call>` parsing, up to 30 iterations, auto error recovery (read error → fix → rerun)
- **Tools**: read_file, write_file, edit_file, list_directory, search_files, execute_command, get_file_info, git_status, git_diff, run_tests
- **Workspace sandboxing**: blocks `../../` traversal
- **Terminal**: real `powershell` / `bash` execution via backend
- **Git**: status / diff / branches / add / commit
- **SQLite**: settings / sessions / messages / projects
- **Three-panel IDE**: Explorer | Monaco | Agent + Terminal (resizable, dark theme #0B0D0F)
- **Simple HTML/CSS/JS frontend** — no build step, Monaco via CDN, WebSocket streaming

### Quick Start
1. **Start LM Studio**
   - Load a coding model (qwen3-coder, deepseek-coder, devstral...)
   - Enable Local Server (default `http://localhost:1234/v1`)

2. **Install & run**
```bash
cd local-code-agent
npm run install:all
npm run dev
# backend http://localhost:3101  (serves frontend)
# frontend http://localhost:3101  (same origin, WS /ws)
```
Or separately:
```bash
cd backend && npm install && npm run dev
# open frontend/index.html via backend static serve
```

3. **Open** `http://localhost:3101`
   - Test LM Studio connection (Settings → Test)
   - Select model
   - Open workspace folder (enter absolute path, e.g. `C:\Projects\my-app`)
   - Ask: `Inspect this project and explain its architecture.`

### Env
Copy `.env.example` to `.env`:
```
LM_STUDIO_BASE_URL=http://localhost:1234/v1
LM_STUDIO_API_KEY=lm-studio
DEFAULT_MODEL=
PORT=3101
AGENT_MAX_ITERATIONS=30
```

### API
- `GET /api/health` `GET /api/diagnostics`
- `GET /api/lmstudio/models` `POST /api/lmstudio/test` `GET+POST /api/lmstudio/config`
- `GET /api/workspace/files?path=.` `GET /api/workspace/file?path=` `POST /api/workspace/file` `POST /api/workspace/execute` `GET /api/workspace/search?q=`
- `GET /api/sessions` `POST /api/sessions` `GET /api/sessions/:id`
- WS `ws://host/ws` → `{type:"agent:run", model, userMessage, history}` streams `{type:"token"|"tool_start"|"tool_result"|"done"}`

##

### Design
Premium dark IDE: `#0B0D0F` `#111418` `#161A1F` `#252A31` with `#7C8CFF` accent, subtle borders, compact spacing.

