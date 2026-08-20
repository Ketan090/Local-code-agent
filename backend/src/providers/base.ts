export interface ModelInfo { id: string; object: string; created?: number; owned_by?: string; }
export interface ChatMessage { role: 'system'|'user'|'assistant'|'tool'; content: string; tool_calls?: ToolCall[]; tool_call_id?: string; name?: string }
export interface ToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }
export interface ToolDefinition { type: 'function'; function: { name: string; description: string; parameters: any } }
export interface StreamChunk { choices: { delta: { content?: string; tool_calls?: any[] }; finish_reason?: string }[] }

export abstract class AIProvider {
  abstract getModels(): Promise<ModelInfo[]>;
  abstract chatCompletion(opts: { model: string; messages: ChatMessage[]; tools?: ToolDefinition[]; stream?: boolean; temperature?: number; max_tokens?: number }): Promise<string>;
  abstract streamChat(opts: { model: string; messages: ChatMessage[]; tools?: ToolDefinition[]; temperature?: number; max_tokens?: number; onToken: (t:string)=>void; onToolCall?: (tc:ToolCall[])=>void; onDone: ()=>void; onError: (e:string)=>void; signal?: AbortSignal }): Promise<void>;
  abstract testConnection(): Promise<{ok:boolean; error?:string}>;
}
