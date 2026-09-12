import fetch from 'node-fetch';
import { AIProvider, ChatMessage, ModelInfo, ToolDefinition, ToolCall } from './base';

export class OpencodeProvider extends AIProvider {
  constructor(private baseUrl: string) { super(); }
  private url(p:string){ return this.baseUrl.replace(/\/$/,'')+p; }
  async testConnection(){ try{ const r=await fetch(this.url('/global/health')); if(!r.ok) return {ok:false, error:`${r.status}`}; return {ok:true}; }catch(e:any){ return {ok:false, error:e.message}; } }
  async getModels():Promise<ModelInfo[]>{
    try{
      const r=await fetch(this.url('/config/providers'));
      if(r.ok){ const j:any=await r.json(); const mods=[]; for(const prov of j.providers||[]){ for(const m of prov.models||[]) mods.push({id:`${prov.id}/${m.id}`, object:'model'}); } if(mods.length) return mods; }
    }catch{}
    try{ const r=await fetch(this.url('/provider')); if(r.ok){ const j:any=await r.json(); const mods=[]; for(const p of j.all||[]){ for(const m of p.models||[]) mods.push({id:`${p.id}/${m}`, object:'model'}); } return mods; } }catch{}
    return [{id:'opencode-default', object:'model'}];
  }
  async chatCompletion(opts:{model:string;messages:ChatMessage[];tools?:ToolDefinition[]}):Promise<string>{
    let sid=null; try{ const r=await fetch(this.url('/session'),{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({title:'Local Code Agent'})}); const j:any=await r.json(); sid=j.id||j.session?.id; }catch{}
    if(!sid) throw new Error('Failed to create opencode session');
    const last=opts.messages[opts.messages.length-1];
    const text=typeof last.content==='string'? last.content : (Array.isArray(last.content)? (last.content.find((c:any)=>c.type==='text')?.text||'') : '');
    const r2=await fetch(this.url(`/session/${sid}/message`),{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({parts:[{type:'text', text}], model: opts.model})});
    const j2:any=await r2.json();
    const parts=j2.parts||j2||[]; const txt=Array.isArray(parts)? parts.map((p:any)=>p.text||p.content||'').join('\n') : (j2.content||'');
    return txt||JSON.stringify(j2).slice(0,4000);
  }
  async streamChat(opts:{model:string;messages:ChatMessage[];tools?:ToolDefinition[];onToken:(t:string)=>void;onToolCall?:(tc:ToolCall[])=>void;onDone:()=>void;onError:(e:string)=>void}):Promise<void>{
    try{ const txt=await this.chatCompletion(opts); const chunkSize=24; for(let i=0;i<txt.length;i+=chunkSize){ opts.onToken(txt.slice(i,i+chunkSize)); await new Promise(r=>setTimeout(r,18)); } opts.onDone(); }catch(e:any){ opts.onError(e.message); }
  }
  updateConfig(url:string){ this.baseUrl=url; }
}
