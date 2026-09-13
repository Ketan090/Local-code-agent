import { Router } from 'express';
import { getSetting, setSetting } from '../db';
import { config } from '../config';
export function opencodeRouter(provider:any, getActive:()=>any, setActive:(p:any)=>void){
  const r=Router();
  r.get('/config', (req,res)=> res.json({ baseUrl: getSetting('opencode_baseUrl', config.opencodeBaseUrl), provider: getSetting('provider', config.provider)}));
  r.post('/config', (req,res)=>{ const {baseUrl, provider:p}=req.body; if(baseUrl){ setSetting('opencode_baseUrl', baseUrl); provider.updateConfig(baseUrl); } if(p){ setSetting('provider', p); setActive(p==='opencode'?provider:getActive()); } res.json({ok:true}); });
  r.get('/models', async (req,res)=>{ try{ const ms=await provider.getModels(); res.json({models:ms}); }catch(e:any){ res.status(500).json({error:e.message}); } });
  r.post('/test', async (req,res)=>{ const {baseUrl}=req.body; if(baseUrl) provider.updateConfig(baseUrl); const ok=await provider.testConnection(); res.json(ok); });
  r.post('/switch', (req,res)=>{ const {provider:p, baseUrl}=req.body; if(baseUrl){ setSetting('opencode_baseUrl', baseUrl); provider.updateConfig(baseUrl); } if(p){ setSetting('provider', p); if(p==='opencode') setActive(provider); } res.json({ok:true, provider:getSetting('provider',config.provider)}); });
  return r;
}
