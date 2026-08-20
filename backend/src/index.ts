import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import { WebSocketServer } from 'ws';
import { config } from './config';
import { db, getSetting } from './db';
import { LMStudioProvider } from './providers/lmstudio';
import { FileManager } from './managers/fileManager';
import { TerminalManager } from './managers/terminalManager';
import { GitManager } from './managers/gitManager';
import { ContextBuilder } from './agent/contextBuilder';
import { AgentController } from './agent/controller';
import { lmstudioRouter } from './routes/lmstudio';
import { workspaceRouter } from './routes/workspace';
import { sessionsRouter } from './routes/sessions';
import { setupWS } from './websocket';

const app = express();
app.use(cors());
app.use(express.json({limit:'10mb'}));
app.use(express.urlencoded({extended:true}));

const workspaceInitial = getSetting('workspace', config.workspaceRoot);
const fm = new FileManager(workspaceInitial||process.cwd());
const tm = new TerminalManager();
const gm = new GitManager(tm, ()=>fm.getWorkspace());
const cb = new ContextBuilder(fm);
const provider = new LMStudioProvider(getSetting('lmstudio_baseUrl',config.lmStudioBaseUrl), getSetting('lmstudio_apiKey',config.lmStudioApiKey));
const agent = new AgentController(provider, fm, tm, gm, cb, { maxIterations: config.maxIterations });

app.get('/api/health', (req,res)=> res.json({ ok:true, workspace: fm.getWorkspace(), lmStudio: getSetting('lmstudio_baseUrl',config.lmStudioBaseUrl) }));
app.use('/api/lmstudio', lmstudioRouter(provider));
app.use('/api/workspace', workspaceRouter(fm,tm,gm));
app.use('/api/sessions', sessionsRouter());
app.get('/api/diagnostics', async (req,res)=>{
  const wsOk = fm.getWorkspace() && require('fs').existsSync(fm.getWorkspace());
  const lm = await provider.testConnection();
  res.json({
    backend:'connected',
    workspace: fm.getWorkspace(),
    workspaceExists: !!wsOk,
    lmStudio: lm,
    model: getSetting('lmstudio_model',''),
    iterations: config.maxIterations
  });
});

const frontendPath = path.join(__dirname, '../../frontend');
app.use(express.static(frontendPath));
app.get('*', (req,res)=>{
  const index = path.join(frontendPath,'index.html');
  if(require('fs').existsSync(index)) res.sendFile(index);
  else res.json({ message:'Local Code Agent API running', frontend:'not built yet' });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path:'/ws' });
setupWS(wss, agent, ()=>fm.getWorkspace());

const PORT = config.port;
server.listen(PORT, ()=> console.log(`Backend running on http://localhost:${PORT}`));
