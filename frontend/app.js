const API = location.origin;
let ws = null, editor = null, monacoLoaded = false, currentFile = null, openTabs = new Map(), workspace = '', currentSession = null, chatHistory = [], modelList = [], pendingImages = [];
const $ = s => document.querySelector(s);
const logTerminal = t => { const e = $('#terminal'); e.textContent += t + '\n'; e.scrollTop = e.scrollHeight; };

async function api(p, o = {}) {
  const r = await fetch(API + p, { headers: { 'Content-Type': 'application/json' }, ...o });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

// ─── Toast ───
function toast(msg, err) {
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.animation = 'toastOut .3s ease forwards'; setTimeout(() => t.remove(), 300); }, 3000);
}

// ─── Markdown Renderer ───
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderMarkdown(s) {
  // Fenced code blocks with language and copy button
  let h = s.replace(/```(\w*)\n([\s\S]*?)```/g, (m, lang, code) => {
    const trimmed = code.replace(/\n+$/, '');
    const id = 'code-' + Math.random().toString(36).slice(2, 8);
    return `<div class="codeHeader"><span>${lang || 'code'}</span><button class="copyBtn" onclick="copyCode('${id}')">Copy</button></div><pre><code id="${id}">${escapeHtml(trimmed)}</code></pre>`;
  });
  // Inline code
  h = h.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  // Bold and italic
  h = h.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Strikethrough
  h = h.replace(/~~(.+?)~~/g, '<s>$1</s>');
  // Headers
  h = h.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  h = h.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  h = h.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  // Horizontal rules
  h = h.replace(/^---+$/gm, '<hr>');
  // Blockquotes
  h = h.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  // Unordered lists
  h = h.replace(/^[*-] (.+)$/gm, '<li>$1</li>');
  h = h.replace(/(<li>.*<\/li>\n?)+/g, m => '<ul>' + m + '</ul>');
  // Ordered lists
  h = h.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  // Links
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // Tables
  h = h.replace(/^\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n?)*)/gm, (_, header, body) => {
    const ths = header.split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join('');
    const rows = body.trim().split('\n').map(row => {
      const tds = row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('');
      return `<tr>${tds}</tr>`;
    }).join('');
    return `<table><thead><tr>${ths}</tr></thead><tbody>${rows}</tbody></table>`;
  });
  return h;
}

function copyCode(id) {
  const el = document.getElementById(id);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent).then(() => toast('Copied!')).catch(() => {});
}

// ─── Config ───
async function loadConfig() {
  try {
    const c = await api('/api/lmstudio/config');
    $('#sBaseUrl').value = c.baseUrl || '';
    $('#sTemp').value = c.temperature;
    $('#sMaxTokens').value = c.maxTokens;
    if (c.apiKey) $('#sApiKey').value = c.apiKey;
    $('#headerModelName').textContent = c.model ? `— ${c.model}` : '— Select model';
    try{ const oc=await api('/api/opencode/config'); if(oc.provider) $('#providerSelect').value=oc.provider; }catch{}
  } catch {}
}

