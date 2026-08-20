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

import os from 'os';
import { setSetting } from './db';
function candidates(){
  const list=new Set<string>([getSetting('lmstudio_baseUrl',config.lmStudioBaseUrl), config.lmStudioBaseUrl, 'http://localhost:1234/v1','http://127.0.0.1:1234/v1','http://10.88.238.129:1234/v1']);
  try{ for(const iface of Object.values(os.networkInterfaces()).flat() as any[]){ if(iface&&iface.family==='IPv4'&&!iface.internal) list.add(`http://${iface.address}:1234/v1`);} }catch{}
  return [...list].filter(Boolean);
}
async function autoConnect(){
  for(const url of candidates()){
    try{
      const c=new AbortController(); setTimeout(()=>c.abort(),1500);
      const r=await (await import('node-fetch')).default(url+'/models',{headers:{Authorization:`Bearer ${getSetting('lmstudio_apiKey',config.lmStudioApiKey)}`}, signal:c.signal as any});
      if(r.ok){ const j:any=await r.json(); if(j.data?.length||j.models?.length){ provider.updateConfig(url,getSetting('lmstudio_apiKey',config.lmStudioApiKey)); setSetting('lmstudio_baseUrl',url); if(j.data?.[0]?.id&&!getSetting('lmstudio_model','')) setSetting('lmstudio_model',j.data[0].id); console.log(`Auto-connected to LM Studio at ${url} (${j.data?.length||0} models)`); return true; } }
    }catch{}
  }
  console.log('LM Studio not found on startup — will retry on requests');
  return false;
}
autoConnect();
setInterval(autoConnect, 15000);

app.get('/api/health', (req,res)=> res.json({ ok:true, workspace: fm.getWorkspace(), lmStudio: getSetting('lmstudio_baseUrl',config.lmStudioBaseUrl) }));
app.use('/api/lmstudio', lmstudioRouter(provider));
app.use('/api/workspace', workspaceRouter(fm,tm,gm));
app.use('/api/sessions', sessionsRouter());
app.get('/api/diagnostics', async (req,res)=>{
  const wsOk = fm.getWorkspace() && require('fs').existsSync(fm.getWorkspace());
  let lm = await provider.testConnection();
  if(!lm.ok) { await autoConnect(); lm = await provider.testConnection(); }
  res.json({
    backend:'connected',
    workspace: fm.getWorkspace(),
    workspaceExists: !!wsOk,
    lmStudio: lm,
    model: getSetting('lmstudio_model',''),
    iterations: config.maxIterations,
    baseUrl: getSetting('lmstudio_baseUrl',config.lmStudioBaseUrl)
  });
});
app.post('/api/lmstudio/autoconnect', async (req,res)=>{ const ok=await autoConnect(); res.json({ok, baseUrl:getSetting('lmstudio_baseUrl',config.lmStudioBaseUrl)}); });

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
