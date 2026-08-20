import path from 'path';
import fs from 'fs';

let _db:any=null;
let useFallback=false;
let fallbackData:any={settings:{},sessions:[],messages:[],projects:[]};
const fallbackFile=path.join(__dirname,'../../data.json');

function loadFallback(){
  try{ if(fs.existsSync(fallbackFile)) fallbackData=JSON.parse(fs.readFileSync(fallbackFile,'utf-8')); }catch{}
}
function saveFallback(){ try{ fs.writeFileSync(fallbackFile, JSON.stringify(fallbackData,null,2)); }catch{} }
loadFallback();
try{
  const Database=require('better-sqlite3');
  const dbPath=path.join(__dirname,'../../data.db');
  fs.mkdirSync(path.dirname(dbPath),{recursive:true});
  _db=new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, projectPath TEXT, model TEXT, title TEXT, createdAt INTEGER, updatedAt INTEGER);
CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, sessionId TEXT, role TEXT, content TEXT, toolCalls TEXT, createdAt INTEGER, FOREIGN KEY(sessionId) REFERENCES sessions(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS projects (path TEXT PRIMARY KEY, name TEXT, lastOpened INTEGER);
`);
}catch(e){ useFallback=true; console.warn('better-sqlite3 not available, using JSON fallback', (e as any).message); }

function fallbackPrepare(sql:string){
  return {
    get:(...args:any[])=>{
      if(sql.includes('SELECT value FROM settings')){ const k=args[0]; return fallbackData.settings[k]? {value:fallbackData.settings[k]}: undefined; }
      if(sql.includes('SELECT * FROM sessions WHERE id=')){ return fallbackData.sessions.find((s:any)=>s.id===args[0]); }
      return undefined;
    },
    all:(...args:any[])=>{
      if(sql.includes('SELECT * FROM sessions ORDER BY')) return [...fallbackData.sessions].sort((a:any,b:any)=>b.updatedAt-a.updatedAt);
      if(sql.includes('SELECT * FROM messages WHERE sessionId=')) return fallbackData.messages.filter((m:any)=>m.sessionId===args[0]).sort((a:any,b:any)=>a.createdAt-b.createdAt);
      if(sql.includes('SELECT * FROM sessions WHERE id=')) { const s=fallbackData.sessions.find((x:any)=>x.id===args[0]); return s?[s]:[]; }
      if(sql.includes('SELECT * FROM projects')) return [...fallbackData.projects].sort((a:any,b:any)=>b.lastOpened-a.lastOpened);
      if(sql.includes('SELECT * FROM messages WHERE sessionId=')) return fallbackData.messages.filter((m:any)=>m.sessionId===args[0]);
      return [];
    },
    run:(...args:any[])=>{
      if(sql.includes('INSERT OR REPLACE INTO settings')){ fallbackData.settings[args[0]]=args[1]; saveFallback(); }
      else if(sql.includes('INSERT INTO sessions')){ fallbackData.sessions.push({id:args[0], projectPath:args[1], model:args[2], title:args[3], createdAt:args[4], updatedAt:args[5]}); saveFallback(); }
      else if(sql.includes('INSERT INTO messages')){ fallbackData.messages.push({id:args[0], sessionId:args[1], role:args[2], content:args[3], toolCalls:args[4], createdAt:args[5]}); saveFallback(); }
      else if(sql.includes('INSERT OR REPLACE INTO projects')){ const idx=fallbackData.projects.findIndex((p:any)=>p.path===args[0]); const row={path:args[0], name:args[1], lastOpened:args[2]}; if(idx>=0) fallbackData.projects[idx]=row; else fallbackData.projects.push(row); saveFallback(); }
      else if(sql.includes('UPDATE sessions SET updatedAt')){ const s=fallbackData.sessions.find((x:any)=>x.id===args[1]); if(s) s.updatedAt=args[0]; saveFallback(); }
      else if(sql.includes('UPDATE sessions SET title')){ const s=fallbackData.sessions.find((x:any)=>x.id===args[2]); if(s) s.title=args[0]; if(s) s.updatedAt=args[1]; saveFallback(); }
      else if(sql.includes('UPDATE sessions SET model')){ const s=fallbackData.sessions.find((x:any)=>x.id===args[2]); if(s) s.model=args[0]; if(s) s.updatedAt=args[1]; saveFallback(); }
      else if(sql.includes('DELETE FROM messages WHERE sessionId')){ fallbackData.messages=fallbackData.messages.filter((m:any)=>m.sessionId!==args[0]); saveFallback(); }
      else if(sql.includes('DELETE FROM sessions WHERE id')){ fallbackData.sessions=fallbackData.sessions.filter((s:any)=>s.id!==args[0]); saveFallback(); }
      return {};
    }
  };
}
export const db:any = useFallback ? { prepare: fallbackPrepare, exec:()=>{}, pragma:()=>{} } : _db;
export function getSetting(key:string, fallback=''):string{
  const row=db.prepare('SELECT value FROM settings WHERE key=?').get(key) as any;
  return row?.value ?? fallback;
}
export function setSetting(key:string, value:string){
  db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').run(key,value);
}
