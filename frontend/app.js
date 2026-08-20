const API = location.origin;
let ws=null, editor=null, monacoLoaded=false, currentFile=null, openTabs=new Map(), workspace='';
let currentSession=null, chatHistory=[], modelList=[];
let fileTreeCache=[];

const $=s=>document.querySelector(s);
function logTerminal(t){ const el=$('#terminal'); el.textContent+=t+'\n'; el.scrollTop=el.scrollHeight; }

async function api(path, opts={}){ const r=await fetch(API+path, {headers:{'Content-Type':'application/json'}, ...opts}); const j=await r.json().catch(()=>({})); if(!r.ok) throw new Error(j.error||r.statusText); return j; }

async function loadConfig(){
  try{ const c=await api('/api/lmstudio/config'); $('#sBaseUrl').value=c.baseUrl; $('#sTemp').value=c.temperature; $('#sMaxTokens').value=c.maxTokens; if(c.apiKey) $('#sApiKey').value=c.apiKey; if(!localStorage.getItem('lm_firstRunDone') && !c.baseUrl) $('#firstRun').classList.remove('hidden'); }catch{}
}
async function refreshModels(){
  $('#lmStatus').textContent='○ Connecting...'; $('#lmStatus').className='status off';
  try{
    const {models, baseUrl} = await api('/api/lmstudio/models');
    modelList=models;
    const sel=$('#modelSelect'); sel.innerHTML='';
    if(!models.length) sel.innerHTML='<option>No models</option>';
    else models.forEach(m=>{ const o=document.createElement('option'); o.value=m.id; o.textContent=m.id; sel.appendChild(o); });
    const cfg=await api('/api/lmstudio/config'); if(cfg.model) sel.value=cfg.model;
    $('#lmStatus').textContent='● Connected'; $('#lmStatus').className='status on';
    logTerminal(`LM Studio models: ${models.map(m=>m.id).join(', ')}`);
  }catch(e){ $('#lmStatus').textContent='○ Offline'; $('#lmStatus').className='status off'; logTerminal('LM Studio offline: '+e.message); }
}
async function testConnection(){
  const baseUrl=$('#sBaseUrl').value, apiKey=$('#sApiKey').value;
  try{ const r=await api('/api/lmstudio/test',{method:'POST', body:JSON.stringify({baseUrl,apiKey})}); $('#settingsStatus').textContent=r.ok?'● Connected':'○ Failed: '+(r.error||''); }catch(e){ $('#settingsStatus').textContent='Error: '+e.message; }
}
async function saveSettings(){
  const baseUrl=$('#sBaseUrl').value, apiKey=$('#sApiKey').value, temperature=parseFloat($('#sTemp').value), maxTokens=parseInt($('#sMaxTokens').value,10);
  await api('/api/lmstudio/config',{method:'POST', body:JSON.stringify({baseUrl,apiKey,temperature,maxTokens})});
  await refreshModels(); $('#settingsStatus').textContent='Saved'; setTimeout(()=>$('#settingsModal').classList.add('hidden'),600);
}
async function loadWorkspace(){
  try{ const {workspace:ws}=await api('/api/workspace/info'); if(ws){ workspace=ws; $('#projLabel').textContent=ws.split(/[\\/]/).pop()||ws; $('#workspaceInput').value=ws; renderTree(); loadGit(); } }catch{}
}
async function setWorkspace(){
  const p=$('#workspaceInput').value.trim(); if(!p) return;
  try{ await api('/api/workspace/open',{method:'POST', body:JSON.stringify({path:p})}); workspace=p; $('#projLabel').textContent=p.split(/[\\/]/).pop(); renderTree(); loadGit(); logTerminal('Workspace: '+p); }catch(e){ alert(e.message); }
}
async function renderTree(path='.'){
  try{
    const list=await api('/api/workspace/files?path='+encodeURIComponent(path));
    const tree=$('#fileTree');
    if(path==='.'){ tree.innerHTML=''; fileTreeCache=list; }
    tree.innerHTML=list.map(f=>`<div class="item ${f.isDirectory?'dir':''}" data-path="${f.path}" data-dir="${f.isDirectory}">${f.isDirectory?'📁 ':'📄 '}${f.name}</div>`).join('');
    tree.querySelectorAll('.item').forEach(el=>{
      el.onclick=async()=>{
        const p=el.dataset.path, isDir=el.dataset.dir==='true';
        if(isDir){ renderTree(p); } else { openFile(p); }
      };
    });
  }catch(e){ $('#fileTree').textContent=e.message; }
}
async function openFile(p){
  try{
    const {content}=await api('/api/workspace/file?path='+encodeURIComponent(p));
    currentFile=p;
    if(!openTabs.has(p)) addTab(p);
    setActiveTab(p);
    if(monacoLoaded && editor) { const model=monaco.editor.createModel(content, langFromPath(p)); editor.setModel(model); }
    else { $('#editor').textContent=content; }
  }catch(e){ logTerminal('read_file error '+e.message); }
}
function langFromPath(p){ if(p.endsWith('.ts')||p.endsWith('.tsx')) return 'typescript'; if(p.endsWith('.py')) return 'python'; if(p.endsWith('.json')) return 'json'; if(p.endsWith('.md')) return 'markdown'; if(p.endsWith('.css')) return 'css'; if(p.endsWith('.html')) return 'html'; return 'javascript'; }
function addTab(p){
  openTabs.set(p,true);
  const tabs=$('#tabs'); const tab=document.createElement('div'); tab.className='tab'; tab.dataset.path=p; tab.innerHTML=`<span>${p.split('/').pop()}</span><span class="close">×</span>`;
  tab.onclick=(e)=>{ if((e.target).classList.contains('close')){ openTabs.delete(p); tab.remove(); if(currentFile===p){ currentFile=null; if(editor) editor.setValue(''); }} else openFile(p); };
  tabs.appendChild(tab);
}
function setActiveTab(p){ document.querySelectorAll('.tab').forEach(t=> t.classList.toggle('active', t.dataset.path===p)); }

