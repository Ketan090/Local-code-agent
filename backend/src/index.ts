import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { WebSocketServer } from 'ws';
import { config } from './config';
import { db, getSetting, setSetting } from './db';
import { LMStudioProvider } from './providers/lmstudio';
import { OpencodeProvider } from './providers/opencode';
import { NvidiaProvider } from './providers/nvidia';
import { FileManager } from './managers/fileManager';
import { TerminalManager } from './managers/terminalManager';
import { GitManager } from './managers/gitManager';
import { ContextBuilder } from './agent/contextBuilder';
import { AgentController } from './agent/controller';
import { lmstudioRouter } from './routes/lmstudio';
import { workspaceRouter } from './routes/workspace';
import { sessionsRouter } from './routes/sessions';
import { setupWS } from './websocket';

// --- Express setup ---
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// --- Core services ---
const workspaceInitial = getSetting('workspace', config.workspaceRoot);
const fm = new FileManager(workspaceInitial || process.cwd());
const tm = new TerminalManager();
const gm = new GitManager(tm, () => fm.getWorkspace());
const cb = new ContextBuilder(fm);
const lmProvider = new LMStudioProvider(
  getSetting('lmstudio_baseUrl', config.lmStudioBaseUrl),
  getSetting('lmstudio_apiKey', config.lmStudioApiKey)
);
const ocProvider = new OpencodeProvider(getSetting('opencode_baseUrl', config.opencodeBaseUrl));
const nvProvider = new NvidiaProvider(getSetting('nvidia_baseUrl', config.nvidiaBaseUrl), getSetting('nvidia_apiKey', config.nvidiaApiKey));
function resolveProvider(){ const p=getSetting('provider',config.provider); if(p==='opencode') return ocProvider; if(p==='nvidia') return nvProvider; return lmProvider; }
let activeProvider: any = resolveProvider();
const provider = activeProvider;
const agent = new AgentController(provider, fm, tm, gm, cb, { maxIterations: config.maxIterations });

// --- LM Studio auto-connect ---
let autoConnectRunning = false;
function lmCandidates(): string[] {
  const list = new Set<string>([
    getSetting('lmstudio_baseUrl', config.lmStudioBaseUrl),
    config.lmStudioBaseUrl,
    'http://localhost:1234/v1',
    'http://127.0.0.1:1234/v1',
  ]);
  try {
    for (const iface of Object.values(os.networkInterfaces()).flat() as any[]) {
      if (iface && iface.family === 'IPv4' && !iface.internal) {
        list.add(`http://${iface.address}:1234/v1`);
      }
    }
  } catch {}
  return [...list].filter(Boolean);
}

async function autoConnect(): Promise<boolean> {
  if (autoConnectRunning) return false;
  autoConnectRunning = true;
  try {
    const apiKey = getSetting('lmstudio_apiKey', config.lmStudioApiKey);
    for (const url of lmCandidates()) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 2000);
        const fetch = (await import('node-fetch')).default;
        const r = await fetch(url + '/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: ctrl.signal as any,
        });
        clearTimeout(timer);
        if (r.ok) {
          const j: any = await r.json();
          const models = j.data || j.models || [];
          if (models.length) {
            provider.updateConfig(url, apiKey);
            setSetting('lmstudio_baseUrl', url);
            if (!getSetting('lmstudio_model', '') && models[0]?.id) {
              setSetting('lmstudio_model', models[0].id);
            }
            console.log(`Auto-connected to LM Studio at ${url} (${models.length} models)`);
            return true;
          }
        }
      } catch {}
    }
    console.log('LM Studio not found — will retry every 30s');
    return false;
  } finally {
    autoConnectRunning = false;
  }
}

autoConnect();
const autoConnectInterval = setInterval(autoConnect, 30_000);

// --- Routes ---
app.get('/api/health', (_req, res) =>
  res.json({ ok: true, workspace: fm.getWorkspace(), lmStudio: getSetting('lmstudio_baseUrl', config.lmStudioBaseUrl), opencode: getSetting('opencode_baseUrl', config.opencodeBaseUrl), provider: getSetting('provider', config.provider) })
);
app.use('/api/lmstudio', lmstudioRouter(lmProvider));
import { opencodeRouter } from './routes/opencode';
app.use('/api/opencode', opencodeRouter(ocProvider, ()=>activeProvider, (p:any)=>{activeProvider=p;}));
import { nvidiaRouter } from './routes/nvidia';
app.use('/api/nvidia', nvidiaRouter(nvProvider, ()=>activeProvider, (p:any)=>{activeProvider=p;}));
app.use('/api/workspace', workspaceRouter(fm, tm, gm));
app.use('/api/sessions', sessionsRouter());

app.get('/api/diagnostics', async (_req, res) => {
  const wsOk = fm.getWorkspace() && fs.existsSync(fm.getWorkspace());
  let lm = await provider.testConnection();
  if (!lm.ok) { await autoConnect(); lm = await provider.testConnection(); }
  res.json({
    backend: 'connected',
    workspace: fm.getWorkspace(),
    workspaceExists: !!wsOk,
    lmStudio: lm,
    model: getSetting('lmstudio_model', ''),
    iterations: config.maxIterations,
    baseUrl: getSetting('lmstudio_baseUrl', config.lmStudioBaseUrl),
  });
});

app.post('/api/lmstudio/autoconnect', async (_req, res) => {
  const ok = await autoConnect();
  res.json({ ok, baseUrl: getSetting('lmstudio_baseUrl', config.lmStudioBaseUrl) });
});

// --- Static frontend ---
const frontendPath = path.join(__dirname, '../../frontend');
app.use(express.static(frontendPath));
app.get('*', (req, res) => {
  const index = path.join(frontendPath, 'index.html');
  if (fs.existsSync(index)) res.sendFile(index);
  else res.json({ message: 'Local Code Agent API running', frontend: 'not built yet' });
});

// --- Server & WebSocket ---
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
setupWS(wss, agent, () => fm.getWorkspace());

const PORT = config.port;
server.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));

// --- Graceful shutdown ---
function shutdown(signal: string) {
  console.log(`\n${signal} received — shutting down...`);
  clearInterval(autoConnectInterval);
  wss.clients.forEach(ws => { try { ws.close(1001, 'Server shutting down'); } catch {} });
  wss.close();
  server.close(() => {
    try { tm.killAll?.(); } catch {}
    console.log('Server stopped.');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
