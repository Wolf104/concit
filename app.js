"use strict";
const KIND={eat:"Restaurant",drink:"Bar",wine:"Wine bar",beer:"Craft beer",cheap:"Cheap eats",culture:"Culture",club:"Nightclub"};
/* Budgets are per unit: a meal, a drink, club entry or a ticket. */
const STEPS={meal:[10,15,20,25,30,40,50,60,80,100,150,200],drink:[5,6,7,8,10,12,15,18,20,25],entry:[10,15,20,25,30,40,50],ticket:[0,5,10,15,20,30,50,75,100]};
const LABEL={meal:"Max per meal",drink:"Max per drink",entry:"Max entry price",ticket:"Max per ticket"};
const UNIT_TEXT={meal:"a meal",drink:"a drink",entry:"entry",ticket:"a ticket"};
const WHAT_UNIT={eat:"meal",drinks:"drink",clubs:"entry",culture:"ticket",event:"ticket"};
const KIND_UNIT={eat:"meal",cheap:"meal",drink:"drink",wine:"drink",beer:"drink",club:"entry",culture:"ticket"};
const HOT_UNIT={eat:"meal",drink:"drink",club:"entry",culture:"ticket"};
const BAND={meal:[15,30,55,130],drink:[7,11,15,20],entry:[15,20,30,40],ticket:[5,15,25,40]};
const costOf=(p,unit)=>p.costs&&p.costs[unit]!=null?p.costs[unit]:BAND[unit][p.price-1];
const maxFor=(unit,i)=>i>=STEPS[unit].length?null:STEPS[unit][i];
const stepText=(unit,i)=>{const m=maxFor(unit,i);return m===null?"No limit":m===0?"Free only":`€${m}`};
function costText(p){const u=KIND_UNIT[p.kind],c=costOf(p,u);return c===0?"Free":`about €${c} ${UNIT_TEXT[u]}`}
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
function whenOptions(){
  let w=addDays(today,2);
  while(![0,6].includes(parse(w).getDay())) w=addDays(w,1);
  return [[today,"Tonight"],[addDays(today,1),"Tomorrow"],[w,long(w)]];
}
const open=(p,day)=>!(p.closed||[]).includes(parse(day).getDay());

/* The best places for the choices made, skipping anything the group has already seen. */
function shortlist(s,seen=[]){
  const near=z=>s.area&&z&&ZONES[z]?km(ZONES[s.area],ZONES[z]):(s.area?6:0);
  const unit=WHAT_UNIT[s.what], fits=x=>s.max==null||(x.cat?x.priceNum==null||x.priceNum<=s.max:costOf(x,unit)<=s.max);
  const places=want=>PLACES.filter(p=>want(p)&&open(p,s.day)&&!seen.includes(p.id));
  let pool=[];
  if(s.what==="event"){
    pool=EVENTS.filter(e=>!e.sold&&e.cat!=="art"&&!isRun(e)&&e.end>=s.day&&e.start<=addDays(s.day,6)&&!seen.includes(e.id)&&fits(e));
    pool.sort((a,b)=>(a.start>s.day?a.start:s.day).localeCompare(b.start>s.day?b.start:s.day)||near(a.zone)-near(b.zone));
    return pool.slice(0,5).map(e=>e.id);
  }
  if(s.what==="clubs"){
    pool=places(p=>p.occ.includes("night")&&fits(p));
  } else if(s.what==="culture"){
    const shows=EVENTS.filter(e=>e.cat==="art"&&e.start<=s.day&&e.end>=s.day&&!seen.includes(e.id)&&fits(e));
    pool=[...places(p=>p.kind==="culture"&&fits(p)),...shows];
  } else {
    const occ=s.what==="eat"?["dinner","cheap"]:["drinks"];
    pool=places(p=>p.occ.some(o=>occ.includes(o))&&fits(p));
  }
  const score=x=>near(x.zone)-(x.hot||1)*.9;
  pool.sort((a,b)=>score(a)-score(b));
  const out=[],zones={};
  for(const x of pool){ if(!s.area&&(zones[x.zone]||0)>=2) continue; zones[x.zone]=(zones[x.zone]||0)+1; out.push(x.id); if(out.length===5) break; }
  return out;
}
/* Most yeses wins. Ties go to the place that appeared first, which is the stronger match. */
function results(p){
  return p.options.map((id,i)=>({id,i,item:byId(id),yes:Object.values(p.votes||{}).filter(v=>v[id]===1).length}))
    .filter(r=>r.item).sort((a,b)=>b.yes-a.yes||a.i-b.i);
}
const votedAll=(p,n)=>p.options.every(id=>(p.votes?.[n]||{})[id]!==undefined);
const allDone=p=>p.people.every(n=>votedAll(p,n));
const nextCard=(p,n)=>p.options.find(id=>(p.votes?.[n]||{})[id]===undefined);
function merge(a,b){const o={...a};for(const k in b)o[k]=b[k]&&typeof b[k]==="object"&&!Array.isArray(b[k])&&a[k]&&typeof a[k]==="object"?merge(a[k],b[k]):b[k];return o}

