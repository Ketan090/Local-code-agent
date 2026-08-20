import { Router } from 'express';
import { LMStudioProvider } from '../providers/lmstudio';
import { getSetting, setSetting } from '../db';
import { config } from '../config';

export function lmstudioRouter(provider: LMStudioProvider){
  const r = Router();
  r.get('/config', (req,res)=>{
    res.json({
      baseUrl: getSetting('lmstudio_baseUrl', config.lmStudioBaseUrl),
      apiKey: getSetting('lmstudio_apiKey', config.lmStudioApiKey),
      model: getSetting('lmstudio_model', config.defaultModel),
      temperature: parseFloat(getSetting('temperature', String(config.temperature))),
      maxTokens: parseInt(getSetting('maxTokens', String(config.maxTokens)),10),
      streaming: getSetting('streaming', String(config.streaming))==='true'
    });
  });
  r.post('/config', (req,res)=>{
    const { baseUrl, apiKey, model, temperature, maxTokens, streaming } = req.body;
    if(baseUrl) setSetting('lmstudio_baseUrl', baseUrl);
    if(apiKey!==undefined) setSetting('lmstudio_apiKey', apiKey);
    if(model!==undefined) setSetting('lmstudio_model', model);
    if(temperature!==undefined) setSetting('temperature', String(temperature));
    if(maxTokens!==undefined) setSetting('maxTokens', String(maxTokens));
    if(streaming!==undefined) setSetting('streaming', String(streaming));
    if(baseUrl||apiKey) provider.updateConfig(baseUrl||getSetting('lmstudio_baseUrl',config.lmStudioBaseUrl), apiKey??getSetting('lmstudio_apiKey',config.lmStudioApiKey));
    res.json({ok:true});
  });
  r.get('/models', async (req,res)=>{
    try{
      const baseUrl = getSetting('lmstudio_baseUrl', config.lmStudioBaseUrl);
      const apiKey = getSetting('lmstudio_apiKey', config.lmStudioApiKey);
      provider.updateConfig(baseUrl, apiKey);
      const models = await provider.getModels();
      res.json({ models, baseUrl });
    }catch(e:any){ res.status(500).json({error:e.message}); }
  });
  r.post('/test', async (req,res)=>{
    const { baseUrl, apiKey } = req.body;
    const bu = baseUrl||getSetting('lmstudio_baseUrl',config.lmStudioBaseUrl);
    const ak = apiKey??getSetting('lmstudio_apiKey',config.lmStudioApiKey);
    provider.updateConfig(bu,ak);
    const result = await provider.testConnection();
    res.json(result);
  });
  r.post('/chat', async (req,res)=>{
    try{
      const { model, messages, temperature, max_tokens } = req.body;
      const m = model||getSetting('lmstudio_model',config.defaultModel);
      if(!m) return res.status(400).json({error:'No model selected'});
      const text = await provider.chatCompletion({ model:m, messages, temperature, max_tokens });
      res.json({ content:text });
    }catch(e:any){ res.status(500).json({error:e.message}); }
  });
  return r;
}
