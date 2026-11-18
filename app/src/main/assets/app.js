const NULLEL=new Proxy(function(){},{get:(t,k)=>k==='classList'?{add(){},remove(){},toggle(){},contains(){return false}}:(k==='style'||k==='dataset')?{}:(k==='value'||k==='textContent'||k==='innerHTML'||k==='className')?'':(k==='querySelectorAll')?(()=>[]):(()=>NULLEL),set:()=>true,apply:()=>NULLEL});
const $ = (id) => document.getElementById(id)||NULLEL;
const $q = (q) => document.querySelector(q)||NULLEL;
let autoUnl=false,lastAct=Date.now();
let histQ='',renaming=null;
const A=window.Android;
window.addEventListener('error',e=>{try{showToast('Erreur : '+e.message+' (l.'+e.lineno+')')}catch(_){}});
window.addEventListener('unhandledrejection',e=>{try{showToast('Erreur : '+((e.reason&&e.reason.message)||e.reason))}catch(_){}});
const STORAGE = { chats: 'leybotdy_chats_v1', memory: 'leybotdy_memory_v1', cache: 'leybotdy_ui_cache_v1' };
let chats = load(STORAGE.chats, []);
let currentChat = null;
function load(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function saveChats() { localStorage.setItem(STORAGE.chats, JSON.stringify(chats)); }
function showToast(message) { const t=$('toast'); t.textContent=message; t.classList.add('show'); clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>t.classList.remove('show'),2600); }
function newChat() { currentChat={id:Date.now(),title:'Nouvelle discussion',messages:[]}; chats.unshift(currentChat); saveChats(); renderHistory(); renderMessages(); $('welcome').classList.remove('hidden'); $('sidebar').classList.remove('open'); $('messageInput').focus(); }
function renderHistory() { const host=$('historyList'); host.innerHTML=''; if(!chats.length){host.innerHTML='<div class="empty-history">Aucune discussion récente</div>';return;} chats.slice(0,30).forEach(chat=>{const b=document.createElement('button');b.className='history-entry';b.textContent=chat.title||'Discussion';b.onclick=()=>openChat(chat.id);host.appendChild(b);}); }
function openChat(id) { currentChat=chats.find(c=>c.id===id)||null; renderMessages(); $('welcome').classList.toggle('hidden',!!(currentChat&&currentChat.messages.length)); $('sidebar').classList.remove('open'); }
function renderMessages() { const host=$('messages');host.innerHTML='';(currentChat?.messages||[]).forEach(m=>{const div=document.createElement('div');div.className='message '+m.role;div.textContent=m.text;host.appendChild(div);});scrollEnd(); }
function addMessage(role,text) { if(!currentChat) newChat();currentChat.messages.push({role,text});if(currentChat.title==='Nouvelle discussion'&&role==='user')currentChat.title=text.slice(0,34)+(text.length>34?'…':'');saveChats();renderHistory();renderMessages();$('welcome').classList.add('hidden'); }
const API='http://127.0.0.1:8080';
let busy=false,ctrl=null;
async function waitServer(){const st=$q('.sidebar-bottom span:last-child');for(;;){try{const r=await fetch(API+'/health');if(r.ok){if(st)st.textContent='Gemma prêt (100 % local)';return;}}catch(e){}if(st)st.textContent='Chargement de Gemma…';await new Promise(r=>setTimeout(r,1500));}}
$('composer').addEventListener('submit',async e=>{
  e.preventDefault();
  if(busy){ctrl&&ctrl.abort();return;}
  window.Android&&Android.stopSpeak();
  const input=$('messageInput'),text=input.value.trim();if(!text)return;
  addMessage('user',text);input.value='';input.style.height='auto';localStorage.removeItem('leybotdy_draft');markDay();
  if(currentChat.messages.length===1)currentChat.title=text.slice(0,32);
  const cm=tryCommand(text);if(cm!==null){addMessage('assistant',cm);saveChats();liveSay(cm);return;}
  const mr=tryMemory(text);if(mr!==null){addMessage('assistant',mr);saveChats();liveSay(mr);return;}
  const cr=tryCalc(text);if(cr!==null){addMessage('assistant',cr);saveChats();liveSay(cr);return;}
  addMessage('assistant','…');
  const last=currentChat.messages[currentChat.messages.length-1];
  const msgs=[];{let used=0;const hh=currentChat.messages.slice(0,-1);for(let i=hh.length-1;i>=0&&msgs.length<6;i--){const c=hh[i].text.startsWith('Erreur')?'(pas de réponse)':hh[i].text.slice(-900);if(used+c.length>2200)break;used+=c.length;msgs.unshift({role:hh[i].role,content:c});}while(msgs.length&&msgs[0].role!=='user')msgs.shift();}
  const P=personaText();if(P&&msgs.length)msgs[msgs.length-1].content=P+'\n\n'+msgs[msgs.length-1].content;
  const W=wrapForModel(text);if(W&&msgs.length)msgs[msgs.length-1].content=W;
  const el=$('messages').lastElementChild.firstChild,btn=$q('.send-btn');
  let raf=0;busy=true;ctrl=new AbortController();btn.textContent='■';const t0=Date.now();let n=0;
  try{
    {const fr=ramInfo();if(fr>=0&&fr<350&&Date.now()-lastWarn>120000){lastWarn=Date.now();showToast('Mémoire basse ('+fr+' Mo) : ferme tes autres applis.');}}
    await ensureEngine();
    const r=await fetch(API+'/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},signal:ctrl.signal,
      body:JSON.stringify({stream:true,temperature:0.7,top_p:0.95,top_k:64,repeat_penalty:1.05,max_tokens:fast()?128:+(localStorage.getItem('leybotdy_maxtok')||256),messages:[{role:'system',content:'Tu es un assistant. Réponds en français, de façon courte et exacte. Nous sommes le '+new Date().toLocaleString('fr-FR',{dateStyle:'full',timeStyle:'short'})+'.'+memText()+memCtx()+memText()},...msgs]})});
    if(!r.ok){let d='';try{d=(await r.text()).slice(0,160)}catch(_){}throw new Error(r.status===400?'discussion trop longue : ouvrez une nouvelle discussion.':r.status===503?'Gemma charge encore, réessayez dans un instant.':'HTTP '+r.status+' '+d);}
    const rd=r.body.getReader(),dec=new TextDecoder();let buf='',out='';
    for(;;){const {done,value}=await rd.read();if(done)break;buf+=dec.decode(value,{stream:true});const lines=buf.split('\n');buf=lines.pop();
      for(const l of lines){if(!l.startsWith('data: ')||l.includes('[DONE]'))continue;
        try{const t=JSON.parse(l.slice(6)).choices[0].delta.content;if(t){out+=t;n++;last.text=out;if(liveOn)liveFeed(out);if(!raf)raf=requestAnimationFrame(()=>{raf=0;el.innerHTML=md(out);scrollEnd();});}}catch{}}}
  }catch(err){
    if(last.text==='…')last.text=err.name==='AbortError'?'(interrompu)':'Erreur : '+err.message;
  }
  busy=false;btn.textContent='↑';quizAfter(last);if(liveOn)liveDone(last.text);if(n>1)last.speed=(n/((Date.now()-t0)/1000)).toFixed(1);saveChats();renderMessages();if(window.Android&&localStorage.getItem('leybotdy_autoread')==='1'&&n>0)Android.speak(last.text.replace(/[`*#_]/g,'').slice(0,3900));
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
function md(t){return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/```(?:\w*\n)?([\s\S]*?)(```|$)/g,'<pre>$1</pre>').replace(/`([^`\n]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>').replace(/^[-*] (.+)$/gm,'• $1');}
function renderMessages(){const host=$('messages');host.innerHTML='';(currentChat?.messages||[]).forEach(m=>{const d=document.createElement('div');d.className='message '+m.role;
  if(m.role==='user'){d.textContent=m.text;}else{const c=document.createElement('div');c.innerHTML=m.text==='…'?'<span class="dots"><i></i><i></i><i></i></span>':md(m.text);decorate(c);d.appendChild(c);
    if(m.text!=='…'){const f=document.createElement('div');f.className='msg-foot';const b=document.createElement('button');b.textContent='Copier';b.onclick=()=>{A?A.copy(m.text):navigator.clipboard&&navigator.clipboard.writeText(m.text)};f.appendChild(b);if(A){const v=document.createElement('button');v.textContent='🔊 Lire';v.onclick=()=>{if(A.speaking())A.stopSpeak();else A.speak(m.text.replace(/[`*#_]/g,'').slice(0,3900));};f.appendChild(v);}{const i0=currentChat.messages.indexOf(m),pq=i0>0?currentChat.messages[i0-1].text:'';[['⭐',()=>cardAdd('',m.text,true)],['📇',()=>cardAdd(pq,m.text,false)]].forEach(([t,fn])=>{const b2=document.createElement('button');b2.textContent=t;b2.onclick=fn;f.appendChild(b2);});}
if(m===currentChat.messages[currentChat.messages.length-1]){const g=document.createElement('button');g.textContent='↻';g.onclick=regen;f.appendChild(g);}if(m.speed){const sp=document.createElement('span');sp.textContent=m.speed+' tok/s';f.appendChild(sp);}d.appendChild(f);}}
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
function setStatus(t){const st=$q('.sidebar-bottom span:last-child');if(st)st.textContent=t;}
async function tick(){
  const s=A.status();
  if(s!=='starting'){ready=false;since=0;}
  if(s==='nomodel')return showBoot('Bienvenue','Choisissez votre fichier Gemma (.gguf) pour commencer.',-1,'','Choisir le modèle',()=>A.pick());
  if(s.startsWith('copying:')){const p=+s.slice(8);return showBoot('Préparation du modèle',p+' %',p);}
  if(s==='none'){if(autoUnl){boot.classList.add('hidden');setStatus('Gemma en veille');return;}return showBoot('Moteur déchargé','La mémoire est libérée.',-1,'','Recharger Gemma',()=>A.reload());}
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
function setNav(v){document.querySelectorAll('.fab').forEach(b=>b.style.display=v==='settings'?'none':'');const b=$('openSettings');b.textContent=v==='settings'?'⌂':'⚙';b.setAttribute('aria-label',v==='settings'?'Accueil':'Paramètres');}
window.goBack=function(){if(liveOn){liveStop();return true;}const sb=$('sidebar');if(sb.classList.contains('open')){sb.classList.remove('open');return true;}if(!$('settingsView').classList.contains('hidden')){switchView('chat');return true;}return false;};
$('backHome').onclick=()=>switchView('chat');
$q('.top-title').onclick=()=>{switchView('chat');window.scrollTo({top:0,behavior:'smooth'});};
let sx=0,sy=0;
document.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY;},{passive:true});
document.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-sx,dy=Math.abs(e.changedTouches[0].clientY-sy);if(dy>60||Math.abs(dx)<70)return;const sb=$('sidebar');if(dx>0&&sx<30)sb.classList.add('open');else if(dx<0&&sb.classList.contains('open'))sb.classList.remove('open');},{passive:true});
document.addEventListener('click',e=>{const sb=$('sidebar');if(sb.classList.contains('open')&&!sb.contains(e.target)&&e.target.id!=='menuToggle')sb.classList.remove('open');});
const tbtn=$('toBottom'),msc=$('messages');
window.addEventListener('scroll',()=>tbtn.classList.toggle('hidden',document.documentElement.scrollHeight-window.scrollY-window.innerHeight<300),{passive:true});
tbtn.onclick=()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'smooth'});
const PERSONAS={prof:'Explique comme un professeur patient, avec des mots simples et un exemple.',redac:'Réponds comme un rédacteur : texte soigné et bien tourné.',prog:'Réponds comme un développeur expert : code court et clair, explication brève.',court:'Réponds en deux phrases maximum.'};
function personaText(){return fast()?PERSONAS.court:(PERSONAS[localStorage.getItem('leybotdy_persona')]||'');}
function renderHistory(){const h=$('historyList');h.innerHTML='';const q=histQ.trim().toLowerCase();
  const list=chats.filter(c=>!q||(c.title||'').toLowerCase().includes(q)||(c.messages||[]).some(m=>String(m.text||'').toLowerCase().includes(q))).sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0));
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
document.querySelectorAll('#chips button[data-q]').forEach(b=>b.onclick=()=>{if(busy)return;$('messageInput').value=b.dataset.q;$('composer').dispatchEvent(new Event('submit',{cancelable:true}));});
$('personaSel').value=localStorage.getItem('leybotdy_persona')||'';
$('personaSel').onchange=e=>localStorage.setItem('leybotdy_persona',e.target.value);
function applyTheme(){document.documentElement.classList.toggle('light',localStorage.getItem('leybotdy_theme')==='light');}
applyTheme();$('themeSel').value=localStorage.getItem('leybotdy_theme')||'dark';
$('themeSel').onchange=e=>{localStorage.setItem('leybotdy_theme',e.target.value);applyTheme();};
$('exportBtn').onclick=()=>{if(!currentChat||!currentChat.messages.length)return showToast('Aucune discussion à exporter.');
  const t=currentChat.title+'\n\n'+currentChat.messages.map(m=>(m.role==='user'?'Moi : ':'LEYBOTDY : ')+m.text).join('\n\n');
  if(A)A.share(t);else{navigator.clipboard&&navigator.clipboard.writeText(t);showToast('Copié.');}};