async function loadGit(){
  try{ const s=await api('/api/workspace/git/status'); $('#gitPanel').textContent=(s.stdout||'')+(s.stderr||'')||'Clean'; }catch{ $('#gitPanel').textContent='Git not available'; }
}

function initMonaco(){
  try{
    require.config({paths:{vs:'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs'}});
    require(['vs/editor/editor.main'], ()=>{
      monacoLoaded=true;
      editor=monaco.editor.create($('#editor'),{value:'// Open a file\n', language:'typescript', theme:'vs-dark', automaticLayout:true});
      editor.onDidChangeModelContent(()=>{ const tab=document.querySelector('.tab.active'); if(tab) tab.style.fontStyle='italic'; });
    });
  }catch(e){ console.warn('monaco failed',e); }
}

function connectWS(){
  const proto=location.protocol==='https:'?'wss:':'ws:';
  ws=new WebSocket(proto+'//'+location.host+'/ws');
  ws.onopen=()=> logTerminal('WS connected');
  ws.onmessage=(ev)=>{
    try{
      const m=JSON.parse(ev.data);
      if(m.type==='token'){ appendAssistant(m.content, !m.final); }
      else if(m.type==='assistant' && m.content){ appendAssistant(m.content, !m.final); if(m.toolCalls) logActivity('Tool calls: '+m.toolCalls.map(t=>t.function.name).join(', ')); }
      else if(m.type==='tool_start'){ addChat('tool', `▶ ${m.name} ${JSON.stringify(m.args).slice(0,400)}`); logActivity('● '+m.name); }
      else if(m.type==='tool_result'){ addChat('tool', `◀ ${m.name}: ${(m.result||'').slice(0,800)}`); logActivity('✓ '+m.name); if(m.name.includes('write')||m.name.includes('edit')) setTimeout(()=>{ renderTree(); if(currentFile) openFile(currentFile); loadGit(); },300); }
      else if(m.type==='status'){ $('#agentStatus').textContent=`Thinking... ${m.iteration}/${m.max}`; }
      else if(m.type==='done'){ $('#agentStatus').textContent='Idle'; logActivity('Done'); }
      else if(m.type==='error'){ addChat('assistant','Error: '+m.message); $('#agentStatus').textContent='Error'; }
      else if(m.type==='approval_required'){ if(confirm(`Agent wants to execute:\n${m.command}\nAllow?`)){ ws.send(JSON.stringify({type:'approve', id:m.id})); } }
    }catch{}
  };
  ws.onclose=()=> setTimeout(connectWS,2000);
}
function addChat(role, content){
  const chat=$('#chat'); const div=document.createElement('div'); div.className='msg '+role; div.textContent=content; chat.appendChild(div); chat.scrollTop=chat.scrollHeight;
}
let assistantBuf='';
function appendAssistant(chunk, streaming){
  if(!assistantBuf || !streaming) { if(!streaming) assistantBuf=''; }
  // find last assistant msg or create
  let last=document.querySelector('#chat .msg.assistant:last-child');
  if(!last || last.dataset.done==='true'){ last=document.createElement('div'); last.className='msg assistant'; last.dataset.done='false'; $('#chat').appendChild(last); }
  last.textContent=(last.textContent||'')+chunk;
  if(!streaming) last.dataset.done='true';
  $('#chat').scrollTop=$('#chat').scrollHeight;
}
function logActivity(t){ const el=$('#activity'); const d=document.createElement('div'); d.textContent=new Date().toLocaleTimeString()+' '+t; el.appendChild(d); el.scrollTop=el.scrollHeight; }

