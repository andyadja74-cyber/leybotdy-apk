const $ = (id) => document.getElementById(id);
const STORAGE = { chats: 'leybotdy_chats_v1', memory: 'leybotdy_memory_v1', cache: 'leybotdy_ui_cache_v1' };
let chats = load(STORAGE.chats, []);
let currentChat = null;
function load(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function saveChats() { localStorage.setItem(STORAGE.chats, JSON.stringify(chats)); }
function showToast(message) { const t=$('toast'); t.textContent=message; t.classList.add('show'); clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>t.classList.remove('show'),2600); }
function newChat() { currentChat={id:Date.now(),title:'Nouvelle discussion',messages:[]}; chats.unshift(currentChat); saveChats(); renderHistory(); renderMessages(); $('welcome').classList.remove('hidden'); $('sidebar').classList.remove('open'); $('messageInput').focus(); }
function renderHistory() { const host=$('historyList'); host.innerHTML=''; if(!chats.length){host.innerHTML='<div class="empty-history">Aucune discussion récente</div>';return;} chats.slice(0,30).forEach(chat=>{const b=document.createElement('button');b.className='history-entry';b.textContent=chat.title||'Discussion';b.onclick=()=>openChat(chat.id);host.appendChild(b);}); }
function openChat(id) { currentChat=chats.find(c=>c.id===id)||null; renderMessages(); $('welcome').classList.toggle('hidden',!!(currentChat&&currentChat.messages.length)); $('sidebar').classList.remove('open'); }
function renderMessages() { const host=$('messages');host.innerHTML='';(currentChat?.messages||[]).forEach(m=>{const div=document.createElement('div');div.className='message '+m.role;div.textContent=m.text;host.appendChild(div);});host.scrollTop=host.scrollHeight; }
function addMessage(role,text) { if(!currentChat) newChat();currentChat.messages.push({role,text});if(currentChat.title==='Nouvelle discussion'&&role==='user')currentChat.title=text.slice(0,34)+(text.length>34?'…':'');saveChats();renderHistory();renderMessages();$('welcome').classList.add('hidden'); }
const API='http://127.0.0.1:8080';
let busy=false,ctrl=null;
async function waitServer(){const st=document.querySelector('.sidebar-bottom span:last-child');for(;;){try{const r=await fetch(API+'/health');if(r.ok){if(st)st.textContent='Gemma prêt (100 % local)';return;}}catch(e){}if(st)st.textContent='Chargement de Gemma…';await new Promise(r=>setTimeout(r,1500));}}
$('composer').addEventListener('submit',async e=>{
  e.preventDefault();
  if(busy){ctrl&&ctrl.abort();return;}
  const input=$('messageInput');const text=input.value.trim();if(!text)return;
  addMessage('user',text);input.value='';input.style.height='auto';
  addMessage('assistant','…');
  const last=currentChat.messages[currentChat.messages.length-1];
  const msgs=currentChat.messages.slice(0,-1).slice(-8).map(m=>({role:m.role,content:m.text}));
  const el=$('messages').lastElementChild;const btn=document.querySelector('.send-btn');
  busy=true;ctrl=new AbortController();btn.textContent='■';
  try{
    const r=await fetch(API+'/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},signal:ctrl.signal,
      body:JSON.stringify({stream:true,temperature:0.7,max_tokens:512,messages:[{role:'system',content:'Tu es LEYBOTDY, un assistant utile qui répond en français.'},...msgs]})});
    if(!r.ok)throw new Error('Gemma charge encore, réessayez dans un instant.');
    const rd=r.body.getReader(),dec=new TextDecoder();let buf='',out='';
    for(;;){const {done,value}=await rd.read();if(done)break;buf+=dec.decode(value,{stream:true});const lines=buf.split('\n');buf=lines.pop();
      for(const l of lines){if(!l.startsWith('data: ')||l.includes('[DONE]'))continue;
        try{const t=JSON.parse(l.slice(6)).choices[0].delta.content;if(t){out+=t;last.text=out;el.textContent=out;$('messages').scrollTop=1e9;}}catch{}}}
  }catch(err){
    if(last.text==='…'){last.text=err.name==='AbortError'?'(interrompu)':'Erreur : '+err.message;el.textContent=last.text;}
  }
  busy=false;btn.textContent='↑';saveChats();
});
$('messageInput').addEventListener('input',e=>{e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,130)+'px';});
$('newChat').onclick=newChat;
$('openSettings').onclick=()=>switchView('settings');
document.querySelectorAll('.side-link').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
function switchView(view){$('chatView').classList.toggle('hidden',view!=='chat');$('settingsView').classList.toggle('hidden',view!=='settings');document.querySelectorAll('.side-link').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$('sidebar').classList.remove('open');}
$('menuToggle').onclick=()=>$('sidebar').classList.toggle('open');
document.querySelectorAll('.suggestion').forEach(b=>b.onclick=()=>{$('messageInput').value=b.dataset.prompt;$('messageInput').focus();});
$('openCleanup').onclick=()=>$('cleanupModal').classList.remove('hidden');
$('cancelCleanup').onclick=()=>$('cleanupModal').classList.add('hidden');
$('cleanupModal').addEventListener('click',e=>{if(e.target===$('cleanupModal'))$('cleanupModal').classList.add('hidden');});
$('confirmCleanup').onclick=()=>{
  let removed=[];
  if($('deleteHistory').checked){localStorage.removeItem(STORAGE.chats);chats=[];currentChat=null;removed.push('historiques');renderHistory();renderMessages();$('welcome').classList.remove('hidden');}
  if($('deleteMemory').checked){localStorage.removeItem(STORAGE.memory);removed.push('mémoire locale');}
  if($('deleteCache').checked){localStorage.removeItem(STORAGE.cache);removed.push('cache de l’interface');}
  $('cleanupModal').classList.add('hidden');showToast(removed.length?'Nettoyage effectué : '+removed.join(', ')+'.':'Aucun élément sélectionné.');
};
renderHistory();
waitServer();