renderHistory();

function scrollEnd(){window.scrollTo(0,document.documentElement.scrollHeight);}
function fast(){return localStorage.getItem('leybotdy_fast')==='1';}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function tryCalc(t){let e=t.toLowerCase().replace(/combien (font|fait|vaut)|calcule|calcul|=|\?/g,'').replace(/×|x(?=\s*\d)/g,'*').replace(/÷/g,'/').replace(/,/g,'.').replace(/\^/g,'**').replace(/(\d)\s+(?=\d)/g,'$1').trim();
  if(!/^[\d\s+\-*/().%]+$/.test(e)||!/\d\s*([+\-*/%]|\*\*)\s*[\d(]/.test(e))return null;
  try{const v=Function('"use strict";return ('+e+')')();if(typeof v!=='number'||!isFinite(v))return null;
    return e.replace(/\*\*/g,'^').replace(/\*/g,'×').replace(/\//g,'÷')+' = '+(+v.toFixed(8)).toLocaleString('fr-FR',{maximumFractionDigits:8});}catch(_){return null;}}
function regen(){if(busy)return;const ms=currentChat.messages;if(ms.length<2)return;ms.pop();const u=ms.pop();$('messageInput').value=u.text;renderMessages();$('composer').dispatchEvent(new Event('submit',{cancelable:true}));}
async function ensureEngine(){lastAct=Date.now();if(!A||A.status()!=='none')return;autoUnl=false;A.reload();for(let i=0;i<150;i++){await sleep(1000);try{if((await fetch(API+'/health')).ok)return;}catch(e){}}}
setInterval(()=>{const m=+(localStorage.getItem('leybotdy_idle')||5);if(!A||!m||busy||autoUnl||!ready)return;if(Date.now()-lastAct>m*60000){autoUnl=true;A.unload();setStatus('Gemma en veille');}},30000);
['touchstart','keydown'].forEach(ev=>document.addEventListener(ev,()=>{lastAct=Date.now();},{passive:true}));
function applyLook(){const d=document.documentElement;d.classList.toggle('perf',localStorage.getItem('leybotdy_perf')==='1');d.dataset.fs=localStorage.getItem('leybotdy_fs')||'m';
  d.style.setProperty('--ar',({violet:'170,110,255',vert:'90,210,150',rose:'255,120,190'})[localStorage.getItem('leybotdy_acc')]||'110,130,255');}
const sel=(id,key,def,fn)=>{const e=$(id);e.value=localStorage.getItem(key)||def;e.onchange=()=>{localStorage.setItem(key,e.value);fn&&fn();};};
sel('perfSel','leybotdy_perf','0',applyLook);sel('fsSel','leybotdy_fs','m',applyLook);sel('accSel','leybotdy_acc','bleu',applyLook);sel('idleSel','leybotdy_idle','5');applyLook();
const fc=$('fastChip'),paintFast=()=>fc.classList.toggle('on',fast());fc.onclick=()=>{localStorage.setItem('leybotdy_fast',fast()?'0':'1');paintFast();};paintFast();
const mi=$('messageInput');mi.value=localStorage.getItem('leybotdy_draft')||'';mi.addEventListener('input',()=>localStorage.setItem('leybotdy_draft',mi.value));
/*MEM_START*/
function memGet(){try{return JSON.parse(localStorage.getItem('leybotdy_mem')||'[]')}catch(_){return[]}}
function memSet(a){localStorage.setItem('leybotdy_mem',JSON.stringify(a.slice(-20)));}
function memText(){const m=memGet();let o='';for(let i=m.length-1;i>=0;i--){if((o+m[i]).length>700)break;o=m[i]+' ; '+o;}
  return o?' Ce que tu sais sur l’utilisateur : '+o.replace(/ ; $/,'')+'. Si on te demande des conseils ou quoi apprendre, appuie-toi dessus.':'';}
function memAdd(f){f=f.trim().replace(/[.!]+$/,'').slice(0,120);if(!f)return;const m=memGet().filter(x=>x.toLowerCase()!==f.toLowerCase());m.push(f);memSet(m);renderMem();}
const FIRST=s=>s.replace(/\bmon\b/gi,'son').replace(/\bma\b/gi,'sa').replace(/\bmes\b/gi,'ses').replace(/\bje suis\b/gi,'il est').replace(/\bj['’]ai\b/gi,'il a').replace(/\bj['’]/gi,'il ').replace(/\bje\b/gi,'il').replace(/\bmoi\b/gi,'lui');
function tryMemory(t){const x=t.trim();let m;
  if(/^(\/oublie|oublie)\s+(tout|toute la m[ée]moire)/i.test(x)){memSet([]);renderMem();return 'C’est effacé : je ne sais plus rien sur toi.';}
  if(m=x.match(/^(?:\/oublie|oublie)\s+(?:que\s+)?(.+)/i)){const k=m[1].toLowerCase(),a=memGet(),b=a.filter(f=>!f.toLowerCase().includes(k));memSet(b);renderMem();return a.length>b.length?'Oublié ✅':'Je n’ai rien trouvé à oublier avec « '+m[1]+' ».';}
  if(/^(\/m[ée]moire|que sais[- ]tu (de|sur) moi|qu['’]est[- ]ce que tu sais (de|sur) moi)/i.test(x)){const a=memGet();return a.length?'Voici ce que je sais :\n• '+a.join('\n• '):'Je ne sais encore rien sur toi. Dis-moi par exemple « j’aime la musique ».';}
  let f=null;
  if(m=x.match(/^(?:\/retiens|retiens(?: que)?|souviens[- ]toi(?: que)?|rappelle[- ]toi(?: que)?|note(?: que)?)\s+(.+)/i))f='L’utilisateur : '+FIRST(m[1]);
  else if(!x.includes('?')){
    if(m=x.match(/^je m['’]appelle\s+(.+)/i)||x.match(/^mon (?:pr[ée]nom|nom) est\s+(.+)/i))f='L’utilisateur s’appelle '+m[1];
    else if(m=x.match(/^j['’](?:aime|adore)(?: bien| beaucoup)?\s+(.+)/i))f='L’utilisateur aime '+m[1];
    else if(m=x.match(/^je n['’]aime pas\s+(.+)/i))f='L’utilisateur n’aime pas '+m[1];
    else if(m=x.match(/^(?:j['’]habite|je vis)\s+(?:à |a |en |au |aux )?(.+)/i))f='L’utilisateur habite '+m[1];
    else if(m=x.match(/^j['’]ai (\d{1,2}) ans/i))f='L’utilisateur a '+m[1]+' ans';
    else if(m=x.match(/^je veux (apprendre|devenir|faire)\s+(.+)/i))f='L’utilisateur veut '+m[1]+' '+m[2];
  }
  if(!f)return null;memAdd(f);return 'Noté ✅ — '+f;}
function renderMem(){const l=$('memList');if(!l)return;l.innerHTML='';const a=memGet();
  if(!a.length){l.innerHTML='<div class="empty-history">Rien pour l’instant.</div>';return;}
  a.forEach((f,i)=>{const r=document.createElement('div');r.className='mem-row';const sp=document.createElement('span');sp.textContent=f;const x=document.createElement('button');x.className='hist-del';x.textContent='✕';
    x.onclick=()=>{const b=memGet();b.splice(i,1);memSet(b);renderMem();};r.append(sp,x);l.appendChild(r);});}
$('memAdd').onclick=()=>{const i=$('memInput');memAdd(i.value);i.value='';};
$('memClear').onclick=()=>{memSet([]);renderMem();showToast('Mémoire effacée.');};
renderMem();
/*MEM_END*/
var lastWarn=0;
/*PURE_START*/
var quiz=null;
function wrapForModel(t){const m=t.match(/^\/quiz\s*(.*)/i);
  if(m){quiz={topic:m[1]||'culture générale',score:0,n:0,wait:false,first:true};return 'Pose-moi une seule question de quiz courte sur : '+quiz.topic+'. Ne donne pas la réponse.';}
  if(quiz&&quiz.wait)return 'Ma réponse : '+t+'\nDis si elle est correcte en commençant par « Correct » ou « Incorrect », explique en une phrase, puis pose une nouvelle question courte sur '+quiz.topic+'.';
  return null;}
function quizAfter(last){if(!quiz||last.text.startsWith('Erreur'))return;if(quiz.first){quiz.first=false;quiz.wait=true;return;}
  quiz.n++;if(/^\W*(correct|exact|bravo)/i.test(last.text))quiz.score++;last.text+='\n\n🎯 Score : '+quiz.score+'/'+quiz.n;}
function tryCommand(t){const x=t.trim();let m;
  if(/^\/stop\b/i.test(x)){if(!quiz)return 'Aucun quiz en cours.';const q=quiz;quiz=null;return 'Quiz terminé. Score final : '+q.score+'/'+q.n+'.';}
  if(m=x.match(/^\/cherche\s+(.+)/i)){const k=m[1].toLowerCase(),r=[];currentChat.messages.forEach(g=>{if(!g.text.startsWith('/')&&g.text.toLowerCase().includes(k))r.push((g.role==='user'?'Moi : ':'LEYBOTDY : ')+g.text.slice(0,90));});
    return r.length?r.length+' résultat(s) :\n• '+r.join('\n• '):'Aucun résultat pour « '+m[1]+' ».';}
  if(/^\/aide\b/i.test(x))return 'Commandes : /quiz sujet, /stop, /cherche mot, /retiens …, /oublie …, /memoire. Calculs : tape 12×7.';
  return null;}
function fmt(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function markDay(){let d=[];try{d=JSON.parse(localStorage.getItem('leybotdy_days')||'[]')}catch(_){}const k=fmt(new Date());if(!d.includes(k)){d.push(k);localStorage.setItem('leybotdy_days',JSON.stringify(d.slice(-60)));}}
function streak(){let d=[];try{d=JSON.parse(localStorage.getItem('leybotdy_days')||'[]')}catch(_){}const s=new Set(d);let n=0;const t=new Date();while(s.has(fmt(t))){n++;t.setDate(t.getDate()-1);}return n;}
/*PURE_END*/
var TIPS=['Demande « explique comme à un enfant » pour une réponse plus simple.','Appuie sur ⚡ Rapide pour des réponses courtes et vite.','Dis « retiens que… » pour que Gemma se souvienne de toi.','Une question courte et précise donne de meilleures réponses.','Ferme tes autres applis pour libérer de la mémoire.','Écris 12×7 : la calculatrice répond instantanément.','Essaie /quiz histoire pour t’entraîner avec des questions.','Touche 📇 sous une réponse pour créer une fiche de révision.'];
var TIPS_DEV=['Demande à Gemma d’expliquer ton code ligne par ligne.','Colle une erreur et demande : « qu’est-ce que ça veut dire ? ».','Choisis la personnalité Programmeur pour des réponses plus techniques.','Essaie /quiz python pour réviser en jouant.'];
function renderDaily(){let e=document.getElementById('daily');if(!e){e=document.createElement('div');e.id='daily';e.className='daily glass';const w=$('welcome');if(w)w.appendChild(e);}
  const pool=/python|code|program|dev/.test(memText().toLowerCase())?TIPS_DEV:TIPS;e.innerHTML='<b>💡 Astuce du jour</b><br>'+pool[new Date().getDate()%pool.length]+'<br><small>🔥 Série : '+streak()+' jour(s)</small>';}
function decorate(c){c.querySelectorAll('pre').forEach(p=>{const b=document.createElement('button');b.className='copy-code';b.textContent='Copier';b.onclick=()=>{const t=p.childNodes[0].textContent;A?A.copy(t):navigator.clipboard&&navigator.clipboard.writeText(t);};p.appendChild(b);});}
function cardsGet(){try{return JSON.parse(localStorage.getItem('leybotdy_cards')||'[]')}catch(_){return[]}}
function cardAdd(q,a,star){const c=cardsGet();c.push({q:q.slice(0,200),a:a.slice(0,900),star:!!star});localStorage.setItem('leybotdy_cards',JSON.stringify(c.slice(-50)));renderCards();showToast(star?'Ajouté aux favoris ⭐':'Fiche créée 📇');}
function renderCards(){const l=$('cardList');if(!l)return;l.innerHTML='';const c=cardsGet();if(!c.length){l.innerHTML='<div class="empty-history">Rien pour l’instant.</div>';return;}
  c.map((k,i)=>[k,i]).reverse().forEach(([k,i])=>{const d=document.createElement('details');d.className='card-row';const s=document.createElement('summary');s.textContent=(k.star?'⭐ ':'📇 ')+(k.q||k.a).slice(0,70);const p=document.createElement('div');p.textContent=k.a;const x=document.createElement('button');x.className='hist-del';x.textContent='✕';
    x.onclick=()=>{const b=cardsGet();b.splice(i,1);localStorage.setItem('leybotdy_cards',JSON.stringify(b));renderCards();};d.append(s,p,x);l.appendChild(d);});}
function prGet(){try{return JSON.parse(localStorage.getItem('leybotdy_prompts')||'[]')}catch(_){return[]}}
function renderPrompts(){const l=$('prList');if(l){l.innerHTML='';prGet().forEach((p,i)=>{const r=document.createElement('div');r.className='mem-row';const sp=document.createElement('span');sp.textContent=p;const x=document.createElement('button');x.className='hist-del';x.textContent='✕';
    x.onclick=()=>{const b=prGet();b.splice(i,1);localStorage.setItem('leybotdy_prompts',JSON.stringify(b));renderPrompts();};r.append(sp,x);l.appendChild(r);});}
  const ch=$('chips');if(!ch)return;ch.querySelectorAll('.mine').forEach(e=>e.remove());
  prGet().slice(0,6).forEach(p=>{const b=document.createElement('button');b.className='mine';b.textContent='📌 '+p.slice(0,18);b.onclick=()=>{$('messageInput').value=p;switchView('chat');$('messageInput').focus();};ch.appendChild(b);});}
$('prAdd').onclick=()=>{const i=$('prInput'),v=i.value.trim();if(!v)return;const b=prGet();b.push(v.slice(0,200));localStorage.setItem('leybotdy_prompts',JSON.stringify(b.slice(-12)));i.value='';renderPrompts();};
function ramInfo(){return A&&A.freeMb?A.freeMb():-1;}
function ramCheck(){const f=ramInfo(),e=$('ramVal');if(e)e.textContent=f<0?'—':f+' Mo libres';return f;}
setInterval(()=>{if(!$('settingsView').classList.contains('hidden'))ramCheck();},3000);
sel('thrSel','leybotdy_thr','4',()=>{if(A){A.setThreads(+localStorage.getItem('leybotdy_thr'));showToast('Moteur relancé…');A.reload();}});
sel('rateSel','leybotdy_rate','1',()=>{if(A&&A.setRate)A.setRate(+localStorage.getItem('leybotdy_rate'));});
if(A&&A.setRate)A.setRate(+(localStorage.getItem('leybotdy_rate')||1));
renderCards();renderPrompts();renderDaily();ramCheck();
var liveOn=false,livePos=0,livePending=0,liveFinishing=false,liveId=0,micOn=false,micBase='';
/*LIVE_START*/
function cleanSpeech(t){return t.replace(/[`*#_•]/g,'').replace(/\s+/g,' ').trim();}
function speakPiece(t){t=cleanSpeech(t);if(!t)return;livePending++;A.speakQ(t,'u'+(++liveId));setLiveState('speak');}
function liveFeed(out){const a=$('liveAns');if(a)a.textContent=out.slice(-240);const rest=out.slice(livePos),m=rest.match(/^[\s\S]*[.!?…\n](?=\s|$)/);if(m&&cleanSpeech(m[0]).length>2){speakPiece(m[0]);livePos+=m[0].length;}}
function liveDone(full){if(!liveOn)return;const rest=full.slice(livePos);if(cleanSpeech(rest))speakPiece(rest);livePos=full.length;liveFinishing=true;if(livePending===0)liveNext();}
function liveSay(t){if(!liveOn)return;livePos=0;livePending=0;$('liveAns').textContent=t.slice(-240);liveDone(t);}
function liveNext(){liveFinishing=false;if(liveOn)liveListen();}
window.onSpoken=()=>{if(livePending>0)livePending--;if(liveOn&&liveFinishing&&livePending===0)liveNext();};
/*LIVE_END*/
function setLiveState(s){const o=$('liveOrb');if(o)o.className='live-orb '+s;const t=$('liveState');if(t)t.textContent=({listen:'JE T’ÉCOUTE',think:'JE RÉFLÉCHIS…',speak:'JE RÉPONDS'})[s]||'';}
function liveListen(){if(!liveOn)return;setLiveState('listen');$('liveText').textContent='';A.listen();}
function liveSend(txt){livePos=0;livePending=0;liveFinishing=false;setLiveState('think');$('liveText').textContent=txt;$('liveAns').textContent='';$('messageInput').value=txt;$('composer').dispatchEvent(new Event('submit',{cancelable:true}));}
function liveStart(){if(!A||!A.speechAvailable()){showToast('Reconnaissance vocale indisponible : installe l’appli Google et le pack vocal français.');return;}
  liveOn=true;switchView('chat');$('live').classList.remove('hidden');const G=['Salut, comment tu vas ? Tu veux commencer par quoi ?','Salut, je suis ton IA locale. Tu veux commencer par quoi ?'];liveSay(G[Math.floor(Math.random()*G.length)]);}
function liveStop(){liveOn=false;if(A){A.stopListen();A.stopSpeak();}if(ctrl)ctrl.abort();$('live').classList.add('hidden');}
function paintMic(){const b=$('micBtn');if(b)b.classList.toggle('on',micOn);}
window.onSpeech=(type,txt)=>{
  if(type==='partial'){if(liveOn)$('liveText').textContent=txt;else if(micOn)$('messageInput').value=micBase+txt;return;}
  if(type==='final'){if(liveOn){if(/^\W*(stop|arrête|arrete|quitte)\W*$/i.test(txt)){liveStop();return;}liveSend(txt);}else if(micOn){micOn=false;paintMic();$('messageInput').value=micBase+txt;}return;}
  if(type==='error'){const c=+txt;
    if(liveOn){if(c===7||c===6)setTimeout(liveListen,300);else if(c===8||c===5)setTimeout(liveListen,900);else{liveStop();showToast(txt==='perm'?'Autorise le micro dans les réglages.':'Micro indisponible (code '+txt+'). Installe le pack vocal français de Google.');}}
    else if(micOn){micOn=false;paintMic();if(c!==7&&c!==6)showToast(txt==='perm'?'Autorise le micro.':'Micro indisponible (code '+txt+').');}}};
if(A){
  const mk=(id,t)=>{const b=document.createElement('button');b.id=id;b.className='fab';b.textContent=t;document.body.appendChild(b);return b;};
  mk('liveBtn','🎙').onclick=liveStart;
  mk('micBtn','🎤').onclick=()=>{if(micOn){micOn=false;A.stopListen();paintMic();return;}micBase=$('messageInput').value+($('messageInput').value?' ':'');micOn=true;paintMic();A.listen();};
  const lv=document.createElement('div');lv.id='live';lv.className='live hidden';
  lv.innerHTML='<div class="live-orb listen" id="liveOrb"></div><div class="live-state" id="liveState"></div><div class="live-text" id="liveText"></div><div class="live-ans" id="liveAns"></div><button class="boot-btn" id="liveEnd">Quitter le live</button>';
  document.body.appendChild(lv);$('liveEnd').onclick=liveStop;
}
