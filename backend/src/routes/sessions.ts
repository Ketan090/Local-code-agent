import { Router } from 'express';
import { db } from '../db';
import { v4 as uuid } from 'uuid';

export function sessionsRouter(){
  const r=Router();
  r.get('/', (req,res)=>{
    const rows = db.prepare('SELECT * FROM sessions ORDER BY updatedAt DESC').all();
    res.json(rows);
  });
  r.post('/', (req,res)=>{
    const { projectPath, model, title } = req.body;
    const id=uuid();
    const now=Date.now();
    db.prepare('INSERT INTO sessions(id,projectPath,model,title,createdAt,updatedAt) VALUES(?,?,?,?,?,?)').run(id, projectPath||'', model||'', title||'New Session', now, now);
    res.json({id});
  });
  r.get('/:id', (req,res)=>{
    const s=db.prepare('SELECT * FROM sessions WHERE id=?').get(req.params.id);
    if(!s) return res.status(404).json({error:'not found'});
    const msgs=db.prepare('SELECT * FROM messages WHERE sessionId=? ORDER BY createdAt ASC').all(req.params.id);
    res.json({ session:s, messages:msgs });
  });
  r.delete('/:id', (req,res)=>{
    db.prepare('DELETE FROM messages WHERE sessionId=?').run(req.params.id);
    db.prepare('DELETE FROM sessions WHERE id=?').run(req.params.id);
    res.json({ok:true});
  });
  r.put('/:id', (req,res)=>{
    const { title, model }=req.body;
    if(title) db.prepare('UPDATE sessions SET title=?, updatedAt=? WHERE id=?').run(title, Date.now(), req.params.id);
    if(model) db.prepare('UPDATE sessions SET model=?, updatedAt=? WHERE id=?').run(model, Date.now(), req.params.id);
    res.json({ok:true});
  });
  r.post('/:id/messages', (req,res)=>{
    const { role, content, toolCalls }=req.body;
    const id=uuid();
    db.prepare('INSERT INTO messages(id,sessionId,role,content,toolCalls,createdAt) VALUES(?,?,?,?,?,?)').run(id, req.params.id, role, content, toolCalls?JSON.stringify(toolCalls):null, Date.now());
    db.prepare('UPDATE sessions SET updatedAt=? WHERE id=?').run(Date.now(), req.params.id);
    res.json({id});
  });
  return r;
}
