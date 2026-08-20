export interface ToolDef { name: string; description: string; parameters: any; }
export const TOOL_DEFINITIONS: ToolDef[] = [
  { name: 'read_file', description: 'Read file contents. Path is relative to workspace.', parameters: { type:'object', properties:{ path:{type:'string', description:'Relative file path'} }, required:['path'] } },
  { name: 'write_file', description: 'Create or overwrite a file with content.', parameters: { type:'object', properties:{ path:{type:'string'}, content:{type:'string'} }, required:['path','content'] } },
  { name: 'edit_file', description: 'Edit file by replacing exact old_text with new_text. Fails if old_text not found.', parameters: { type:'object', properties:{ path:{type:'string'}, old_text:{type:'string'}, new_text:{type:'string'} }, required:['path','old_text','new_text'] } },
  { name: 'list_directory', description: 'List files and directories in a path. Use \".\" for root.', parameters: { type:'object', properties:{ path:{type:'string'} }, required:['path'] } },
  { name: 'search_files', description: 'Search for text pattern across files. Returns matching file:line.', parameters: { type:'object', properties:{ pattern:{type:'string'}, include:{type:'string', description:'Glob like *.ts'} }, required:['pattern'] } },
  { name: 'execute_command', description: 'Execute a shell command in workspace directory. Returns stdout/stderr.', parameters: { type:'object', properties:{ command:{type:'string'} }, required:['command'] } },
  { name: 'get_file_info', description: 'Get file metadata (size, modified, isDir).', parameters: { type:'object', properties:{ path:{type:'string'} }, required:['path'] } },
  { name: 'git_status', description: 'Run git status --porcelain', parameters: { type:'object', properties:{}, required:[] } },
  { name: 'git_diff', description: 'Run git diff. Optional staged flag.', parameters: { type:'object', properties:{ staged:{type:'boolean'}, path:{type:'string'} }, required:[] } },
  { name: 'run_tests', description: 'Run tests (npm test if available, else try pytest/python).', parameters: { type:'object', properties:{ command:{type:'string'} }, required:[] } },
];

export function toOpenAITools() {
  return TOOL_DEFINITIONS.map(t=>({ type:'function' as const, function:{ name:t.name, description:t.description, parameters:t.parameters }}));
}

export function parseFallbackToolCalls(text: string): {name:string, args:any}[] {
  const results:{name:string,args:any}[]=[];
  const regex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
  let m;
  while ((m=regex.exec(text))!==null) {
    try { const j=JSON.parse(m[1]); if(j.name) results.push({name:j.name, args:j.arguments||j.args||{}}); } catch {}
  }
  const jsonRegex = /```tool\s*([\s\S]*?)```/g;
  while ((m=jsonRegex.exec(text))!==null) {
    try { const j=JSON.parse(m[1]); if(j.name) results.push({name:j.name, args:j.arguments||{}}); } catch {}
  }
  return results;
}