/* ---------- State ---------- */
const KEY="concit.v4", SKEY="concit.session";
const SB=window.CONCIT_CONFIG||{};
const load=k=>{try{return JSON.parse(localStorage.getItem(k))}catch{return null}};
const init=load(KEY)||{};
const S={tab:"decide",plan:null,code:null,saved:new Set(init.saved||[]),session:load(SKEY),authView:"login",authBusy:false,authNote:"",email:"",pending:init.pending||null,
  groups:[],gid:null,leaving:false,ver:0,inflight:0,
  form:{what:"drinks",day:today,area:"",group:init.group||"",idx:{meal:5,drink:5,entry:2,ticket:6}},hotIdx:{meal:12,drink:10,entry:7,ticket:9},hot:"all",hotView:"list",zone:null,sel:null,open:new Set(),mapFail:false,mapOk:false,ev:"all"};
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
  S.session=null; S.plan=null; S.code=null; S.groups=[]; S.gid=null; S.authView="login"; S.authNote=expired?"Please log in again.":""; S.tab="decide";
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
const planBody=({votes,names,group_id,group_name,...rest})=>rest;
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
    const g=await rpc("my_groups");
    if(JSON.stringify(g)!==JSON.stringify(S.groups)){ S.groups=g||[]; render(); }
  }catch{}
}
async function openPlan(code){
  try{
    await rpc("join_plan",{p_code:code});
    const p=await rpc("get_plan",{p_code:code});
    if(!p){ toast("That plan has expired. Start a new one."); setUrl(null); return; }
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
function clearPlan(){ S.plan=null; S.code=null; setUrl(null); render(); }
async function vote(id,v){
  S.ver++;
  S.plan=merge(S.plan,{votes:{[uid()]:{[id]:v}}});
  render(); scrollTo(0,0);
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
function toast(t){const el=document.getElementById("toast");el.textContent=t;el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>el.hidden=true,3500)}

/* ---------- Views ---------- */
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const seg=(act,val,opts,label)=>`<div class="seg" role="group" aria-label="${label}">${opts.map(([v,l])=>`<button data-act="${act}" data-v="${v}" aria-pressed="${String(v)===String(val)}">${l}</button>`).join("")}</div>`;
const zname=z=>ZONES[z]?ZONES[z][0]:"";
function slider(id,unit,i){
  return `<div class="group"><div class="sliderhead"><span class="label">${LABEL[unit]}</span><b id="${id}Val">${stepText(unit,i)}</b></div><input type="range" id="${id}" data-slider="${unit}" min="0" max="${STEPS[unit].length}" step="1" value="${i}" aria-label="${LABEL[unit]}"></div>`;
}
const metroText=m=>m[0]?`M${m[0][0]} ${m[0][1]}`:"";
const placeLine=p=>[zname(p.zone),costText(p),metroText(p.metro)].filter(Boolean).join(" · ");
const eventWhen=e=>e.start===e.end?`${wday(e.start)} ${short(e.start)}`:(e.start<=today?`Until ${short(e.end)}`:`${short(e.start)} to ${short(e.end)}`);
const mapsUrl=q=>"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(q+", Milano");

const WHAT_TEXT={eat:"Food",drinks:"Drinks",clubs:"Clubs",culture:"Culture",event:"An event"};
const dayText=d=>d===today?"tonight":d===addDays(today,1)?"tomorrow":`${long(d)} ${short(d)}`;
const planTitle=p=>`${WHAT_TEXT[p.what]||"Plan"} ${dayText(p.day)}`;
const toVote=()=>S.groups.flatMap(g=>g.plans.filter(p=>!p.finished&&p.mine<p.options).map(p=>({...p,group:g.name})));
function viewSetup(){
  const f=S.form, unit=WHAT_UNIT[f.what], todo=toVote();
  if(f.group&&!S.groups.some(g=>g.id===f.group)) f.group="";
  if(!f.group&&S.groups.length&&!f.linkOnly) f.group=S.groups[0].id;
  return `<div data-hero><h1>Where to?</h1></div>
  ${todo.length?`<div class="group"><span class="label">Waiting for your vote</span><div class="stack">${todo.map(p=>`<button class="person" data-act="openPlan" data-code="${esc(p.code)}"><span>${esc(planTitle(p))}<small class="sub">${esc(p.by||"Someone")} in ${esc(p.group)}</small></span><small>Vote</small></button>`).join("")}</div></div>`:""}
  <div class="group">${seg("what",f.what,[["eat","Eat"],["drinks","Drinks"],["clubs","Clubs"],["culture","Culture"],["event","Event"]],"What")}</div>
  <div class="group">${seg("day",f.day,whenOptions(),"When")}</div>
  ${slider("budget",unit,f.idx[unit])}
  <div class="group"><select id="area" data-change="area" aria-label="Area"><option value="">Anywhere in Milan</option>${AREAS.map(z=>`<option value="${z}" ${f.area===z?"selected":""}>${esc(zname(z))}</option>`).join("")}</select></div>
  <div class="group"><span class="label">Send to</span><select id="sendTo" data-change="sendTo" aria-label="Send to">${S.groups.map(g=>`<option value="${esc(g.id)}" ${f.group===g.id?"selected":""}>${esc(g.name)}</option>`).join("")}<option value="" ${f.group?"":"selected"}>Share by link</option></select></div>
  <button class="btn" data-act="start">${f.group?"Send to the group":"Find places"}</button>`;
}
function viewWaiting(p){
  const done=p.people.filter(n=>votedAll(p,n)).length, solo=p.people.length===1;
  const nameOf=n=>n===uid()?"You":(p.names?.[n]||"Someone");
  return `<div data-hero><span>${esc(p.group_name||planTitle(p))}</span><h1>${solo?"Invite your friends":`${done} of ${p.people.length} voted`}</h1></div>
  ${p.group_id?"":`<div class="group"><button class="btn" data-act="share">Share link</button></div>`}
  <div class="stack">${p.people.map(n=>`<div class="person"><span>${esc(nameOf(n))}</span><small>${votedAll(p,n)?"Done":"Voting"}</small></div>`).join("")}</div>
  ${Object.keys(p.votes||{}).length?`<button class="text" data-act="finish">See the result now</button>`:""}
  <button class="text" data-act="reset">Back</button>`;
}
function viewCard(p){
  const id=nextCard(p,uid()), it=byId(id), i=p.options.indexOf(id);
  const line=it.cat?`${eventWhen(it)} · ${it.venue}`:placeLine(it);
  return `<div data-hero><span>${esc(p.group_name||"Your vote")}</span><h1>${i+1} of ${p.options.length}</h1></div>
  <div class="place"><span class="dim">${it.cat?"Event":esc(KIND[it.kind])}</span><h2>${esc(it.name)}</h2>
    ${it.cat?(it.priceText?`<p>${esc(it.priceText)}</p>`:""):`<p>${esc(it.why)}</p>`}
    <p class="dim">${esc(line)}</p></div>
  <div class="yesno"><button class="btn plain" data-act="vote" data-id="${esc(id)}" data-v="0">No</button><button class="btn" data-act="vote" data-id="${esc(id)}" data-v="1">Yes</button></div>`;
}
function viewResult(p){
  const r=results(p), w=r[0], total=Object.keys(p.votes||{}).length||p.people.length, back=p.group_id?"Back":"New plan";
  if(!w||w.yes===0) return `<div data-hero><span>Nobody said yes to any of these</span><h1>No match this round</h1></div>
    <div class="stack"><button class="btn" data-act="again">Try 5 more</button></div><button class="text" data-act="reset">${back}</button>`;
  const it=w.item, where=it.cat?it.venue:`${it.addr}`, sub=it.cat?eventWhen(it):[metroText(it.metro),zname(it.zone)].filter(Boolean).join(" · ");
  return `<div data-hero><span>${w.yes} of ${total} said yes</span><h1 class="placename">${esc(it.name)}</h1></div><div class="win"><p>${esc(where)}</p><p class="dim">${esc(sub)}</p></div>
  <div class="stack"><button class="btn" data-act="copy">Copy the details</button><a class="btn plain" href="${mapsUrl(it.name+" "+where)}" target="_blank" rel="noopener">Directions</a></div>
  <div class="group" style="margin-top:24px"><span class="label">Other options</span><div class="rows">${r.slice(1).map(x=>`<div class="rowstat"><span>${esc(x.item.name)}</span><span>${x.yes} yes</span></div>`).join("")}</div></div>
  <button class="text" data-act="reset">${back}</button>`;
}
function viewDecide(){
  const p=S.plan;
  if(!p) return viewSetup();
  if(p.finished||(allDone(p)&&p.people.length>1)) return viewResult(p);
  if(p.people.includes(uid())&&nextCard(p,uid())) return viewCard(p);
  return viewWaiting(p);
}

/* ---------- Login ---------- */
function viewAuth(){
  const v=S.authView, b=S.authBusy, invited=S.pending?.join, f=(id,type,label,auto,val="")=>`<label class="field"><span class="label">${label}</span><input type="${type}" id="${id}" autocomplete="${auto}" value="${esc(val)}" ${b?"disabled":""}></label>`;
  const titles={login:invited?"Log in to join the group":"Welcome back",signup:invited?"Create an account to join":"Create your account",reset:"Reset your password",newpass:"Choose a new password"};
  const main={login:"Log in",signup:"Create account",reset:"Send reset link",newpass:"Save password"}[v];
  return `<div data-hero><h1>${titles[v]}</h1></div>
  ${v==="login"||v==="signup"?`<div class="group">${seg("authView",v,[["login","Log in"],["signup","Create account"]],"Account")}</div>`:""}
  ${S.authNote?`<p class="note">${esc(S.authNote)}</p>`:""}
  <form id="authForm" novalidate>
    ${v==="signup"?f("name","text","Your name","name")+`<p class="hint left">Your friends will see this in your groups.</p>`:""}
    ${v==="newpass"?"":f("email","email","Email","email",S.email)}
    ${v==="reset"?"":f("password","password",v==="newpass"?"New password":"Password",v==="login"?"current-password":"new-password")}
    <button class="btn" type="submit" ${b?"disabled":""}>${b?"One moment":main}</button>
  </form>
  ${v==="login"?`<button class="text" data-act="authView" data-v="reset">Forgot your password?</button>`:""}
  ${v==="reset"?`<button class="text" data-act="authView" data-v="login">Back to log in</button>`:""}`;
}

/* ---------- Groups ---------- */
function planRow(p){
  const status=p.finished||p.done>=p.people?"See result":p.mine<p.options?"Vote":`${p.done} of ${p.people} voted`;
  return `<button class="person" data-act="openPlan" data-code="${esc(p.code)}"><span>${esc(planTitle(p))}<small class="sub">Started by ${esc(p.by||"someone")}</small></span><small>${status}</small></button>`;
}
function viewGroup(g){
  const n=g.members.length;
  return `<div data-hero><span>${n} ${n===1?"member":"members"}</span><h1>${esc(g.name)}</h1></div>
  <div class="stack"><button class="btn" data-act="newGroupPlan" data-id="${esc(g.id)}">Start a plan</button>
  <button class="btn plain" data-act="invite" data-id="${esc(g.id)}">Invite people</button></div>
  <p class="hint">Or share the code <b class="code">${esc(g.invite_code)}</b></p>
  <div class="group" style="margin-top:20px"><span class="label">Plans</span>${g.plans.length?`<div class="stack">${g.plans.map(planRow).join("")}</div>`:`<p class="hint left">No plans yet. Start one and everyone here can vote.</p>`}</div>
  <div class="group"><span class="label">Members</span><div class="rows">${g.members.map(m=>`<div class="rowstat"><span>${esc(m.name)}${m.id===uid()?" (you)":""}</span></div>`).join("")}</div></div>
  <button class="text" data-act="leave" data-id="${esc(g.id)}">${S.leaving?"Tap again to leave this group":"Leave group"}</button>
  <button class="text" data-act="allGroups">All groups</button>`;
}
function viewGroups(){
  const g=S.groups.find(x=>x.id===S.gid);
  if(g) return viewGroup(g);
  const name=S.session?.user?.user_metadata?.name||"You";
  return `<div data-hero><h1>My groups</h1></div>
  ${S.groups.length?`<div class="stack">${S.groups.map(x=>{const v=x.plans.filter(p=>!p.finished&&p.mine<p.options).length;return `<button class="person" data-act="openGroup" data-id="${esc(x.id)}"><span>${esc(x.name)}<small class="sub">${x.members.length} ${x.members.length===1?"member":"members"}</small></span><small>${v?`${v} to vote on`:"Open"}</small></button>`}).join("")}</div>`:`<p class="hint left">Create a group for your friends or family, then invite them. Plans you send there appear for everyone.</p>`}
  <form id="groupForm" class="group" style="margin-top:20px" novalidate><span class="label">New group</span><div class="inline"><input type="text" id="groupName" placeholder="Group name" maxlength="40" autocomplete="off"><button class="btn small" type="submit">Create</button></div></form>
  <form id="codeForm" class="group" novalidate><span class="label">Got an invite code?</span><div class="inline"><input type="text" id="joinCode" placeholder="Invite code" maxlength="14" autocomplete="off" autocapitalize="off"><button class="btn small plain" type="submit">Join</button></div></form>
  <p class="foot">Logged in as ${esc(name)}.</p><button class="text" data-act="logout">Log out</button>`;
}
const HOT_TYPES=[["all","All"],["eat","Eat"],["drink","Drinks"],["club","Clubs"],["culture","Culture"]];
const HOT_GROUPS=[["Restaurants",p=>p.kind==="eat"],["Cheap eats",p=>p.kind==="cheap"],["Bars",p=>["drink","wine","beer"].includes(p.kind)],["Nightclubs",p=>p.kind==="club"],["Culture",p=>p.kind==="culture"]];
const MAPLIBRE="https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/";
const MAP_STYLE="https://tiles.openfreemap.org/styles/liberty";
const PIN='<svg viewBox="18 10 64 84" aria-hidden="true"><path fill-rule="evenodd" d="M50 90 C50 90 22 62 22 42 A28 28 0 1 1 78 42 C78 62 50 90 50 90 Z M61.584 30.416 A16.380 16.380 0 1 0 61.584 53.584 A3.780 3.780 0 0 0 56.237 48.237 A8.820 8.820 0 1 1 56.237 35.763 A3.780 3.780 0 0 0 61.584 30.416 Z"/></svg>';
let MAP=null, MAP_HOST=null, MAP_LIB=null, PINS={}, FIT="";
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
function syncPins(){
  const list=PLACES.filter(p=>hotMatch(p)&&p.lat), ids=new Set(list.map(p=>p.id));
  for(const id of Object.keys(PINS)) if(!ids.has(id)){ PINS[id].remove(); delete PINS[id]; }
  for(const p of list){
    if(!PINS[p.id]){
      const el=document.createElement("button");
      el.className="mk"; el.type="button"; el.innerHTML=PIN; el.setAttribute("aria-label",p.name); el.dataset.act="pin"; el.dataset.id=p.id;
      PINS[p.id]=new maplibregl.Marker({element:el,anchor:"bottom"}).setLngLat([p.lng,p.lat]).addTo(MAP);
      el.setAttribute("aria-label",p.name);
    }
    PINS[p.id].getElement().classList.toggle("on",p.id===S.sel);
  }
  const fk=S.hot+(hotUnit()?S.hotIdx[hotUnit()]:"");
  if(FIT!==fk&&list.length){
    FIT=fk;
    const b=new maplibregl.LngLatBounds(); list.forEach(p=>b.extend([p.lng,p.lat]));
    MAP.fitBounds(b,{padding:{top:56,bottom:30,left:34,right:34},maxZoom:15,duration:S.hot==="all"?0:500});
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
      MAP.on("load",()=>{ S.mapOk=true; });
      setTimeout(()=>{ if(!S.mapOk&&!S.mapFail) mapFailed(); },12000);
    }
    MAP.resize(); syncPins();
  }catch{ mapFailed(); }
}
const hotType=p=>({all:true,eat:["eat","cheap"].includes(p.kind),drink:["drink","wine","beer"].includes(p.kind),club:p.kind==="club",culture:p.kind==="culture"})[S.hot];
const hotUnit=()=>HOT_UNIT[S.hot];
function hotMatch(p){ if(!hotType(p)) return false; const u=hotUnit(); if(!u) return true; const m=maxFor(u,S.hotIdx[u]); return m===null||costOf(p,u)<=m; }
const byHot=(a,b)=>b.hot-a.hot||a.price-b.price;
function placeRow(p){
  return `<details><summary><div><b>${esc(p.name)}</b><small>${esc(zname(p.zone))} · ${esc(costText(p))}</small></div></summary>
  <div class="more"><p>${esc(p.why)}. ${esc(p.detail)}</p><p class="dim">${esc(p.addr)}${p.metro[0]?" · "+esc(metroText(p.metro)):""}</p>
  <div class="actions"><a href="${mapsUrl(p.name+" "+p.addr)}" target="_blank" rel="noopener">Directions</a><a href="${esc(SRC[p.src][1])}" target="_blank" rel="noopener">Source</a></div></div></details>`;
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
    if(S.mapFail) body=`<p class="head" style="margin-top:0">Tap an area to see what's there</p><div class="mapwrap">${hotMap(list)}</div><p class="head">${esc(zname(S.zone))}</p><div class="list">${here.map(placeRow).join("")}</div>`;
    else { const sel=list.find(p=>p.id===S.sel);
      body=`<div id="mapSlot" class="mapslot"></div>${sel?`<div class="list picked">${placeRow(sel).replace("<details>","<details open>")}</div>`:`<p class="hint">Tap a pin to see the place.</p>`}`; }
  } else {
    body=HOT_GROUPS.map(([t,f])=>{const g=list.filter(f), full=S.hot!=="all"||S.open.has(t), rows=full?g:g.slice(0,6);
      return g.length?`<p class="head">${t}</p>${rows.map(placeRow).join("")}${rows.length<g.length?`<button class="text" data-act="showGroup" data-v="${t}">Show all ${g.length}</button>`:""}`:""}).join("");
  }
  return `<div data-hero><h1>Hotspots</h1></div>
  <div class="group">${seg("hotView",S.hotView,[["list","List"],["map","Map"]],"View")}</div>
  <div class="chips">${HOT_TYPES.map(([k,l])=>`<button class="chip" data-act="hot" data-v="${k}" aria-pressed="${S.hot===k}">${l}</button>`).join("")}</div>
  ${hotUnit()?slider("hotBudget",hotUnit(),S.hotIdx[hotUnit()]):""}
  ${body||`<p class="empty">Nothing at that price. Try raising it.</p>`}
  <p class="foot">Prices are typical estimates. Checked ${CHECKED}, so confirm before you go.${S.hotView==="map"?" Map data © OpenStreetMap contributors.":""}</p>`;
}
function evRow(e){
  const on=S.saved.has(e.id), info=[e.venue,e.sold?"Sold out":e.priceText].filter(Boolean).join(" · ");
  return `<details><summary><div><b>${esc(e.name)}</b><small>${esc(info)}</small></div><span class="when">${esc(eventWhen(e))}</span></summary>
  <div class="more"><div class="actions"><button data-act="save" data-id="${e.id}">${on?"Saved":"Save"}</button><a href="${esc(SRC[e.src][1])}" target="_blank" rel="noopener">Source</a></div>${e.time?`<p class="dim">${esc(e.time)}</p>`:""}</div></details>`;
}
function viewEvents(){
  const test={all:()=>true,music:e=>e.cat==="music",art:e=>e.cat==="art",sport:e=>e.cat==="sport",free:e=>e.priceNum===0,saved:e=>S.saved.has(e.id)}[S.ev];
  const list=EVENTS.filter(e=>e.end>=today&&test(e));
  const dated=list.filter(e=>!isRun(e)).sort((a,b)=>a.start.localeCompare(b.start));
  const runs=list.filter(isRun).sort((a,b)=>a.end.localeCompare(b.end));
  const wk=addDays(today,7), groups=[["Today",e=>e.start<=today],["This week",e=>e.start>today&&e.start<=wk],["Later",e=>e.start>wk]];
  const body=groups.map(([t,f])=>{const g=dated.filter(f);return g.length?`<p class="head">${t}</p>${g.map(evRow).join("")}`:""}).join("")+(runs.length?`<p class="head">Running for a while</p>${runs.map(evRow).join("")}`:"");
  return `<div data-hero><h1>Events</h1></div>
  <div class="chips">${[["all","All"],["music","Music"],["art","Art"],["sport","Sport"],["free","Free"],["saved","Saved"]].map(([k,l])=>`<button class="chip" data-act="ev" data-v="${k}" aria-pressed="${S.ev===k}">${l}</button>`).join("")}</div>
  <div class="list">${body||`<p class="empty">${S.ev==="saved"?"Open an event and tap Save to keep it here.":"Nothing here right now."}</p>`}</div>
  <p class="foot">Checked ${CHECKED}. Confirm dates before you go.</p>`;
}
function render(){
  const a=document.activeElement;
  if(render.ok&&a&&a.matches?.('input[type=text],input[type=email],input[type=password]')&&a.value&&S.session){ render.later=true; return; }
  render.ok=true; render.later=false;
  const open=[...document.querySelectorAll("details[open] b")].map(b=>b.textContent);
  const authed=S.session&&S.authView!=="newpass";
  document.body.classList.toggle("noauth",!authed);
  document.getElementById("view").innerHTML=!authed?viewAuth():S.tab==="decide"?viewDecide():S.tab==="hotspots"?viewHot():S.tab==="groups"?viewGroups():viewEvents();
  const h=document.querySelector("#view [data-hero]"), ht=document.getElementById("heroText");
  ht.innerHTML=h?h.innerHTML:""; h?.remove();
  document.querySelectorAll("details").forEach(d=>{ if(open.includes(d.querySelector("b").textContent)) d.open=true; });
  if(authed&&S.tab==="hotspots"&&S.hotView==="map"&&!S.mapFail) mountMap();
  const badge=document.getElementById("badge"), c=toVote().length; if(badge){ badge.textContent=c; badge.hidden=!c; }
  document.querySelectorAll("nav button").forEach(b=>b.dataset.tab===S.tab?b.setAttribute("aria-current","page"):b.removeAttribute("aria-current"));
}
const H={
  tab(el){ S.tab=el.dataset.tab; try{location.hash=S.tab}catch{} render(); scrollTo(0,0); },
  what(el){ S.form.what=el.dataset.v; render(); },
  day(el){ S.form.day=el.dataset.v; render(); },
  start(){ const f=S.form, unit=WHAT_UNIT[f.what], max=maxFor(unit,f.idx[unit]), {group,idx,linkOnly,...rest}=f, q={...rest,max}, options=shortlist(q);
    if(!options.length){ toast("Nothing fits that budget. Try raising it or choosing another day."); return; }
    newPlan({...q,options,seen:options,finished:false},group); },
  share(){ shareOut(`Help choose where we go: ${shareUrl()}`,"Link copied"); },
  authView(el){ S.email=document.getElementById("email")?.value||S.email; S.authView=el.dataset.v; S.authNote=""; render(); },
  logout(){ logout(); },
  openPlan(el){ openPlan(el.dataset.code); },
  openGroup(el){ S.gid=el.dataset.id; S.leaving=false; render(); scrollTo(0,0); },
  allGroups(){ S.gid=null; S.leaving=false; render(); scrollTo(0,0); },
  newGroupPlan(el){ S.form.group=el.dataset.id; S.form.linkOnly=false; S.plan=null; S.code=null; setUrl(null); S.tab="decide"; render(); scrollTo(0,0); },
  invite(el){ const g=S.groups.find(x=>x.id===el.dataset.id); if(g) shareOut(`Join ${g.name} on Concit: ${inviteUrl(g)}`,"Invite link copied"); },
  async leave(el){ if(!S.leaving){ S.leaving=true; render(); return; } S.leaving=false; try{ await rpc("leave_group",{p_group:el.dataset.id}); S.gid=null; await loadGroups(); render(); }catch{ toast("Couldn't leave the group. Try again."); } },
  vote(el){ vote(el.dataset.id,Number(el.dataset.v)); },
  finish(){ changePlan({...S.plan,finished:true}); },
  reset(){ const g=S.plan?.group_id; clearPlan(); if(g){ S.gid=g; S.tab="groups"; render(); } },
  again(){ const p=S.plan, options=shortlist(p,p.seen||p.options); if(!options.length){ toast("That's everything for these choices."); return; }
    S.ver++; changePlan({...p,options,seen:[...(p.seen||[]),...options],votes:{},finished:false},true); },
  copy(){ const it=results(S.plan)[0].item, where=it.cat?it.venue:it.addr, when=parse(S.plan.day).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"});
    const t=`${it.name}, ${where}. ${when}.`;
    (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>toast("Copied"),()=>toast(t)); },
  hot(el){ S.hot=el.dataset.v; render(); },
  hotView(el){ S.hotView=el.dataset.v; render(); },
  zoneMap(el){ S.zone=el.dataset.z; render(); },
  pin(el){ S.sel=el.dataset.id; render(); },
  showGroup(el){ S.open.add(el.dataset.v); render(); },
  ev(el){ S.ev=el.dataset.v; render(); },
  save(el){ const id=el.dataset.id; S.saved.has(id)?S.saved.delete(id):S.saved.add(id); persist(); render();
  }
};
document.addEventListener("click",e=>{const el=e.target.closest("[data-act]");if(el) H[el.dataset.act]?.(el)});
document.addEventListener("input",e=>{const u=e.target.dataset.slider; if(!u) return; const i=Number(e.target.value);
  if(e.target.id==="budget") S.form.idx[u]=i; else S.hotIdx[u]=i;
  document.getElementById(e.target.id+"Val").textContent=stepText(u,i);});