// ─── Models ───
let autoRetry = null;
async function refreshModels(silent) {
  const dot = $('#lmStatus');
  const provider = ($('#providerSelect')?.value)||'lmstudio';
  if (!silent) { dot.className = 'dotStatus off'; dot.title = 'Connecting...'; }
  try {
    if(provider==='opencode'){
      try{ const r=await api('/api/opencode/test',{method:'POST'}); if(!r.ok) throw new Error('Opencode offline'); }catch(e){ throw e;}
      const {models}=await api('/api/opencode/models');
      if(!models.length) throw new Error('No opencode models');
      modelList=models; const sel=$('#modelSelect'); const prev=sel.value; sel.innerHTML='';
      models.forEach(m=>{const o=document.createElement('option');o.value=m.id;o.textContent=m.id;sel.appendChild(o);});
      const has=prev&&models.find(x=>x.id===prev)?prev:models[0].id; sel.value=has; $('#headerModelName').textContent=`— ${sel.value}`;
      dot.className='dotStatus on'; dot.title='Opencode'; if(!silent) logTerminal(`Opencode models: ${models.map(m=>m.id).join(', ')}`);
      if(autoRetry){clearInterval(autoRetry);autoRetry=null;} return true;
    }
    try { await api('/api/lmstudio/autoconnect', { method: 'POST' }); } catch {}
    const { models } = await api('/api/lmstudio/models');
    if (!models.length) throw new Error('No models loaded in LM Studio');
    modelList = models;
    const sel = $('#modelSelect');
    const prev = sel.value;
    sel.innerHTML = '';
    models.forEach(m => { const o = document.createElement('option'); o.value = m.id; o.textContent = m.id; sel.appendChild(o); });
    const cfg = await api('/api/lmstudio/config');
    const has = cfg.model && models.find(x => x.id === cfg.model) ? cfg.model : models[0].id;
    if (prev && models.find(x => x.id === prev)) sel.value = prev; else sel.value = has;
    $('#headerModelName').textContent = `— ${sel.value}`;
    if (!cfg.model || !models.find(x => x.id === cfg.model)) await api('/api/lmstudio/config', { method: 'POST', body: JSON.stringify({ model: sel.value }) });
    dot.className = 'dotStatus on'; dot.title = 'Connected';
    if (!silent) logTerminal(`Models: ${models.map(m => m.id).join(', ')}`);
    if (autoRetry) { clearInterval(autoRetry); autoRetry = null; }
    return true;
  } catch (e) {
    const d = $('#lmStatus'); d.className = 'dotStatus off'; d.title = 'Offline';
    if (!silent) logTerminal('Offline: ' + e.message + ' — retrying...');
    if (!autoRetry) autoRetry = setInterval(() => refreshModels(true), 3000);
    return false;
  }
}

// ─── Settings ───
async function testConnection() {
  const b = $('#sBaseUrl').value, a = $('#sApiKey').value;
  try {
    const r = await api('/api/lmstudio/test', { method: 'POST', body: JSON.stringify({ baseUrl: b, apiKey: a }) });
    $('#settingsStatus').textContent = r.ok ? '● Connected' : '○ Failed: ' + (r.error || '');
    $('#settingsStatus').style.color = r.ok ? 'var(--green)' : 'var(--red)';
  } catch (e) { $('#settingsStatus').textContent = 'Error: ' + e.message; $('#settingsStatus').style.color = 'var(--red)'; }
}

async function saveSettings() {
  const b = $('#sBaseUrl').value, a = $('#sApiKey').value, t = parseFloat($('#sTemp').value), m = parseInt($('#sMaxTokens').value, 10);
  await api('/api/lmstudio/config', { method: 'POST', body: JSON.stringify({ baseUrl: b, apiKey: a, temperature: t, maxTokens: m }) });
  await refreshModels();
  toast('Settings saved');
  $('#settingsModal').classList.add('hidden');
}

// ─── Workspace ───
async function loadWorkspace() {
  try {
    const { workspace: ws } = await api('/api/workspace/info');
    if (ws) { workspace = ws; $('#projLabel').textContent = ws.split(/[\\/]/).pop() || ws; $('#workspaceInput').value = ws; renderTree(); loadGit(); }
  } catch {}
}

async function setWorkspace() {
  const p = $('#workspaceInput').value.trim();
  if (!p) return;
  try {
    await api('/api/workspace/open', { method: 'POST', body: JSON.stringify({ path: p }) });
    workspace = p; $('#projLabel').textContent = p.split(/[\\/]/).pop(); renderTree(); loadGit();
    logTerminal('Workspace: ' + p); toast('Workspace opened');
  } catch (e) { toast(e.message, true); }
}

// ─── File Tree ───
function fileIcon(name, isDir) {
  if (isDir) return '<span class="fileIcon dir">📁</span>';
  const ext = name.split('.').pop().toLowerCase();
  const icons = { ts: '📜', tsx: '⚛', js: '📜', jsx: '⚛', py: '🐍', json: '📋', md: '📝', css: '🎨', html: '🌐', go: '🔵', rs: '🦀', java: '☕', rb: '💎', sh: '⚙', yml: '⚙', yaml: '⚙', toml: '⚙', txt: '📄', sql: '🗄', svg: '🖼', png: '🖼', jpg: '🖼', jpeg: '🖼', gif: '🖼', lock: '🔒' };
  return `<span class="fileIcon ${ext}">${icons[ext] || '📄'}</span>`;
}

