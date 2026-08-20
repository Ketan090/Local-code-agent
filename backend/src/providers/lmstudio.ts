import fetch from 'node-fetch';
import { AIProvider, ChatMessage, ModelInfo, ToolDefinition, ToolCall } from './base';

export class LMStudioProvider extends AIProvider {
  constructor(private baseUrl: string, private apiKey: string) { super(); }
  private url(p: string) { return this.baseUrl.replace(/\/$/, '') + p; }
  private headers(): any { return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` }; }

  private modelCache:{t:number,v:ModelInfo[]}|null=null;
  async testConnection() {
    try {
      const ctrl=new AbortController(); const to=setTimeout(()=>ctrl.abort(),3000);
      const r = await fetch(this.url('/models'), { headers: this.headers(), signal: ctrl.signal as any });
      clearTimeout(to);
      if (!r.ok) return { ok: false, error: `${r.status} ${r.statusText}` };
      return { ok: true };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }
  async getModels(): Promise<ModelInfo[]> {
    if(this.modelCache && Date.now()-this.modelCache.t < 10000) return this.modelCache.v;
    const r = await fetch(this.url('/models'), { headers: this.headers() });
    if (!r.ok) throw new Error(`Failed to fetch models: ${r.status}`);
    const j: any = await r.json();
    const v=j.data || j.models || [];
    this.modelCache={t:Date.now(), v};
    return v;
  }
  async chatCompletion(opts: { model: string; messages: ChatMessage[]; tools?: ToolDefinition[]; stream?: boolean; temperature?: number; max_tokens?: number }): Promise<string> {
    const body:any = { model: opts.model, messages: opts.messages, temperature: opts.temperature ?? 0.2, max_tokens: opts.max_tokens, stream: false };
    if (opts.tools?.length) body.tools = opts.tools;
    const r = await fetch(this.url('/chat/completions'), { method: 'POST', headers: this.headers(), body: JSON.stringify(body) });
    if (!r.ok) throw new Error(await r.text());
    const j:any = await r.json();
    return j.choices?.[0]?.message?.content || '';
  }
  async streamChat(opts: { model: string; messages: ChatMessage[]; tools?: ToolDefinition[]; temperature?: number; max_tokens?: number; onToken:(t:string)=>void; onToolCall?:(tc:ToolCall[])=>void; onDone:()=>void; onError:(e:string)=>void; signal?: AbortSignal }): Promise<void> {
    const body:any = { model: opts.model, messages: opts.messages, temperature: opts.temperature ?? 0.2, max_tokens: opts.max_tokens, stream: true };
    if (opts.tools?.length) body.tools = opts.tools;
    body.tool_choice = opts.tools?.length ? 'auto' : undefined;
    try {
      const r: any = await fetch(this.url('/chat/completions'), { method: 'POST', headers: this.headers(), body: JSON.stringify(body), signal: opts.signal as any });
      if (!r.ok) { opts.onError(await r.text()); return; }
      const textStream = r.body;
      let buffer = '';
      let toolCallBuffer: any[] = [];
      let toolCallMap = new Map<number, any>();
      for await (const chunk of textStream) {
        const str = chunk.toString();
        buffer += str;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') { opts.onDone(); return; }
          try {
            const j = JSON.parse(data);
            const delta = j.choices?.[0]?.delta;
            if (!delta) continue;
            if (delta.content) opts.onToken(delta.content);
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (!toolCallMap.has(idx)) toolCallMap.set(idx, { id: tc.id || `call_${idx}`, type: 'function', function: { name: tc.function?.name || '', arguments: tc.function?.arguments || '' } });
                else {
                  const cur = toolCallMap.get(idx);
                  if (tc.function?.name) cur.function.name = tc.function.name;
                  if (tc.function?.arguments) cur.function.arguments += tc.function.arguments;
                }
              }
            }
            if (j.choices?.[0]?.finish_reason === 'tool_calls') {
              const calls = Array.from(toolCallMap.values());
              if (calls.length && opts.onToolCall) opts.onToolCall(calls);
              toolCallMap.clear();
            }
            if (j.choices?.[0]?.finish_reason) {
              const remaining = Array.from(toolCallMap.values());
              if (remaining.length && opts.onToolCall) opts.onToolCall(remaining);
            }
          } catch {}
        }
      }
      if (toolCallMap.size) {
        const calls = Array.from(toolCallMap.values());
        if (opts.onToolCall) opts.onToolCall(calls);
      }
      opts.onDone();
    } catch (e:any) {
      if (e.name === 'AbortError') return;
      opts.onError(e.message);
    }
  }
  updateConfig(baseUrl: string, apiKey: string) { this.baseUrl = baseUrl; this.apiKey = apiKey; }
}
