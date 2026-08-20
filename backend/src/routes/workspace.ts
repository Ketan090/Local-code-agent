import { Router } from 'express';
import { FileManager } from '../managers/fileManager';
import { TerminalManager } from '../managers/terminalManager';
import { GitManager } from '../managers/gitManager';
import { getSetting, setSetting, db } from '../db';
import fs from 'fs';
import path from 'path';

export function workspaceRouter(fm: FileManager, tm: TerminalManager, gm: GitManager){
  const r = Router();
  r.get('/info', (req,res)=>{
    const ws = fm.getWorkspace();
    res.json({ workspace: ws, exists: ws? fs.existsSync(ws): false });
  });
  r.post('/open', (req,res)=>{
    const { path: p } = req.body;
    if(!p) return res.status(400).json({error:'path required'});
    if(!fs.existsSync(p)) return res.status(400).json({error:'path not exists'});
    const stat = fs.statSync(p);
    if(!stat.isDirectory()) return res.status(400).json({error:'not a directory'});
    fm.setWorkspace(p);
    setSetting('workspace', p);
    db.prepare('INSERT OR REPLACE INTO projects(path,name,lastOpened) VALUES(?,?,?)').run(p, path.basename(p), Date.now());
    res.json({ok:true, workspace:p});
  });
  r.get('/files', async (req,res)=>{
    try{
      const p = (req.query.path as string)||'.';
      const list = await fm.listDirectory(p);
      res.json(list);
    }catch(e:any){ res.status(500).json({error:e.message}); }
  });
  r.get('/tree', async (req,res)=>{
    try{ const t = await fm.getProjectTree(3); res.json({tree:t}); }catch(e:any){ res.status(500).json({error:e.message}); }
  });
  r.get('/file', async (req,res)=>{
    try{ const p = req.query.path as string; if(!p) return res.status(400).json({error:'path required'}); const c = await fm.readFile(p); res.json({content:c}); }catch(e:any){ res.status(500).json({error:e.message}); }
  });
  r.post('/file', async (req,res)=>{
    try{ const { path: p, content } = req.body; await fm.writeFile(p, content); res.json({ok:true}); }catch(e:any){ res.status(500).json({error:e.message}); }
  });
  r.post('/edit', async (req,res)=>{
    try{ const { path: p, old_text, new_text } = req.body; await fm.editFile(p, old_text, new_text); res.json({ok:true}); }catch(e:any){ res.status(500).json({error:e.message}); }
  });
  r.get('/search', async (req,res)=>{
    try{ const q=req.query.q as string; const inc=req.query.include as string; if(!q) return res.status(400).json({error:'q required'}); const r2=await fm.searchFiles(q, inc); res.json({results:r2}); }catch(e:any){ res.status(500).json({error:e.message}); }
  });
  r.get('/info-file', async (req,res)=>{
    try{ const p=req.query.path as string; const i=await fm.getFileInfo(p); res.json(i);}catch(e:any){ res.status(500).json({error:e.message}); }
  });
  r.post('/execute', async (req,res)=>{
    try{ const { command } = req.body; if(!command) return res.status(400).json({error:'command required'}); const out=await tm.executeCommand(command, fm.getWorkspace(), {timeout:30000}); res.json(out);}catch(e:any){ res.status(500).json({error:e.message}); }
  });
  r.get('/git/status', async (req,res)=>{ try{ const o=await gm.status(); res.json(o);}catch(e:any){res.status(500).json({error:e.message});}});
  r.get('/git/diff', async (req,res)=>{ try{ const staged=req.query.staged==='true'; const p=req.query.path as string; const o=await gm.diff(staged,p); res.json(o);}catch(e:any){res.status(500).json({error:e.message});}});
  r.get('/git/branches', async (req,res)=>{ try{ const o=await gm.branches(); res.json(o);}catch(e:any){res.status(500).json({error:e.message});}});
  r.post('/git/add', async (req,res)=>{ try{ const {paths}=req.body; const o=await gm.add(paths||['.']); res.json(o);}catch(e:any){res.status(500).json({error:e.message});}});
  r.post('/git/commit', async (req,res)=>{ try{ const {message}=req.body; const o=await gm.commit(message||'update'); res.json(o);}catch(e:any){res.status(500).json({error:e.message});}});
  r.get('/projects', (req,res)=>{
    const rows = db.prepare('SELECT * FROM projects ORDER BY lastOpened DESC').all();
    res.json(rows);
  });
  return r;
}
