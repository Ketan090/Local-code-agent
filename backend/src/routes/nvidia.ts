import { Router } from 'express';
import { getSetting, setSetting } from '../db';
import { config } from '../config';
export function nvidiaRouter(provider:any, getActive:()=>any, setActive:(p:any)=>void){
  const r=Router();
  r.get('/config', (req,res)=> res.json({ baseUrl:getSetting('nvidia_baseUrl',config.nvidiaBaseUrl), hasKey: !!getSetting('nvidia_apiKey',config.nvidiaApiKey), provider:getSetting('provider',config.provider)}));
  r.post('/config', (req,res)=>{ const {baseUrl, apiKey, provider:p}=req.body; if(baseUrl){ setSetting('nvidia_baseUrl', baseUrl); provider.updateConfig(baseUrl, apiKey||getSetting('nvidia_apiKey','')); } if(apiKey){ setSetting('nvidia_apiKey', apiKey); provider.updateConfig(getSetting('nvidia_baseUrl',config.nvidiaBaseUrl), apiKey); } if(p){ setSetting('provider', p); setActive(p==='nvidia'?provider:getActive()); } res.json({ok:true}); });
  r.get('/models', async (req,res)=>{ try{ const ms=await provider.getModels(); res.json({models:ms}); }catch(e:any){ res.status(500).json({error:e.message}); } });
  r.post('/test', async (req,res)=>{ const {baseUrl, apiKey}=req.body; if(baseUrl||apiKey) provider.updateConfig(baseUrl||getSetting('nvidia_baseUrl',config.nvidiaBaseUrl), apiKey||getSetting('nvidia_apiKey','')); const ok=await provider.testConnection(); res.json(ok); });
  r.post('/switch', (req,res)=>{ const {provider:p}=req.body; if(p){ setSetting('provider', p); if(p==='nvidia') setActive(provider); } res.json({ok:true, provider:getSetting('provider',config.provider)}); });
  return r;
}