async function sendPrompt(){
  const text=$('#prompt').value.trim(); if(!text) return;
  const model=$('#modelSelect').value;
  if(!model){ alert('Select a model first'); return; }
  if(!workspace){ alert('Open a workspace first'); return; }
  addChat('user', text);
  $('#prompt').value='';
  chatHistory.push({role:'user', content:text});
  const openFiles=Array.from(openTabs.keys());
  const payload={ type:'agent:run', sessionId: currentSession, model, userMessage: text, history: chatHistory.slice(-10), openFiles, currentFile, temperature: parseFloat($('#sTemp').value)||0.2, maxTokens: parseInt($('#sMaxTokens').value,10)||4096 };
  if(ws && ws.readyState===1) ws.send(JSON.stringify(payload));
  else { // fallback HTTP
    try{
      const r=await api('/api/lmstudio/chat',{method:'POST', body:JSON.stringify({model, messages: chatHistory})});
      addChat('assistant', r.content);
    }catch(e){ addChat('assistant','Error: '+e.message); }
  }
}

async function loadSessions(){
  try{ const list=await api('/api/sessions'); const sel=$('#sessionSelect'); sel.innerHTML='<option value="">New session</option>'; list.forEach(s=>{ const o=document.createElement('option'); o.value=s.id; o.textContent=(s.title||'Session')+' '+new Date(s.updatedAt).toLocaleDateString(); sel.appendChild(o); }); if(list[0]){ currentSession=list[0].id; sel.value=currentSession; loadSession(currentSession);} }catch{}
}
async function loadSession(id){
  try{ const {session,messages}=await api('/api/sessions/'+id); currentSession=id; chatHistory=messages.map(m=>({role:m.role, content:m.content})); $('#chat').innerHTML=''; messages.forEach(m=> addChat(m.role==='user'?'user':m.role==='assistant'?'assistant':'tool', m.content)); }catch{}
}
async function createSession(){
  const title=prompt('Session title','New Session')||'New Session';
  const {id}=await api('/api/sessions',{method:'POST', body:JSON.stringify({projectPath:workspace, model:$('#modelSelect').value, title})});
  currentSession=id; chatHistory=[]; $('#chat').innerHTML=''; loadSessions();
}
async function execTerm(){
  const cmd=$('#termInput').value.trim(); if(!cmd) return; $('#termInput').value=''; logTerminal('$ '+cmd);
  try{ const r=await api('/api/workspace/execute',{method:'POST', body:JSON.stringify({command:cmd})}); logTerminal(r.stdout||''); if(r.stderr) logTerminal('ERR: '+r.stderr); logTerminal(`exit ${r.code}`);}catch(e){ logTerminal('Error: '+e.message); }
}

document.addEventListener('DOMContentLoaded', ()=>{
  loadConfig(); refreshModels(); loadWorkspace(); loadSessions(); initMonaco(); connectWS();
  $('#btnRefreshModels').onclick=refreshModels;
  $('#btnConnect').onclick=refreshModels;
  $('#btnSetWorkspace').onclick=setWorkspace;
  $('#btnOpenFolder').onclick=()=>{ const p=prompt('Enter workspace path','C:\\Projects\\my-app'); if(p){ $('#workspaceInput').value=p; setWorkspace(); }};
  $('#btnSend').onclick=sendPrompt;
  $('#prompt').addEventListener('keydown', e=>{ if(e.key==='Enter' && (e.ctrlKey||e.metaKey)){ sendPrompt(); }});
  $('#btnNewSession').onclick=createSession;
  $('#sessionSelect').onchange=(e)=>{ if(e.target.value) loadSession(e.target.value); };
  $('#btnSettings').onclick=()=> $('#settingsModal').classList.remove('hidden');
  $('#btnCloseSettings').onclick=()=> $('#settingsModal').classList.add('hidden');
  $('#btnSaveSettings').onclick=saveSettings;
  $('#btnTestConn').onclick=testConnection;
  $('#btnGit').onclick=loadGit;
  $('#termInput').addEventListener('keydown', e=>{ if(e.key==='Enter'){ execTerm(); }});
  $('#btnClearTerm').onclick=()=> $('#terminal').textContent='';
  document.querySelectorAll('.cmds button').forEach(b=> b.onclick=()=>{ $('#prompt').value=b.dataset.cmd+' '; $('#prompt').focus(); });
  $('#btnCloseDiff').onclick=()=> $('#diffModal').classList.add('hidden');
  $('#btnFrTest').onclick=async()=>{ $('#sBaseUrl').value=$('#frUrl').value; await testConnection(); const ok=$('#settingsStatus').textContent.includes('Connected'); $('#frStatus').textContent= ok?'● Connected — select model':'○ Failed'; if(ok) $('#btnFrOpen').style.display='block'; };
  $('#btnFrOpen').onclick=()=>{ $('#firstRun').classList.add('hidden'); localStorage.setItem('lm_firstRunDone','1'); };
  $('#modelSelect').onchange=(e)=>{ api('/api/lmstudio/config',{method:'POST', body:JSON.stringify({model:e.target.value})}); };
  // auto show first run if offline
  setTimeout(async()=>{ try{ const r=await fetch(API+'/api/lmstudio/models'); if(!r.ok) $('#firstRun').classList.remove('hidden'); }catch{ }},800);
});
