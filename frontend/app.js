const API=location.origin;
let ws=null,editor=null,monacoLoaded=false,currentFile=null,openTabs=new Map(),workspace='',currentSession=null,chatHistory=[],modelList=[];
const $=s=>document.querySelector(s);
const logTerminal=t=>{const e=$('#terminal');e.textContent+=t+'\n';e.scrollTop=e.scrollHeight;};
async function api(p,o={}){const r=await fetch(API+p,{headers:{'Content-Type':'application/json'},...o});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||r.statusText);return j;}
async function loadConfig(){try{const c=await api('/api/lmstudio/config');$('#sBaseUrl').value=c.baseUrl;$('#sTemp').value=c.temperature;$('#sMaxTokens').value=c.maxTokens;if(c.apiKey)$('#sApiKey').value=c.apiKey;$('#headerModelName').textContent=c.model?`— ${c.model}`:'— Select model';}catch{}}
async function refreshModels(){
  const dot=$('#lmStatus'); dot.className='dotStatus off'; dot.title='Connecting...';
  try{
    const {models}=await api('/api/lmstudio/models');
    modelList=models; const sel=$('#modelSelect'); sel.innerHTML='';
    if(!models.length) sel.innerHTML='<option>No models</option>'; else models.forEach(m=>{const o=document.createElement('option');o.value=m.id;o.textContent=m.id;sel.appendChild(o);});
    const cfg=await api('/api/lmstudio/config'); if(cfg.model) sel.value=cfg.model;
    const has=cfg.model||models[0]?.id; if(has){sel.value=has; $('#headerModelName').textContent=`— ${has}`;}
    dot.className='dotStatus on'; dot.title='Connected'; logTerminal(`Models: ${models.map(m=>m.id).join(', ')}`);
  }catch(e){const d=$('#lmStatus');d.className='dotStatus off';d.title='Offline';logTerminal('Offline: '+e.message);}
}
async function testConnection(){const b=$('#sBaseUrl').value,a=$('#sApiKey').value;try{const r=await api('/api/lmstudio/test',{method:'POST',body:JSON.stringify({baseUrl:b,apiKey:a})});$('#settingsStatus').textContent=r.ok?'● Connected':'○ Failed: '+(r.error||'');}catch(e){$('#settingsStatus').textContent='Error: '+e.message;}}
async function saveSettings(){const b=$('#sBaseUrl').value,a=$('#sApiKey').value,t=parseFloat($('#sTemp').value),m=parseInt($('#sMaxTokens').value,10);await api('/api/lmstudio/config',{method:'POST',body:JSON.stringify({baseUrl:b,apiKey:a,temperature:t,maxTokens:m})});await refreshModels();$('#settingsStatus').textContent='Saved';setTimeout(()=>$('#settingsModal').classList.add('hidden'),500);}
async function loadWorkspace(){try{const {workspace:ws}=await api('/api/workspace/info');if(ws){workspace=ws;$('#projLabel').textContent=ws.split(/[\\/]/).pop()||ws;$('#workspaceInput').value=ws;renderTree();loadGit();}}catch{}}
async function setWorkspace(){const p=$('#workspaceInput').value.trim();if(!p)return;try{await api('/api/workspace/open',{method:'POST',body:JSON.stringify({path:p})});workspace=p;$('#projLabel').textContent=p.split(/[\\/]/).pop();renderTree();loadGit();logTerminal('Workspace: '+p);toast('Workspace opened');}catch(e){toast(e.message,true);}}
async function renderTree(path='.'){
  try{
    const list=await api('/api/workspace/files?path='+encodeURIComponent(path));
    const el=$('#fileTree');
    if(path==='.'){el.innerHTML='';}
    el.innerHTML=list.map(f=>`<div class="item ${f.isDirectory?'dir':''}" data-path="${f.path}" data-dir="${f.isDirectory}">${f.isDirectory?'▸ ':''}${f.name}</div>`).join('')||'<div style="color:var(--muted2);padding:6px">Empty</div>';
    el.querySelectorAll('.item').forEach(n=>{n.onclick=()=>{const p=n.dataset.path,d=n.dataset.dir==='true'; if(d) renderTree(p); else openFile(p);};});
  }catch(e){$('#fileTree').textContent=e.message;}
}
async function openFile(p){
  try{
    const {content}=await api('/api/workspace/file?path='+encodeURIComponent(p));
    currentFile=p; if(!openTabs.has(p)) addTab(p); setActiveTab(p);
    $('#ideDrawer').classList.remove('hidden');
    if(monacoLoaded&&editor){const m=monaco.editor.createModel(content,langFromPath(p));editor.setModel(m);} else $('#editor').textContent=content;
    $('#emptyState').style.display='none';
  }catch(e){logTerminal(e.message);}
}
function langFromPath(p){if(p.endsWith('.ts')||p.endsWith('.tsx'))return 'typescript';if(p.endsWith('.py'))return 'python';if(p.endsWith('.json'))return 'json';if(p.endsWith('.md'))return 'markdown';if(p.endsWith('.css'))return 'css';if(p.endsWith('.html'))return 'html';return 'javascript';}
function addTab(p){openTabs.set(p,true);const t=$('#tabs');const d=document.createElement('div');d.className='tab';d.dataset.path=p;d.innerHTML=`<span>${p.split('/').pop()}</span><span class="close">×</span>`;d.onclick=e=>{if(e.target.classList.contains('close')){openTabs.delete(p);d.remove();if(currentFile===p){currentFile=null;if(editor)editor.setValue('');}}else openFile(p);};t.appendChild(d);}
function setActiveTab(p){document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.path===p));}
async function loadGit(){try{const s=await api('/api/workspace/git/status');const el=$('#gitPanel');el.style.display='block';el.textContent=(s.stdout||'')+(s.stderr||'')||'Clean';}catch{}}
function initMonaco(){try{require.config({paths:{vs:'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs'}});require(['vs/editor/editor.main'],()=>{monacoLoaded=true;editor=monaco.editor.create($('#editor'),{value:'// Open a file',language:'typescript',theme:'vs-dark',automaticLayout:true});});}catch{}}
function toast(msg,err){const t=document.createElement('div');t.className='toast';t.textContent=msg;if(err)t.style.borderColor='var(--red)';document.body.appendChild(t);setTimeout(()=>t.remove(),2500);}
function escapeHtml(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function renderMarkdown(s){
  let h=escapeHtml(s);
  h=h.replace(/```(\w+)?\n([\s\S]*?)```/g,(m,lang,code)=>`<pre><code>${code.trim()}</code></pre>`);
  h=h.replace(/`([^`]+)`/g,'<code>$1</code>');
  h=h.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
  return h;
}
function connectWS(){
  const proto=location.protocol==='https:'?'wss:':'ws:';
  ws=new WebSocket(proto+'//'+location.host+'/ws');
  ws.onopen=()=>logTerminal('WS connected');
  ws.onmessage=ev=>{
    try{
      const m=JSON.parse(ev.data);
      if(m.type==='token') appendAssistant(m.content,!m.final);
      else if(m.type==='assistant'&&m.content){appendAssistant(m.content,!m.final);if(m.toolCalls) logActivity(m.toolCalls.map(t=>t.function.name).join(', '));}
      else if(m.type==='tool_start'){ addChat('tool',`▶ ${m.name} ${JSON.stringify(m.args).slice(0,300)}`); logActivity('● '+m.name);}
      else if(m.type==='tool_result'){addChat('tool',`◀ ${m.name}: ${(m.result||'').slice(0,600)}`);logActivity('✓ '+m.name); if(m.name.includes('write')||m.name.includes('edit')) setTimeout(()=>{renderTree();if(currentFile)openFile(currentFile);loadGit();},300);}
      else if(m.type==='status'){$('#agentStatus').textContent=`Thinking ${m.iteration}/${m.max}`;}
      else if(m.type==='done'){$('#agentStatus').textContent='Idle';logActivity('Done');}
      else if(m.type==='error'){addChat('assistant','Error: '+m.message);}
      else if(m.type==='approval_required'){if(confirm(`Allow: ${m.command}?`)) ws.send(JSON.stringify({type:'approve',id:m.id}));}
    }catch{}
  };
  ws.onclose=()=>setTimeout(connectWS,2000);
}
function addChat(role,content){
  const chat=$('#chat'); const row=document.createElement('div'); row.className=`msgRow ${role}`;
  const ava=document.createElement('div'); ava.className='avatar'; ava.textContent=role==='user'?'U':role==='tool'?'⚙':'✦';
  const bub=document.createElement('div'); bub.className='msgBubble';
  if(role==='assistant') bub.innerHTML=renderMarkdown(content); else bub.textContent=content;
  if(role!=='user'){ row.appendChild(ava); row.appendChild(bub);} else { bub.textContent=content; row.appendChild(bub); row.appendChild(ava);}
  chat.appendChild(row); $('#emptyState').style.display='none'; chatWrapScroll();
}
let streamingRow=null;
function appendAssistant(chunk, streaming){
  if(!streamingRow || streamingRow.dataset.done==='true'){
    const chat=$('#chat'); streamingRow=document.createElement('div'); streamingRow.className='msgRow assistant'; streamingRow.dataset.done='false';
    const ava=document.createElement('div'); ava.className='avatar'; ava.textContent='✦';
    const bub=document.createElement('div'); bub.className='msgBubble'; bub.textContent='';
    streamingRow.appendChild(ava); streamingRow.appendChild(bub); chat.appendChild(streamingRow); $('#emptyState').style.display='none';
  }
  const bub=streamingRow.querySelector('.msgBubble');
  bub.textContent=(bub.textContent||'')+chunk;
  if(!streaming){ bub.innerHTML=renderMarkdown(bub.textContent); streamingRow.dataset.done='true'; streamingRow=null;}
  chatWrapScroll();
}
function chatWrapScroll(){const w=$('#chatWrap'); w.scrollTop=w.scrollHeight;}
function logActivity(t){const e=$('#activity');const d=document.createElement('div');d.textContent=new Date().toLocaleTimeString()+' '+t;e.appendChild(d);e.scrollTop=e.scrollHeight;if(e.children.length>60) e.firstChild.remove();}
async function sendPrompt(){
  const text=$('#prompt').value.trim(); if(!text) return;
  const model=$('#modelSelect').value; if(!model) return toast('Select model',true);
  if(!workspace) return toast('Open workspace first',true);
  addChat('user',text); $('#prompt').value=''; autoResize($('#prompt')); chatHistory.push({role:'user',content:text});
  const payload={type:'agent:run', sessionId:currentSession, model, userMessage:text, history:chatHistory.slice(-10), openFiles:Array.from(openTabs.keys()), currentFile, temperature:parseFloat($('#sTemp').value)||0.2, maxTokens:parseInt($('#sMaxTokens').value,10)||4096};
  if(ws&&ws.readyState===1) ws.send(JSON.stringify(payload)); else {try{const r=await api('/api/lmstudio/chat',{method:'POST',body:JSON.stringify({model,messages:chatHistory})});addChat('assistant',r.content);}catch(e){addChat('assistant','Error: '+e.message);}}
}
async function loadSessions(){
  try{
    const list=await api('/api/sessions');
    const container=$('#sessionList'); container.innerHTML='';
    const sel=$('#sessionSelect'); sel.innerHTML='<option value="">New</option>';
    list.forEach(s=>{const o=document.createElement('option');o.value=s.id;o.textContent=s.title;sel.appendChild(o);
      const div=document.createElement('div');div.className='sessionItem'+(s.id===currentSession?' active':'');div.textContent=s.title||'New chat';div.onclick=()=>loadSession(s.id);container.appendChild(div);
    });
    if(list[0]&&!currentSession){currentSession=list[0].id; loadSession(currentSession);}
  }catch{}
}
async function loadSession(id){
  try{const {messages}=await api('/api/sessions/'+id);currentSession=id;chatHistory=messages.map(m=>({role:m.role,content:m.content}));$('#chat').innerHTML='';streamingRow=null;messages.forEach(m=>addChat(m.role==='user'?'user':m.role==='assistant'?'assistant':'tool',m.content));loadSessions();}catch{}
}
async function createSession(){const t=prompt('Chat title','New chat')||'New chat';const {id}=await api('/api/sessions',{method:'POST',body:JSON.stringify({projectPath:workspace,model:$('#modelSelect').value,title:t})});currentSession=id;chatHistory=[];$('#chat').innerHTML='';$('#emptyState').style.display='';loadSessions();}
function execTerm(){const c=$('#termInput').value.trim();if(!c)return;$('#termInput').value='';logTerminal('$ '+c);api('/api/workspace/execute',{method:'POST',body:JSON.stringify({command:c})}).then(r=>{logTerminal(r.stdout||'');if(r.stderr)logTerminal('ERR: '+r.stderr);}).catch(e=>logTerminal(e.message));}
function autoResize(el){el.style.height='auto';el.style.height=Math.min(el.scrollHeight,120)+'px';}
document.addEventListener('DOMContentLoaded',()=>{
  loadConfig();refreshModels();loadWorkspace();loadSessions();initMonaco();connectWS();
  $('#btnRefreshModels').onclick=refreshModels; $('#btnConnect').onclick=refreshModels;
  $('#btnSetWorkspace').onclick=setWorkspace;
  $('#btnOpenFolder').onclick=()=>{const p=prompt('Workspace path','C:\\Projects\\my-app');if(p){$('#workspaceInput').value=p;setWorkspace();}};
  $('#btnSend').onclick=sendPrompt;
  $('#prompt').addEventListener('input',()=>autoResize($('#prompt')));
  $('#prompt').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendPrompt();}});
  $('#btnNewSession').onclick=createSession;
  $('#sessionSelect').onchange=e=>{if(e.target.value) loadSession(e.target.value);};
  $('#btnSettings').onclick=()=>$('#settingsModal').classList.remove('hidden');
  $('#btnCloseSettings').onclick=()=>$('#settingsModal').classList.add('hidden');
  $('#btnSaveSettings').onclick=saveSettings;
  $('#btnTestConn').onclick=testConnection;
  $('#btnGit').onclick=()=>{$('#gitPanel').style.display=$('#gitPanel').style.display==='none'?'block':'none';loadGit();};
  $('#termInput').addEventListener('keydown',e=>{if(e.key==='Enter')execTerm();});
  $('#btnClearTerm').onclick=()=>$('#terminal').textContent='';
  $('#btnToggleIDE').onclick=()=>$('#ideDrawer').classList.toggle('hidden');
  $('#btnCloseIDE').onclick=()=>$('#ideDrawer').classList.add('hidden');
  $('#btnToggleSidebar').onclick=()=>$('#sidebar').classList.toggle('open');
  document.querySelectorAll('.cmds button').forEach(b=>b.onclick=()=>{$('#prompt').value=b.dataset.cmd+' ';$('#prompt').focus();});
  document.querySelectorAll('.suggestions button').forEach(b=>b.onclick=()=>{$('#prompt').value=b.dataset.prompt;sendPrompt();});
  $('#btnTermToggle').onclick=()=>$('#terminalWrap').classList.toggle('collapsed');
  $('#modelSelect').onchange=e=>{api('/api/lmstudio/config',{method:'POST',body:JSON.stringify({model:e.target.value})});$('#headerModelName').textContent=`— ${e.target.value}`;};
  $('#btnFrTest').onclick=async()=>{$('#sBaseUrl').value=$('#frUrl').value;await testConnection();const ok=$('#settingsStatus').textContent.includes('Connected');$('#frStatus').textContent=ok?'● Connected':'○ Failed';};
  $('#btnFrOpen').onclick=()=>{$('#firstRun').classList.add('hidden');localStorage.setItem('lm_firstRunDone','1');};
  setTimeout(async()=>{try{const r=await fetch(API+'/api/lmstudio/models');if(!r.ok)$('#firstRun').classList.remove('hidden');}catch{}},800);
});