let currentTreePath = '.';
async function renderTree(treePath) {
  if (treePath !== undefined) currentTreePath = treePath;
  try {
    const list = await api('/api/workspace/files?path=' + encodeURIComponent(currentTreePath));
    const el = $('#fileTree');
    el.innerHTML = '';
    // Back button
    if (currentTreePath !== '.') {
      const back = document.createElement('div');
      back.className = 'item back';
      back.innerHTML = '← Back';
      const parent = currentTreePath.split('/').slice(0, -1).join('/') || '.';
      back.onclick = () => renderTree(parent);
      el.appendChild(back);
    }
    // Directories first, then files
    const sorted = [...list].sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
    if (!sorted.length) {
      el.innerHTML += '<div style="color:var(--muted2);padding:6px;font-style:italic">Empty directory</div>';
      return;
    }
    sorted.forEach(f => {
      const n = document.createElement('div');
      n.className = 'item' + (f.isDirectory ? ' dir' : '');
      n.innerHTML = `${fileIcon(f.name, f.isDirectory)} ${f.name}`;
      n.dataset.path = f.path;
      n.onclick = () => { if (f.isDirectory) renderTree(f.path); else openFile(f.path); };
      el.appendChild(n);
    });
  } catch (e) { $('#fileTree').textContent = e.message; }
}

// ─── File Editing ───
async function openFile(p) {
  try {
    const { content } = await api('/api/workspace/file?path=' + encodeURIComponent(p));
    currentFile = p; if (!openTabs.has(p)) addTab(p); setActiveTab(p);
    $('#ideDrawer').classList.remove('hidden');
    if (monacoLoaded && editor) { const m = monaco.editor.createModel(content, langFromPath(p)); editor.setModel(m); }
    else $('#editor').textContent = content;
    $('#emptyState').style.display = 'none';
  } catch (e) { logTerminal('Error opening file: ' + e.message); toast(e.message, true); }
}

function langFromPath(p) {
  const ext = p.split('.').pop().toLowerCase();
  const map = { ts: 'typescript', tsx: 'typescript', py: 'python', json: 'json', md: 'markdown', css: 'css', html: 'html', go: 'go', rs: 'rust', java: 'java', rb: 'ruby', sh: 'shell', yml: 'yaml', yaml: 'yaml', sql: 'sql', xml: 'xml', c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp' };
  return map[ext] || 'plaintext';
}

function addTab(p) {
  openTabs.set(p, true);
  const t = $('#tabs');
  const d = document.createElement('div');
  d.className = 'tab'; d.dataset.path = p;
  d.innerHTML = `<span>${p.split('/').pop()}</span><span class="close">×</span>`;
  d.onclick = e => {
    if (e.target.classList.contains('close')) {
      openTabs.delete(p); d.remove();
      if (currentFile === p) { currentFile = null; if (editor) editor.setValue(''); }
    } else openFile(p);
  };
  t.appendChild(d);
}

function setActiveTab(p) { document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.path === p)); }

// ─── Git ───
async function loadGit() {
  try {
    const s = await api('/api/workspace/git/status');
    const el = $('#gitPanel');
    el.style.display = 'block';
    const text = (s.stdout || '') + (s.stderr || '') || 'Working tree clean';
    el.textContent = text;
  } catch { $('#gitPanel').style.display = 'none'; }
}

// ─── Monaco ───
function initMonaco() {
  try {
    require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' } });
    require(['vs/editor/editor.main'], () => {
      monacoLoaded = true;
      editor = monaco.editor.create($('#editor'), { value: '// Open a file from the sidebar or file tree', language: 'typescript', theme: 'vs-dark', automaticLayout: true, fontSize: 13, minimap: { enabled: false }, scrollBeyondLastLine: false, padding: { top: 10 } });
    });
  } catch {}
}

