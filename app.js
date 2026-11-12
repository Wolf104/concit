"use strict";
const KIND={cafe:"Café",eat:"Restaurant",drink:"Bar",wine:"Wine bar",beer:"Craft beer",cheap:"Cheap eats",culture:"Culture",club:"Nightclub"};
/* Budgets are per unit: a meal, a drink, club entry or a ticket. */
const STEPS={coffee:[2,3,4,5,6,8,10,12,15],meal:[10,15,20,25,30,40,50,60,80,100,150,200],drink:[5,6,7,8,10,12,15,18,20,25],entry:[10,15,20,25,30,40,50],ticket:[0,5,10,15,20,30,50,75,100]};
const LABEL={coffee:"Max per coffee",meal:"Max per meal",drink:"Max per drink",entry:"Max entry price",ticket:"Max per ticket"};
const UNIT_TEXT={coffee:"a coffee",meal:"a meal",drink:"a drink",entry:"entry",ticket:"a ticket"};
const WHAT_UNIT={coffee:"coffee",eat:"meal",drinks:"drink",clubs:"entry",culture:"ticket",event:"ticket"};
const KIND_UNIT={cafe:"coffee",eat:"meal",cheap:"meal",drink:"drink",wine:"drink",beer:"drink",club:"entry",culture:"ticket"};
const HOT_UNIT={cafe:"coffee",eat:"meal",drink:"drink",club:"entry",culture:"ticket"};
const BAND={coffee:[3,5,8,12],meal:[15,30,55,130],drink:[7,11,15,20],entry:[15,20,30,40],ticket:[5,15,25,40]};
const costOf=(p,unit)=>{const c=p.costs||{}; if(c[unit]!=null) return c[unit]; if(unit==="coffee"&&c.drink!=null) return c.drink; return BAND[unit][(p.price||2)-1];};
const maxFor=(unit,i)=>i>=STEPS[unit].length?null:STEPS[unit][i];
const stepText=(unit,i)=>{const m=maxFor(unit,i);return m===null?"No limit":m===0?"Free only":`€${m}`};
/* Star ratings: p.stars is the 0–5 score, p.reviews how many reviews it is based on. */
const RATE_STEPS=[4,4.5];
const rateMin=v=>RATE_STEPS.includes(+v)?+v:0;
const rank=p=>p&&p.stars?(p.stars*(p.reviews||0)+4.2*150)/((p.reviews||0)+150):0;
const quality=p=>p.stars?Math.max(1,Math.min(3,1+(rank(p)-3.8)*2.5)):(p.hot||1);
const byRank=(a,b)=>rank(b)-rank(a);
const revText=n=>n>=10000?Math.round(n/1000)+"k":n>=1000?(n/1000).toFixed(1).replace(/\.0$/,"")+"k":String(n||0);
function starsHtml(p,cls){
  if(!p||p.stars==null) return `<span class="rate none${cls?" "+cls:""}">No rating yet</span>`;
  const v=(+p.stars).toFixed(1);
  return `<span class="rate${cls?" "+cls:""}" role="img" aria-label="Rated ${v} out of 5 from ${(p.reviews||0).toLocaleString("en-GB")} reviews"><span class="st5" style="--p:${Math.round(p.stars*20)}%" aria-hidden="true">★★★★★</span><b aria-hidden="true">${v}</b><small aria-hidden="true">(${revText(p.reviews)})</small></span>`;
}
function costText(p){const u=KIND_UNIT[p.kind],c=costOf(p,u);return c===0?"Free":`about €${c} ${UNIT_TEXT[u]}`}
const CUISINES=[["","Any"],["pizza","Pizza"],["pasta","Pasta"],["milanese","Milanese"],["seafood","Seafood"],["sushi","Sushi"],["asian","Asian"],["meat","Meat"],["street","Street food"],["world","World"],["veggie","Veggie"],["fine","Fine dining"]];
const CUISINE_TEXT=Object.fromEntries(CUISINES);
const hasCuisine=(p,c)=>!c||(p.cuisine||[]).includes(c);
const cuisineSelect=(act,val,any)=>`<select class="csel${val?" on":""}" data-cs="${act}" aria-label="Cuisine">${CUISINES.map(([k,l])=>`<option value="${k}" ${(val||"")===k?"selected":""}>${k?l:any}</option>`).join("")}</select>`;
const cuisineChips=(act,val)=>`<div class="chips sub" role="group" aria-label="Cuisine">${CUISINES.map(([k,l])=>`<button class="chip" data-act="${act}" data-v="${k}" aria-pressed="${(val||"")===k}">${l}</button>`).join("")}</div>`;
const AREAS=["brera","duomo","garibaldi","isola","lambrate","navigli","nolo","romana","venezia","sarpi","tortona"];

/* ---------- Logic ---------- */
const byId=id=>PLACES.find(p=>p.id===id)||EVENTS.find(e=>e.id===id)||null;
const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const parse=s=>{const[y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d)};
const addDays=(s,n)=>{const d=parse(s);d.setDate(d.getDate()+n);return iso(d)};
const short=s=>parse(s).toLocaleDateString("en-GB",{day:"numeric",month:"short"});
const wday=s=>parse(s).toLocaleDateString("en-GB",{weekday:"short"});
const long=s=>parse(s).toLocaleDateString("en-GB",{weekday:"long"});
const today=iso(new Date());
const isRun=e=>(parse(e.end)-parse(e.start))/864e5>7;
function km(a,b){const p=Math.PI/180,x=(b[2]-a[2])*p*Math.cos((a[1]+b[1])/2*p),y=(b[1]-a[1])*p;return Math.sqrt(x*x+y*y)*6371}
/* Opening hours: p.hours is Monday-first, "|" between days, "=" repeats the day before, "C" closed, e.g. "C|1200-1430,1900-2230|=|...". */
function hoursOn(p,day){ if(!p||!p.hours) return null; const a=String(p.hours).split("|"); for(let i=1;i<a.length;i++) if(a[i]==="=") a[i]=a[i-1]; return a[(parse(day).getDay()+6)%7]||null; }
const fmtHours=h=>h==="C"?"Closed":h.split(",").map(r=>r.replace(/^(\d\d)(\d\d)-(\d\d)(\d\d)$/,"$1:$2–$3:$4")).join("\n");
const open=(p,day)=>{ const h=hoursOn(p,day); return h?h!=="C":!(p.closed||[]).includes(parse(day).getDay()); };

/* The best places for the choices made, skipping anything the group has already seen. */
function shortlist(s,seen=[]){
  const pin=s.pin?[null,s.pin[0],s.pin[1]]:null;
  const near=(z,x)=>pin?(x&&x.lat?km(pin,[null,x.lat,x.lng]):ZONES[z]?km(pin,ZONES[z]):6):s.area&&z&&ZONES[z]?km(ZONES[s.area],ZONES[z]):(s.area?6:0);
  const local=pin||s.area;
  const R=pin&&s.radius?s.radius:0, inR=x=>{ if(!R) return true; const d=x.lat?km(pin,[null,x.lat,x.lng]):ZONES[x.zone]?km(pin,ZONES[x.zone]):null; return d!=null&&d<=R; };
  const unit=WHAT_UNIT[s.what], fits=x=>s.max==null||(x.cat?(s.max===0?x.priceNum===0:x.priceNum==null||x.priceNum<=s.max):costOf(x,unit)<=s.max);
  const places=want=>PLACES.filter(p=>want(p)&&open(p,s.day)&&!seen.includes(p.id)&&(!rateMin(s.rating)||(p.stars||0)>=rateMin(s.rating))&&(!s.metro||(p.metro||[]).length));
  let pool=[];
  if(s.what==="event"){
    pool=EVENTS.filter(e=>!e.sold&&e.cat!=="art"&&!isRun(e)&&e.end>=s.day&&e.start<=addDays(s.day,6)&&!seen.includes(e.id)&&fits(e)&&inR(e));
    pool.sort((a,b)=>(a.start>s.day?a.start:s.day).localeCompare(b.start>s.day?b.start:s.day)||near(a.zone,a)-near(b.zone,b));
    return pool.slice(0,5).map(e=>e.id);
  }
  if(s.what==="clubs"){
    pool=places(p=>p.occ.includes("night")&&fits(p));
  } else if(s.what==="culture"){
    const shows=EVENTS.filter(e=>e.cat==="art"&&e.start<=s.day&&e.end>=s.day&&!seen.includes(e.id)&&fits(e));
    pool=[...places(p=>p.kind==="culture"&&fits(p)),...shows];
  } else {
    const occ=s.what==="eat"?["dinner","cheap"]:s.what==="coffee"?["coffee"]:["drinks"];
    pool=places(p=>p.occ.some(o=>occ.includes(o))&&fits(p)&&(s.what!=="eat"||hasCuisine(p,s.cuisine)));
  }
  pool=pool.filter(inR);
  const score=x=>pin?near(x.zone,x)*1.8-quality(x)*.5:near(x.zone,x)-quality(x)*.9;
  pool.sort((a,b)=>score(a)-score(b));
  const out=[],zones={};
  for(const x of pool){ if(!local&&(zones[x.zone]||0)>=2) continue; zones[x.zone]=(zones[x.zone]||0)+1; out.push(x.id); if(out.length===5) break; }
  return out;
}
/* Most yeses wins. Ties go to the place that appeared first, which is the stronger match. */
function results(p){
  return p.options.map((id,i)=>({id,i,item:byId(id),yes:Object.entries(p.votes||{}).filter(([n,v])=>!isOut(p,n)&&v[id]===1).length}))
    .filter(r=>r.item).sort((a,b)=>b.yes-a.yes||a.i-b.i);
}
const votedAll=(p,n)=>p.options.every(id=>(p.votes?.[n]||{})[id]!==undefined);
/* People who said they can't make it don't vote and aren't waited for. */
const isOut=(p,n)=>(p.out||[]).includes(n);
const going=p=>p.people.filter(n=>!isOut(p,n));
const allDone=p=>going(p).length>0&&going(p).every(n=>votedAll(p,n));
const nextCard=(p,n)=>p.options.find(id=>(p.votes?.[n]||{})[id]===undefined);
function merge(a,b){const o={...a};for(const k in b)o[k]=b[k]&&typeof b[k]==="object"&&!Array.isArray(b[k])&&a[k]&&typeof a[k]==="object"?merge(a[k],b[k]):b[k];return o}

/* ---------- State ---------- */
const KEY="concit.v4", SKEY="concit.session";
const SB=window.CONCIT_CONFIG||{};
const load=k=>{try{return JSON.parse(localStorage.getItem(k))}catch{return null}};
const init=load(KEY)||{};
const S={tab:"decide",plan:null,code:null,saved:new Set(init.saved||[]),session:load(SKEY),authView:"login",authBusy:false,authNote:"",email:"",pending:init.pending||null,
  groups:[],gid:null,leaving:false,ver:0,inflight:0,
  form:{what:"drinks",day:today,area:"",group:init.group||"",idx:{coffee:4,meal:5,drink:5,entry:2,ticket:6}},hotIdx:{coffee:9,meal:12,drink:10,entry:7,ticket:9},hot:"all",hotView:"list",zone:null,sel:null,open:new Set(),mapFail:false,mapOk:false,ev:null};
const uid=()=>S.session?.user?.id;
const persist=()=>{try{localStorage.setItem(KEY,JSON.stringify({saved:[...S.saved],pending:S.pending,group:S.form.group}))}catch{}};
const saveSession=()=>{try{S.session?localStorage.setItem(SKEY,JSON.stringify(S.session)):localStorage.removeItem(SKEY)}catch{}};

