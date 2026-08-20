import { WebSocketServer, WebSocket } from 'ws';
import { AgentController } from './agent/controller';
import { db } from './db';

export function setupWS(wss: WebSocketServer, agent: AgentController, getWorkspace:()=>string){
  wss.on('connection',(ws:WebSocket)=>{
    let sessionId='';
    ws.on('message', async (raw:any)=>{
      try{
        const msg = JSON.parse(raw.toString());
        if(msg.type==='agent:run'){
          const { model, userMessage, history, openFiles, currentFile, temperature, maxTokens } = msg;
          const workspace = getWorkspace();
          if(!workspace) { ws.send(JSON.stringify({type:'error', message:'No workspace selected'})); return; }
          if(!model) { ws.send(JSON.stringify({type:'error', message:'No model selected'})); return; }
          const dbHist = history || [];
          const gen = agent.run({ sessionId: sessionId||msg.sessionId, model, userMessage, history: dbHist, workspace, openFiles, currentFile, temperature, maxTokens, approvalPolicy:'manual' });
          for await (const ev of gen){
            if(ev.type==='assistant' && ev.content){
              ws.send(JSON.stringify({type:'token', content: ev.content, final: ev.final}));
            } else {
              ws.send(JSON.stringify(ev));
            }
            if(ev.type==='tool_result'){
              ws.send(JSON.stringify({type:'file_changed', hint:'refresh'}));
            }
          }
          try{
            const sid = msg.sessionId;
            if(sid){
              db.prepare('UPDATE sessions SET updatedAt=? WHERE id=?').run(Date.now(), sid);
              const mid = Date.now().toString()+Math.random().toString(36).slice(2);
              const mid2 = Date.now().toString()+Math.random().toString(36).slice(2)+'2';
              db.prepare('INSERT OR IGNORE INTO messages(id,sessionId,role,content,createdAt) VALUES(?,?,?,?,?)').run(mid, sid, 'user', userMessage, Date.now());
            }
          }catch{}
        }
        if(msg.type==='ping') ws.send(JSON.stringify({type:'pong'}));
      }catch(e:any){ ws.send(JSON.stringify({type:'error', message:e.message})); }
    });
  });
}