// ─── WebSocket ───
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(proto + '//' + location.host + '/ws');
  ws.onopen = () => { logTerminal('WebSocket connected'); toast('Connected to agent'); };
  ws.onmessage = ev => {
    try {
      const m = JSON.parse(ev.data);
      if (m.type === 'token') appendAssistant(m.content, !m.final);
      else if (m.type === 'assistant' && m.content) { appendAssistant(m.content, !m.final); if (m.toolCalls) logActivity(m.toolCalls.map(t => t.function.name).join(', ')); }
      else if (m.type === 'tool_start') { addToolCard(m.name, m.args, 'running'); logActivity('● ' + m.name); }
      else if (m.type === 'tool_result') { updateToolCard(m.name, m.result, m.id); logActivity('✓ ' + m.name); if (m.name?.includes('write') || m.name?.includes('edit')) setTimeout(() => { renderTree(); if (currentFile) openFile(currentFile); loadGit(); }, 300); }
      else if (m.type === 'status') { $('#agentStatus').innerHTML = `<span class="spinner"></span> ${m.iteration}/${m.max} iterations`; }
      else if (m.type === 'done') { $('#agentStatus').innerHTML = '<span class="agentDone">✓ Done</span>'; logActivity('Done'); removeStreamingIndicator(); }
      else if (m.type === 'error') { addChat('assistant', '⚠️ Error: ' + m.message); removeStreamingIndicator(); }
      else if (m.type === 'file_changed') { /* handled by tool_result */ }
      else if (m.type === 'approval_required') {
        if (confirm(`⚠️ Allow this command?\n\n${m.command}`)) { ws.send(JSON.stringify({ type: 'approve', id: m.id })); }
      }
    } catch {}
  };
  ws.onclose = () => { logTerminal('WebSocket disconnected — reconnecting...'); setTimeout(connectWS, 2000); };
}

// ─── Chat ───
function addChat(role, content, images) {
  const chat = $('#chat');
  const row = document.createElement('div');
  row.className = `msgRow ${role}`;
  const ava = document.createElement('div');
  ava.className = 'avatar'; ava.textContent = role === 'user' ? 'U' : role === 'tool' ? '⚙' : '✦';
  const bub = document.createElement('div');
  bub.className = 'msgBubble';
  if (role === 'assistant') bub.innerHTML = renderMarkdown(content);
  else { bub.textContent = content; if (images?.length) images.forEach(src => { const im = document.createElement('img'); im.src = src; bub.appendChild(im); }); }
  if (role !== 'user') { row.appendChild(ava); row.appendChild(bub); }
  else { row.appendChild(bub); row.appendChild(ava); }
  chat.appendChild(row);
  $('#emptyState').style.display = 'none';
  chatWrapScroll();
}

// ─── Tool Cards ───
let lastToolCard = null;
function addToolCard(name, args, status) {
  const chat = $('#chat');
  const card = document.createElement('div');
  card.className = 'toolCard' + (status === 'error' ? ' error' : '');
  card.dataset.toolName = name;
  const argsStr = JSON.stringify(args || {}, null, 0);
  card.innerHTML = `
    <div class="toolName"><span class="toolIcon">${status === 'error' ? '❌' : '⚙️'}</span> ${name} ${status === 'running' ? '<span class="spinner" style="width:12px;height:12px;border-width:1.5px"></span>' : ''}</div>
    ${argsStr.length > 10 ? `<div class="toolArgs">${escapeHtml(argsStr.slice(0, 300))}${argsStr.length > 300 ? '...' : ''}</div>` : ''}
    <div class="toolOutput" style="display:none"></div>
  `;
  chat.appendChild(card);
  lastToolCard = card;
  $('#emptyState').style.display = 'none';
  chatWrapScroll();
}

function updateToolCard(name, result, id) {
  // Find the most recent tool card with this name that has no output yet
  const cards = document.querySelectorAll('.toolCard[data-tool-name="' + name + '"]');
  let card = null;
  for (const c of cards) {
    const out = c.querySelector('.toolOutput');
    if (out && out.style.display === 'none') { card = c; break; }
  }
  if (!card) { addToolCard(name, {}, 'done'); card = lastToolCard; }
  const output = card.querySelector('.toolOutput');
  const spinner = card.querySelector('.spinner');
  if (spinner) spinner.remove();
  const icon = card.querySelector('.toolIcon');
  if (icon) icon.textContent = '✅';
  const truncated = (result || '').slice(0, 800);
  if (truncated) {
    output.style.display = 'block';
    output.textContent = truncated + ((result || '').length > 800 ? '\n...[truncated]' : '');
    // Add toggle for long outputs
    if ((result || '').length > 200) {
      const toggle = document.createElement('span');
      toggle.className = 'toolToggle';
      toggle.textContent = 'Show more';
      toggle.onclick = () => {
        if (output.textContent === truncated + '\n...[truncated]') { output.textContent = result.slice(0, 3000); toggle.textContent = 'Show less'; }
        else { output.textContent = truncated + '\n...[truncated]'; toggle.textContent = 'Show more'; }
      };
      card.appendChild(toggle);
    }
  }
  chatWrapScroll();
}

