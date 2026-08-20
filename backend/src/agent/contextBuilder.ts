import { FileManager } from '../managers/fileManager';
import fs from 'fs';
import path from 'path';

export class ContextBuilder {
  constructor(private fm: FileManager){}
  private treeCache=new Map<string,{t:number,v:string}>();
  async build(opts:{workspace:string; openFiles?:string[]; currentFile?:string}): Promise<string> {
    const parts:string[]=[];
    parts.push(`Workspace: ${opts.workspace}`);
    try{
      let tree=''; const cached=this.treeCache.get(opts.workspace);
      if(cached && Date.now()-cached.t < 5000) tree=cached.v; else { tree=await this.fm.getProjectTree(2); this.treeCache.set(opts.workspace,{t:Date.now(),v:tree}); }
      parts.push(`Project structure:\n${tree.slice(0,2000)}`);
    }catch{}
    const pkgPath = path.join(opts.workspace,'package.json');
    if(fs.existsSync(pkgPath)){ try{ const pkg=fs.readFileSync(pkgPath,'utf-8').slice(0,1500); parts.push(`package.json:\n${pkg}`);}catch{} }
    if(opts.currentFile){ try{ const c=await this.fm.readFile(opts.currentFile); parts.push(`Current file ${opts.currentFile}:\n\`\`\`\n${c.slice(0,3000)}\n\`\`\``);}catch{} }
    if(opts.openFiles?.length){ for(const f of opts.openFiles.slice(0,2)){ if(f===opts.currentFile) continue; try{ const c=await this.fm.readFile(f); parts.push(`Open file ${f}:\n\`\`\`\n${c.slice(0,1200)}\n\`\`\``);}catch{} } }
    const out=parts.join('\n\n');
    return out.length>6000? out.slice(0,6000)+'\n...[truncated]': out;
  }
  systemPrompt(workspace:string){
    return `You are a professional coding agent operating inside a real IDE. You have access to tools to read/write files, execute commands, search, git, etc.
Rules:
- Always inspect project structure before making changes (list_directory, read_file).
- Make minimal, correct changes. Preserve existing style.
- Use tools to verify: run builds/tests after edits and fix errors iteratively.
- When you need to perform an action, use the tool calling format. If native tool calling is unavailable, use: <tool_call>{"name":"tool_name","arguments":{...}}</tool_call>
- Available tools: read_file, write_file, edit_file, list_directory, search_files, execute_command, get_file_info, git_status, git_diff, run_tests.
- Workspace is sandboxed to: ${workspace}
- Destructive commands (rm -rf, git reset --hard, etc.) require user approval and may be blocked.
- After completing tasks, summarize what changed.
- Be concise and precise.`;
  }
}
