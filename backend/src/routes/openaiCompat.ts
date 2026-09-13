import { Router } from 'express';
import { getSetting, setSetting } from '../db';
import { config } from '../config';
export function openaiCompatRouter(name:string, provider:any, getActive:()=>any, setActive:(p:any)=>void){
  const r=Router();
  const keyVal = name==='openrouter'?'openrouter_key':name==='xkiro'?'xkiro_key':'uno_key';
  const defKey = name==='openrouter'?config.openrouterKey:name==='xkiro'?config.xkiroApiKey:config.unoKey;
  r.get('/config', (req,res)=> res.json({ hasKey:!!getSetting(keyVal,defKey), provider:getSetting('provider',config.provider)}));
  r.post('/config', (req,res)=>{ const {apiKey, provider:p}=req.body; if(apiKey){ setSetting(keyVal, apiKey); provider.updateConfig('', apiKey); } if(p){ setSetting('provider', p); setActive(name==='openrouter'?provider:getActive()); } res.json({ok:true}); });
  r.post('/config-key', (req,res)=>{ const {apiKey, provider:p}=req.body; if(apiKey){ setSetting(keyVal, apiKey); provider.updateConfig('', apiKey); } if(p){ setSetting('provider', p); setActive(p===name?provider:getActive()); } res.json({ok:true}); });
  r.get('/models', async (req,res)=>{ try{ const ms=await provider.getModels(); res.json({models:ms}); }catch(e:any){ res.status(500).json({error:e.message}); } });
  r.post('/test', async (req,res)=>{ const {apiKey}=req.body; if(apiKey) provider.updateConfig('', apiKey); const ok=await provider.testConnection(); res.json(ok); });
  r.post('/switch', (req,res)=>{ const {provider:p}=req.body; if(p){ setSetting('provider', p); if(p===name) setActive(provider); } res.json({ok:true, provider:getSetting('provider',config.provider)}); });
  return r;
}