// ─── Streaming ───
let streamingRow = null;
function appendAssistant(chunk, streaming) {
  if (!streamingRow || streamingRow.dataset.done === 'true') {
    const chat = $('#chat');
    streamingRow = document.createElement('div');
    streamingRow.className = 'msgRow assistant';
    streamingRow.dataset.done = 'false';
    const ava = document.createElement('div');
    ava.className = 'avatar'; ava.textContent = '✦';
    const bub = document.createElement('div');
    bub.className = 'msgBubble'; bub.textContent = '';
    streamingRow.appendChild(ava);
    streamingRow.appendChild(bub);
    chat.appendChild(streamingRow);
    $('#emptyState').style.display = 'none';
  }
  const bub = streamingRow.querySelector('.msgBubble');
  bub.textContent = (bub.textContent || '') + chunk;
  if (!streaming) {
    bub.innerHTML = renderMarkdown(bub.textContent);
    streamingRow.dataset.done = 'true';
    streamingRow = null;
  }
  chatWrapScroll();
}

function removeStreamingIndicator() { /* handled by done event */ }
function chatWrapScroll() { const w = $('#chatWrap'); w.scrollTop = w.scrollHeight; }
function logActivity(t) {
  const e = $('#activity');
  const d = document.createElement('div');
  d.textContent = new Date().toLocaleTimeString() + ' ' + t;
  e.appendChild(d);
  e.scrollTop = e.scrollHeight;
  if (e.children.length > 60) e.firstChild.remove();
}

// ─── Photos ───
function renderPreview() {
  const c = $('#photoPreview'); c.innerHTML = '';
  pendingImages.forEach((src, i) => {
    const d = document.createElement('div'); d.className = 'thumb';
    d.innerHTML = `<img src="${src}"/><button class="rm">✕</button>`;
    d.querySelector('.rm').onclick = () => { pendingImages.splice(i, 1); renderPreview(); };
    c.appendChild(d);
  });
}

// ─── Send ───
async function sendPrompt() {
  const text = $('#prompt').value.trim();
  if (!text && !pendingImages.length) return;
  const model = $('#modelSelect').value;
  if (!model) return toast('Select a model first', true);
  if (!workspace) return toast('Open a workspace first', true);

  const imgs = [...pendingImages];
  addChat('user', text || '(photo)', imgs);
  $('#prompt').value = '';
  pendingImages = []; renderPreview(); autoResize($('#prompt'));
  chatHistory.push({ role: 'user', content: text });

  // Show streaming indicator
  const chat = $('#chat');
  const indicator = document.createElement('div');
  indicator.className = 'loadingRow';
  indicator.id = 'streamingIndicator';
  indicator.innerHTML = '<span class="spinner"></span> Thinking...';
  chat.appendChild(indicator);
  chatWrapScroll();

  const payload = {
    type: 'agent:run', sessionId: currentSession, model, userMessage: text,
    history: chatHistory.slice(-12), openFiles: Array.from(openTabs.keys()), currentFile,
    images: imgs, temperature: parseFloat($('#sTemp').value) || 0.2, maxTokens: parseInt($('#sMaxTokens').value, 10) || 4096
  };
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(payload));
  else {
    try {
      const r = await api('/api/lmstudio/chat', { method: 'POST', body: JSON.stringify({ model, messages: chatHistory }) });
      const ind = document.getElementById('streamingIndicator'); if (ind) ind.remove();
      addChat('assistant', r.content);
    } catch (e) {
      const ind = document.getElementById('streamingIndicator'); if (ind) ind.remove();
      addChat('assistant', '⚠️ Error: ' + e.message);
    }
  }
}