/* ---------- Accounts ---------- */
const AUTH_ERRORS=[["invalid login","That email or password isn't right."],["already registered","That email already has an account. Log in instead."],["not confirmed","Confirm your email first, using the link we sent you."],["rate limit","Too many emails sent just now. Try again in a while."],["password","Choose a stronger password of at least 8 characters."],["email","Check that email address."]];
function authMessage(m){ const t=String(m||"").toLowerCase(), f=AUTH_ERRORS.find(([k])=>t.includes(k)); return f?f[1]:"That didn't work. Check your connection and try again."; }
async function authCall(path,body,method="POST",token){
  const r=await fetch(`${SB.url}/auth/v1/${path}`,{method,headers:{apikey:SB.anonKey,"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});
  const t=await r.text(); let j={}; try{j=t?JSON.parse(t):{}}catch{}
  if(!r.ok) throw new Error(j.msg||j.error_description||j.message||`auth ${r.status}`);
  return j;
}
function setSession(j){
  S.session={access_token:j.access_token,refresh_token:j.refresh_token,expires_at:j.expires_at||Math.floor(Date.now()/1000)+(j.expires_in||3600),user:j.user||S.session?.user};
  saveSession();
}
async function refreshSession(){
  if(refreshSession.p) return refreshSession.p;
  refreshSession.p=(async()=>{
    try{ setSession(await authCall("token?grant_type=refresh_token",{refresh_token:S.session.refresh_token})); }
    catch(e){ if(/token|refresh|invalid/i.test(e.message)) logout(true); throw e; }
    finally{ refreshSession.p=null; }
  })();
  return refreshSession.p;
}
function logout(expired){
  const t=S.session?.access_token;
  if(t&&!expired) authCall("logout",{}, "POST",t).catch(()=>{});
  S.session=null; S.plan=null; S.code=null; S.groups=[]; S.gid=null; S.acct=false; S.deleting=false; S.authView="login"; S.authNote=expired?"Please log in again.":""; S.tab="decide"; S.chatOpen=false;
  if(typeof CHAT!=="undefined"){ CHAT.gid=null; CHAT.msgs=[]; }
  if(!expired){ for(const k in AV) delete AV[k]; if(typeof AV_LARGE!=="undefined") for(const k in AV_LARGE) delete AV_LARGE[k]; try{localStorage.removeItem("concit.av")}catch{} }
  saveSession(); history.replaceState(null,"",location.pathname); render();
}
const redirectTo=()=>encodeURIComponent(location.origin+location.pathname);
async function authSubmit(){
  if(S.authBusy) return;
  const v=id=>(document.getElementById(id)?.value||"").trim(), view=S.authView, email=v("email"), pass=document.getElementById("password")?.value||"", name=v("name");
  S.email=email; S.authNote="";
  if(view==="signup"&&!name){ toast("Add your name"); return; }
  if(view!=="newpass"&&!email){ toast("Add your email"); return; }
  if(view!=="reset"&&pass.length<8){ toast("Passwords need at least 8 characters"); return; }
  const btn=document.querySelector("#authForm button[type=submit]"), label=btn.textContent;
  S.authBusy=true; btn.disabled=true; btn.textContent="One moment"; document.activeElement?.blur();
  try{
    if(view==="login") setSession(await authCall("token?grant_type=password",{email,password:pass}));
    if(view==="signup"){
      const j=await authCall(`signup?redirect_to=${redirectTo()}`,{email,password:pass,data:{name}});
      if(j.access_token) setSession(j); else { S.authView="login"; S.authNote=`We sent a link to ${email}. Open it to finish, then log in.`; }
    }
    if(view==="reset"){ await authCall(`recover?redirect_to=${redirectTo()}`,{email}); S.authView="login"; S.authNote=`If ${email} has an account, a reset link is on its way.`; }
    if(view==="newpass"){ await authCall("user",{password:pass},"PUT",S.session.access_token); S.authView="login"; S.fromEmail=null; toast("Password updated"); }
    S.authBusy=false;
    if(S.session){ await afterLogin(); return; }
    render();
  }catch(e){ S.authBusy=false; btn.disabled=false; btn.textContent=label; toast(authMessage(e.message)); }
}

/* ---------- Data ---------- */
async function rpc(fn,args,retry=true){
  if(S.session&&S.session.expires_at-60<Date.now()/1000) await refreshSession();
  const r=await fetch(`${SB.url}/rest/v1/rpc/${fn}`,{method:"POST",headers:{apikey:SB.anonKey,Authorization:`Bearer ${S.session?.access_token||SB.anonKey}`,"Content-Type":"application/json"},body:JSON.stringify(args||{})});
  if(r.status===401&&retry&&S.session){ await refreshSession(); return rpc(fn,args,false); }
  if(!r.ok) throw new Error(`${fn} failed (${r.status})`);
  const t=await r.text();
  return t?JSON.parse(t):null;
}
function setUrl(q){ history.pushState(null,"",q?`?${q}`:location.pathname); }
const shareUrl=()=>`${location.origin}${location.pathname}?plan=${S.code}`;
const inviteUrl=g=>`${location.origin}${location.pathname}?join=${g.invite_code}`;
const planBody=({votes,names,group_id,group_name,mine,left,...rest})=>rest;
async function shareOut(text,done){
  if(navigator.share){ try{ await navigator.share({text}); return; }catch(e){ if(e.name==="AbortError") return; } }
  (navigator.clipboard?navigator.clipboard.writeText(text):Promise.reject()).then(()=>toast(done),()=>toast(text));
}
async function refresh(){
  if(!S.code||refresh.busy||document.hidden) return;
  refresh.busy=true;
  try{
    const ver=S.ver, p=await rpc("get_plan",{p_code:S.code});
    if(ver!==S.ver||S.inflight) return;
    if(p&&JSON.stringify(p)!==JSON.stringify(S.plan)){ S.plan=p; render(); }
    if(!p){ S.code=null; S.plan=null; setUrl(null); render(); toast("That plan is no longer available."); }
  }catch{} finally{ refresh.busy=false; }
}
async function loadGroups(){
  if(!S.session||document.hidden) return;
  try{
    rpc("heartbeat").catch(()=>{});
    const g=await rpc("my_groups"); needAv((g||[]).flatMap(x=>x.members||[]));
    if(JSON.stringify(g)!==JSON.stringify(S.groups)){ S.groups=g||[]; if(!(S.chatOpen&&S.tab==="groups"&&!S.acct)) render(); }
  }catch{}
}
async function openPlan(code){
  try{
    await rpc("join_plan",{p_code:code});
    const p=await rpc("get_plan",{p_code:code});
    if(!p){ toast("That plan link doesn't work any more. Start a new plan."); setUrl(null); return; }
    p.options=p.options.filter(byId);
    S.code=code; S.plan=p; S.tab="decide";
    if(new URLSearchParams(location.search).get("plan")!==code) setUrl(`plan=${code}`);
    render(); scrollTo(0,0);
  }catch{ toast("Couldn't open that plan. Check your connection."); }
}
async function newPlan(p,group){
  try{
    const code=await rpc("create_plan",{p_data:planBody(p),p_group:group||null});
    await openPlan(code); loadGroups();
  }catch{ toast("Couldn't create the plan. Check your connection and try again."); }
}
async function changePlan(p,reset=false){
  S.ver++; S.plan=p; render();
  try{ await rpc("update_plan",{p_code:S.code,p_data:planBody(p),p_reset_votes:reset}); }catch{ toast("That change didn't save. Try again."); }
}
function armConfirm(){ S.confirm=S.code; render(); clearTimeout(armConfirm.t); armConfirm.t=setTimeout(()=>{ if(S.confirm){ S.confirm=null; render(); } },4000); }
async function closePlan(rpcName,msg){
  const code=S.code; S.confirm=null;
  try{ await rpc(rpcName,{p_code:code}); }catch{ toast("That didn't work. Check your connection and try again."); render(); return; }
  S.code=null; S.plan=null; setUrl(null); render(); scrollTo(0,0); toast(msg); loadGroups();
}
async function setAttending(go){
  const p=S.plan; if(!p||!S.code) return;
  const me=uid(), out=(p.out||[]).filter(n=>n!==me);
  S.ver++; S.plan={...p,out:go?out:[...out,me],votes:go?p.votes:Object.fromEntries(Object.entries(p.votes||{}).filter(([n])=>n!==me))}; render(); scrollTo(0,0);
  try{ await rpc("set_attending",{p_code:S.code,p_going:go}); toast(go?"You're back in. Time to vote.":"Got it, you're not going."); loadGroups(); }
  catch{ S.plan=p; render(); toast("That didn't save. Try again."); }
}
function clearPlan(){ S.plan=null; S.code=null; setUrl(null); render(); }
/* Voting as a deck of cards: the card flies right for yes, left for no, and the next one rises from the stack.
   The card can also be dragged sideways to vote. */
const calmMotion=()=>window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
let DEALING=false, LAST_CARD="";
function dealVote(id,v){
  if(DEALING) return;
  const card=document.querySelector(".vcard:not(.under)");
  if(!card||calmMotion()){ vote(id,v); return; }
  DEALING=true;
  card.classList.add("flying"); card.style.setProperty("--sy",v?1:0); card.style.setProperty("--sn",v?0:1);
  card.style.transform=`translateX(${v?135:-135}%) translateY(30px) rotate(${v?16:-16}deg)`; card.style.opacity="0";
  const under=document.querySelector(".vcard.under"); if(under){ under.style.transition="transform .33s cubic-bezier(.2,.8,.3,1)"; under.style.transform="none"; }
  document.querySelectorAll(".vvote button").forEach(b=>b.disabled=true);
  const nxt=document.querySelector(".vcard.under"); 
  setTimeout(()=>{ DEALING=false; if(nxt) LAST_CARD="dealt:"+nxt.dataset.id; vote(id,v); },330);
}
/* All cards in a vote share one height: the tallest option's, measured once per plan and screen width. */
let DECK_H={key:"",h:0};
function sizeDeck(){
  const deck=document.querySelector(".vdeck"), p=S.plan; if(!deck||!p) return;
  const key=(S.code||"")+"|"+p.options.join(",")+"|"+deck.clientWidth;
  if(DECK_H.key!==key){
    const box=document.createElement("div"); box.className="vdeck vmeasure"; box.style.cssText=`position:absolute;left:-9999px;top:0;width:${deck.clientWidth}px;visibility:hidden;--vh:0px`;
    box.innerHTML=p.options.filter(byId).map(id=>cardHtml(p,id,false)).join("");
    document.body.appendChild(box);
    DECK_H={key,h:Math.max(0,...[...box.querySelectorAll(".vcard")].map(c=>c.offsetHeight))};
    box.remove();
  }
  deck.style.setProperty("--vh",DECK_H.h+"px");
}
addEventListener("resize",()=>{ if(document.querySelector(".vdeck")) sizeDeck(); });
function setupDeck(){
  sizeDeck();
  const card=document.querySelector(".vcard:not(.under)"), under=document.querySelector(".vcard.under"); if(!card) return;
  const grow=f=>{ if(under) under.style.transform=`translateY(${12*(1-f)}px) scale(${.95+.05*f})`; };
  if(RETURNING&&RETURNING.id===card.dataset.id){ if(!calmMotion()){ card.style.setProperty("--bx",RETURNING.v?1:-1); card.classList.add("backin"); } RETURNING=null; }
  else if(card.dataset.id!==LAST_CARD&&!calmMotion()&&LAST_CARD!=="dealt:"+card.dataset.id){ card.classList.add("enter"); }
  LAST_CARD=card.dataset.id;
  let x0=null,y0=0,dx=0,drag=false;
  card.addEventListener("pointerdown",e=>{ if(DEALING||e.button>0||e.target.closest("a,button")) return; x0=e.clientX; y0=e.clientY; dx=0; drag=false; });
  card.addEventListener("pointermove",e=>{ if(x0==null) return; dx=e.clientX-x0;
    if(!drag){ if(Math.abs(dx)<8) return; if(Math.abs(e.clientY-y0)>Math.abs(dx)){ x0=null; return; } drag=true; card.setPointerCapture(e.pointerId); card.classList.add("dragging"); }
    card.style.transform=`translateX(${dx}px) rotate(${dx/22}deg)`; grow(Math.min(1,Math.abs(dx)/160));
    card.style.setProperty("--sy",Math.max(0,Math.min(1,dx/90))); card.style.setProperty("--sn",Math.max(0,Math.min(1,-dx/90))); });
  const end=()=>{ if(x0==null) return; x0=null; if(!drag) return; drag=false; card.classList.remove("dragging");
    if(Math.abs(dx)>90){ dealVote(card.dataset.id,dx>0?1:0); }
    else { card.style.transform=""; card.style.setProperty("--sy",0); card.style.setProperty("--sn",0); if(under){ under.style.transition="transform .25s ease"; grow(0); } } };
  card.addEventListener("pointerup",end); card.addEventListener("pointercancel",end);
}
/* Undo: take back your most recent vote and bring that card back to the top of the deck. */
const lastVoted=p=>{ const v=p.votes?.[uid()]||{}; return [...p.options].reverse().find(id=>v[id]!==undefined); };
let RETURNING=null;
async function undoVote(){
  const p=S.plan, id=p&&lastVoted(p); if(!id||DEALING) return;
  const was=p.votes[uid()][id], mine={...p.votes[uid()]}; delete mine[id];
  S.ver++; S.plan={...p,votes:{...p.votes,[uid()]:mine}};
  RETURNING={id,v:was}; render();
  S.inflight++;
  try{ await rpc("undo_vote",{p_code:S.code,p_place:id}); }
  catch{ toast("Couldn't undo that vote. Try again."); S.plan=merge(S.plan,{votes:{[uid()]:{[id]:was}}}); render(); }
  S.inflight--; S.ver++; loadGroups();
}
async function vote(id,v){
  S.ver++;
  S.plan=merge(S.plan,{votes:{[uid()]:{[id]:v}}});
  render(); if(!nextCard(S.plan,uid())) scrollTo(0,0);
  S.inflight++;
  try{ await rpc("cast_vote",{p_code:S.code,p_place:id,p_value:v}); }catch{ toast("That vote didn't save. Try again."); }
  S.inflight--; S.ver++; loadGroups();
}
async function joinByCode(code){
  try{
    const g=await rpc("join_group",{p_code:code});
    if(!g){ toast("That invite isn't valid. Ask for a new one."); return; }
    await loadGroups(); S.gid=g.id; S.tab="groups"; toast(`You're in ${g.name}`); render();
  }catch{ toast("Couldn't join that group. Check your connection."); }
}
function toast(t){const el=document.getElementById("toast");el.textContent=t;el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>el.hidden=true,3000)}
const hideToast=()=>{const el=document.getElementById("toast"); if(el) el.hidden=true; clearTimeout(toast.t);};

/* ---------- Views ---------- */
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const seg=(act,val,opts,label)=>`<div class="seg" role="group" aria-label="${label}">${opts.map(([v,l])=>`<button data-act="${act}" data-v="${v}" aria-pressed="${String(v)===String(val)}">${l}</button>`).join("")}</div>`;
const zname=z=>ZONES[z]?ZONES[z][0]:"";
/* Price as a free slider: any euro limit from the cheapest to the dearest, "Any price" at the far right.
   State: 0 = any price, -1 = free only, otherwise the most you'd pay in euros. */
const PRANGE={coffee:[2,12,.5],meal:[5,150,5],drink:[3,25,1],entry:[5,50,5],ticket:[0,50,1],all:[1,150,1]};
const prange=u=>PRANGE[u]||PRANGE.all;
const priceLabel=(u,v)=>!v?"Any price":v<0?(u==="entry"?"Free entry":"Free"):`Up to €${String(v).replace(".",",")}${u?" "+UNIT_TEXT[u]:" each"}`;
function priceSlider(act,unit,val){
  const [lo,hi,st]=prange(unit), any=+(hi+st).toFixed(2);
  const pos=!val?any:val<0?0:Math.min(hi,Math.max(lo,val));
  const lbl=priceLabel(unit,val);
  return `<div class="fsec"><div class="sliderhead"><span class="label">Price</span><b class="psval">${esc(lbl)}</b></div>
    <input type="range" class="pslider" data-ps="${act}" data-unit="${unit||""}" min="${lo}" max="${any}" step="${st}" value="${pos}" aria-label="Most you'd pay" aria-valuetext="${esc(lbl)}">
    <div class="psends" aria-hidden="true"><span>${lo===0?"Free":"€"+String(lo).replace(".",",")}</span><span>Any</span></div></div>`;
}
const psValue=el=>{ const [ ,hi]=prange(el.dataset.unit), v=+el.value; return v>hi?0:v===0?-1:v; };
function slider(id,unit,i){
  return `<div class="group"><div class="sliderhead"><span class="label">${LABEL[unit]}</span><b id="${id}Val">${stepText(unit,i)}</b></div><input type="range" id="${id}" data-slider="${unit}" min="0" max="${STEPS[unit].length}" step="1" value="${i}" aria-label="${LABEL[unit]}"></div>`;
}
const metroText=m=>m[0]?`M${m[0][0]} ${m[0][1]}`:"";
const placeLine=p=>[zname(p.zone),costText(p),metroText(p.metro)].filter(Boolean).join(" · ");
/* Changing the day drops picked events that aren't on that day. */
function setDay(d){ const f=S.form; f.day=d; if(f.picks) f.picks=f.picks.filter(id=>{ const e=EVENTS.find(x=>x.id===id); return !e||(e.start<=d&&e.end>=d); }); }
const dayName=d=>d===today?"today":d===addDays(today,1)?"tomorrow":parse(d).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"});
const eventWhen=e=>e.start===e.end?`${wday(e.start)} ${short(e.start)}`:(e.start<=today?`Until ${short(e.end)}`:`${short(e.start)} to ${short(e.end)}`);
const srcUrl=k=>SRC[k]?SRC[k][1]:/^https?:\/\//.test(k||"")?k:"#";
const mapsUrl=q=>"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(q+", Milano");

const WHAT_TEXT={coffee:"Coffee",eat:"Food",drinks:"Drinks",clubs:"Clubs",culture:"Culture",event:"An event"};
const dayText=d=>d===today?"tonight":d===addDays(today,1)?"tomorrow":`${long(d)} ${short(d)}`;
const planTitle=p=>`${p.what==="eat"&&p.cuisine?CUISINE_TEXT[p.cuisine]:WHAT_TEXT[p.what]||"Plan"} ${dayText(p.day)}${p.time?` at ${p.time}`:""}`;
const toVote=()=>S.groups.flatMap(g=>g.plans.filter(p=>!p.finished&&!p.me_out&&p.mine<p.options).map(p=>({...p,group:g.name})));
/* When: two quick picks, or any date up to six months ahead from a calendar. */
const MAX_AHEAD=180;
function calendar(sel){
  const base=S.calMonth||sel.slice(0,7), [y,m]=base.split("-").map(Number);
  const first=new Date(y,m-1,1), days=new Date(y,m,0).getDate(), lead=(first.getDay()+6)%7;
  const last=addDays(today,MAX_AHEAD), title=first.toLocaleDateString("en-GB",{month:"long",year:"numeric"});
  let cells="";
  for(let i=0;i<lead;i++) cells+="<span></span>";
  for(let d=1;d<=days;d++){ const v=`${base}-${String(d).padStart(2,"0")}`, off=v<today||v>last;
    cells+=`<button class="calday" data-act="pickDay" data-v="${v}" aria-pressed="${v===sel}" ${v===today?'aria-current="date"':""} ${off?"disabled":""} aria-label="${parse(v).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}">${d}</button>`; }
  return `<div class="cal"><div class="calhead"><button class="calnav" data-act="calMove" data-v="-1" ${base<=today.slice(0,7)?"disabled":""} aria-label="Previous month">‹</button><b>${title}</b><button class="calnav" data-act="calMove" data-v="1" ${base>=last.slice(0,7)?"disabled":""} aria-label="Next month">›</button></div>
  <div class="calgrid">${["M","T","W","T","F","S","S"].map(x=>`<span class="dow">${x}</span>`).join("")}${cells}</div></div>`;
}
/* Where: drop a pin by moving the map under a fixed centre pin. Falls back to an area list if the map can't load. */
const MILAN=[45.4642,9.19];
const nearestZone=([lat,lng])=>Object.entries(ZONES).reduce((b,[k,z])=>{const d=km([null,lat,lng],z);return d<b[1]?[k,d]:b},[null,1e9])[0];
const radText=r=>r<1?`${Math.round(r*1000)} m`:`${r} km`;
const pinText=(pin,r)=>r?`Within ${radText(r)} of ${zname(nearestZone(pin))}`:`Near ${zname(nearestZone(pin))}`;
const pickTarget=()=>S.pickOpen==="hot"?flt():S.form;
function viewPinPicker(){
  const r=S.pickR||2;
  return `<div id="pickSlot" class="pickslot"><div id="radRing" class="radring" aria-hidden="true"></div><div class="centerpin" aria-hidden="true">${PIN}</div></div>
    <div class="radrow"><label for="radius">Radius</label><input type="range" id="radius" min="0.5" max="10" step="0.5" value="${r}"><b id="radVal">${radText(r)}</b></div>
    <p class="fine center" style="margin-top:4px">Move the map to place the pin, then set how far you'll go.</p>
    <div class="inline" style="margin-top:10px"><button class="btn small plain" data-act="pickCancel">Cancel</button><button class="btn" data-act="pickSet" style="flex:1">Set area</button></div>`;
}
function pinButton(t,which){
  return `<div class="where"><button class="wherebtn" data-act="pickOpen" data-v="${which}"><span class="wpin">${PIN}</span><span>${t.pin?esc(pinText(t.pin,t.radius)):"Anywhere in Milan"}</span><small>${t.pin?"Change":"Drop a pin"}</small></button>
    ${t.pin?`<button class="wclear" data-act="pinClear" data-v="${which}" aria-label="Remove pin">×</button>`:""}</div>`;
}
function viewWhere(f){
  if(S.mapFail) return `<div class="group"><select id="area" data-change="area" aria-label="Area"><option value="">Anywhere in Milan</option>${AREAS.map(z=>`<option value="${z}" ${f.area===z?"selected":""}>${esc(zname(z))}</option>`).join("")}</select></div>`;
  return `<div class="group">${S.pickOpen===true?viewPinPicker():pinButton(f,"form")}</div>`;
}
let PICK=null, PICK_HOST=null;
/* Milan metro lines by station (M1–M5, including the full M4 opened in 2024). Names are matched to the map's station labels. */
const METRO_LINES={1:"#e2231a",2:"#009a49",3:"#d9a400",4:"#0071bc",5:"#8f5fa8"};
const METRO_STATIONS={
1:"Sesto 1° Maggio FS|Sesto Primo Maggio FS|Sesto 1º Maggio FS|Sesto Rondò|Sesto Marelli|Villa San Giovanni|Precotto|Gorla|Turro|Rovereto|Pasteur|Loreto|Lima|Porta Venezia|Palestro|San Babila|Duomo|Cordusio|Cairoli|Cairoli Castello|Cadorna|Cadorna FN|Conciliazione|Pagano|Buonarroti|Amendola|Lotto|Lotto Fieramilanocity|QT8|Lampugnano|Uruguay|Bonola|San Leonardo|Molino Dorino|Pero|Rho Fiera|Rho Fieramilano|Wagner|De Angeli|Gambara|Bande Nere|Primaticcio|Inganni|Bisceglie",
2:"Assago Milanofiori Forum|Assago Milanofiori Nord|Abbiategrasso|Famagosta|Romolo|Porta Genova|Porta Genova FS|Sant'Agostino|Sant'Ambrogio|Cadorna|Cadorna FN|Lanza|Moscova|Garibaldi|Garibaldi FS|Gioia|Centrale|Centrale FS|Caiazzo|Loreto|Piola|Lambrate|Lambrate FS|Udine|Cimiano|Crescenzago|Cascina Gobba|Vimodrone|Cologno Sud|Cologno Centro|Cologno Nord|Cascina Burrona|Cernusco sul Naviglio|Villa Pompea|Gorgonzola|Cascina Antonietta|Gessate|Cassina de' Pecchi|Bussero|Villa Fiorita|Villa Fiorita-Cernusco",
3:"Comasina|Affori FN|Affori Centro|Dergano|Maciachini|Zara|Sondrio|Centrale|Centrale FS|Repubblica|Turati|Montenapoleone|Duomo|Missori|Crocetta|Porta Romana|Lodi T.I.B.B.|Lodi TIBB|Brenta|Corvetto|Porto di Mare|Rogoredo|Rogoredo FS|San Donato",
4:"Linate Aeroporto|Repetti|Stazione Forlanini|Forlanini FS|Argonne|Susa|Dateo|Tricolore|San Babila|Sforza-Policlinico|Sforza Policlinico|Santa Sofia|Vetra|De Amicis|Sant'Ambrogio|Coni Zugna|California|Bolivar|Tolstoj|Frattini|Gelsomini|Segneri|San Cristoforo|San Cristoforo FS",
5:"Bignami|Ponale|Bicocca|Ca' Granda|Istria|Marche|Zara|Isola|Garibaldi|Garibaldi FS|Monumentale|Cenisio|Gerusalemme|Domodossola|Domodossola FN|Tre Torri|Portello|Lotto|Lotto Fieramilanocity|Segesta|San Siro Ippodromo|San Siro Stadio"};
/* Main train stations that connect to the metro. */
const TRAIN_LINKS={"milano centrale":[2,3],"milano porta garibaldi":[2,5],"milano cadorna":[1,2],"milano lambrate":[2],"milano porta genova":[2],"milano rogoredo":[3],"milano porta venezia":[1],"milano repubblica":[3],"milano dateo":[4],"milano forlanini":[4],"milano san cristoforo":[4],"sesto san giovanni":[1],"milano affori":[3],"milano domodossola":[5],"milano bovisa":[]};
function metroLookup(){
  const m={}, add=(n,l)=>{ for(const v of new Set([n.toLowerCase(),n.toLowerCase().replace(/'/g,"’")])){ m[v]=m[v]||[]; if(!m[v].includes(l)) m[v].push(l); } };
  for(const [l,names] of Object.entries(METRO_STATIONS)) names.split("|").forEach(n=>add(n,+l));
  for(const [n,ls] of Object.entries(TRAIN_LINKS)) ls.forEach(l=>add(n,l));
  Object.values(m).forEach(a=>a.sort());
  return m;
}
/* Metro and train stations from the map's own street data, drawn as clear dots with names. */
function addStations(map){
  const go=()=>{
    try{
      if(map.getLayer("concit-stations")||!map.getSource("openmaptiles")) return;
      const ref=map.getLayer("poi_transit"), font=(ref&&map.getLayoutProperty("poi_transit","text-font"))||["Noto Sans Bold"];
      if(ref) map.setLayoutProperty("poi_transit","visibility","none");
      const isStation=["all",["match",["get","class"],["railway","rail"],true,false],["!",["match",["get","subclass"],["tram_stop","subway_entrance","train_station_entrance","platform"],true,false]]];
      const look=metroLookup(), key=["downcase",["get","name"]], navy="#0f2a44";
      const colorPairs=[], labelPairs=[];
      for(const [n,ls] of Object.entries(look)){ if(!ls.length) continue;
        colorPairs.push(n,METRO_LINES[ls[0]]);
        const f=["format"]; ls.forEach(l=>f.push("M"+l+" ",{"text-color":METRO_LINES[l]})); f.push(["get","name"],{"text-color":navy});
        labelPairs.push(n,f); }
      map.addLayer({id:"concit-stations",type:"circle",source:"openmaptiles","source-layer":"poi",minzoom:12,filter:isStation,
        paint:{"circle-radius":["interpolate",["linear"],["zoom"],12,3.5,16,6],"circle-color":["match",key,...colorPairs,navy],"circle-stroke-color":"#ffffff","circle-stroke-width":2}});
      map.addLayer({id:"concit-station-lines",type:"symbol",source:"openmaptiles","source-layer":"poi",minzoom:12.6,maxzoom:13.6,filter:["all",isStation,["match",key,Object.keys(look).filter(k=>look[k].length),true,false]],
        layout:{"text-field":["match",key,...Object.keys(look).filter(k=>look[k].length).flatMap(k=>[k,look[k].map(l=>"M"+l).join(" ")]),""],"text-font":font,"text-size":10,"text-anchor":"left","text-offset":[0.7,0],"text-optional":true},
        paint:{"text-color":["match",key,...colorPairs,navy],"text-halo-color":"#ffffff","text-halo-width":1.6}});
      map.addLayer({id:"concit-station-names",type:"symbol",source:"openmaptiles","source-layer":"poi",minzoom:13.6,filter:isStation,
        layout:{"text-field":["match",key,...labelPairs,["get","name"]],"text-font":font,"text-size":11,"text-anchor":"left","text-offset":[0.8,0],"text-optional":true},
        paint:{"text-color":navy,"text-halo-color":"#ffffff","text-halo-width":1.6}});
    }catch(e){}
  };
  if(map.isStyleLoaded()) go(); else map.on("load",go);
}
/* Area names on the maps, so people can find their way around (Duomo, Brera...). Tapping one on the pin map moves the pin there. */
function zoneLabels(map,tap){
  const els=[];
  for(const [k,[name,lat,lng]] of Object.entries(ZONES)){
    const el=document.createElement(tap?"button":"div");
    el.className="zl"+(tap?" tap":""); el.textContent=name;
    if(tap){ el.type="button"; el.setAttribute("aria-label",`Move the pin to ${name}`); el.addEventListener("click",e=>{ e.stopPropagation(); map.easeTo({center:[lng,lat],zoom:Math.max(map.getZoom(),14)}); }); }
    new maplibregl.Marker({element:el,anchor:"center"}).setLngLat([lng,lat]).addTo(map); els.push(el);
  }
  const fit=()=>map.getContainer().classList.toggle("far",map.getZoom()<(tap?12.3:12.9));
  map.on("zoom",fit); fit();
}
/* The radius ring is drawn over the map around the pin; its size follows the map's scale. */
const mPerPx=(lat,z)=>40075016.686*Math.cos(lat*Math.PI/180)/(512*Math.pow(2,z));
const ringRoom=()=>{ const el=document.getElementById("pickSlot"); return el?Math.min(el.clientWidth,el.clientHeight):300; };
const ringPx=()=>PICK?2*(S.pickR||2)*1000/mPerPx(PICK.getCenter().lat,PICK.getZoom()):0;
const radZoom=r=>Math.min(16,Math.max(9,Math.log2(40075016.686*Math.cos(45.46*Math.PI/180)/(512*(2*r*1000/(ringRoom()*.72))))));
function sizeRing(){ const ring=document.getElementById("radRing"); if(!ring||!PICK) return; const d=ringPx(); ring.style.width=ring.style.height=d+"px"; }
async function mountPick(){
  const slot=document.getElementById("pickSlot"); if(!slot) return;
  if(!PICK_HOST){ PICK_HOST=document.createElement("div"); PICK_HOST.id="pickmap"; }
  slot.prepend(PICK_HOST);
  try{
    await loadMapLib();
    if(!document.getElementById("pickSlot")) return;
    const t=pickTarget(), c=t.pin||MILAN;
    if(!PICK){
      PICK=new maplibregl.Map({container:PICK_HOST,style:MAP_STYLE,center:[c[1],c[0]],zoom:radZoom(S.pickR||2),dragRotate:false,touchPitch:false,attributionControl:{compact:true}});
      PICK.addControl(new maplibregl.NavigationControl({showCompass:false}),"top-right");
      PICK.touchZoomRotate.disableRotation();
      PICK.on("click",e=>PICK.easeTo({center:e.lngLat}));
      zoneLabels(PICK,true); addStations(PICK); PICK.on("move",sizeRing);
      let ok=false; PICK.on("load",()=>{ok=true}); setTimeout(()=>{ if(!ok&&S.pickOpen){ S.pickOpen=false; mapFailed(); } },12000);
    } else if(S.pickFresh){ PICK.jumpTo({center:[c[1],c[0]],zoom:radZoom(S.pickR||2)}); }
    S.pickFresh=false; PICK.resize(); sizeRing();
    const sl=document.getElementById("radius");
    if(sl) sl.oninput=()=>{ S.pickR=+sl.value; document.getElementById("radVal").textContent=radText(S.pickR); sizeRing();
      const d=ringPx(), m=ringRoom(); if(d>m*.92||d<m*.3) PICK.easeTo({zoom:radZoom(S.pickR),duration:250}); };
  }catch{ S.pickOpen=false; mapFailed(); }
}
function viewDecideFilters(f,unit,part){
  const ev=f.what==="event", price=f.price||0, rating=ev?0:rateMin(f.rating), metro=!ev&&f.metro;
  const parts=[price?priceLabel(unit,price):"", rating?rating+"+ stars":"", metro?"Near a metro":""].filter(Boolean);
  const chips=(act,opts,val)=>`<div class="chips wrap">${opts.map(([k,l])=>`<button class="chip" data-act="${act}" data-v="${k}" aria-pressed="${String(val)===String(k)}">${l}</button>`).join("")}</div>`;
  if(part==="text") return parts.join(" · ");
  if(part==="pill") return `<button class="pill${parts.length?" on":""}" data-act="dfltOpen" aria-expanded="${!!S.dfltOpen}">${FILTER_ICON}<span>${parts.length?esc(parts.join(" · ")):"Filters"}</span></button>`;
  return `${S.dfltOpen?`<div class="fpanel">${parts.length?`<button class="link quiet fclear" data-act="dfltReset">Clear filters</button>`:""}
    ${priceSlider("dPrice",unit,price)}
    ${ev?"":`<div class="fsec"><span class="label">Rating</span>${chips("dRating",[[0,"Any"],[4,"4+ ★"],[4.5,"4.5+ ★"]],rating)}</div>
    <div class="fsec"><span class="label">Show only</span><div class="chips wrap"><button class="chip" data-act="dMetro" aria-pressed="${!!metro}">Near a metro</button></div></div>`}
  </div>`:""}`;
}
/* Choosing your own places: up to 8, searched by name, area or type. */
const PICK_MAX=8;
function pickPool(f){
  const q=(S.pickQ||"").trim().toLowerCase(), z=S.mapFail?S.pickArea||"":"", R=f.pin&&f.radius?f.radius:0;
  const unit=WHAT_UNIT[f.what], max=maxFromPrice(unit,f.price||0);
  const fits=x=>(max==null||(x.cat?(max===0?x.priceNum===0:x.priceNum==null||x.priceNum<=max):costOf(x,unit)<=max))&&(x.cat||((!rateMin(f.rating)||(x.stars||0)>=rateMin(f.rating))&&(!f.metro||(x.metro||[]).length)));
  const inArea=p=>(!z||p.zone===z)&&(!R||(pinDist(f,p)??99)<=R)&&fits(p);
  const evs=EVENTS.filter(e=>!e.sold&&e.start<=f.day&&e.end>=f.day&&inArea(e));
  if(q){ const m=x=>(x.name+" "+(x.zone?zname(x.zone):"")+" "+(x.venue||"")+" "+(x.kind?KIND[x.kind]:"")+" "+(x.cuisine||[]).map(c=>(CUISINES.find(k=>k[0]===c)||[c,c])[1]+" "+c).join(" ")+" "+(x.why||"")).toLowerCase().includes(q);
    return [...PLACES.filter(p=>inArea(p)&&m(p)).sort(byRank),...evs.filter(m)]; }
  if(f.what==="event") return evs.sort((a,b)=>a.start.localeCompare(b.start));
  const occ={eat:["dinner","cheap"],coffee:["coffee"],drinks:["drinks"]}[f.what];
  const want=f.what==="clubs"?p=>p.occ.includes("night"):f.what==="culture"?p=>p.kind==="culture":p=>p.occ.some(o=>occ.includes(o))&&(f.what!=="eat"||hasCuisine(p,f.cuisine));
  return PLACES.filter(p=>inArea(p)&&want(p)).sort((a,b)=>(R?pinDist(f,a)-pinDist(f,b):0)||byRank(a,b)||a.name.localeCompare(b.name));
}
/* Distance from the plan's pin, in km (null if we don't know where it is). */
const pinDist=(f,x)=>!f.pin?null:x.lat?km([null,f.pin[0],f.pin[1]],[null,x.lat,x.lng]):ZONES[x.zone]?km([null,f.pin[0],f.pin[1]],ZONES[x.zone]):null;
function pickBoxHtml(f){
  const picks=(f.picks||[]).filter(byId), pool=pickPool(f);
  const far=x=>{ const d=f.pin&&f.radius?pinDist(f,x):null; return d==null?"":` · ${d<0.975?Math.round(d*1000/50)*50+" m":d.toFixed(1)+" km"}`; };
  const sub=x=>x.cat?`${eventWhen(x)} · ${x.venue}${far(x)}`:`${KIND[x.kind]} · ${zname(x.zone)}${far(x)}${open(x,f.day)?"":" · closed that day"}`;
  const areas=S.mapFail?`<div class="chips pickareas" role="group" aria-label="Area">${areaOpts().map(([k,l])=>`<button class="chip" data-act="pickArea" data-v="${k}" aria-pressed="${(S.pickArea||"")===k}">${esc(l)}</button>`).join("")}</div>`:"";
  if(!S.pickSearched) return `${areas}<div id="pickChips">${pickChipsHtml(picks)}</div><p class="hint pickhint">Pick a category, set your area or type a name, then tap Search.</p>`;
  return `${areas}<div id="pickChips">${pickChipsHtml(picks)}</div>${pickListHtml(f,picks,pool,sub)}`;
}
const pickChipsHtml=picks=>picks.length?`<div class="picked">${picks.map(id=>`<button class="chip" data-act="pickToggle" data-id="${esc(id)}" aria-pressed="true" aria-label="Remove ${esc(byId(id).name)}">${esc(byId(id).name)} <span aria-hidden="true">×</span></button>`).join("")}</div><button class="link danger pickcancel" data-act="pickCancelAll">Cancel my selection</button>`:"";
function pickListHtml(f,picks,pool,sub){
  return `<div class="stack picklist">${pool.map(x=>{ const on=picks.includes(x.id);
    return `<button class="person" data-act="pickToggle" data-id="${esc(x.id)}" aria-pressed="${on}" ${!on&&picks.length>=PICK_MAX?"disabled":""}><span>${esc(x.name)}<small class="sub">${esc(sub(x))}</small>${x.cat?"":starsHtml(x)}</span><small>${on?"Added ✓":"Add"}</small></button>`; }).join("")||`<p class="empty">${f.what==="event"?(S.pickQ?`No events match “${esc(S.pickQ)}” on ${esc(dayName(f.day))}`:`No events on ${esc(dayName(f.day))}`):S.pickQ?`No places match “${esc(S.pickQ)}”`:"Nothing here"}${S.mapFail&&S.pickArea?` in ${esc(zname(S.pickArea))}`:f.pin&&f.radius?` within ${radText(f.radius)} of the pin. Try a bigger radius`:""}.</p>`}</div>`;
}
const pickStartLabel=f=>{ const n=(f.picks||[]).filter(byId).length; return (f.group?"Send to the group":"Start the vote")+` (${n})`; };
function viewPicker(f){
  return `<section class="dsec"><span class="label">Your ${f.what==="event"?"events":"places"} · up to ${PICK_MAX}</span>
  <input type="text" id="pickQ" data-search="pick" value="${esc(S.pickQ||"")}" placeholder="Search a name" autocomplete="off" aria-label="Search places by name">
  ${S.pickSearched?"":`<button class="btn pickgo" data-act="pickSearch">Search</button>`}
  <div id="pickBox">${pickBoxHtml(f)}</div></section>`;
}
/* Meet times to pick from: every half hour from 07:00 through to 03:00. */
const TIMES=[...Array(41)].map((_,i)=>{ const m=420+i*30; return `${String(Math.floor(m/60)%24).padStart(2,"0")}:${m%60?"30":"00"}`; });
const TIME_HINT={coffee:"10:00",eat:"20:00",drinks:"19:00",clubs:"23:00",culture:"15:00"};
const WHATS=[
  ["eat","Restaurants",'<path d="M7 3v8M4.5 3v4.5a2.5 2.5 0 0 0 5 0V3M7 11v10M17 3c-1.7 1.2-2.5 3.5-2.5 6v4H17zM17 13v8"/>'],
  ["drinks","Bars",'<path d="M4 4h16l-8 9zM12 13v7M8 20h8"/>'],
  ["coffee","Coffee",'<path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3v2M12 3v2"/>'],
  ["clubs","Clubs",'<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'],
  ["culture","Culture",'<path d="M3 21h18M4 10h16M12 3 3 8h18zM6 10v8M10 10v8M14 10v8M18 10v8"/>'],
  ["event","Events",'<path d="M3 9V6h18v3a3 3 0 0 0 0 6v3H3v-3a3 3 0 0 0 0-6zM14 6v2.5M14 11v2M14 15.5V18"/>']];
/* Setup: big category tiles, then one tidy list of settings (when, time, where, filters, who). */
function viewSetup(){
  const f=S.form, unit=WHAT_UNIT[f.what], todo=toVote(), pick=f.mode==="pick", ev=f.what==="event";
  if(f.day<today) f.day=today;
  if(f.group&&!S.groups.some(g=>g.id===f.group)) f.group="";
  if(!f.group&&S.groups.length&&!f.linkOnly) f.group=S.groups[0].id;
  const tom=addDays(today,1), picked=f.day!==today&&f.day!==tom, ftxt=viewDecideFilters(f,unit,"text");
  const row=(k,v,body="")=>`<div class="srow"><span class="k">${k}</span><div class="v">${v}</div></div>${body?`<div class="sbody">${body}</div>`:""}`;
  const rows=[
    f.what==="eat"?row("Cuisine",cuisineSelect("cuisine",f.cuisine,"Any")):"",
    row("When",`<div class="seg" role="group" aria-label="When"><button data-act="day" data-v="${today}" aria-pressed="${f.day===today}">Tonight</button><button data-act="day" data-v="${tom}" aria-pressed="${f.day===tom}">Tomorrow</button><button data-act="cal" aria-pressed="${picked}" aria-expanded="${!!S.calOpen}">${picked?short(f.day):"Other"}</button></div>`,S.calOpen?calendar(f.day):""),
    ev?"":row("Time",`<input type="text" class="tin" id="meetTime" inputmode="numeric" maxlength="5" autocomplete="off" placeholder="Any time" value="${esc(f.time||"")}" aria-label="Meet time, 24-hour, for example 19:30">`),
    S.mapFail?row("Where",`<select id="area" data-change="area" aria-label="Area"><option value="">Anywhere in Milan</option>${AREAS.map(z=>`<option value="${z}" ${f.area===z?"selected":""}>${esc(zname(z))}</option>`).join("")}</select>`)
      :row("Where",`<button class="sval${f.pin?" on":""}" data-act="pickOpen" data-v="form" aria-expanded="${S.pickOpen===true}">${f.pin?esc(pinText(f.pin,f.radius)):"Anywhere in Milan"}</button>${f.pin?`<button class="pillx" data-act="pinClear" data-v="form" aria-label="Remove pin">×</button>`:""}`,S.pickOpen===true?viewPinPicker():""),
    row("Filters",`<button class="sval${ftxt?" on":""}" data-act="dfltOpen" aria-expanded="${!!S.dfltOpen}">${ftxt?esc(ftxt):"None"}</button>`,S.dfltOpen?viewDecideFilters(f,unit):""),
    S.groups.length?row("Send to",`<select id="sendTo" data-change="sendTo" aria-label="Send to">${S.groups.map(g=>`<option value="${esc(g.id)}" ${f.group===g.id?"selected":""}>${esc(g.name)}</option>`).join("")}<option value="" ${f.group?"":"selected"}>Share by link</option></select>`):""
  ].join("");
  return `<div data-hero><h1>Where to?</h1></div>
  ${todo.length?`<div class="group"><span class="label">Waiting for your vote</span><div class="stack">${todo.map(p=>`<button class="person" data-act="openPlan" data-code="${esc(p.code)}"><span>${esc(planTitle(p))}<small class="sub">${esc(p.by||"Someone")} in ${esc(p.group)}</small></span><small>Vote</small></button>`).join("")}</div></div>`:""}
  <div class="tiles" role="group" aria-label="What">${WHATS.map(([k,l,ic])=>`<button class="tile" data-act="what" data-v="${k}" aria-pressed="${f.what===k}">${evIcon(ic)}<span>${l}</span></button>`).join("")}</div>
  <div class="sheet">${rows}</div>
  ${pick?viewPicker(f):""}
  ${pick?`<button class="btn stick" data-act="start" id="startBtn" ${(f.picks||[]).filter(byId).length?"":"hidden"}>${pickStartLabel(f)}</button>
    <button class="link quiet center" data-act="mode" data-v="auto">Suggest 5 for me instead</button>`
  :`<div class="ctas"><button class="btn" data-act="start" id="startBtn">Suggest 5 for me</button>
    <button class="link center" data-act="mode" data-v="pick">I'll pick myself</button></div>`}`;
}
function viewWaiting(p){
  const g=going(p), done=g.filter(n=>votedAll(p,n)).length, solo=p.people.length===1, meOut=isOut(p,uid());
  const nameOf=n=>n===uid()?"You":(p.names?.[n]||"Someone");
  const status=n=>isOut(p,n)?`<span class="out">Not going</span>`:votedAll(p,n)?`<span class="ok">Done</span>`:`<span>Voting</span>`;
  return `<div data-hero><button class="back" data-act="reset">‹ ${esc(p.group_name||"New plan")}</button><span>${esc(cap(planTitle(p)))}</span><h1>${solo?"Invite your friends":meOut?"You're not going":`${done} of ${g.length} voted`}</h1></div>
  ${meOut?`<p class="note">You said you can't make it, so you won't be asked to vote.</p>`:""}
  ${p.group_id?"":`<div class="group"><button class="btn" data-act="share">Share link</button></div>`}
  <div class="rows">${[...g,...p.people.filter(n=>isOut(p,n))].map(n=>`<div class="rowstat"><span>${esc(nameOf(n))}</span>${status(n)}</div>`).join("")}</div>
  ${!meOut&&!p.finished&&lastVoted(p)?`<button class="btn plain vchange" data-act="undoVote">${UNDO_ICON}<span>Change my last vote</span></button>`:""}
  ${Object.keys(p.votes||{}).length?`<button class="link center" data-act="finish">See the result now</button>`:""}
  ${solo&&!p.group_id?"":meOut?`<button class="btn plain" style="margin-top:18px" data-act="attend" data-v="1">I can make it after all</button>`:`<button class="link quiet center" data-act="attend" data-v="0">I can't make it</button>`}`;
}
const cap=t=>t.charAt(0).toUpperCase()+t.slice(1);
const UNDO_ICON='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>';
/* The voting card: a coloured header for the type of place, the rating, why it's on the list, key facts and links. */
const VI={
  price:'<path d="M17 6.5A6.5 6.5 0 1 0 17 17.5M4 10.5h9M4 13.5h9"/>',
  pin:'<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  metro:'<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M9 21l1.5-4M15 21l-1.5-4M8 13h.01M16 13h.01M5 9h14"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  cal:'<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  walk:'<circle cx="13" cy="4.5" r="1.8"/><path d="M10 21l2-6 3 3v3M8 12l2-4 3 1 2 4 3 1"/>',
  ticket:'<path d="M3 9V6h18v3a3 3 0 0 0 0 6v3H3v-3a3 3 0 0 0 0-6z"/>',
  dir:'<path d="M3 11l18-8-8 18-2-8z"/>', web:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  no:'<path d="M6 6l12 12M18 6 6 18"/>', yes:'<path d="M5 12.5l4.5 4.5L19 7.5"/>'};
const vi=(k,c)=>`<svg class="${c||"vi"}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${VI[k]}</svg>`;
const EV_COL={music:"#8b5cf6",art:"#ef6a3a",theatre:"#ef6a3a",sport:"#1d8a4a",festival:"#e0408a"};
const KIND_ICON={cafe:"coffee",eat:"eat",cheap:"eat",drink:"drinks",wine:"drinks",beer:"drinks",club:"clubs",culture:"culture"};
const distText=d=>d<0.975?Math.round(d*1000/50)*50+" m":d.toFixed(1)+" km";
function cardHtml(p,id,under){
  const it=byId(id), ev=!!it.cat;
  const far=p.pin&&it.lat?km([null,p.pin[0],p.pin[1]],[null,it.lat,it.lng]):null;
  const col=ev?(EV_COL[it.cat]||"#2f9bff"):mapCat(it)[2];
  const icon=(WHATS.find(w=>w[0]===(ev?"event":KIND_ICON[it.kind]))||WHATS[0])[2];
  const evCat=ev?(EV_CATS.find(c=>c[3](it))||[])[1]||"Event":"";
  const tags=ev?[evCat]:[KIND[it.kind],...(it.cuisine||[]).map(c=>(CUISINES.find(k=>k[0]===c)||[])[1]).filter(Boolean).slice(0,2)];
  const facts=[];
  if(ev){
    facts.push(["cal",eventWhen(it),it.time?it.time:"Time to be confirmed"]);
    facts.push(["ticket",it.priceNum===0?"Free":it.priceText||"Price to be confirmed","Tickets"]);
    facts.push(["pin",it.venue||"Venue to be confirmed",it.zone?zname(it.zone):"Milan"]);
    if(far!=null) facts.push(["walk",distText(far),"from your pin"]);
  } else {
    const c=costOf(it,KIND_UNIT[it.kind]);
    facts.push(["price",c===0?"Free":`About €${c}`,UNIT_TEXT[KIND_UNIT[it.kind]].replace(/^a /,"per ")]);
    facts.push(far!=null?["walk",distText(far),"from your pin"]:["pin",zname(it.zone),"Area"]);
    if((it.metro||[])[0]) facts.push(["metro",metroText(it.metro),"Nearest metro"]);
    const d=p.day||today, h=hoursOn(it,d), when=d===today?"today":d===addDays(today,1)?"tomorrow":parse(d).toLocaleDateString("en-GB",{weekday:"long"});
    facts.push(h?["clock",fmtHours(h),(h==="C"?"Closed ":"Open ")+when,h==="C"]:["clock",open(it,d)?"Hours not listed":"Usually closed",when,!open(it,d)]);
  }
  const links=ev?(/^https?:\/\//.test(it.src||"")?[[it.src,"web","Event page"]]:[]).concat(it.venue?[[mapsUrl(it.venue),"dir","Directions"]]:[])
    :[[mapsUrl(it.name+" "+it.addr),"dir","Directions"]].concat(/^https?:\/\//.test(it.web||"")?[[it.web,"web",/instagram\.com/.test(it.web)?"Instagram":/facebook\.com/.test(it.web)?"Facebook":"Website"]]:[]);
  const about=ev?"":[it.why,it.detail].filter(Boolean).map(t=>t.replace(/\.$/,"")).join(". ")+".";
  return `<article class="vcard${under?" under":""}" style="--cc:${col}" data-id="${esc(id)}"${under?' aria-hidden="true" inert':""}>
    ${under?"":`<span class="vstamp yes" aria-hidden="true">I'm in</span><span class="vstamp no" aria-hidden="true">Nope</span>`}
    <header class="vhead"><div class="vtags">${tags.map(t=>`<span>${esc(t)}</span>`).join("")}</div>
      <h2>${esc(it.name)}</h2>${ev?"":starsHtml(it,"big")}
      <svg class="vbig" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${icon}</svg></header>
    <div class="vbody">
      ${about.length>1?`<p class="vabout">${esc(about)}</p>`:""}
      <div class="vfacts">${facts.map(([k,a,b,w])=>`<div class="vfact${k==="clock"&&w?" warn":""}${k==="clock"?" vhours":""}">${vi(k)}<div><b>${esc(a)}</b><small>${esc(b)}</small></div></div>`).join("")}</div>
      ${ev?"":`<p class="vaddr">${vi("pin")}<span>${esc(it.addr)}</span></p>`}
      ${links.length?`<div class="vlinks">${links.map(([u,k,l])=>`<a href="${esc(u)}" target="_blank" rel="noopener">${vi(k)}${esc(l)}</a>`).join("")}</div>`:""}
    </div>
  </article>`;
}
function viewCard(p){
  const left=p.options.filter(o=>(p.votes?.[uid()]||{})[o]===undefined), id=left[0], i=p.options.indexOf(id), n=p.options.length;
  return `<div data-hero><button class="back" data-act="reset">‹ ${esc(p.group_name||"New plan")}</button><span>${esc(cap(planTitle(p)))}</span><h1>${i+1} of ${n}</h1></div>
  <div class="vtop"><div class="vprog" aria-hidden="true">${p.options.map((o,j)=>`<i class="${j<i?"done":j===i?"now":""}"></i>`).join("")}</div></div>
  <div class="vdeck" data-left="${Math.min(3,left.length-1)}">${left[1]?cardHtml(p,left[1],true):""}${cardHtml(p,id,false)}</div>
  <div class="vvote${lastVoted(p)?" hasundo":""}">${lastVoted(p)?`<button class="vback" data-act="undoVote" aria-label="Go back and change your last vote" title="Go back">${UNDO_ICON}</button>`:""}<button class="vno" data-act="vote" data-id="${esc(id)}" data-v="0">${vi("no","vic")}<span>Nope</span></button><button class="vyes" data-act="vote" data-id="${esc(id)}" data-v="1">${vi("yes","vic")}<span>I'm in</span></button></div>
  ${p.people.length>1||p.group_id?`<button class="link quiet center" data-act="attend" data-v="0">I can't make it</button>`:""}`;
}
function viewResult(p){
  const r=results(p), w=r[0], total=Object.keys(p.votes||{}).filter(n=>!isOut(p,n)).length||going(p).length, back=p.group_id?(p.group_name||"Back"):"New plan";
  if(!w||w.yes===0) return `<div data-hero><button class="back" data-act="reset">‹ ${esc(back)}</button><span>Nobody said yes to any of these</span><h1>No match this round</h1></div>
    <button class="btn" data-act="again">Try 5 more</button>`;
  const it=w.item, where=it.cat?it.venue:`${it.addr}`, sub=it.cat?eventWhen(it):[metroText(it.metro),zname(it.zone)].filter(Boolean).join(" · ");
  const n=going(p).length, outN=p.people.filter(x=>isOut(p,x)).map(x=>x===uid()?"You":(p.names?.[x]||"Someone")), votes=x=>`${x.yes} ${x.yes===1?"vote":"votes"}`;
  return `<div data-hero><button class="back" data-act="reset">‹ ${esc(back)}</button><h1>Results</h1></div>
  <section class="poll" aria-label="Vote results">
    <div class="pollhead"><div><span class="label">${p.group_id?"Concit group":"Concit plan"}</span><h2>${esc(p.group_name||planTitle(p))}</h2>
      <p class="dim">${n} ${n===1?"person":"people"} going · ${esc(planTitle(p))}</p>${outN.length?`<p class="dim">Not going: ${esc(nameList(outN))}</p>`:""}</div>${GROUP_ICON}</div>
    <h3>Where are we going?</h3>
    <div class="pollrows">${r.map((x,i)=>`<div class="pollrow${i===0?" lead":""}">
      <div class="prtop"><span class="prname">${esc(x.item.name)}</span><span class="prvotes">${votes(x)}</span></div>
      <div class="prbar" role="img" aria-label="${esc(x.item.name)}: ${x.yes} of ${total}"><i style="width:${total?Math.round(x.yes/total*100):0}%"></i></div></div>`).join("")}</div>
    <p class="pollwin">${TROPHY_ICON}<span>Winner: <b>${esc(it.name)}</b></span></p>
  </section>
  <div class="win"><p class="ok">${w.yes} of ${total} said yes</p>${p.time?`<p><b>Meet at ${esc(p.time)}</b> · ${esc(dayText(p.day))}</p>`:""}<p>${esc(where)}</p><p class="dim">${esc(sub)}</p></div>
  <div class="stack"><button class="btn" data-act="copy">Copy the details</button><a class="btn plain" href="${mapsUrl(it.name+" "+where)}" target="_blank" rel="noopener">Directions</a></div>`;
}
const GROUP_ICON='<svg class="pollicon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 19.5c0-3.4 2.7-5.8 6-5.8s6 2.4 6 5.8"/><circle cx="16.6" cy="9" r="2.6"/><path d="M16 13.8c2.8.2 5 2.3 5 5.2"/></svg>';
const TROPHY_ICON='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 6H5a2 2 0 0 0 2 4h1M16 6h3a2 2 0 0 1-2 4h-1M12 13v4M8.5 20h7M10 17h4"/></svg>';
function viewDecide(){
  const p=S.plan;
  if(!p) return viewSetup();
  if((p.left||[]).includes(uid())&&!p.people.includes(uid())) return viewLeft(p);
  if(p.finished||(allDone(p)&&p.people.length>1)) return viewResult(p)+planManage(p);
  if(p.people.includes(uid())&&!isOut(p,uid())&&nextCard(p,uid())) return viewCard(p)+planManage(p);
  return viewWaiting(p)+planManage(p);
}
/* Delete (whoever made the plan) or leave (everyone else). Both need a second tap to confirm. */
function planManage(p){
  const me=uid(), ask=S.confirm===S.code;
  if(p.mine) return `<div class="manage"><button class="link danger center" data-act="planDelete">${ask?"Tap again to delete it for everyone":"Delete plan"}</button></div>`;
  if(p.people.includes(me)) return `<div class="manage"><button class="link danger center" data-act="planLeave">${ask?"Tap again to leave":"Leave plan"}</button></div>`;
  return "";
}
function viewLeft(p){
  return `<div data-hero><button class="back" data-act="reset">‹ ${esc(p.group_name||"Back")}</button><span>${esc(cap(planTitle(p)))}</span><h1>You left this plan</h1></div>
  <p class="note">You won't be asked to vote and it's off your list.</p>
  ${p.finished?"":`<button class="btn plain" data-act="planRejoin">Rejoin the plan</button>`}`;
}

/* ---------- Login ---------- */
function viewAuth(){
  const v=S.authView, b=S.authBusy, invited=S.pending?.join, f=(id,type,label,auto,val="")=>`<label class="field"><span class="label">${label}</span><input type="${type}" id="${id}" autocomplete="${auto}" value="${esc(val)}" ${b?"disabled":""}></label>`;
  const titles={login:invited?"Log in to join the group":"Welcome back",signup:invited?"Create an account to join":"Create your account",reset:"Reset your password",newpass:"Choose a new password"};
  const main={login:"Log in",signup:"Create account",reset:"Send reset link",newpass:"Save password"}[v];
  return `<div data-hero><h1>${titles[v]}</h1></div>
  ${S.authNote?`<p class="note">${esc(S.authNote)}</p>`:""}
  <form id="authForm" novalidate>
    ${v==="signup"?f("name","text","Your name","name"):""}
    ${v==="newpass"?"":f("email","email","Email","email",S.email)}
    ${v==="reset"?"":f("password","password",v==="newpass"?"New password":"Password",v==="login"?"current-password":"new-password")}
    <button class="btn" type="submit" ${b?"disabled":""}>${b?"One moment":main}</button>
  </form>
  <div class="links">
  ${v==="login"?`<p>New to Concit? <button class="link" data-act="authView" data-v="signup">Create an account</button></p><p><button class="link quiet" data-act="authView" data-v="reset">Forgot your password?</button></p>`:""}
  ${v==="signup"?`<p>Already have an account? <button class="link" data-act="authView" data-v="login">Log in</button></p><p class="fine">See how Concit handles your data in the <a href="privacy.html">privacy notice</a>.</p>`:""}
  ${v==="reset"?`<p><button class="link" data-act="authView" data-v="login">Back to log in</button></p>`:""}
  </div>`;
}

/* ---------- Groups ---------- */
function planRow(p){
  const status=p.finished||(p.people>0&&p.done>=p.people)?"See result":p.me_out?"Not going":p.mine<p.options?"Vote":`${p.done} of ${p.people} voted`;
  return `<button class="person" data-act="openPlan" data-code="${esc(p.code)}"><span>${esc(planTitle(p))}<small class="sub">Started by ${esc(p.by||"someone")}</small></span><small>${status}</small></button>`;
}
/* ---------- Profile pictures ---------- */
/* Pictures are small JPEGs fetched once per version and cached on this device. */
const AV=(()=>{try{return JSON.parse(localStorage.getItem("concit.av"))||{}}catch{return {}}})();
const saveAv=()=>{try{localStorage.setItem("concit.av",JSON.stringify(AV))}catch{}};
let AV_BUSY=false;
async function needAv(people){
  const want=[]; let dropped=false;
  for(const p of people||[]){ if(!p||!p.id) continue;
    if(p.av==null){ if(AV[p.id]){ delete AV[p.id]; dropped=true; } }
    else if(!AV[p.id]||AV[p.id].v!==p.av) want.push(p.id); }
  if(dropped){ saveAv(); repaintAv(); }
  if(!want.length||AV_BUSY) return;
  AV_BUSY=true;
  try{ const got=await rpc("get_avatars",{p_ids:[...new Set(want)]}); for(const [id,x] of Object.entries(got||{})) AV[id]={v:x.v,img:x.img}; saveAv(); repaintAv(); }
  catch{} finally{ AV_BUSY=false; }
}
function repaintAv(){ if(S.chatOpen&&document.getElementById("chatList")) paintChat(false); else render(); }
const AV_COLORS=["#2f9bff","#7a5af8","#ef6a5b","#16a37f","#e8912d","#d6418f","#3d8d4f","#5b6cf0"];
function avatarHtml(id,name,cls="",open=true){
  const a=AV[id];
  if(a&&a.img) return open?`<img class="av tap ${cls}" src="${a.img}" alt="${esc(name||"")}" draggable="false" data-act="viewAv" data-id="${esc(id)}" data-name="${esc(name||"")}" role="button" tabindex="0" aria-label="View ${esc(name||"their")} photo">`:`<img class="av ${cls}" src="${a.img}" alt="" draggable="false">`;
  let h=0; for(const c of String(id||name)) h=(h*31+c.charCodeAt(0))>>>0;
  return `<span class="av ${cls}" style="background:${AV_COLORS[h%AV_COLORS.length]}" aria-hidden="true">${esc((name||"?").trim().charAt(0).toUpperCase()||"?")}</span>`;
}
/* Photo cropper: drag to move, slider / pinch / scroll to zoom, inside a circular frame.
   It lives in its own overlay outside #view so background refreshes never redraw it. */
const CROP_OUT=192;
function loadImage(file){
  return new Promise((ok,no)=>{ const url=URL.createObjectURL(file), i=new Image();
    i.onload=()=>{ URL.revokeObjectURL(url); i.naturalWidth?ok(i):no(new Error("empty")); };
    i.onerror=()=>{ URL.revokeObjectURL(url); no(new Error("empty")); }; i.src=url; });
}
function openCropper(img){
  return new Promise(done=>{
    const wrap=document.createElement("div"); wrap.className="cropwrap"; wrap.setAttribute("role","dialog"); wrap.setAttribute("aria-modal","true"); wrap.setAttribute("aria-label","Adjust your photo");
    wrap.innerHTML=`<div class="cropbox"><h2>Adjust your photo</h2>
      <div class="cropstage" tabindex="0" aria-label="Photo position. Drag, or use the arrow keys; plus and minus zoom."><canvas></canvas><div class="cropring" aria-hidden="true"></div></div>
      <label class="cropzoom"><span aria-hidden="true">−</span><input type="range" min="1" max="4" step="0.01" value="1" aria-label="Zoom"><span aria-hidden="true">+</span></label>
      <p class="fine center">Drag to move · pinch or use the slider to zoom</p>
      <div class="yesno"><button class="btn plain" data-c="cancel">Cancel</button><button class="btn" data-c="save">Save</button></div></div>`;
    document.body.appendChild(wrap); document.body.classList.add("cropping");
    const stage=wrap.querySelector(".cropstage"), cv=wrap.querySelector("canvas"), zoomEl=wrap.querySelector("input"), g=cv.getContext("2d");
    const iw=img.naturalWidth, ih=img.naturalHeight;
    let V=0, base=1, z=1, ox=0, oy=0;
    const W=()=>iw*base*z, H=()=>ih*base*z;
    const clamp=()=>{ ox=Math.min(0,Math.max(V-W(),ox)); oy=Math.min(0,Math.max(V-H(),oy)); };
    const draw=()=>{ const r=devicePixelRatio||1; if(cv.width!==Math.round(V*r)){ cv.width=cv.height=Math.round(V*r); }
      g.setTransform(r,0,0,r,0,0); g.fillStyle="#fff"; g.fillRect(0,0,V,V); g.imageSmoothingQuality="high"; g.drawImage(img,ox,oy,W(),H()); };
    const layout=()=>{ const nv=stage.clientWidth; if(!nv) return; const f=V?nv/V:1; ox*=f; oy*=f; V=nv; base=Math.max(V/iw,V/ih); if(!layout.done){ ox=(V-W())/2; oy=(V-H())/2; layout.done=true; } clamp(); draw(); };
    /* Zoom keeping the point (cx,cy) on the stage still. */
    const zoomTo=(nz,cx=V/2,cy=V/2)=>{ nz=Math.min(4,Math.max(1,nz)); const k=nz/z; ox=cx-(cx-ox)*k; oy=cy-(cy-oy)*k; z=nz; zoomEl.value=z; clamp(); draw(); };
    const pts=new Map(); let pinch=null;
    const local=e=>{ const b=stage.getBoundingClientRect(); return [e.clientX-b.left,e.clientY-b.top]; };
    stage.addEventListener("pointerdown",e=>{ stage.setPointerCapture(e.pointerId); pts.set(e.pointerId,local(e)); if(pts.size===2){ const [a,b]=[...pts.values()]; pinch={d:Math.hypot(a[0]-b[0],a[1]-b[1]),z}; } e.preventDefault(); });
    stage.addEventListener("pointermove",e=>{ if(!pts.has(e.pointerId)) return; const prev=pts.get(e.pointerId), cur=local(e); pts.set(e.pointerId,cur);
      if(pts.size===2&&pinch){ const [a,b]=[...pts.values()], d=Math.hypot(a[0]-b[0],a[1]-b[1]); zoomTo(pinch.z*d/pinch.d,(a[0]+b[0])/2,(a[1]+b[1])/2); }
      else if(pts.size===1){ ox+=cur[0]-prev[0]; oy+=cur[1]-prev[1]; clamp(); draw(); } });
    const up=e=>{ pts.delete(e.pointerId); if(pts.size<2) pinch=null; };
    stage.addEventListener("pointerup",up); stage.addEventListener("pointercancel",up);
    stage.addEventListener("wheel",e=>{ e.preventDefault(); const [x,y]=local(e); zoomTo(z*Math.exp(-e.deltaY*0.0015),x,y); },{passive:false});
    zoomEl.addEventListener("input",()=>zoomTo(+zoomEl.value));
    const close=val=>{ removeEventListener("resize",layout); document.removeEventListener("keydown",key,true); document.body.classList.remove("cropping"); wrap.remove(); done(val); };
    const key=e=>{ if(e.key==="Escape"){ e.preventDefault(); close(null); return; }
      if(document.activeElement!==stage) return; const step=e.shiftKey?30:8;
      if(e.key==="ArrowLeft"){ox+=step;} else if(e.key==="ArrowRight"){ox-=step;} else if(e.key==="ArrowUp"){oy+=step;} else if(e.key==="ArrowDown"){oy-=step;}
      else if(e.key==="+"||e.key==="="){ zoomTo(z*1.1); e.preventDefault(); return; } else if(e.key==="-"){ zoomTo(z/1.1); e.preventDefault(); return; } else return;
      e.preventDefault(); clamp(); draw(); };
    document.addEventListener("keydown",key,true); addEventListener("resize",layout);
    wrap.addEventListener("click",e=>{ const c=e.target.closest("[data-c]")?.dataset.c; if(c==="cancel"||e.target===wrap) close(null);
      if(c==="save"){
        const render=(size,limit)=>{ const out=document.createElement("canvas"); out.width=out.height=size; const o=out.getContext("2d"), k=size/V;
          o.fillStyle="#fff"; o.fillRect(0,0,size,size); o.imageSmoothingQuality="high"; o.drawImage(img,ox*k,oy*k,W()*k,H()*k);
          for(const q of [.86,.74,.6,.45]){ const d=out.toDataURL("image/jpeg",q); if(d.length<=limit) return d; } return null; };
        const small=render(CROP_OUT,110000), large=render(Math.min(1080,Math.max(640,Math.round(Math.min(iw,ih)/z))),880000)||render(800,880000)||render(640,880000);
        if(!small){ close(null); toast("That photo is too detailed to save. Try another."); return; }
        close({small,large}); } });
    requestAnimationFrame(()=>{ layout(); stage.focus({preventScroll:true}); });
  });
}
async function uploadAvatar(file){
  if(!file) return;
  if(!/^image\//.test(file.type||"image/")){ toast("Choose a photo (JPEG or PNG)."); return; }
  let img; try{ img=await loadImage(file); }catch{ toast("That photo couldn't be opened. Try a JPEG or PNG."); return; }
  const pic=await openCropper(img); if(!pic) return;
  S.avBusy=true; render();
  try{ const v=await rpc("set_avatar",{p_data:pic.small,p_large:pic.large}); AV[uid()]={v,img:pic.small}; if(pic.large) AV_LARGE[uid()]=pic.large; else delete AV_LARGE[uid()]; saveAv(); toast("Profile picture saved"); }
  catch{ toast("Couldn't save your picture. Check your connection and try again."); }
  finally{ S.avBusy=false; render(); loadGroups(); }
}
async function removeAvatar(){
  try{ await rpc("set_avatar",{p_data:null,p_large:null}); delete AV[uid()]; delete AV_LARGE[uid()]; saveAv(); toast("Profile picture removed"); }catch{ toast("Couldn't remove your picture. Try again."); }
  render(); loadGroups();
}
/* Full-size view of a profile picture. Shows the small copy at once, then swaps in the sharp one. */
const AV_LARGE={};
async function openPhoto(id,name){
  const small=AV[id]?.img; if(!small) return;
  const wrap=document.createElement("div"); wrap.className="photoview"; wrap.setAttribute("role","dialog"); wrap.setAttribute("aria-modal","true"); wrap.setAttribute("aria-label",(name||"Profile")+" photo");
  wrap.innerHTML=`<figure><img src="${AV_LARGE[id]||small}" alt="${esc(name||"Profile picture")}"><figcaption>${esc(name||"")}</figcaption></figure><button class="photoclose" aria-label="Close">×</button>`;
  /* Pictures saved before the sharp copy existed are only 192px: show them small rather than stretched. */
  const fit=im=>{ if(!wrap.isConnected) return; const low=im.naturalWidth&&im.naturalWidth<400; wrap.classList.toggle("lowres",low);
    const note=wrap.querySelector(".pvnote"); if(low&&id===uid()&&!note) wrap.querySelector("figure").insertAdjacentHTML("beforeend",`<p class="pvnote">This is an older, low-resolution copy. Add your photo again in Your account to make it sharp.</p>`); };
  const imEl=wrap.querySelector("img"); imEl.addEventListener("load",()=>fit(imEl)); if(imEl.complete) fit(imEl);
  document.body.appendChild(wrap); document.body.classList.add("cropping");
  const back=document.activeElement, btn=wrap.querySelector(".photoclose"); btn.focus({preventScroll:true});
  const close=()=>{ document.removeEventListener("keydown",key,true); document.body.classList.remove("cropping"); wrap.remove(); back?.focus?.({preventScroll:true}); };
  const key=e=>{ if(e.key==="Escape"||e.key==="Tab"){ e.preventDefault(); if(e.key==="Escape") close(); } };
  document.addEventListener("keydown",key,true);
  wrap.addEventListener("click",e=>{ if(e.target.tagName!=="IMG") close(); });
  if(!AV_LARGE[id]){ try{ const big=await rpc("get_avatar_large",{p_id:id}); if(big&&wrap.isConnected){ AV_LARGE[id]=big; wrap.querySelector("img").src=big; } }catch{} }
}
async function loadMyAvatar(){ try{ const v=await rpc("my_avatar"); await needAv([{id:uid(),av:v}]); }catch{} }

/* ---------- Group chat ---------- */
const CHAT={gid:null,msgs:[],last:0,busy:false,loaded:false,people:[],typingSent:0};
const nameList=a=>a.length<=2?a.join(" and "):a.slice(0,-1).join(", ")+" and "+a[a.length-1];
function whoHtml(){
  const on=CHAT.people.filter(p=>p.online).map(p=>p.name);
  return on.length?`<span class="dot" aria-hidden="true"></span>${esc(nameList(on))} ${on.length===1?"is":"are"} online`:CHAT.loaded?"Nobody else is online right now":"";
}
function typingHtml(){
  const t=CHAT.people.filter(p=>p.typing).map(p=>p.name);
  return t.length?`<div class="typing"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>${esc(nameList(t))} ${t.length===1?"is":"are"} typing…</div>`:"";
}
function paintPresence(){
  const w=document.getElementById("chatWho"), t=document.getElementById("chatTyping"); if(!w||!t) return;
  const near=chatNearBottom(), had=!!t.innerHTML;
  w.innerHTML=whoHtml(); t.innerHTML=typingHtml();
  if(near&&!had&&t.innerHTML) chatToBottom();
}
function typing(on){
  if(!CHAT.gid) return; const now=Date.now();
  if(on&&now-CHAT.typingSent<2500) return;
  if(!on&&!CHAT.typingSent) return;
  CHAT.typingSent=on?now:0;
  rpc("set_typing",{p_group:CHAT.gid,p_on:on}).catch(()=>{});
}
const chatTime=t=>{const d=new Date(t), now=new Date(), same=d.toDateString()===now.toDateString();
  return same?d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}):d.toLocaleDateString("en-GB",{day:"numeric",month:"short"})+" "+d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});};
const linkify=t=>esc(t).replace(/https?:\/\/[^\s<]+/g,u=>`<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
/* Who has opened the chat since this message arrived. */
function seenText(m){
  if(m.pending) return "Sending…";
  const others=CHAT.people, by=others.filter(p=>(p.read||0)>=m.id).map(p=>p.name);
  if(!others.length) return "Sent";
  if(!by.length) return "Not seen yet";
  return by.length===others.length&&others.length>1?"Seen by everyone":"Seen by "+nameList(by);
}
/* Read receipts as tiny profile pictures of the people who have seen the message. */
function seenHtml(m){
  if(m.pending) return `<span class="seentxt">Sending…</span>`;
  const others=CHAT.people, by=others.filter(p=>(p.read||0)>=m.id);
  if(!others.length) return `<span class="seentxt">Sent</span>`;
  if(!by.length) return `<span class="seentxt">Not seen yet</span>`;
  const label=by.length===others.length&&others.length>1?"Seen by everyone":"Seen by "+nameList(by.map(p=>p.name));
  return `<span class="seenavs" role="img" aria-label="${esc(label)}" title="${esc(label)}">${by.slice(0,6).map(p=>avatarHtml(p.id,p.name,"tiny")).join("")}${by.length>6?`<span class="seenmore">+${by.length-6}</span>`:""}</span>`;
}
function chatListHtml(){
  if(!CHAT.loaded) return `<p class="empty">Loading messages…</p>`;
  if(!CHAT.msgs.length) return `<p class="empty">No messages yet. Say hi to the group.</p>`;
  /* Messages from the same person within a minute of each other form a run: name on the first, time under the last. */
  const joined=(a,b)=>a&&b&&a.by===b.by&&Math.abs(new Date(b.at)-new Date(a.at))<60e3, L=CHAT.msgs;
  const lastMine=[...L].reverse().find(m=>m.by===uid());
  return L.map((m,i)=>{ const mine=m.by===uid(), cont=joined(L[i-1],m), more=joined(m,L[i+1]), seen=mine&&(m===lastMine||CHAT.seenOpen===m.id);
    return `<div class="msg${mine?" mine":" theirs"}${cont?" cont":""}">${!mine&&!more?avatarHtml(m.by,m.name,"msgav"):""}${!mine&&!cont?`<span class="who">${esc(m.name||"Former member")}</span>`:""}<p${mine&&!m.pending?` data-act="seen" data-id="${m.id}" title="Tap to see who has read this"`:""}>${linkify(m.body)}</p>${more?(seen?`<div class="seen">${seenHtml(m)}</div>`:""):`<div class="meta"><time>${esc(chatTime(m.at))}</time>${seen?seenHtml(m):""}</div>`}</div>`; }).join("");
}
/* The messages scroll inside their own panel, sized to end just above the message box,
   which sits above the tab bar (or above the phone keyboard when it is open). */
const chatScroller=()=>document.getElementById("chatScroll");
const chatNearBottom=()=>{ const el=chatScroller(); return !el||el.scrollHeight-el.scrollTop-el.clientHeight<120; };
const chatToBottom=()=>{ const el=chatScroller(); if(el) el.scrollTop=el.scrollHeight; };
function sizeChat(){
  const el=chatScroller(), bar=document.getElementById("chatForm"); if(!el||!bar) return;
  if(scrollY&&!(window.visualViewport&&visualViewport.height<innerHeight-120)) scrollTo(0,0);
  const near=chatNearBottom(), vv=window.visualViewport, nav=document.querySelector("nav div");
  const keyboard=vv&&vv.height<innerHeight-120;
  const bottom=keyboard?vv.offsetTop+vv.height-10:(nav?nav.getBoundingClientRect().top:innerHeight)-12;
  const h=Math.max(160,Math.floor(bottom-bar.offsetHeight-10-el.getBoundingClientRect().top));
  if(Math.abs(el.offsetHeight-h)>1) el.style.height=h+"px";
  if(near) chatToBottom();
}
addEventListener("resize",()=>sizeChat());
/* Re-measure whenever anything around the chat changes size (header, fonts, message box, tab bar). */
const CHAT_RO=typeof ResizeObserver!=="undefined"?new ResizeObserver(()=>requestAnimationFrame(()=>sizeChat())):null;
function watchChatLayout(){ if(!CHAT_RO) return; CHAT_RO.disconnect(); ["heroText","chatForm"].forEach(id=>{ const el=document.getElementById(id); if(el) CHAT_RO.observe(el); }); const nav=document.querySelector("nav div"); if(nav) CHAT_RO.observe(nav); const hero=document.querySelector(".hero"); if(hero) CHAT_RO.observe(hero,{box:"border-box"}); CHAT_RO.observe(document.documentElement); }
document.fonts?.ready?.then(()=>sizeChat());
addEventListener("load",()=>sizeChat());
window.visualViewport?.addEventListener("resize",()=>{ sizeChat(); if(S.chatOpen) scrollTo(0,0); });
function paintChat(stick){
  const el=document.getElementById("chatList"); if(!el) return;
  const near=stick||chatNearBottom();
  el.innerHTML=chatListHtml();
  if(near) chatToBottom();
}
async function loadChat(first){
  if(!CHAT.gid||CHAT.busy||document.hidden) return;
  CHAT.busy=true;
  try{
    const gid=CHAT.gid, r=await rpc("chat_poll",{p_group:gid,p_after:CHAT.last});
    if(gid!==CHAT.gid) return;
    sizeChat();
    const rows=r?r.messages:null, readKey=r?JSON.stringify((r.people||[]).map(p=>[p.id,p.read])):"";
    if(r){ const changed=readKey!==CHAT.readKey; CHAT.readKey=readKey; CHAT.people=r.people||[]; paintPresence(); needAv(CHAT.people); if(changed&&CHAT.loaded) paintChat(false); }
    if(rows===null){ closeChat(); toast("You're no longer in that group."); return; }
    const fresh=rows.filter(m=>!CHAT.msgs.some(x=>x.id===m.id));
    if(fresh.length||!CHAT.loaded){ CHAT.msgs.push(...fresh); CHAT.msgs.sort((a,b)=>a.id-b.id); CHAT.last=CHAT.msgs.length?CHAT.msgs[CHAT.msgs.length-1].id:0; CHAT.loaded=true; paintChat(first); }
    const g=S.groups.find(x=>x.id===gid); if(g&&g.unread){ g.unread=0; }
  }catch{ if(first&&!CHAT.loaded){ CHAT.loaded=true; paintChat(); toast("Couldn't load messages. Check your connection."); } }
  finally{ CHAT.busy=false; }
}
function openChat(gid){ if(CHAT.gid!==gid){ CHAT.gid=gid; CHAT.msgs=[]; CHAT.last=0; CHAT.loaded=false; CHAT.people=[]; CHAT.typingSent=0; CHAT.readKey=""; CHAT.seenOpen=null; } S.chatOpen=true; render(); scrollTo(0,0); sizeChat(); chatToBottom(); loadChat(true); }
function closeChat(){ typing(false); S.chatOpen=false; CHAT.gid=null; render(); scrollTo(0,0); loadGroups(); }
async function sendChat(){
  const i=document.getElementById("chatText"), body=(i?.value||"").trim(); if(!body||!CHAT.gid) return;
  i.value=""; i.style.height=""; typing(false);
  const temp={id:Number.MAX_SAFE_INTEGER, body, by:uid(), name:"You", at:new Date().toISOString(), pending:true};
  CHAT.msgs.push(temp); paintChat(true);
  try{ const m=await rpc("send_message",{p_group:CHAT.gid,p_body:body}); CHAT.msgs=CHAT.msgs.filter(x=>x!==temp); if(m&&!CHAT.msgs.some(x=>x.id===m.id)) CHAT.msgs.push(m); CHAT.msgs.sort((a,b)=>a.id-b.id); CHAT.last=Math.max(CHAT.last,m?.id||0); paintChat(true); }
  catch{ CHAT.msgs=CHAT.msgs.filter(x=>x!==temp); paintChat(); if(i&&!i.value) i.value=body; toast("Message not sent. Check your connection and try again."); }
}
function viewChat(g){
  return `<div data-hero><button class="back" data-act="closeChat">‹ Back</button><h1>${esc(g.name)}</h1><p id="chatWho" class="who-online">${whoHtml()}</p></div>
  <div id="chatScroll" class="chatscroll"><div id="chatList" class="chat" aria-live="polite">${chatListHtml()}</div>
  <div id="chatTyping" aria-live="polite">${typingHtml()}</div></div>
  <form id="chatForm" class="chatbar" novalidate><textarea id="chatText" rows="1" maxlength="1000" placeholder="Message ${esc(g.name)}" aria-label="Message"></textarea><button class="sendbtn" type="submit" aria-label="Send"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h14M12 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button></form>`;
}
function viewGroup(g){
  const n=g.members.length, on=g.members.filter(m=>m.online&&m.id!==uid()).length;
  const planStatus=p=>p.finished||(p.people>0&&p.done>=p.people)?["See result","done"]:p.me_out?["Not going","out"]:p.mine<p.options?["Vote","todo"]:[`${p.done} of ${p.people} voted`,""];
  return `<div data-hero><button class="back" data-act="allGroups">‹ Groups</button><span>${n} ${n===1?"member":"members"}${on?` · ${on} online`:""}</span><h1>${esc(g.name)}</h1></div>
  <div class="gacts">
    <button class="gact" data-act="openChat" data-id="${esc(g.id)}">${evIcon('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>')}${g.unread?`<i class="gbadge">${g.unread}</i>`:""}<b>Chat</b><small>${g.last?esc((g.last.mine?"You":(g.last.name||"Someone").split(" ")[0])+": "+g.last.body):"Say hello"}</small></button>
    <button class="gact primary" data-act="newGroupPlan" data-id="${esc(g.id)}">${evIcon('<path d="M12 5v14M5 12h14"/>')}<b>Start a plan</b><small>Vote on where to go</small></button>
  </div>
  ${g.plans.length?`<p class="glabel">Plans</p><div class="sheet glist">${g.plans.map(p=>{ const [t,c]=planStatus(p); return `<button class="grow" data-act="openPlan" data-code="${esc(p.code)}"><span class="gmain"><b>${esc(cap(planTitle(p)))}</b><small>Started by ${esc(p.by||"someone")}</small></span><span class="gstat ${c}">${esc(t)}</span></button>`; }).join("")}</div>`:""}
  <p class="glabel">Members</p>
  <div class="sheet glist">${g.members.map(m=>{ const me=m.id===uid(); return `<div class="grow">${avatarHtml(m.id,m.name,"mid")}<span class="gmain"><b>${esc(m.name)}</b>${me?"<small>You</small>":m.online?'<small class="live"><span class="dot" aria-hidden="true"></span>Online</small>':""}</span></div>`; }).join("")}
    <button class="grow ginvite" data-act="invite" data-id="${esc(g.id)}"><span class="gplus" aria-hidden="true">+</span><span class="gmain"><b>Invite people</b><small>Share a link to join</small></span></button></div>
  <button class="gcode" data-act="copyCode" data-v="${esc(g.invite_code)}" aria-label="Copy invite code">Invite code <b class="code">${esc(g.invite_code)}</b><span>Copy</span></button>
  <button class="link quiet center danger" data-act="leave" data-id="${esc(g.id)}">${S.leaving?"Tap again to leave this group":"Leave group"}</button>`;
}
function viewGroups(){
  const g=S.groups.find(x=>x.id===S.gid);
  if(g) return S.chatOpen&&CHAT.gid===g.id?viewChat(g):viewGroup(g);
  return `<div data-hero><h1>My groups</h1></div>
  ${S.joinMode?`<form id="codeForm" class="group" novalidate><span class="label">Join with an invite code</span><div class="inline"><input type="text" id="joinCode" placeholder="Invite code" maxlength="14" autocomplete="off" autocapitalize="off"><button class="btn small" type="submit">Join</button></div></form>
  <button class="link joinswap" data-act="joinMode" data-v="0">Create a group instead</button>`
  :`<form id="groupForm" class="group" novalidate><span class="label">New group</span><div class="inline"><input type="text" id="groupName" placeholder="Group name" maxlength="40" autocomplete="off"><button class="btn small" type="submit">Create</button></div></form>
  <button class="link joinswap" data-act="joinMode" data-v="1">Have an invite code?</button>`}
  ${S.groups.length?`<p class="head">Your groups</p><div class="stack">${S.groups.map(x=>{const v=x.plans.filter(p=>!p.finished&&p.mine<p.options).length;return `<button class="person" data-act="openGroup" data-id="${esc(x.id)}"><span>${esc(x.name)}<small class="sub">${x.last?esc((x.last.mine?"You":x.last.name||"Someone")+": "+x.last.body):`${x.members.length} ${x.members.length===1?"member":"members"}`}</small></span><small>${x.unread?`<b class="pill">${x.unread} new</b>`:v?`${v} to vote on`:(()=>{const o=x.members.filter(m=>m.online&&m.id!==uid()).length;return o?`<span class="dot" aria-hidden="true"></span>${o} online`:"Open"})()}</small></button>`}).join("")}</div>`:`<p class="hint left">Create a group for your friends or family, then invite them. Plans you send there appear for everyone.</p>`}`;
}
/* Light or dark look. The choice is kept on this device; "auto" follows the phone or computer setting. */
const themePref=()=>{ try{ return localStorage.getItem("concit.theme")||"light"; }catch{ return "light"; } };
const THEME_MQ=window.matchMedia?matchMedia("(prefers-color-scheme: dark)"):null;
function applyTheme(){ const p=themePref(), dark=p==="dark"||(p==="auto"&&THEME_MQ&&THEME_MQ.matches);
  document.documentElement.dataset.theme=dark?"dark":"light";
  const m=document.querySelector('meta[name="theme-color"]'); if(m) m.content=dark?"#145fae":"#2f9bff"; }
function setTheme(v){ try{ localStorage.setItem("concit.theme",v); }catch{} applyTheme(); }
applyTheme(); THEME_MQ&&THEME_MQ.addEventListener&&THEME_MQ.addEventListener("change",()=>themePref()==="auto"&&applyTheme());
function viewAccount(){
  const u=S.session?.user||{}, name=u.user_metadata?.name||"";
  return `<div data-hero><button class="back" data-act="closeAccount">‹ Back</button><h1>Your account</h1></div>
  <p class="fine" style="margin:0 0 16px">Logged in as ${esc(u.email||"")}</p>
  <div class="group avpick"><span class="label">Profile picture</span><div class="avrow">${avatarHtml(uid(),name,"big")}<div class="avbtns">
    <label class="btn small plain${S.avBusy?" busy":""}">${S.avBusy?"Saving…":AV[uid()]?"Change photo":"Add a photo"}<input type="file" id="avFile" accept="image/*" hidden ${S.avBusy?"disabled":""}></label>
    ${AV[uid()]&&!S.avBusy?`<button class="link quiet" data-act="removeAvatar">Remove</button>`:""}</div></div>
    <p class="fine">Shown next to your messages and in your groups. Only people in your groups can see it.</p></div>
  <form id="nameForm" class="group" novalidate><span class="label">Your name</span><div class="inline"><input type="text" id="myName" value="${esc(name)}" maxlength="30" autocomplete="name"><button class="btn small" type="submit">Save</button></div></form>
  <div class="group"><span class="label">Appearance</span><div class="themeseg">${seg("setTheme",themePref(),[["light","Light"],["dark","Dark"],["auto","Match device"]],"Appearance")}</div><p class="fine">Saved on this device.</p></div>
  <div class="group"><span class="label">Your data</span><a class="person" href="privacy.html"><span>Privacy notice<small class="sub">What Concit keeps and why</small></span><small>Read</small></a></div>
  <button class="btn plain" data-act="logout">Log out</button>
  <button class="link quiet center danger" data-act="deleteAccount">${S.deleting?"Tap again to delete for good":"Delete my account"}</button>
  ${S.deleting?`<p class="fine center">This removes your account, your votes, your messages and your place in every group. It can't be undone.</p>`:""}`;
}
const HOT_TYPES=[["all","All"],["cafe","Coffee"],["eat","Restaurants"],["drink","Bars"],["club","Clubs"],["culture","Culture"]];
const HOT_GROUPS=[["Coffee",p=>p.kind==="cafe"],["Restaurants",p=>p.kind==="eat"],["Cheap eats",p=>p.kind==="cheap"],["Bars",p=>["drink","wine","beer"].includes(p.kind)],["Nightclubs",p=>p.kind==="club"],["Culture",p=>p.kind==="culture"]];
const MAPLIBRE="https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/";
const MAP_STYLE="https://tiles.openfreemap.org/styles/liberty";
const PIN='<svg viewBox="18 10 64 84" aria-hidden="true"><path fill-rule="evenodd" d="M50 90 C50 90 22 62 22 42 A28 28 0 1 1 78 42 C78 62 50 90 50 90 Z M61.584 30.416 A16.380 16.380 0 1 0 61.584 53.584 A3.780 3.780 0 0 0 56.237 48.237 A8.820 8.820 0 1 1 56.237 35.763 A3.780 3.780 0 0 0 61.584 30.416 Z"/></svg>';
let MAP=null, MAP_HOST=null, MAP_LIB=null, FIT="";
function loadMapLib(){
  if(window.maplibregl) return Promise.resolve();
  if(MAP_LIB) return MAP_LIB;
  MAP_LIB=new Promise((ok,no)=>{
    const css=document.createElement("link"); css.rel="stylesheet"; css.href=MAPLIBRE+"maplibre-gl.css"; document.head.appendChild(css);
    const js=document.createElement("script"); js.src=MAPLIBRE+"maplibre-gl.js"; js.onload=ok; js.onerror=no; document.head.appendChild(js);
  });
  return MAP_LIB;
}
function mapFailed(){ S.mapFail=true; render(); }
/* Places are drawn inside the map (not as page elements), so they stay put while zooming.
   Every place is a dot coloured by type; names appear as you zoom in, best-rated first, and never overlap. */
const MAP_CATS=[["cafe","Coffee","#b7793b",p=>p.kind==="cafe"],["eat","Food","#ef6a3a",p=>p.kind==="eat"||p.kind==="cheap"],["drink","Bars","#8b5cf6",p=>["drink","wine","beer"].includes(p.kind)],["club","Clubs","#e0408a",p=>p.kind==="club"],["culture","Culture","#13a39a",p=>p.kind==="culture"]];
const mapCat=p=>(MAP_CATS.find(c=>c[3](p))||MAP_CATS[1]);
let SEL_MK=null;
function placesGeo(list){
  return {type:"FeatureCollection",features:list.map(p=>({type:"Feature",properties:{id:p.id,name:p.name,col:mapCat(p)[2],rank:rank(p)||3,sel:p.id===S.sel?1:0},geometry:{type:"Point",coordinates:[p.lng,p.lat]}}))};
}
function addPlaceLayers(map){
  if(map.getSource("places")) return;
  const font=(map.getLayer("poi_transit")&&map.getLayoutProperty("poi_transit","text-font"))||["Noto Sans Bold"];
  map.addSource("places",{type:"geojson",data:placesGeo([])});
  map.addLayer({id:"places-dot",type:"circle",source:"places",layout:{"circle-sort-key":["get","rank"]},
    paint:{"circle-color":["get","col"],"circle-stroke-color":"#ffffff","circle-stroke-width":["interpolate",["linear"],["zoom"],11,.8,13,1.4,15,2],
      "circle-radius":["interpolate",["linear"],["zoom"],10,2.6,11.5,3.4,13,5.2,14.5,7.5,16,9.5],"circle-opacity":["case",["==",["get","sel"],1],0,1],"circle-stroke-opacity":["case",["==",["get","sel"],1],0,1]}});
  map.addLayer({id:"places-name",type:"symbol",source:"places",minzoom:13.2,filter:["==",["get","sel"],0],
    layout:{"text-field":["get","name"],"text-font":font,"text-size":["interpolate",["linear"],["zoom"],13.2,10.5,16,12.5],"text-anchor":"top","text-offset":[0,.75],
      "text-max-width":8,"symbol-sort-key":["-",5,["get","rank"]],"text-padding":3,"text-optional":true},
    paint:{"text-color":"#0f2a44","text-halo-color":"#ffffff","text-halo-width":1.6}});
  map.on("mouseenter","places-dot",()=>map.getCanvas().style.cursor="pointer");
  map.on("mouseleave","places-dot",()=>map.getCanvas().style.cursor="");
  map.on("click",e=>{
    const r=14, hits=map.queryRenderedFeatures([[e.point.x-r,e.point.y-r],[e.point.x+r,e.point.y+r]],{layers:["places-dot"]});
    if(!hits.length){ if(S.sel) selectPlace(null); return; }
    const best=hits.map(h=>{ const xy=map.project(h.geometry.coordinates); return {h,d:Math.hypot(xy.x-e.point.x,xy.y-e.point.y)}; }).sort((a,b)=>a.d-b.d)[0].h;
    selectPlace(best.properties.id);
  });
}
/* Choosing a place updates the big pin and the card below the map, without redrawing the screen. */
function selectPlace(id){
  S.sel=id; syncPins(true);
  const card=document.getElementById("mapCard"); if(!card) return;
  const p=id&&byId(id);
  card.innerHTML=p?`<div class="list picked sheet dlist">${placeRow(p).replace("<details>","<details open>")}</div>`:`<p class="hint">Tap a dot to see the place.</p>`;
  if(p&&MAP){ const xy=MAP.project([p.lng,p.lat]), c=MAP.getContainer(), m=40;
    if(xy.x<m||xy.y<m||xy.x>c.clientWidth-m||xy.y>c.clientHeight-m) MAP.easeTo({center:[p.lng,p.lat],duration:400}); }
}
/* Frame the bulk of the places: a few far-out ones (Sesto, Bicocca...) shouldn't zoom the whole map out. */
function fitCore(list){
  if(list.length<8) return list;
  const med=a=>a.slice().sort((x,y)=>x-y)[a.length>>1], cy=med(list.map(p=>p.lat)), cx=med(list.map(p=>p.lng));
  const d=p=>Math.hypot(p.lat-cy,(p.lng-cx)*.7);
  return list.slice().sort((a,b)=>d(a)-d(b)).slice(0,Math.ceil(list.length*.9));
}
function syncPins(selOnly){
  if(!MAP||!MAP.getSource||!MAP.getSource("places")) return;
  const list=PLACES.filter(p=>hotMatch(p)&&p.lat);
  if(S.sel&&!list.some(p=>p.id===S.sel)) S.sel=null;
  MAP.getSource("places").setData(placesGeo(list));
  const p=S.sel&&byId(S.sel);
  if(p){ if(!SEL_MK){ const el=document.createElement("div"); el.className="mk on"; el.innerHTML=PIN; SEL_MK=new maplibregl.Marker({element:el,anchor:"bottom"}); }
    SEL_MK.getElement().querySelector("path").style.fill=mapCat(p)[2]; SEL_MK.setLngLat([p.lng,p.lat]).addTo(MAP); }
  else if(SEL_MK) SEL_MK.remove();
  if(selOnly) return;
  const fk=S.hot+"|"+JSON.stringify(flt())+"|"+(S.hotCuisine||"");
  if(FIT!==fk&&list.length){
    const first=FIT==null||FIT==="";
    FIT=fk;
    const b=new maplibregl.LngLatBounds(); fitCore(list).forEach(p=>b.extend([p.lng,p.lat]));
    MAP.fitBounds(b,{padding:{top:40,bottom:30,left:30,right:30},maxZoom:15,duration:first?0:450});
  }
}
async function mountMap(){
  const slot=document.getElementById("mapSlot"); if(!slot) return;
  if(!MAP_HOST){ MAP_HOST=document.createElement("div"); MAP_HOST.id="realmap"; }
  slot.appendChild(MAP_HOST);
  try{
    await loadMapLib();
    if(!document.getElementById("mapSlot")) return;
    if(!MAP){
      MAP=new maplibregl.Map({container:MAP_HOST,style:MAP_STYLE,center:[9.19,45.4642],zoom:12,dragRotate:false,touchPitch:false,attributionControl:{compact:true}});
      MAP.addControl(new maplibregl.NavigationControl({showCompass:false}),"top-right");
      MAP.touchZoomRotate.disableRotation();
      MAP.on("error",e=>{ if(!MAP.isStyleLoaded()&&!S.mapOk) mapFailed(); });
      MAP.on("load",()=>{ S.mapOk=true; addPlaceLayers(MAP); syncPins(); });
      zoneLabels(MAP,false); addStations(MAP);
      setTimeout(()=>{ if(!S.mapOk&&!S.mapFail) mapFailed(); },12000);
    }
    MAP.resize(); if(MAP.isStyleLoaded()&&!MAP.getSource("places")) addPlaceLayers(MAP); syncPins();
  }catch{ mapFailed(); }
}
const hotType=p=>({all:true,cafe:p.kind==="cafe",eat:["eat","cheap"].includes(p.kind)&&hasCuisine(p,S.hotCuisine),drink:["drink","wine","beer"].includes(p.kind),club:p.kind==="club",culture:p.kind==="culture"})[S.hot];
const hotUnit=()=>HOT_UNIT[S.hot];
/* Hotspots filters: price, rating, open today, near a metro, and sort order. */
const FLT0={price:0,rating:0,open:false,metro:false,sort:"top",area:"",pin:null,radius:null};
/* Every area that has at least one place, A–Z. */
const areaOpts=()=>[["","All areas"],...[...new Set(PLACES.map(p=>p.zone).filter(Boolean))].sort((a,b)=>zname(a).localeCompare(zname(b))).map(z=>[z,zname(z)])];
const flt=()=>S.flt||(S.flt={...FLT0});
const fltCount=()=>{const f=flt(); return (f.price?1:0)+(rateMin(f.rating)?1:0)+(f.open?1:0)+(f.metro?1:0)+(f.area||f.pin?1:0)+(f.sort!=="top"?1:0);};
const maxFromPrice=(u,v)=>v<0?0:v>0?v:null;
function hotMatch(p){ if(!hotType(p)) return false; const f=flt(), u=hotUnit();
  if(f.price&&costOf(p,u||KIND_UNIT[p.kind])>maxFromPrice(u,f.price)) return false;
  if(rateMin(f.rating)&&(p.stars||0)<rateMin(f.rating)) return false;
  if(f.open&&(p.closed||[]).includes(new Date().getDay())) return false;
  if(f.metro&&!(p.metro||[]).length) return false;
  if(f.area&&p.zone!==f.area) return false;
  if(f.pin&&f.radius){ const d=p.lat?km([null,f.pin[0],f.pin[1]],[null,p.lat,p.lng]):ZONES[p.zone]?km([null,f.pin[0],f.pin[1]],ZONES[p.zone]):null; if(d==null||d>f.radius) return false; }
  return true; }
const priceOf=p=>{const u=KIND_UNIT[p.kind]; return u?costOf(p,u):p.price*10;};
const byHot=(a,b)=>{const s=flt().sort; return s==="cheap"?priceOf(a)-priceOf(b)||byRank(a,b):s==="dear"?priceOf(b)-priceOf(a)||byRank(a,b):s==="az"?a.name.localeCompare(b.name):byRank(a,b)||a.price-b.price;};
const FILTER_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v2H3zm3 6h12v2H6zm4 6h4v2h-4z"/></svg>';
function viewFilters(part){
  const f=flt(), n=fltCount();
  if(part==="pill") return `<button class="pill${n?" on":""}" data-act="fltOpen" aria-expanded="${!!S.fltOpen}">${FILTER_ICON}<span>${n?`Filters · ${n}`:"Filters"}</span></button>${n?`<button class="pillx" data-act="fltReset" aria-label="Clear filters">×</button>`:""}`;
  const row=(label,act,opts,val)=>`<div class="fsec"><span class="label">${label}</span><div class="chips wrap">${opts.map(([k,l])=>`<button class="chip" data-act="${act}" data-v="${k}" aria-pressed="${String(val)===String(k)}">${l}</button>`).join("")}</div></div>`;
  return `${S.fltOpen?`<div class="fpanel fcard">
    ${priceSlider("fltPrice",hotUnit(),f.price)}
    ${S.mapFail?row("Area","fltArea",areaOpts(),f.area):`<div class="fsec"><span class="label">Area</span>${S.pickOpen==="hot"?viewPinPicker():pinButton(f,"hot")}</div>`}
    ${row("Rating","fltRating",[[0,"Any"],[4,"4+ ★"],[4.5,"4.5+ ★"]],rateMin(f.rating))}
    ${row("Show only","fltToggle",[["open","Open today"],["metro","Near a metro"]].map(([k,l])=>[k,l]),"")
      .replace(/data-v="open" aria-pressed="false"/,`data-v="open" aria-pressed="${f.open}"`).replace(/data-v="metro" aria-pressed="false"/,`data-v="metro" aria-pressed="${f.metro}"`)}
    ${row("Sort by","fltSort",[["top","Top rated"],["cheap","Cheapest"],["dear","Priciest"],["az","A–Z"]],f.sort)}
  </div>`:""}`;
}
function placeRow(p){
  return `<details><summary><div><b>${esc(p.name)}</b><small>${esc(zname(p.zone))} · ${esc(costText(p))}</small>${starsHtml(p)}</div></summary>
  <div class="more"><p>${esc(p.why)}. ${esc(p.detail)}</p><p class="dim">${esc(p.addr)}${p.metro[0]?" · "+esc(metroText(p.metro)):""}</p>
  <div class="actions"><a href="${mapsUrl(p.name+" "+p.addr)}" target="_blank" rel="noopener">Directions</a>${/^https?:\/\//.test(p.web||"")?`<a href="${esc(p.web)}" target="_blank" rel="noopener">${/instagram\.com/.test(p.web)?"Instagram":/facebook\.com/.test(p.web)?"Facebook":"Website"}</a>`:""}<button class="link addplan" data-act="pickToggle" data-id="${esc(p.id)}">${(S.form.picks||[]).includes(p.id)?"In your plan ✓":"Add to a plan"}</button></div></div></details>`;
}
const MAP_SPOTS={bicocca:[270,30],isola:[175,88],lambrate:[320,80],sarpi:[64,140],garibaldi:[178,140],centrale:[300,130],cittastudi:[318,178],brera:[100,192],venezia:[240,212],duomo:[190,265],tortona:[66,305],navigli:[135,345],romana:[285,320],lodi:[270,375]};
/* An illustrated rooftop view: Milan's ring-and-spoke street plan, filled with courtyard blocks. */
let CITY_BG="";
function cityBg(){
  if(CITY_BG) return CITY_BG;
  const W=800,H=820,cx=380,cy=530,c=document.createElement("canvas");
  c.width=W;c.height=H;
  const g=c.getContext("2d"); if(!g) return "";
  let seed=7; const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
  const pt=(r,a)=>[cx+r*Math.cos(a),cy+r*Math.sin(a)];
  const quad=(r0,r1,a0,a1)=>{g.beginPath();[pt(r0,a0),pt(r1,a0),pt(r1,a1),pt(r0,a1)].forEach((p,i)=>i?g.lineTo(...p):g.moveTo(...p));g.closePath()};
  g.fillStyle="#f6fafe";g.fillRect(0,0,W,H);
  const radii=[52]; while(radii[radii.length-1]<1100) radii.push(radii[radii.length-1]+30+rnd()*20);
  const shades=["#cfe1f2","#d6e6f4","#c8dcef","#dceaf6"];
  for(let i=0;i<radii.length-1;i++){
    const wide=i%5===2, r0=radii[i]+(wide?9:2), r1=radii[i+1]-2, n=Math.round(2*Math.PI*(r0+r1)/2/(38+rnd()*16)), off=rnd()*6.28;
    for(let k=0;k<n;k++){
      const step=2*Math.PI/n, major=k%9===0, gap=(major?8:2)/((r0+r1)/2);
      let a0=off+k*step+gap, a1=off+(k+1)*step-2/((r0+r1)/2);
      const parts=rnd()<.25?2:1;
      for(let p=0;p<parts;p++){
        const b0=a0+(a1-a0)*p/parts+(p?4/r1:0), b1=a0+(a1-a0)*(p+1)/parts;
        if(rnd()<.04) continue;
        quad(r0,r1,b0,b1);g.fillStyle="#b4cbe2";g.save();g.translate(1.5,2.5);g.fill();g.restore();
        quad(r0,r1,b0,b1);g.fillStyle=shades[Math.floor(rnd()*4)];g.fill();
        if(r1-r0>26&&(b1-b0)*r1>30&&rnd()<.7){ const t=(r1-r0)*.32, ta=(b1-b0)*.32; quad(r0+t,r1-t,b0+ta,b1-ta);g.fillStyle="#eef5fc";g.fill(); }
      }
    }
  }
  const park=(x,y,rx,ry,rot)=>{g.beginPath();g.ellipse(x,y,rx,ry,rot,0,6.3);g.fillStyle="#d9eee3";g.fill();g.strokeStyle="#f6fafe";g.lineWidth=5;g.stroke();
    for(let i=0;i<46;i++){const a=rnd()*6.28,d=Math.sqrt(rnd())*.85,tx=x+Math.cos(a)*rx*d*Math.cos(rot)-Math.sin(a)*ry*d*Math.sin(rot),ty=y+Math.cos(a)*rx*d*Math.sin(rot)+Math.sin(a)*ry*d*Math.cos(rot);g.beginPath();g.arc(tx,ty,4+rnd()*4,0,6.3);g.fillStyle="#bfe2cf";g.fill();}};
  park(226,352,92,58,-.65);park(530,372,54,36,.2);
  g.fillStyle="#f6fafe";g.beginPath();g.arc(cx,cy,50,0,6.3);g.fill();
  g.save();g.translate(cx,cy);g.rotate(-.1);g.fillStyle="#2f9bff";g.globalAlpha=.55;g.fillRect(-23,-11,46,22);g.restore();
  try{ CITY_BG=c.toDataURL("image/png"); }catch{}
  return CITY_BG;
}
function hotMap(list){
  const zones=[...new Set(list.map(p=>p.zone))].filter(z=>MAP_SPOTS[z]);
  const pill=z=>{const [x,y]=MAP_SPOTS[z], c=list.filter(p=>p.zone===z).length, on=S.zone===z;
    return `<button class="area" style="left:${x/4}%;top:${y/4.1}%" data-act="zoneMap" data-z="${z}" aria-pressed="${on}">${esc(zname(z))}<i>${c}</i></button>`};
  return `<div class="mapbox"><img src="${cityBg()}" alt=""><span class="north">N ↑</span>${zones.map(pill).join("")}</div>`;
}
function viewHot(){
  const list=PLACES.filter(hotMatch).sort(byHot);
  let body;
  if(S.hotView==="map"){
    const zones=[...new Set(list.map(p=>p.zone))].filter(z=>MAP_SPOTS[z]);
    if(!zones.includes(S.zone)) S.zone=zones.includes("duomo")?"duomo":zones[0];
    const here=list.filter(p=>p.zone===S.zone);
    if(S.mapFail) body=`<p class="head" style="margin-top:0">Tap an area to see what's there</p><div class="mapwrap">${hotMap(list)}</div><p class="glabel">${esc(zname(S.zone))}</p><div class="list sheet dlist">${here.map(placeRow).join("")}</div>`;
    else { const sel=list.find(p=>p.id===S.sel);
      body=`<div id="mapSlot" class="mapslot"></div>${S.hot==="all"?`<div class="maplegend" aria-hidden="true">${MAP_CATS.map(c=>`<span><i style="background:${c[2]}"></i>${c[1]}</span>`).join("")}</div>`:""}<div id="mapCard">${sel?`<div class="list picked sheet dlist">${placeRow(sel).replace("<details>","<details open>")}</div>`:`<p class="hint">Tap a dot to see the place.</p>`}</div>`; }
  } else {
    body=HOT_GROUPS.map(([t,f])=>{const g=list.filter(f), full=S.hot!=="all"||S.open.has(t), rows=full?g:g.slice(0,6);
      return g.length?`<p class="glabel">${t}</p><div class="sheet dlist">${rows.map(placeRow).join("")}${rows.length<g.length?`<button class="showall" data-act="showGroup" data-v="${t}">Show all ${g.length}</button>`:""}</div>`:""}).join("");
  }
  return `<div data-hero><h1>Hotspots</h1></div>
  <div class="chips hottypes">${HOT_TYPES.map(([k,l])=>`<button class="chip" data-act="hot" data-v="${k}" aria-pressed="${S.hot===k}">${l}</button>`).join("")}</div>
  <div class="hotbar${S.hot==="eat"?" tight":""}">${seg("hotView",S.hotView,[["list","List"],["map","Map"]],"View")}${S.hot==="eat"?cuisineSelect("hotCuisine",S.hotCuisine,"Cuisine"):""}<span class="grow1"></span>${viewFilters("pill")}</div>
  ${viewFilters()}
  ${body||`<p class="empty">Nothing matches these filters.</p>${fltCount()?`<button class="link center" data-act="fltReset">Clear filters</button>`:""}`}
  <p class="foot">Prices are typical estimates. Checked ${CHECKED}, so confirm before you go. Star ratings are Google review scores as of ${STARS_CHECKED}.${S.hotView==="map"?" Map data © OpenStreetMap contributors.":""}</p>`;
}
function evRow(e){
  const on=S.saved.has(e.id), info=[e.venue,e.sold?"Sold out":e.priceText].filter(Boolean).join(" · ");
  const run=e.start!==e.end, until=run&&e.start<=today, d=parse(until?e.end:e.start);
  return `<details><summary><span class="dbadge">${until?"<i>until</i>":""}<b>${d.getDate()}</b><i>${d.toLocaleDateString("en-GB",{month:"short"})}</i></span><div><b>${esc(e.name)}</b><small>${esc([run&&!until?eventWhen(e):"",info].filter(Boolean).join(" · "))}</small></div></summary>
  <div class="more">${e.time?`<p class="dim">Starts ${esc(e.time)}</p>`:""}<div class="actions"><button data-act="save" data-id="${e.id}">${on?"Saved ✓":"Save"}</button><a href="${esc(srcUrl(e.src))}" target="_blank" rel="noopener">Source</a></div></div></details>`;
}
/* Events calendar: days with events get a dot; tapping a day shows what's on. */
const CAL_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7zm-2 8h14v10H5V10z"/></svg>';
function evCalendar(list){
  const base=S.evMonth||today.slice(0,7), [y,m]=base.split("-").map(Number);
  const first=new Date(y,m-1,1), days=new Date(y,m,0).getDate(), lead=(first.getDay()+6)%7;
  const last=list.reduce((a,e)=>e.end>a?e.end:a,addDays(today,30)), title=first.toLocaleDateString("en-GB",{month:"long",year:"numeric"});
  const busy=new Set(); list.filter(e=>!isRun(e)).forEach(e=>{ for(let d=e.start<today?today:e.start;d<=e.end;d=addDays(d,1)) busy.add(d); });
  let cells="";
  for(let i=0;i<lead;i++) cells+="<span></span>";
  for(let d=1;d<=days;d++){ const v=`${base}-${String(d).padStart(2,"0")}`, off=v<today||v>last;
    cells+=`<button class="calday${busy.has(v)&&!off?" has":""}" data-act="evPick" data-v="${v}" aria-pressed="${v===S.evDate}" ${v===today?'aria-current="date"':""} ${off?"disabled":""} aria-label="${parse(v).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}${busy.has(v)?", has events":""}">${d}</button>`; }
  return `<div class="cal evcal"><div class="calhead"><button class="calnav" data-act="evMove" data-v="-1" ${base<=today.slice(0,7)?"disabled":""} aria-label="Previous month">‹</button><b>${title}</b><button class="calnav" data-act="evMove" data-v="1" ${base>=last.slice(0,7)?"disabled":""} aria-label="Next month">›</button></div>
  <div class="calgrid">${["M","T","W","T","F","S","S"].map(x=>`<span class="dow">${x}</span>`).join("")}${cells}</div></div>`;
}
const EV_CATS=[
  ["music","Music","Concerts, gigs and DJ sets",e=>e.cat==="music",'<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'],
  ["culture","Culture","Exhibitions, theatre and opera",e=>e.cat==="art"||e.cat==="theatre",'<path d="M3 21h18M4 10h16M12 3 3 8h18zM6 10v8M10 10v8M14 10v8M18 10v8"/>'],
  ["sport","Sport","Matches and races",e=>e.cat==="sport",'<circle cx="12" cy="12" r="9"/><path d="m12 7 4 3-1.5 4.5h-5L8 10zM12 3v4M21 10l-5 0M15 14.5l2.5 5M9 14.5 6.5 19.5M3 10h5"/>'],
  ["activities","Activities","Festivals, fairs and markets",e=>e.cat==="festival",'<path d="M12 3l2.3 5.3L20 9l-4.3 3.9L17 19l-5-3-5 3 1.3-6.1L4 9l5.7-.7z"/>']];
/* Photos for the event boxes, per city. Freely licensed files on Wikimedia Commons, credited under the boxes. */
const CITY_PHOTOS={milan:{
  music:["Destrage_-_The_Last_Dance,_Alcatraz,_Milan_(October_20,_2024)_-_3609_02.jpg","a gig at Alcatraz"],
  culture:["Milan_Cathedral_from_Piazza_del_Duomo.jpg","the Duomo"],
  sport:["Stadio_Meazza_2021_3.jpg","San Siro"],
  activities:["Milan_Naviglio_Grande_at_sunset_HD_01.jpg","the Naviglio Grande"]}};
const CITY="milan";
const commonsImg=(f,w=600)=>"https://commons.wikimedia.org/wiki/Special:FilePath/"+encodeURIComponent(f)+"?width="+w;
const commonsPage=f=>"https://commons.wikimedia.org/wiki/File:"+encodeURIComponent(f);
const EV_MORE=[["free","Free","Nothing to pay",e=>e.priceNum===0],["saved","Saved","Events you kept",e=>S.saved.has(e.id)],["all","Everything","All upcoming events",()=>true]];
const evIcon=p=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
function viewEvents(){
  const live=EVENTS.filter(e=>e.end>=today);
  const cat=[...EV_CATS,...EV_MORE].find(c=>c[0]===S.ev);
  if(!cat){
    const n=f=>live.filter(f).length;
    return `<div data-hero><h1>Events</h1></div>
    <p class="evintro">What are you in the mood for?</p>
    <div class="evtiles">${EV_CATS.map(([k,l,sub,f,ic])=>{const ph=(CITY_PHOTOS[CITY]||{})[k];
      return `<button class="evtile ev-${k}${ph?" hasph":""}" data-act="ev" data-v="${k}">${ph?`<img src="${commonsImg(ph[0])}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.classList.remove('hasph');this.remove()">`:""}<b>${l}</b><small>${esc(sub)}</small></button>`}).join("")}</div>
    <div class="evmore">${EV_MORE.map(([k,l,sub,f])=>`<button class="evmini" data-act="ev" data-v="${k}"><b>${l}</b><small>${k==="saved"?`${n(f)} saved`:`${n(f)} events`}</small></button>`).join("")}</div>
    <p class="foot">Checked ${S.evChecked||CHECKED}. Confirm dates before you go.</p>
    <p class="foot credits">Photos from Wikimedia Commons: ${EV_CATS.map(c=>(CITY_PHOTOS[CITY]||{})[c[0]]).filter(Boolean).map(([f,of])=>`<a href="${commonsPage(f)}" target="_blank" rel="noopener">${esc(of)}</a>`).join(", ")}. Tap a name for the photographer and licence.</p>`;
  }
  const all=live.filter(cat[3]), d=S.evDate;
  const list=d?all.filter(e=>e.start<=d&&e.end>=d):all;
  const dated=list.filter(e=>!isRun(e)).sort((a,b)=>a.start.localeCompare(b.start));
  const runs=list.filter(isRun).sort((a,b)=>a.end.localeCompare(b.end));
  const wk=addDays(today,7), groups=d?[[parse(d).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"}),()=>true]]:[["Today",e=>e.start<=today],["This week",e=>e.start>today&&e.start<=wk],["Later",e=>e.start>wk]];
  const body=groups.map(([t,f])=>{const g=dated.filter(f);return g.length?`<p class="glabel">${t}</p><div class="sheet dlist">${g.map(evRow).join("")}</div>`:""}).join("")+(runs.length?`<p class="glabel">${d?"Also on that day":"Running for a while"}</p><div class="sheet dlist">${runs.map(evRow).join("")}</div>`:"");
  return `<div data-hero><button class="back" data-act="ev" data-v="">‹ Events</button><span>${esc(cat[2])}</span><h1>${cat[1]}</h1></div>
  <div class="hotbar"><button class="pill${d?" on":""}" data-act="evCal" aria-expanded="${!!S.evCalOpen}">${CAL_ICON}<span>${d?esc(parse(d).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})):"All dates"}</span></button>${d?`<button class="pillx" data-act="evPick" data-v="" aria-label="Show all dates">×</button>`:""}<span class="grow1"></span><span class="count">${list.length} ${list.length===1?"event":"events"}</span></div>
  ${S.evCalOpen?evCalendar(all):""}
  <div class="list">${body||`<p class="empty">${S.ev==="saved"?"Open an event and tap Save to keep it here.":d?"Nothing on that day. Try another date.":"Nothing here right now."}</p>`}</div>
  <p class="foot">Checked ${S.evChecked||CHECKED}. Confirm dates before you go.</p>`;
}
function render(){
  if(DEALING){ clearTimeout(render.wait); render.wait=setTimeout(render,360); return; }
  const a=document.activeElement;
  if(render.ok&&a&&a.matches?.('input[type=text],input[type=email],input[type=password],textarea')&&a.value&&S.session){ render.later=true; return; }
  render.ok=true; render.later=false;
  const open=[...document.querySelectorAll("details[open] b")].map(b=>b.textContent);
  const authed=S.session&&S.authView!=="newpass";
  document.body.classList.toggle("noauth",!authed);
  document.getElementById("view").innerHTML=!authed?viewAuth():S.acct?viewAccount():S.tab==="decide"?viewDecide():S.tab==="hotspots"?viewHot():S.tab==="groups"?viewGroups():viewEvents();
  const h=document.querySelector("#view [data-hero]"), ht=document.getElementById("heroText");
  ht.innerHTML=h?h.innerHTML:""; h?.remove();
  document.querySelectorAll("details").forEach(d=>{ if(open.includes(d.querySelector("b").textContent)) d.open=true; });
  if(authed&&S.tab==="hotspots"&&S.hotView==="map"&&!S.mapFail) mountMap();
  setupDeck();
  if(authed&&S.pickOpen&&!S.acct&&(S.pickOpen==="hot"?S.tab==="hotspots"&&S.fltOpen:S.tab==="decide")) mountPick();
  document.body.classList.toggle("inchat",!!(authed&&S.chatOpen&&S.tab==="groups"&&!S.acct));
  if(authed&&S.chatOpen&&S.tab==="groups"){ sizeChat(); watchChatLayout(); requestAnimationFrame(()=>sizeChat()); } else CHAT_RO?.disconnect();
  const badge=document.getElementById("badge"), c=toVote().length; if(badge){ badge.textContent=c; badge.hidden=!c; }
  const me=document.getElementById("me"); if(me){ const mine=S.session&&AV[uid()]; me.innerHTML=mine?`<img src="${mine.img}" alt="">`:esc((S.session?.user?.user_metadata?.name||"?").trim().charAt(0).toUpperCase()); me.classList.toggle("hasav",!!mine); me.toggleAttribute("aria-current",!!S.acct); }
  document.querySelectorAll("nav button").forEach(b=>b.dataset.tab===S.tab&&!S.acct?b.setAttribute("aria-current","page"):b.removeAttribute("aria-current"));
}
const H={
  home(){ if(!S.session) return; S.acct=false; S.deleting=false; S.pickOpen=false; if(S.plan||S.code) clearPlan(); S.tab="decide"; try{location.hash="decide"}catch{} render(); scrollTo(0,0); },
  tab(el){ S.acct=false; S.deleting=false; S.tab=el.dataset.tab; try{location.hash=S.tab}catch{} render(); scrollTo(0,0); },
  what(el){ const was=S.form.what; S.form.what=el.dataset.v; if(WHAT_UNIT[was]!==WHAT_UNIT[el.dataset.v]) S.form.price=0; render(); },
  cuisine(el){ S.form.cuisine=el.dataset.v; render(); },
  hotCuisine(el){ S.hotCuisine=el.dataset.v; render(); },
  evPick(el){ const v=el.dataset.v||null; S.evDate=S.evDate===v?null:v; if(v) S.evCalOpen=false; render(); },
  dfltOpen(){ S.dfltOpen=!S.dfltOpen; render(); },
  dfltReset(){ Object.assign(S.form,{price:0,rating:0,metro:false}); render(); },
  dPrice(el){ S.form.price=+el.dataset.v; render(); },
  dRating(el){ S.form.rating=+el.dataset.v; render(); },
  dMetro(){ S.form.metro=!S.form.metro; render(); },
  fltOpen(){ S.fltOpen=!S.fltOpen; render(); },
  fltReset(){ S.flt={...FLT0}; if(S.pickOpen==="hot") S.pickOpen=false; FIT=null; render(); },
  fltPrice(el){ flt().price=+el.dataset.v; FIT=null; render(); },
  fltRating(el){ flt().rating=+el.dataset.v; FIT=null; render(); },
  fltToggle(el){ const f=flt(), k=el.dataset.v; f[k]=!f[k]; FIT=null; render(); },
  fltArea(el){ flt().area=el.dataset.v; FIT=null; render(); },
  pickSearch(){ S.pickSearched=true; document.activeElement?.blur?.(); render(); },
  pickArea(el){ S.pickArea=el.dataset.v; refreshPicks(); },
  fltSort(el){ flt().sort=el.dataset.v; render(); },
  evCal(){ S.evCalOpen=!S.evCalOpen; if(S.evCalOpen&&S.evDate) S.evMonth=S.evDate.slice(0,7); render(); },
  evMove(el){ const [y,m]=(S.evMonth||today.slice(0,7)).split("-").map(Number); S.evMonth=iso(new Date(y,m-1+Number(el.dataset.v),1)).slice(0,7); render(); },
  day(el){ setDay(el.dataset.v); S.calOpen=false; render(); },
  pickOpen(el){ const which=el?.dataset.v==="hot"?"hot":true; if(S.pickOpen===which){ S.pickOpen=false; render(); return; } S.pickOpen=which; S.pickR=pickTarget().radius||2; S.pickFresh=true; S.calOpen=false; render(); },
  pickCancel(){ S.pickOpen=false; render(); },
  pickSet(){ if(!PICK) return; const c=PICK.getCenter(), t=pickTarget(); t.pin=[+c.lat.toFixed(5),+c.lng.toFixed(5)]; t.radius=S.pickR||2; t.area=""; if(S.pickOpen==="hot") FIT=null; S.pickOpen=false; render(); },
  pinClear(el){ const t=el?.dataset.v==="hot"?flt():S.form; t.pin=null; t.radius=null; if(t!==S.form) FIT=null; render(); },
  cal(){ S.calOpen=!S.calOpen; S.calMonth=S.form.day.slice(0,7); render(); },
  calMove(el){ const [y,m]=S.calMonth.split("-").map(Number); S.calMonth=iso(new Date(y,m-1+Number(el.dataset.v),1)).slice(0,7); render(); },
  pickDay(el){ setDay(el.dataset.v); S.calOpen=false; render(); },
  mode(el){ S.form.mode=el.dataset.v; S.pickOpen=false; S.dfltOpen=false; render(); scrollTo(0,0); },
  addTime(){ S.timeOpen=!S.timeOpen; S.calOpen=false; render(); const strip=document.getElementById("timeStrip"), c=strip?.querySelector(`[data-v="${S.form.time||TIME_HINT[S.form.what]||"19:00"}"]`); if(c) strip.scrollLeft=c.offsetLeft-strip.offsetLeft-(strip.clientWidth-c.offsetWidth)/2; },
  setTime(el){ S.form.time=el.dataset.v; S.timeOpen=false; render(); },
  pickCancelAll(){ S.form.picks=[]; updatePicks(); toast("Selection cleared."); },
  copyCode(el){ const c=el.dataset.v; (navigator.clipboard?navigator.clipboard.writeText(c):Promise.reject()).then(()=>toast("Invite code copied."),()=>toast(c)); },
  pickToggle(el){ const f=S.form, id=el.dataset.id, l=(f.picks||[]).filter(byId);
    f.picks=l.includes(id)?l.filter(x=>x!==id):l.length<PICK_MAX?[...l,id]:l;
    f.mode="pick";
    if(!document.getElementById("pickBox")){ document.querySelectorAll(`.addplan[data-id="${CSS.escape(id)}"]`).forEach(b=>b.textContent=f.picks.includes(id)?"In your plan ✓":"Add to a plan"); if(f.picks.includes(id)) toast(`Added to your plan (${f.picks.length}). Send it from Decide.`); return; }
    updatePicks(); },
  start(){ const f=S.form, unit=WHAT_UNIT[f.what], ev=f.what==="event", max=maxFromPrice(unit,f.price||0), {group,idx,linkOnly,...rest}=f, q={...rest,max,rating:ev?0:rateMin(f.rating),metro:!ev&&!!f.metro,time:ev?"":(f.time||"")}, options=shortlist(q);
    if(f.mode==="pick"){ const picks=(f.picks||[]).filter(byId); if(!picks.length) return;
      newPlan({...q,what:f.what,options:picks,seen:picks,picked:true,finished:false},group); f.picks=[]; S.pickQ=""; S.pickSearched=false; return; }
    if(!options.length){ toast(f.pin&&f.radius&&shortlist({...q,radius:null}).length?`Nothing within ${radText(f.radius)} of the pin. Try a bigger radius.`:f.what==="event"?"No events listed around that date yet. Try another date or price.":"Nothing matches. Try fewer filters or another day."); return; }
    newPlan({...q,options,seen:options,finished:false},group); },
  planDelete(){ if(S.confirm!==S.code) return armConfirm(); closePlan("delete_plan","Plan deleted."); },
  planLeave(){ if(S.confirm!==S.code) return armConfirm(); closePlan("leave_plan","You left the plan."); },
  async planRejoin(){ const code=S.code; try{ await rpc("rejoin_plan",{p_code:code}); await openPlan(code); loadGroups(); toast("You're back in."); }catch{ toast("Couldn't rejoin. Try again."); } },
  attend(el){ const go=el.dataset.v==="1"; setAttending(go); },
  clearTime(){ S.timeOpen=false;  S.form.time=""; render(); },
  share(){ shareOut(`Help choose where we go: ${shareUrl()}`,"Link copied"); },
  authView(el){ S.email=document.getElementById("email")?.value||S.email; S.authView=el.dataset.v; S.authNote=""; render(); },
  logout(){ logout(); },
  openPlan(el){ openPlan(el.dataset.code); },
  openGroup(el){ S.chatOpen=false; CHAT.gid=null; S.gid=el.dataset.id; S.leaving=false; render(); scrollTo(0,0); },
  openChat(el){ openChat(el.dataset.id); },
  seen(el){ if(getSelection&&String(getSelection()).length) return; const id=Number(el.dataset.id); CHAT.seenOpen=CHAT.seenOpen===id?null:id; paintChat(false); },
  closeChat(){ closeChat(); },
  removeAvatar(){ removeAvatar(); },
  viewAv(el){ openPhoto(el.dataset.id,el.dataset.name); },
  allGroups(){ S.chatOpen=false; CHAT.gid=null; S.gid=null; S.acct=false; S.deleting=false; S.leaving=false; render(); scrollTo(0,0); },
  account(){ S.acct=true; S.deleting=false; render(); scrollTo(0,0); },
  setTheme(el){ setTheme(el.dataset.v); render(); },
  closeAccount(){ S.acct=false; S.deleting=false; render(); scrollTo(0,0); },
  joinMode(el){ S.joinMode=el.dataset.v==="1"; render(); document.getElementById(S.joinMode?"joinCode":"groupName")?.focus(); },
  async deleteAccount(el){ if(!S.deleting){ S.deleting=true; render(); return; }
    el.disabled=true; el.textContent="Deleting";
    try{ await rpc("delete_account"); }catch{ S.deleting=false; render(); toast("Couldn't delete your account. Try again."); return; }
    try{localStorage.removeItem(KEY)}catch{} S.saved.clear(); S.acct=false; S.deleting=false;
    logout(true); S.authNote="Your account and its data have been deleted."; render(); },
  newGroupPlan(el){ S.form.group=el.dataset.id; S.form.linkOnly=false; S.plan=null; S.code=null; setUrl(null); S.tab="decide"; render(); scrollTo(0,0); },
  invite(el){ const g=S.groups.find(x=>x.id===el.dataset.id); if(g) shareOut(`Join ${g.name} on Concit: ${inviteUrl(g)}`,"Invite link copied"); },
  async leave(el){ if(!S.leaving){ S.leaving=true; render(); return; } S.leaving=false; try{ await rpc("leave_group",{p_group:el.dataset.id}); S.gid=null; await loadGroups(); render(); }catch{ toast("Couldn't leave the group. Try again."); } },
  vote(el){ dealVote(el.dataset.id,Number(el.dataset.v)); },
  undoVote(){ undoVote(); },
  finish(){ changePlan({...S.plan,finished:true}); },
  reset(){ const g=S.plan?.group_id; clearPlan(); if(g){ S.gid=g; S.tab="groups"; render(); } },
  again(){ const p=S.plan, options=shortlist(p,p.seen||p.options); if(!options.length){ toast("That's everything for these choices."); return; }
    S.ver++; changePlan({...p,options,seen:[...(p.seen||[]),...options],votes:{},finished:false},true); },
  copy(){ const it=results(S.plan)[0].item, where=it.cat?it.venue:it.addr, when=parse(S.plan.day).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"});
    const t=`${it.name}, ${where}. ${when}${S.plan.time?` at ${S.plan.time}`:""}.`;
    (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>toast("Copied"),()=>toast(t)); },
  hot(el){ if(HOT_UNIT[S.hot]!==HOT_UNIT[el.dataset.v]) flt().price=0; S.hot=el.dataset.v; FIT=null; render(); },
  hotView(el){ S.hotView=el.dataset.v; render(); },
  zoneMap(el){ S.zone=el.dataset.z; render(); },
  pin(el){ selectPlace(el.dataset.id); },
  showGroup(el){ S.open.add(el.dataset.v); render(); },
  ev(el){ S.ev=el.dataset.v||null; S.evCalOpen=false; S.evDate=null; render(); scrollTo(0,0); },
  save(el){ const id=el.dataset.id; S.saved.has(id)?S.saved.delete(id):S.saved.add(id); persist(); render();
  }
};
document.addEventListener("click",e=>{const el=e.target.closest("[data-act]");if(el){ hideToast(); H[el.dataset.act]?.(el); }});
document.addEventListener("submit",hideToast,true);
/* Update what's picked without rebuilding the list, so the page stays where it is. */
function updatePicks(){ const f=S.form, picks=(f.picks||[]).filter(byId), list=document.querySelector(".picklist"), c=document.getElementById("pickChips"), b=document.getElementById("startBtn");
  if(!list||!c){ render(); return; }
  const y0=list.getBoundingClientRect().top; c.innerHTML=pickChipsHtml(picks); const dy=list.getBoundingClientRect().top-y0; if(dy) scrollBy(0,dy);
  list.querySelectorAll(".person[data-id]").forEach(el=>{ const on=picks.includes(el.dataset.id); el.setAttribute("aria-pressed",on); el.disabled=!on&&picks.length>=PICK_MAX; el.lastElementChild.textContent=on?"Added ✓":"Add"; });
  if(b){ b.textContent=pickStartLabel(f); b.hidden=!picks.length; } }
function refreshPicks(){ const box=document.getElementById("pickBox"), b=document.getElementById("startBtn"); if(!box){ render(); return; }
  const sl=box.querySelector(".pickareas")?.scrollLeft||0; box.innerHTML=pickBoxHtml(S.form); const ar=box.querySelector(".pickareas"); if(ar) ar.scrollLeft=sl; if(b){ b.textContent=pickStartLabel(S.form); b.hidden=!(S.form.picks||[]).filter(byId).length; } }
document.addEventListener("keydown",e=>{ if(e.key==="Enter"&&e.target.id==="pickQ"){ e.preventDefault(); e.target.blur(); H.pickSearch(); } });
document.addEventListener("input",e=>{ if(e.target.dataset.search==="pick"){ S.pickQ=e.target.value; refreshPicks(); } });
document.addEventListener("input",e=>{ const el=e.target; if(!el.dataset.ps) return; const t=priceLabel(el.dataset.unit||undefined,psValue(el)); el.parentNode.querySelector(".psval").textContent=t; el.setAttribute("aria-valuetext",t); });
document.addEventListener("change",e=>{ const el=e.target; if(el.dataset.cs){ H[el.dataset.cs]({dataset:{v:el.value}}); return; } if(!el.dataset.ps) return; H[el.dataset.ps]({dataset:{v:String(psValue(el))}}); });
document.addEventListener("input",e=>{const u=e.target.dataset.slider; if(!u) return; const i=Number(e.target.value);
  if(e.target.id==="budget") S.form.idx[u]=i; else S.hotIdx[u]=i;
  document.getElementById(e.target.id+"Val").textContent=stepText(u,i);});
/* Meet time is typed: "1930", "19:30" or "9" all work. It's tidied as you type and checked when you finish. */
function timeTyping(v){
  if(v.includes(":")){ const [h,m=""]=v.split(":"); return h.replace(/\D/g,"").slice(0,2)+":"+m.replace(/\D/g,"").slice(0,2); }
  const d=v.replace(/\D/g,"").slice(0,4); if(d.length<2) return d;
  const one=+d[0]>2||+d.slice(0,2)>23;
  return one?(d.length>1?d[0]+":"+d.slice(1,3):d):(d.length>2?d.slice(0,2)+":"+d.slice(2):d);
}
function timeDone(v){
  v=v.trim(); if(!v) return "";
  const [h,m="0"]=timeTyping(v).split(":"); if(h===""||+h>23||+m>59) return null;
  return String(+h).padStart(2,"0")+":"+String(m.length===1&&m!=="0"?m+"0":+m).padStart(2,"0").slice(0,2);
}
document.addEventListener("input",e=>{ if(e.target.id!=="meetTime") return; const el=e.target, atEnd=el.selectionStart===el.value.length, del=e.inputType&&e.inputType.startsWith("delete"); if(atEnd&&!del) el.value=timeTyping(el.value); el.classList.remove("bad"); });
document.addEventListener("keydown",e=>{ if(e.key==="Enter"&&e.target.id==="meetTime") e.target.blur(); });
document.addEventListener("change",e=>{ if(e.target.id==="meetTime"){ const t=timeDone(e.target.value); if(t===null){ e.target.classList.add("bad"); S.form.time=""; toast("Type the time like 19:30."); } else { S.form.time=t; e.target.value=t; } return; } if(e.target.id==="avFile"){ uploadAvatar(e.target.files&&e.target.files[0]); e.target.value=""; return; } if(e.target.id==="hotBudget") render(); const c=e.target.dataset.change; if(c==="area"){S.form.area=e.target.value}  if(c==="sendTo"){S.form.group=e.target.value;S.form.linkOnly=!e.target.value;persist();render()}});
document.addEventListener("submit",async e=>{ e.preventDefault();
  if(e.target.id==="authForm") authSubmit();
  if(e.target.id==="groupForm"){ const i=document.getElementById("groupName"), n=i.value.trim(); if(!n) return; i.value=""; i.blur(); try{ S.gid=await rpc("create_group",{p_name:n}); await loadGroups(); render(); }catch{ toast("Couldn't create the group. Try again."); } }
  if(e.target.id==="nameForm"){ const i=document.getElementById("myName"), n=i.value.trim(); if(!n){ toast("Add your name"); return; } i.blur();
    try{ await rpc("set_name",{p_name:n}); }catch{ toast("Couldn't save your name. Try again."); return; }
    try{ S.session.user=await authCall("user",{data:{name:n}},"PUT",S.session.access_token); }catch{ S.session.user={...S.session.user,user_metadata:{...S.session.user?.user_metadata,name:n}}; }
    saveSession(); await loadGroups(); render(); toast("Name saved"); }
  if(e.target.id==="chatForm"){ sendChat(); return; }
  if(e.target.id==="codeForm"){ const i=document.getElementById("joinCode"), c=i.value.trim(); if(!c) return; i.value=""; i.blur(); joinByCode(c); }
});
document.addEventListener("keydown",e=>{ if((e.key==="Enter"||e.key===" ")&&e.target.matches?.("g[data-act]")){e.preventDefault();H.zoneMap(e.target)}
  if((e.key==="Enter"||e.key===" ")&&e.target.matches?.("img[data-act=viewAv]")){e.preventDefault();H.viewAv(e.target)} });
document.addEventListener("focusout",()=>setTimeout(()=>{if(render.later)render()},0));
addEventListener("hashchange",()=>{const t=location.hash.slice(1);if(["decide","hotspots","events","groups"].includes(t)&&t!==S.tab){S.tab=t;render()}});
{const t=location.hash.slice(1);if(["decide","hotspots","events","groups"].includes(t))S.tab=t}

async function loadEvents(){
  try{
    const r=await fetch(`${SB.url}/rest/v1/events?select=*&end_date=gte.${today}&order=start_date`,{headers:{apikey:SB.anonKey,Authorization:`Bearer ${SB.anonKey}`}});
    if(!r.ok) return;
    const rows=await r.json();
    if(!Array.isArray(rows)||!rows.length) return;
    EVENTS.length=0;
    rows.forEach(e=>EVENTS.push({id:e.id,name:e.name,cat:e.cat,start:e.start_date,end:e.end_date,venue:e.venue,zone:e.zone||null,time:e.time||"",priceNum:e.price_num,priceText:e.price_text||"",src:e.src,sold:!!e.sold}));
    const c=rows.map(e=>e.checked).filter(Boolean).sort().pop(); if(c) S.evChecked=new Date(c).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});
    render();
  }catch{}
}
async function loadPlaces(){
  try{
    const r=await fetch(`${SB.url}/rest/v1/places?select=*`,{headers:{apikey:SB.anonKey,Authorization:`Bearer ${SB.anonKey}`}});
    if(!r.ok) return;
    const rows=await r.json();
    if(!Array.isArray(rows)||!rows.length) return;
    PLACES.length=0; rows.forEach(p=>PLACES.push(p));
    render();
  }catch{}
}
function linkFromUrl(){
  const q=new URLSearchParams(location.search), plan=q.get("plan"), join=q.get("join");
  if(plan||join){ S.pending={plan,join}; persist(); }
}
async function afterLogin(){
  render();
  await Promise.all([loadPlaces(),loadEvents(),loadGroups(),loadMyAvatar()]);
  const p=S.pending; S.pending=null; persist();
  if(p?.join){ setUrl(null); await joinByCode(p.join); }
  else if(p?.plan) await openPlan(p.plan);
  render();
}
/* Links from confirmation and password-reset emails arrive in the address hash. */
function sessionFromHash(){
  const h=new URLSearchParams(location.hash.slice(1));
  if(h.get("error_description")){ toast(h.get("error_description").replace(/\+/g," ")); history.replaceState(null,"",location.pathname+location.search); return; }
  const t=h.get("access_token"); if(!t) return;
  S.session={access_token:t,refresh_token:h.get("refresh_token"),expires_at:Number(h.get("expires_at"))||Math.floor(Date.now()/1000)+3600,user:null};
  S.fromEmail=h.get("type");
  history.replaceState(null,"",location.pathname+location.search);
}
(async()=>{
  linkFromUrl(); sessionFromHash();
  if(S.session&&!S.session.user){
    try{ S.session.user=await authCall("user",null,"GET",S.session.access_token); saveSession(); }catch{ S.session=null; saveSession(); }
  }
  if(S.fromEmail==="recovery"&&S.session){ S.authView="newpass"; render(); return; }
  if(S.session){ try{ await afterLogin(); }catch{ render(); } } else render();
})();
setInterval(refresh,2500);
setInterval(loadGroups,8000);
setInterval(()=>{ if(S.chatOpen&&S.tab==="groups") loadChat(); },2500);
document.addEventListener("keydown",e=>{ if(e.target.id==="chatText"&&e.key==="Enter"&&!e.shiftKey&&!e.isComposing&&!matchMedia("(pointer:coarse)").matches){ e.preventDefault(); sendChat(); } });
document.addEventListener("input",e=>{ if(e.target.id==="chatText"){ const t=e.target; typing(!!t.value.trim()); t.style.height=""; t.style.height=Math.min(t.scrollHeight,140)+"px"; sizeChat(); } });
document.addEventListener("visibilitychange",()=>{refresh();loadGroups()});
addEventListener("popstate",()=>{ if(!S.session) return; const c=new URLSearchParams(location.search).get("plan"); if(c===S.code||(!c&&!S.code)) return; if(c) openPlan(c); else {S.code=null;S.plan=null;render()} });