document.addEventListener("change",e=>{ if(e.target.id==="hotBudget") render(); const c=e.target.dataset.change; if(c==="area"){S.form.area=e.target.value} if(c==="sendTo"){S.form.group=e.target.value;S.form.linkOnly=!e.target.value;persist();render()}});
document.addEventListener("submit",async e=>{ e.preventDefault();
  if(e.target.id==="authForm") authSubmit();
  if(e.target.id==="groupForm"){ const i=document.getElementById("groupName"), n=i.value.trim(); if(!n) return; i.value=""; i.blur(); try{ S.gid=await rpc("create_group",{p_name:n}); await loadGroups(); render(); }catch{ toast("Couldn't create the group. Try again."); } }
  if(e.target.id==="codeForm"){ const i=document.getElementById("joinCode"), c=i.value.trim(); if(!c) return; i.value=""; i.blur(); joinByCode(c); }
});
document.addEventListener("keydown",e=>{ if((e.key==="Enter"||e.key===" ")&&e.target.matches?.("g[data-act]")){e.preventDefault();H.zoneMap(e.target)} });
document.addEventListener("focusout",()=>setTimeout(()=>{if(render.later)render()},0));
addEventListener("hashchange",()=>{const t=location.hash.slice(1);if(["decide","hotspots","events","groups"].includes(t)&&t!==S.tab){S.tab=t;render()}});
{const t=location.hash.slice(1);if(["decide","hotspots","events","groups"].includes(t))S.tab=t}

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
  await Promise.all([loadPlaces(),loadGroups()]);
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
document.addEventListener("visibilitychange",()=>{refresh();loadGroups()});
addEventListener("popstate",()=>{ if(!S.session) return; const c=new URLSearchParams(location.search).get("plan"); if(c===S.code||(!c&&!S.code)) return; if(c) openPlan(c); else {S.code=null;S.plan=null;render()} });