// ─── Sessions ───
async function loadSessions() {
  try {
    const list = await api('/api/sessions');
    const container = $('#sessionList'); container.innerHTML = '';
    const sel = $('#sessionSelect'); sel.innerHTML = '<option value="">New</option>';
    list.forEach(s => {
      const o = document.createElement('option'); o.value = s.id; o.textContent = s.title; sel.appendChild(o);
      const div = document.createElement('div');
      div.className = 'sessionItem' + (s.id === currentSession ? ' active' : '');
      div.textContent = s.title || 'New chat';
      div.onclick = () => loadSession(s.id);
      // Right-click to delete
      div.oncontextmenu = e => { e.preventDefault(); if (confirm('Delete this chat?')) deleteSession(s.id); };
      container.appendChild(div);
    });
    if (list[0] && !currentSession) { currentSession = list[0].id; loadSession(currentSession); }
  } catch {}
}

async function loadSession(id) {
  try {
    const { messages } = await api('/api/sessions/' + id);
    currentSession = id;
    chatHistory = messages.map(m => ({ role: m.role, content: m.content }));
    $('#chat').innerHTML = '';
    streamingRow = null;
    messages.forEach(m => addChat(m.role === 'user' ? 'user' : m.role === 'assistant' ? 'assistant' : 'tool', m.content));
    loadSessions();
  } catch {}
}

async function deleteSession(id) {
  try { await fetch(API + '/api/sessions/' + id, { method: 'DELETE' }); if (currentSession === id) { currentSession = null; chatHistory = []; $('#chat').innerHTML = ''; } loadSessions(); toast('Chat deleted'); } catch (e) { toast(e.message, true); }
}

async function createSession() {
  const t = prompt('Chat title', 'New chat') || 'New chat';
  const { id } = await api('/api/sessions', { method: 'POST', body: JSON.stringify({ projectPath: workspace, model: $('#modelSelect').value, title: t }) });
  currentSession = id; chatHistory = []; $('#chat').innerHTML = ''; $('#emptyState').style.display = ''; loadSessions();
}

// ─── Terminal ───
function execTerm() {
  const c = $('#termInput').value.trim();
  if (!c) return;
  $('#termInput').value = '';
  logTerminal('$ ' + c);
  api('/api/workspace/execute', { method: 'POST', body: JSON.stringify({ command: c }) })
    .then(r => { logTerminal(r.stdout || ''); if (r.stderr) logTerminal('ERR: ' + r.stderr); })
    .catch(e => logTerminal('Error: ' + e.message));
}

function autoResize(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; }

