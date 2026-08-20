import { LMStudioProvider } from '../providers/lmstudio';
import { FileManager } from '../managers/fileManager';
import { TerminalManager } from '../managers/terminalManager';
import { GitManager } from '../managers/gitManager';
import { ContextBuilder } from './contextBuilder';
import { toOpenAITools, parseFallbackToolCalls } from '../tools';
import { ChatMessage, ToolCall } from '../providers/base';

const DANGEROUS = [/rm\s+-rf/i, /Remove-Item.*-Recurse/i, /git\s+reset\s+--hard/i, /git\s+push.*--force/i, /git\s+clean\s+-f/i, /del\s+\/s/i];
const isDangerous = (c:string)=>DANGEROUS.some(r=>r.test(c));
const READONLY = new Set(['read_file','list_directory','search_files','get_file_info','git_status','git_diff']);
export class AgentController {
  constructor(private provider:LMStudioProvider, private fm:FileManager, private tm:TerminalManager, private gm:GitManager, private cb:ContextBuilder, private opts:{maxIterations:number}){}
  async *run(o:{sessionId:string;model:string;userMessage:string;history:ChatMessage[];workspace:string;openFiles?:string[];currentFile?:string;approvalPolicy?:string;temperature?:number;maxTokens?:number}): AsyncGenerator<any>{
    const t0=Date.now();
    let messages:ChatMessage[]=[{role:'system', content: this.cb.systemPrompt(o.workspace)+'\n\nContext:\n'+ await this.cb.build({workspace:o.workspace, openFiles:o.openFiles, currentFile:o.currentFile})}];
    messages.push(...o.history.slice(-12));
    messages.push({role:'user', content:o.userMessage});
    const tools=toOpenAITools();
    let iter=0, done=false;
    while(!done && iter < this.opts.maxIterations){
      iter++; yield {type:'status', iteration:iter, max:this.opts.maxIterations, elapsed:Date.now()-t0};
      let assistantText=''; const pending:ToolCall[]=[];
      const streamStart=Date.now();
      const tokenQueue:string[]=[]; let streamDone=false; let streamErr:string|null=null;
      const streamPromise = this.provider.streamChat({
        model:o.model, messages, tools, temperature: o.temperature??0.15, max_tokens: o.maxTokens??2048,
        onToken: t=>{ assistantText+=t; tokenQueue.push(t); },
        onToolCall: tcs=> pending.push(...tcs),
        onDone: ()=>{ streamDone=true; },
        onError: e=>{ streamErr=e; streamDone=true; }
      });
      while(!streamDone || tokenQueue.length){
        if(tokenQueue.length){
          const batch=tokenQueue.splice(0,8).join('');
          if(batch) yield {type:'token', content: batch};
        } else {
          await new Promise(r=>setTimeout(r,18));
        }
        if(streamDone && !tokenQueue.length) break;
        if(streamDone) await streamPromise.catch(()=>{});
      }
      await streamPromise.catch(e=>{ streamErr=e.message; });
      if(streamErr) assistantText+=`\n[Error ${streamErr}]`;
      if(!pending.length){
        const fb=parseFallbackToolCalls(assistantText);
        if(fb.length){ fb.forEach((f,i)=>pending.push({id:`fb_${i}_${Date.now()}`, type:'function', function:{name:f.name, arguments:JSON.stringify(f.args)}})); assistantText=assistantText.replace(/<tool_call>[\s\S]*?<\/tool_call>/g,'').trim(); }
      }
      if(pending.length){
        if(assistantText.trim()) yield {type:'assistant', content:'', toolCalls:pending, streamed:true};
        messages.push({role:'assistant', content:assistantText||'', tool_calls:pending} as any);
        const canParallel = pending.every(tc=> READONLY.has(tc.function.name)) && pending.length>1;
        const execOne = async (tc:ToolCall)=>{
          let args:any={}; try{ args=JSON.parse(tc.function.arguments||'{}'); }catch{}
          let result:string; let blocked=false;
          if((tc.function.name==='execute_command'||tc.function.name==='run_tests') && isDangerous(args.command||'') && o.approvalPolicy==='manual'){ blocked=true; result='Blocked: dangerous command requires approval.'; }
          else { try{ result=await this.executeTool(tc.function.name, args); }catch(e:any){ result=`Error: ${e.message}`; } }
          return {tc, args, result, blocked};
        };
        if(canParallel){
          yield {type:'tool_start', name:'parallel', args:{count:pending.length}};
          const results=await Promise.all(pending.map(execOne));
          for(const r of results){ yield {type:'tool_result', name:r.tc.function.name, result:r.result, id:r.tc.id}; messages.push({role:'tool', content: r.result.slice(0,6000), tool_call_id:r.tc.id} as any); }
        } else {
          for(const tc of pending){
            let args:any={}; try{ args=JSON.parse(tc.function.arguments||'{}'); }catch{}
            yield {type:'tool_start', name:tc.function.name, args, id:tc.id};
            let result:string;
            if((tc.function.name==='execute_command'||tc.function.name==='run_tests') && isDangerous(args.command||'')){ yield {type:'approval_required', tool:tc.function.name, command:args.command, id:tc.id}; result='Blocked: dangerous'; }
            else { try{ result=await this.executeTool(tc.function.name, args);}catch(e:any){result=`Error: ${e.message}`;} }
            const out=result.slice(0,6000);
            yield {type:'tool_result', name:tc.function.name, result:out, id:tc.id};
            messages.push({role:'tool', content:out, tool_call_id:tc.id} as any);
          }
        }
        if(messages.length>24){ const sys=messages[0]; messages=[sys, ...messages.slice(-20)]; }
        continue;
      } else {
        if(assistantText.trim()) yield {type:'done_stream', latency: Date.now()-streamStart};
        else yield {type:'assistant', content:'', final:true};
        done=true;
      }
    }
    if(iter>=this.opts.maxIterations) yield {type:'error', message:'Max iterations reached'};
    yield {type:'done', totalTime: Date.now()-t0};
  }
  private async executeTool(name:string, args:any):Promise<string>{
    switch(name){
      case 'read_file': return (await this.fm.readFile(args.path)).slice(0,8000);
      case 'write_file': await this.fm.writeFile(args.path, args.content); return `Wrote ${args.path} (${args.content.length} chars)`;
      case 'edit_file': await this.fm.editFile(args.path, args.old_text, args.new_text); return `Edited ${args.path}`;
      case 'list_directory': return JSON.stringify(await this.fm.listDirectory(args.path||'.'),null,2).slice(0,5000);
      case 'search_files': return (await this.fm.searchFiles(args.pattern, args.include)).slice(0,5000);
      case 'execute_command': { const r=await this.tm.executeCommand(args.command, this.fm.getWorkspace(), {timeout:25000}); return `EXIT ${r.code}\n${r.stdout.slice(0,4000)}\n${r.stderr.slice(0,2000)}`; }
      case 'get_file_info': return JSON.stringify(await this.fm.getFileInfo(args.path),null,2);
      case 'git_status': { const r=await this.gm.status(); return (r.stdout+r.stderr).slice(0,4000); }
      case 'git_diff': { const r=await this.gm.diff(!!args.staged, args.path); return (r.stdout||r.stderr||'No diff').slice(0,5000); }
      case 'run_tests': { const r=await this.tm.executeCommand(args.command||'npm test 2>&1 | head -n 150', this.fm.getWorkspace(), {timeout:45000}); return `EXIT ${r.code}\n${r.stdout.slice(0,5000)}`; }
      default: throw new Error(`Unknown tool ${name}`);
    }
  }
}
