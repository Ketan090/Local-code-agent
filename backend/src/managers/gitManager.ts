import { TerminalManager } from './terminalManager';
export class GitManager {
  constructor(private tm: TerminalManager, private getWorkspace:()=>string){}
  private ws(){ return this.getWorkspace(); }
  async status(){ return this.tm.executeCommand('git status --porcelain -b', this.ws()); }
  async diff(staged=false, p?:string){ const cmd = staged? `git diff --staged ${p||''}` : `git diff ${p||''}`; return this.tm.executeCommand(cmd.trim(), this.ws()); }
  async branches(){ return this.tm.executeCommand('git branch -a', this.ws()); }
  async log(){ return this.tm.executeCommand('git log --oneline -20', this.ws()); }
  async add(paths:string[]){ return this.tm.executeCommand(`git add ${paths.map(p=>`"${p}"`).join(' ')}`, this.ws()); }
  async commit(msg:string){ return this.tm.executeCommand(`git commit -m "${msg.replace(/"/g,'\\"')}"`, this.ws()); }
}
