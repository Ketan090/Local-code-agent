import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

export class FileManager {
  constructor(private workspace: string) {}
  setWorkspace(p: string){ this.workspace=p; }
  getWorkspace(){ return this.workspace; }

  private resolve(p: string): string {
    const abs = path.resolve(this.workspace, p);
    const rel = path.relative(this.workspace, abs);
    if (rel.startsWith('..') || path.isAbsolute(rel) && rel.includes('..')) throw new Error('Path traversal denied');
    if (!abs.startsWith(path.resolve(this.workspace))) throw new Error('Path traversal denied');
    return abs;
  }

  async readFile(p: string): Promise<string> {
    const abs = this.resolve(p);
    return fs.promises.readFile(abs, 'utf-8');
  }
  async writeFile(p: string, content: string): Promise<void> {
    const abs = this.resolve(p);
    await fs.promises.mkdir(path.dirname(abs), { recursive: true });
    await fs.promises.writeFile(abs, content, 'utf-8');
  }
  async editFile(p: string, oldText: string, newText: string): Promise<void> {
    const abs = this.resolve(p);
    const cur = await fs.promises.readFile(abs, 'utf-8');
    if (!cur.includes(oldText)) throw new Error('old_text not found');
    const next = cur.replace(oldText, newText);
    await fs.promises.writeFile(abs, next, 'utf-8');
  }
  async listDirectory(p: string): Promise<any[]> {
    const abs = this.resolve(p || '.');
    const entries = await fs.promises.readdir(abs, { withFileTypes: true });
    return entries.map(e=>({ name:e.name, isDirectory:e.isDirectory(), isFile:e.isFile(), path: path.relative(this.workspace, path.join(abs,e.name)).replace(/\\/g,'/') }));
  }
  async getFileInfo(p: string): Promise<any> {
    const abs = this.resolve(p);
    const st = await fs.promises.stat(abs);
    return { path:p, size:st.size, mtime:st.mtimeMs, isDirectory:st.isDirectory(), isFile:st.isFile() };
  }
  async searchFiles(pattern: string, include?: string): Promise<string> {
    const start=Date.now();
    const extFilter = include ? new RegExp(include.replace(/\*/g,'.*').replace(/\?/g,'.')) : null;
    const results:string[]=[]; const needle=pattern.toLowerCase();
    const walk = async (dir:string)=>{
      if(Date.now()-start>2500 || results.length>=100) return;
      let entries:fs.Dirent[]; try{ entries=await fs.promises.readdir(dir,{withFileTypes:true}); }catch{ return; }
      for(const e of entries){
        if(e.name.startsWith('.')||e.name==='node_modules'||e.name==='dist'||e.name==='.git') continue;
        const full=path.join(dir,e.name);
        if(e.isDirectory()){ await walk(full); continue; }
        if(extFilter && !extFilter.test(e.name)) continue;
        if(results.length>=100) break;
        try{
          const content=await fs.promises.readFile(full,'utf-8');
          const lines=content.split('\n');
          for(let i=0;i<lines.length;i++) if(lines[i].toLowerCase().includes(needle)){ results.push(`${path.relative(this.workspace,full).replace(/\\/g,'/')}:${i+1}:${lines[i].trim().slice(0,120)}`); if(results.length>=100) break; }
        }catch{}
      }
    };
    await walk(this.workspace);
    return results.length? results.join('\n').slice(0,5000) : 'No matches';
  }
  async getProjectTree(maxDepth=3): Promise<string> {
    const walk = async (dir:string, depth:number, prefix:string): Promise<string[]> => {
      if (depth>maxDepth) return [];
      let out:string[]=[];
      try{
        const entries = await fs.promises.readdir(dir, {withFileTypes:true});
        for (const e of entries) {
          if (e.name.startsWith('.')||e.name==='node_modules'||e.name==='dist') continue;
          const full=path.join(dir,e.name);
          out.push(prefix+e.name+(e.isDirectory()?'/':''));
          if (e.isDirectory()) out.push(...await walk(full,depth+1,prefix+'  '));
          if (out.length>200) break;
        }
      }catch{}
      return out;
    };
    const lines = await walk(this.workspace,0,'');
    return lines.join('\n');
  }
}
