import { spawn, ChildProcess } from 'child_process';
import path from 'path';

export interface TerminalSession { id:string; process: ChildProcess; workspace:string; }
export class TerminalManager {
  private sessions = new Map<string, TerminalSession>();
  async executeCommand(command: string, workspace: string, opts?:{timeout?:number}): Promise<{stdout:string,stderr:string,code:number|null,signal:string|null}> {
    return new Promise(resolve=>{
      const shell = process.platform==='win32' ? 'powershell.exe' : 'bash';
      const args = process.platform==='win32' ? ['-NoProfile','-Command', command] : ['-lc', command];
      const child = spawn(shell, args, { cwd: workspace||process.cwd(), env: process.env, windowsHide:true });
      let stdout='', stderr='';
      child.stdout?.on('data', d=> stdout+=d.toString());
      child.stderr?.on('data', d=> stderr+=d.toString());
      const timer = opts?.timeout ? setTimeout(()=>{ try{child.kill();}catch{} }, opts.timeout) : null;
      child.on('close', (code,signal)=>{ if(timer) clearTimeout(timer); resolve({stdout:stdout.slice(0,20000), stderr:stderr.slice(0,20000), code, signal:signal as any}); });
      child.on('error', e=> resolve({stdout, stderr:String(e), code:1, signal:null}));
    });
  }
  createPty(id:string, workspace:string, cols=80, rows=24): ChildProcess {
    try{
      const pty = require('node-pty');
      const shell = process.platform==='win32' ? 'powershell.exe' : (process.env.SHELL||'bash');
      const p = pty.spawn(shell, [], { name:'xterm-color', cols, rows, cwd: workspace||process.cwd(), env: process.env });
      this.sessions.set(id, {id, process:p as any, workspace});
      return p;
    }catch{
      const child = spawn(process.platform==='win32'?'powershell.exe':'bash', [], { cwd:workspace });
      this.sessions.set(id,{id, process:child, workspace});
      return child;
    }
  }
  get(id:string){ return this.sessions.get(id); }
  kill(id:string){ const s=this.sessions.get(id); if(s){ try{s.process.kill();}catch{} this.sessions.delete(id);} }
}
