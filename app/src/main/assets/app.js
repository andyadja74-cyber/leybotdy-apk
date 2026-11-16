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
  window.Android&&Android.stopSpeak();
  const input=$('messageInput'),text=input.value.trim();if(!text)return;
  addMessage('user',text);input.value='';input.style.height='auto';addMessage('assistant','…');
  const last=currentChat.messages[currentChat.messages.length-1];
  const msgs=currentChat.messages.slice(0,-1).slice(-8).map(m=>({role:m.role,content:m.text}));
  const P=personaText();if(P&&msgs.length)msgs[msgs.length-1].content=P+'\n\n'+msgs[msgs.length-1].content;
  const el=$('messages').lastElementChild.firstChild,btn=document.querySelector('.send-btn');
  let raf=0;busy=true;ctrl=new AbortController();btn.textContent='■';const t0=Date.now();let n=0;
  try{
    const r=await fetch(API+'/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},signal:ctrl.signal,
      body:JSON.stringify({stream:true,temperature:0.8,top_p:0.9,top_k:40,repeat_penalty:1.15,max_tokens:+(localStorage.getItem('leybotdy_maxtok')||256),messages:msgs})});
    if(!r.ok)throw new Error('Gemma charge encore, réessayez dans un instant.');
    const rd=r.body.getReader(),dec=new TextDecoder();let buf='',out='';
    for(;;){const {done,value}=await rd.read();if(done)break;buf+=dec.decode(value,{stream:true});const lines=buf.split('\n');buf=lines.pop();
      for(const l of lines){if(!l.startsWith('data: ')||l.includes('[DONE]'))continue;
        try{const t=JSON.parse(l.slice(6)).choices[0].delta.content;if(t){out+=t;n++;last.text=out;if(!raf)raf=requestAnimationFrame(()=>{raf=0;el.innerHTML=md(out);$('messages').scrollTop=1e9;});}}catch{}}}
  }catch(err){
    if(last.text==='…')last.text=err.name==='AbortError'?'(interrompu)':'Erreur : '+err.message;
  }
  busy=false;btn.textContent='↑';if(n>1)last.speed=(n/((Date.now()-t0)/1000)).toFixed(1);saveChats();renderMessages();if(window.Android&&localStorage.getItem('leybotdy_autoread')==='1'&&n>0)Android.speak(last.text.replace(/[`*#_]/g,'').slice(0,3900));
});
$('messageInput').addEventListener('input',e=>{e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,130)+'px';});
$('newChat').onclick=newChat;
$('openSettings').onclick=()=>switchView($('settingsView').classList.contains('hidden')?'settings':'chat');
document.querySelectorAll('.side-link').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
function switchView(view){$('chatView').classList.toggle('hidden',view!=='chat');$('settingsView').classList.toggle('hidden',view!=='settings');document.querySelectorAll('.side-link').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$('sidebar').classList.remove('open');setNav(view);}
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
const A=window.Android;
function md(t){return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/```(?:\w*\n)?([\s\S]*?)(```|$)/g,'<pre>$1</pre>').replace(/`([^`\n]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>').replace(/^[-*] (.+)$/gm,'• $1');}
function renderMessages(){const host=$('messages');host.innerHTML='';(currentChat?.messages||[]).forEach(m=>{const d=document.createElement('div');d.className='message '+m.role;
  if(m.role==='user'){d.textContent=m.text;}else{const c=document.createElement('div');c.innerHTML=md(m.text);d.appendChild(c);
    if(m.text!=='…'){const f=document.createElement('div');f.className='msg-foot';const b=document.createElement('button');b.textContent='Copier';b.onclick=()=>{A?A.copy(m.text):navigator.clipboard&&navigator.clipboard.writeText(m.text)};f.appendChild(b);if(A){const v=document.createElement('button');v.textContent='🔊 Lire';v.onclick=()=>{if(A.speaking())A.stopSpeak();else A.speak(m.text.replace(/[`*#_]/g,'').slice(0,3900));};f.appendChild(v);}if(m.speed){const sp=document.createElement('span');sp.textContent=m.speed+' tok/s';f.appendChild(sp);}d.appendChild(f);}}
  host.appendChild(d);});host.scrollTop=host.scrollHeight;const ch=$('chips');if(ch)ch.classList.toggle('hidden',!(currentChat&&currentChat.messages.length));}
function renderHistory(){const h=$('historyList');h.innerHTML='';if(!chats.length){h.innerHTML='<div class="empty-history">Aucune discussion récente</div>';return;}
  chats.slice(0,30).forEach(c=>{const r=document.createElement('div');r.className='hist-row';const b=document.createElement('button');b.className='history-entry';b.textContent=c.title||'Discussion';b.onclick=()=>openChat(c.id);
    const x=document.createElement('button');x.className='hist-del';x.textContent='✕';x.onclick=()=>{chats=chats.filter(k=>k!==c);if(currentChat===c)currentChat=null;saveChats();renderHistory();renderMessages();if(!currentChat)$('welcome').classList.remove('hidden');};
    r.append(b,x);h.appendChild(r);});}
const boot=document.createElement('div');boot.className='boot hidden';
boot.innerHTML='<div class="boot-card"><div class="boot-orb">✧</div><h2 id="bootT"></h2><p id="bootP"></p><div class="bar" id="bootBar"><i id="bootI"></i></div><pre id="bootL"></pre><button class="boot-btn" id="bootBtn"></button></div>';
document.body.appendChild(boot);
let ready=false,since=0;
function showBoot(T,P,pct,log,label,act){boot.classList.remove('hidden');$('bootT').textContent=T;$('bootP').textContent=P||'';$('bootBar').style.display=pct>=0?'block':'none';$('bootI').style.width=pct+'%';$('bootL').textContent=log||'';$('bootL').style.display=log?'block':'none';const b=$('bootBtn');b.style.display=label?'inline-block':'none';b.textContent=label||'';b.onclick=act;}
function setStatus(t){const st=document.querySelector('.sidebar-bottom span:last-child');if(st)st.textContent=t;}
async function tick(){
  const s=A.status();
  if(s!=='starting'){ready=false;since=0;}
  if(s==='nomodel')return showBoot('Bienvenue','Choisissez votre fichier Gemma (.gguf) pour commencer.',-1,'','Choisir le modèle',()=>A.pick());
  if(s.startsWith('copying:')){const p=+s.slice(8);return showBoot('Préparation du modèle',p+' %',p);}
  if(s==='none')return showBoot('Moteur déchargé','La mémoire est libérée.',-1,'','Recharger Gemma',()=>A.reload());
  if(s==='error')return showBoot('Le moteur s’est arrêté','Détails :',-1,A.log(),'Relancer',()=>A.reload());
  if(ready)return;
  if(!since)since=Date.now();
  let ok=false;try{ok=(await fetch(API+'/health')).ok}catch(e){}
  if(ok){ready=true;boot.classList.add('hidden');setStatus('Gemma prêt (100 % local)');return;}
  setStatus('Chargement de Gemma…');
  if(Date.now()-since>90000)showBoot('Démarrage lent','Le moteur ne répond pas.',-1,A.log(),'Relancer',()=>{since=0;A.reload();});
  else showBoot('Chargement de Gemma…','Quelques secondes…',-1);
}
$('chgModel').onclick=()=>A?A.pick():showToast('Disponible dans l’application.');
$('unloadBtn').onclick=()=>{if(A){A.unload();showToast('Moteur déchargé.');}else showToast('Disponible dans l’application.');};
$('maxTok').value=localStorage.getItem('leybotdy_maxtok')||'256';
$('maxTok').onchange=e=>localStorage.setItem('leybotdy_maxtok',e.target.value);
$('autoRead').value=localStorage.getItem('leybotdy_autoread')||'0';
$('autoRead').onchange=e=>localStorage.setItem('leybotdy_autoread',e.target.value);
$('voiceBtn').onclick=()=>A?A.voiceSettings():showToast('Disponible dans l’application.');
if(A){tick();setInterval(tick,1500);}else waitServer();
function setNav(v){const b=$('openSettings');b.textContent=v==='settings'?'⌂':'⚙';b.setAttribute('aria-label',v==='settings'?'Accueil':'Paramètres');}
window.goBack=function(){const sb=$('sidebar');if(sb.classList.contains('open')){sb.classList.remove('open');return true;}if(!$('settingsView').classList.contains('hidden')){switchView('chat');return true;}return false;};
$('backHome').onclick=()=>switchView('chat');
document.querySelector('.top-title').onclick=()=>{switchView('chat');$('messages').scrollTo({top:0,behavior:'smooth'});};
let sx=0,sy=0;
document.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY;},{passive:true});
document.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-sx,dy=Math.abs(e.changedTouches[0].clientY-sy);if(dy>60||Math.abs(dx)<70)return;const sb=$('sidebar');if(dx>0&&sx<30)sb.classList.add('open');else if(dx<0&&sb.classList.contains('open'))sb.classList.remove('open');},{passive:true});
document.addEventListener('click',e=>{const sb=$('sidebar');if(sb.classList.contains('open')&&!sb.contains(e.target)&&e.target.id!=='menuToggle')sb.classList.remove('open');});
const tbtn=$('toBottom'),msc=$('messages');
msc.addEventListener('scroll',()=>tbtn.classList.toggle('hidden',msc.scrollHeight-msc.scrollTop-msc.clientHeight<200),{passive:true});
tbtn.onclick=()=>msc.scrollTo({top:msc.scrollHeight,behavior:'smooth'});
const PERSONAS={prof:'Explique comme un professeur patient, avec des mots simples et un exemple.',redac:'Réponds comme un rédacteur : texte soigné et bien tourné.',prog:'Réponds comme un développeur expert : code court et clair, explication brève.',court:'Réponds en deux phrases maximum.'};
function personaText(){return PERSONAS[localStorage.getItem('leybotdy_persona')]||'';}
let histQ='',renaming=null;
function renderHistory(){const h=$('historyList');h.innerHTML='';const q=histQ.trim().toLowerCase();
  const list=chats.filter(c=>!q||(c.title||'').toLowerCase().includes(q)||c.messages.some(m=>m.text.toLowerCase().includes(q))).sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0));
  if(!list.length){h.innerHTML='<div class="empty-history">'+(q?'Aucun résultat':'Aucune discussion récente')+'</div>';return;}
  list.slice(0,40).forEach(c=>{const r=document.createElement('div');r.className='hist-row';
    if(renaming===c.id){const i=document.createElement('input');i.className='hist-edit';i.value=c.title||'';const ok=()=>{c.title=i.value.trim()||c.title;renaming=null;saveChats();renderHistory();};i.onkeydown=e=>{if(e.key==='Enter')ok();};i.onblur=ok;r.appendChild(i);h.appendChild(r);setTimeout(()=>i.focus(),30);return;}
    const b=document.createElement('button');b.className='history-entry';b.textContent=(c.pinned?'📌 ':'')+(c.title||'Discussion');b.onclick=()=>openChat(c.id);
    const mk=(t,fn)=>{const x=document.createElement('button');x.className='hist-del';x.textContent=t;x.onclick=ev=>{ev.stopPropagation();fn(x);};return x;};
    r.append(b,mk('📌',()=>{c.pinned=!c.pinned;saveChats();renderHistory();}),mk('✎',()=>{renaming=c.id;renderHistory();}),
      mk('✕',x=>{if(!x.dataset.arm){x.dataset.arm=1;x.textContent='Sûr ?';x.classList.add('armed');setTimeout(()=>{x.dataset.arm='';x.textContent='✕';x.classList.remove('armed');},2500);return;}
        chats=chats.filter(k=>k!==c);if(currentChat===c)currentChat=null;saveChats();renderHistory();renderMessages();if(!currentChat)$('welcome').classList.remove('hidden');}));
    h.appendChild(r);});}
$('histSearch').oninput=e=>{histQ=e.target.value;renderHistory();};
document.querySelectorAll('#chips button').forEach(b=>b.onclick=()=>{if(busy)return;$('messageInput').value=b.dataset.q;$('composer').dispatchEvent(new Event('submit',{cancelable:true}));});
$('personaSel').value=localStorage.getItem('leybotdy_persona')||'';
$('personaSel').onchange=e=>localStorage.setItem('leybotdy_persona',e.target.value);
function applyTheme(){document.documentElement.classList.toggle('light',localStorage.getItem('leybotdy_theme')==='light');}
applyTheme();$('themeSel').value=localStorage.getItem('leybotdy_theme')||'dark';
$('themeSel').onchange=e=>{localStorage.setItem('leybotdy_theme',e.target.value);applyTheme();};
$('exportBtn').onclick=()=>{if(!currentChat||!currentChat.messages.length)return showToast('Aucune discussion à exporter.');
  const t=currentChat.title+'\n\n'+currentChat.messages.map(m=>(m.role==='user'?'Moi : ':'LEYBOTDY : ')+m.text).join('\n\n');
  if(A)A.share(t);else{navigator.clipboard&&navigator.clipboard.writeText(t);showToast('Copié.');}};
renderHistory();