// ─── Init ───
document.addEventListener('DOMContentLoaded', () => {
  loadConfig(); refreshModels(); setTimeout(refreshModels, 2000); loadWorkspace(); loadSessions(); initMonaco(); connectWS();

  // Buttons
  $('#btnRefreshModels').onclick = () => { refreshModels(); toast('Refreshing models...'); };
  $('#btnConnect').onclick = () => { refreshModels(); toast('Testing connection...'); };
  $('#btnSetWorkspace').onclick = setWorkspace;
  $('#btnOpenFolder').onclick = () => { const p = prompt('Workspace path', workspace || ''); if (p) { $('#workspaceInput').value = p; setWorkspace(); } };
  $('#btnSend').onclick = sendPrompt;
  $('#btnNewSession').onclick = createSession;
  $('#sessionSelect').onchange = e => { if (e.target.value) loadSession(e.target.value); };
  $('#btnSettings').onclick = () => { loadConfig(); $('#settingsModal').classList.remove('hidden'); };
  $('#btnCloseSettings').onclick = () => $('#settingsModal').classList.add('hidden');
  $('#btnSaveSettings').onclick = saveSettings;
  $('#btnTestConn').onclick = testConnection;
  $('#btnGit').onclick = () => { const el = $('#gitPanel'); el.style.display = el.style.display === 'none' ? 'block' : 'none'; if (el.style.display === 'block') loadGit(); };
  $('#btnPhoto').onclick = () => $('#photoInput').click();
  $('#btnClearTerm').onclick = () => $('#terminal').textContent = '';
  $('#btnToggleIDE').onclick = () => $('#ideDrawer').classList.toggle('hidden');
  $('#btnCloseIDE').onclick = () => $('#ideDrawer').classList.add('hidden');
  $('#btnToggleSidebar').onclick = () => $('#sidebar').classList.toggle('open');
  $('#btnTermToggle').onclick = () => $('#terminalWrap').classList.toggle('collapsed');
  $('#providerSelect').onchange = async e=>{ const v=e.target.value; await api('/api/opencode/switch',{method:'POST', body:JSON.stringify({provider:v})}); toast('Provider: '+v); refreshModels(); };
  $('#modelSelect').onchange = e => { const prov=$('#providerSelect').value; if(prov==='opencode') api('/api/opencode/config',{method:'POST', body:JSON.stringify({})}); else api('/api/lmstudio/config', { method: 'POST', body: JSON.stringify({ model: e.target.value }) }); $('#headerModelName').textContent = `— ${e.target.value}`; toast('Model: ' + e.target.value); };

  // Photo input
  $('#photoInput').onchange = e => {
    const files = [...e.target.files];
    files.forEach(f => {
      if (f.size > 4 * 1024 * 1024) return toast('Image > 4MB skipped', true);
      const r = new FileReader();
      r.onload = () => { pendingImages.push(r.result); renderPreview(); };
      r.readAsDataURL(f);
    });
    e.target.value = '';
  };

  // Composer
  $('#prompt').addEventListener('input', () => autoResize($('#prompt')));
  $('#prompt').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendPrompt(); }
  });
  $('#termInput').addEventListener('keydown', e => { if (e.key === 'Enter') execTerm(); });

  // Slash command chips
  document.querySelectorAll('.cmds button').forEach(b => b.onclick = () => { $('#prompt').value = b.dataset.cmd + ' '; $('#prompt').focus(); });

  // Empty state suggestions
  document.querySelectorAll('.suggestions button').forEach(b => b.onclick = () => { $('#prompt').value = b.dataset.prompt; sendPrompt(); });

  // First run dialog
  $('#btnFrTest').onclick = async () => {
    $('#sBaseUrl').value = $('#frUrl').value;
    await testConnection();
    const ok = $('#settingsStatus').textContent.includes('Connected');
    $('#frStatus').textContent = ok ? '● Connected' : '○ Failed';
    $('#frStatus').style.color = ok ? 'var(--green)' : 'var(--red)';
  };
  $('#btnFrOpen').onclick = () => { $('#firstRun').classList.add('hidden'); localStorage.setItem('lm_firstRunDone', '1'); };

  // ─── Keyboard Shortcuts ───
  document.addEventListener('keydown', e => {
    // Ctrl+Enter / Cmd+Enter — send prompt
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); sendPrompt(); }
    // Ctrl+N / Cmd+N — new chat
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); createSession(); }
    // Ctrl+, / Cmd+, — settings
    if ((e.ctrlKey || e.metaKey) && e.key === ',') { e.preventDefault(); loadConfig(); $('#settingsModal').classList.remove('hidden'); }
    // Ctrl+B / Cmd+B — toggle sidebar
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); $('#sidebar').classList.toggle('open'); }
    // Ctrl+I / Cmd+I — toggle IDE
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') { e.preventDefault(); $('#ideDrawer').classList.toggle('hidden'); }
    // Escape — close modals/settings
    if (e.key === 'Escape') {
      if (!$('#settingsModal').classList.contains('hidden')) $('#settingsModal').classList.add('hidden');
    }
    // Ctrl+/ / Cmd+/ — focus terminal input
    if ((e.ctrlKey || e.metaKey) && e.key === '/') { e.preventDefault(); $('#termInput').focus(); }
  });

  // Show keyboard shortcuts hint briefly on load
  const hint = document.createElement('div');
  hint.className = 'shortcutHint';
  hint.innerHTML = '<kbd>Ctrl+Enter</kbd> Send · <kbd>Ctrl+N</kbd> New chat · <kbd>Ctrl+,</kbd> Settings · <kbd>Ctrl+I</kbd> IDE';
  document.body.appendChild(hint);
  setTimeout(() => { hint.classList.add('show'); setTimeout(() => hint.classList.remove('show'), 5000); }, 2000);
  setTimeout(() => hint.remove(), 8000);

  // Check first run
  setTimeout(async () => {
    try { const r = await fetch(API + '/api/lmstudio/models'); if (!r.ok) $('#firstRun').classList.remove('hidden'); } catch {}
  }, 1000);
});
