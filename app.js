"use strict";
const KIND={eat:"Restaurant",drink:"Bar",wine:"Wine bar",beer:"Craft beer",cheap:"Cheap eats",culture:"Culture"};
const AREAS=["brera","duomo","garibaldi","isola","lambrate","navigli","romana","venezia","sarpi","tortona"];

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
  const max={1:1,2:2,3:4}[s.budget];
  const places=want=>PLACES.filter(p=>want(p)&&open(p,s.day)&&!seen.includes(p.id));
  let pool=[];
  if(s.what==="event"){
    pool=EVENTS.filter(e=>!e.sold&&e.cat!=="art"&&!isRun(e)&&e.end>=s.day&&e.start<=addDays(s.day,6)&&!seen.includes(e.id));
    pool.sort((a,b)=>(a.start>s.day?a.start:s.day).localeCompare(b.start>s.day?b.start:s.day)||near(a.zone)-near(b.zone));
    return pool.slice(0,5).map(e=>e.id);
  }
  if(s.what==="culture"){
    const shows=EVENTS.filter(e=>e.cat==="art"&&e.start<=s.day&&e.end>=s.day&&!seen.includes(e.id));
    pool=[...places(p=>p.kind==="culture"),...shows];
  } else {
    const occ=s.what==="eat"?["dinner","cheap"]:["drinks"];
    pool=places(p=>p.occ.some(o=>occ.includes(o))&&p.price<=max);
    if(!pool.length) pool=places(p=>p.occ.some(o=>occ.includes(o)));
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
const KEY="concit.v3";
const SB=window.CONCIT_CONFIG||{};
const online=Boolean(SB.url&&SB.anonKey);
async function rpc(fn,args){
  const r=await fetch(`${SB.url}/rest/v1/rpc/${fn}`,{method:"POST",headers:{apikey:SB.anonKey,Authorization:`Bearer ${SB.anonKey}`,"Content-Type":"application/json"},body:JSON.stringify(args)});
  if(!r.ok) throw new Error(`${fn} failed (${r.status})`);
  const t=await r.text();
  return t?JSON.parse(t):null;
}
const load=()=>{try{return JSON.parse(localStorage.getItem(KEY))||{}}catch{return{}}};
const init=load();
const S={tab:"decide",plan:init.plan||null,saved:new Set(init.saved||[]),me:null,code:null,names:init.names||{},ver:0,pending:0,
  form:{what:"drinks",day:today,area:"",budget:2,people:["You"]},hot:"all",hotView:"list",zone:null,ev:"all"};
if(S.plan&&S.plan.day<today) S.plan=null;
const persist=()=>{try{localStorage.setItem(KEY,JSON.stringify({plan:S.code?null:S.plan,saved:[...S.saved],names:S.names}))}catch{}};
const planFromUrl=()=>new URLSearchParams(location.search).get("plan");
function setUrl(code){ history.pushState(null,"",code?`?plan=${code}`:location.pathname); }
const shareUrl=()=>`${location.origin}${location.pathname}?plan=${S.code}`;
const withoutVotes=({votes,...rest})=>rest;
async function refresh(){
  if(!S.code||refresh.busy||document.hidden) return;
  refresh.busy=true;
  try{
    const ver=S.ver, p=await rpc("get_plan",{p_code:S.code});
    if(ver!==S.ver||S.pending) return;
    if(p&&JSON.stringify(p)!==JSON.stringify(S.plan)){ S.plan=p; render(); }
    if(!p){ S.code=null; S.plan=null; setUrl(null); render(); toast("That plan no longer exists."); }
  }catch{} finally{ refresh.busy=false; }
}
async function openPlan(code){
  try{
    const p=await rpc("get_plan",{p_code:code});
    if(!p){ toast("That link has expired. Start a new plan."); setUrl(null); return; }
    S.code=code; S.plan=p; S.me=S.names[code]&&!votedAll(p,S.names[code])?S.names[code]:null;
    render();
  }catch{ toast("Couldn't open that plan. Check your connection."); }
}
async function newPlan(p){
  if(!online){ S.plan=p; S.me=p.people.length===1?p.people[0]:null; persist(); render(); return; }
  try{
    const code=await rpc("create_plan",{p_data:withoutVotes(p)});
    S.code=code; S.plan=p; S.me=null; setUrl(code); persist(); render(); }catch{ toast("Couldn't create the plan. Check your connection and try again."); }
}
async function changePlan(p,reset=false){
  S.ver++; S.plan=p; S.me=null; persist(); render();
  if(S.code){ try{ await rpc("update_plan",{p_code:S.code,p_data:withoutVotes(p),p_reset_votes:reset}); }catch{ toast("That change didn't save. Try again."); } }
}
function clearPlan(){ S.plan=null; S.me=null; S.code=null; setUrl(null); persist(); render(); }
async function vote(id,v){
  const n=S.me;
  S.ver++;
  S.plan=merge(S.plan,{votes:{[n]:{[id]:v}}});
  if(!nextCard(S.plan,n)) S.me=null;
  persist(); render();
  if(S.code){ S.pending++; try{ await rpc("cast_vote",{p_code:S.code,p_person:n,p_place:id,p_value:v}); }catch{ toast("That vote didn't save. Try again."); } S.pending--; S.ver++; }
}
async function joinByName(){
  const el=document.getElementById("joinName"), n=el&&el.value.trim().slice(0,20);
  if(!n) return;
  if(S.plan.people.includes(n)){ el.value=""; S.me=n; S.names[S.code]=n; persist(); render(); return; }
  el.value="";
  if(S.code){ try{ await rpc("add_person",{p_code:S.code,p_name:n}); }catch{ toast("Couldn't add your name. Try again."); return; } }
  S.ver++;
  S.plan={...S.plan,people:[...S.plan.people,n]};
  S.me=n; S.names[S.code]=n; persist(); render();
}
function toast(t){const el=document.getElementById("toast");el.textContent=t;el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>el.hidden=true,3000)}

/* ---------- Views ---------- */
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const seg=(act,val,opts,label)=>`<div class="seg" role="group" aria-label="${label}">${opts.map(([v,l])=>`<button data-act="${act}" data-v="${v}" aria-pressed="${String(v)===String(val)}">${l}</button>`).join("")}</div>`;
const zname=z=>ZONES[z]?ZONES[z][0]:"";
const eur=n=>"€".repeat(n);
const metroText=m=>m[0]?`M${m[0][0]} ${m[0][1]}`:"";
const placeLine=p=>[zname(p.zone),eur(p.price),metroText(p.metro)].filter(Boolean).join(" · ");
const eventWhen=e=>e.start===e.end?`${wday(e.start)} ${short(e.start)}`:(e.start<=today?`Until ${short(e.end)}`:`${short(e.start)} to ${short(e.end)}`);
const mapsUrl=q=>"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(q+", Milano");

function viewSetup(){
  const f=S.form, noBudget=f.what==="event"||f.what==="culture";
  return `<div data-hero><h1>Where to?</h1></div>
  <div class="group">${seg("what",f.what,[["eat","Eat"],["drinks","Drinks"],["culture","Culture"],["event","Event"]],"What")}</div>
  <div class="group">${seg("day",f.day,whenOptions(),"When")}</div>
  ${noBudget?"":`<div class="group">${seg("budget",f.budget,[[1,"€"],[2,"€€"],[3,"€€€"]],"Budget")}</div>`}
  <div class="group"><select id="area" data-change="area" aria-label="Area"><option value="">Anywhere in Milan</option>${AREAS.map(z=>`<option value="${z}" ${f.area===z?"selected":""}>${esc(zname(z))}</option>`).join("")}</select></div>
  <div class="group"><span class="label">Who's coming</span>
    <div class="names">${f.people.map((n,i)=>`<button class="name" data-act="rm" data-i="${i}" aria-label="Remove ${esc(n)}">${esc(n)} <span>×</span></button>`).join("")}</div>
    <input type="text" id="addName" placeholder="Add a name" maxlength="20" enterkeyhint="done" autocomplete="off">
  </div>
  <button class="btn" data-act="start">Find places</button>`;
}
function viewPeople(p){
  const left=p.people.filter(n=>!votedAll(p,n)).length, anyVotes=Object.keys(p.votes||{}).length>0;
  const share=S.code?`<div class="group"><button class="btn" data-act="share">Share link with the group</button></div>`:"";
  const join=S.code?`<div class="group" style="margin-top:14px"><input type="text" id="joinName" placeholder="Not listed? Add your name" maxlength="20" enterkeyhint="done" autocomplete="off"></div>`:"";
  return `<div data-hero><h1>Who's voting?</h1></div>${share}<div class="stack">
    ${p.people.map(n=>{const d=votedAll(p,n);return `<button class="person" data-act="me" data-n="${esc(n)}" ${d?"disabled":""}>${esc(n)}<small>${d?"Done":"Vote"}</small></button>`}).join("")}
  </div>${join}
  ${anyVotes&&left?`<button class="text" data-act="finish">See the result now</button>`:""}
  <button class="text" data-act="reset">Start over</button>`;
}
function viewCard(p){
  const id=nextCard(p,S.me), it=byId(id), i=p.options.indexOf(id);
  const line=it.cat?`${eventWhen(it)} · ${it.venue}`:placeLine(it);
  return `<div data-hero><span>${S.me==="You"?"Your vote":esc(S.me)+"'s vote"}</span><h1>${i+1} of ${p.options.length}</h1></div>
  <div class="place"><span class="dim">${it.cat?"Event":esc(KIND[it.kind])}</span><h2>${esc(it.name)}</h2>
    ${it.cat?(it.priceText?`<p>${esc(it.priceText)}</p>`:""):`<p>${esc(it.why)}</p>`}
    <p class="dim">${esc(line)}</p></div>
  <div class="yesno"><button class="btn plain" data-act="vote" data-id="${esc(id)}" data-v="0">No</button><button class="btn" data-act="vote" data-id="${esc(id)}" data-v="1">Yes</button></div>`;
}
function viewResult(p){
  const r=results(p), w=r[0], total=Object.keys(p.votes||{}).length||p.people.length;
  if(!w||w.yes===0) return `<div data-hero><span>Nobody said yes to any of these</span><h1>No match this round</h1></div>
    <div class="stack"><button class="btn" data-act="again">Try 5 more</button></div><button class="text" data-act="reset">Start over</button>`;
  const it=w.item, where=it.cat?it.venue:`${it.addr}`, sub=it.cat?eventWhen(it):[metroText(it.metro),zname(it.zone)].filter(Boolean).join(" · ");
  return `<div data-hero><span>${w.yes} of ${total} said yes</span><h1 class="placename">${esc(it.name)}</h1></div><div class="win"><p>${esc(where)}</p><p class="dim">${esc(sub)}</p></div>
  <div class="stack"><button class="btn" data-act="copy">Copy for the group chat</button><a class="btn plain" href="${mapsUrl(it.name+" "+where)}" target="_blank" rel="noopener">Directions</a></div>
  <div class="group" style="margin-top:24px"><span class="label">Other options</span><div class="rows">${r.slice(1).map(x=>`<div class="rowstat"><span>${esc(x.item.name)}</span><span>${x.yes} yes</span></div>`).join("")}</div></div>
  <button class="text" data-act="reset">New plan</button>`;
}
function viewDecide(){
  const p=S.plan;
  if(!p) return viewSetup();
  if(p.finished||allDone(p)) return viewResult(p);
  if(S.me&&nextCard(p,S.me)) return viewCard(p);
  return viewPeople(p);
}
const HOT_TYPES=[["all","All"],["eat","Eat"],["drink","Drinks"],["culture","Culture"]];
const HOT_GROUPS=[["Restaurants",p=>p.kind==="eat"],["Cheap eats",p=>p.kind==="cheap"],["Bars",p=>["drink","wine","beer"].includes(p.kind)],["Culture",p=>p.kind==="culture"]];
const hotMatch=p=>({all:true,eat:["eat","cheap"].includes(p.kind),drink:["drink","wine","beer"].includes(p.kind),culture:p.kind==="culture"})[S.hot];
const byHot=(a,b)=>b.hot-a.hot||a.price-b.price;
function placeRow(p){
  return `<details><summary><div><b>${esc(p.name)}</b><small>${esc(zname(p.zone))} · ${eur(p.price)}</small></div></summary>
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
  const zones=[...new Set(list.map(p=>p.zone))];
  const pill=z=>{const [x,y]=MAP_SPOTS[z], c=list.filter(p=>p.zone===z).length, on=S.zone===z;
    return `<button class="area" style="left:${x/4}%;top:${y/4.1}%" data-act="zoneMap" data-z="${z}" aria-pressed="${on}">${esc(zname(z))}<i>${c}</i></button>`};
  return `<div class="mapbox"><img src="${cityBg()}" alt=""><span class="north">N ↑</span>${zones.map(pill).join("")}</div>`;
}
function viewHot(){
  const list=PLACES.filter(hotMatch).sort(byHot);
  let body;
  if(S.hotView==="map"){
    const zones=[...new Set(list.map(p=>p.zone))];
    if(!zones.includes(S.zone)) S.zone=zones.includes("duomo")?"duomo":zones[0];
    const here=list.filter(p=>p.zone===S.zone);
    body=`<p class="head" style="margin-top:0">Tap an area to see what's there</p><div class="mapwrap">${hotMap(list)}</div><p class="head">${esc(zname(S.zone))}</p><div class="list">${here.map(placeRow).join("")}</div>`;
  } else {
    body=HOT_GROUPS.map(([t,f])=>{const g=list.filter(f);return g.length?`<p class="head">${t}</p>${g.map(placeRow).join("")}`:""}).join("");
  }
  return `<div data-hero><h1>Hotspots</h1></div>
  <div class="group">${seg("hotView",S.hotView,[["list","List"],["map","Map"]],"View")}</div>
  <div class="chips">${HOT_TYPES.map(([k,l])=>`<button class="chip" data-act="hot" data-v="${k}" aria-pressed="${S.hot===k}">${l}</button>`).join("")}</div>
  ${body}
  <p class="foot">Checked ${CHECKED}. Confirm hours before you go.${S.hotView==="map"?" The map shows areas, so use Directions for the exact spot.":""}</p>`;
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
  if(render.ok&&a&&(a.id==="addName"||a.id==="joinName")&&a.value){ render.later=true; return; }
  render.ok=true; render.later=false;
  const open=[...document.querySelectorAll("details[open] b")].map(b=>b.textContent);
  document.getElementById("view").innerHTML=S.tab==="decide"?viewDecide():S.tab==="hotspots"?viewHot():viewEvents();
  const h=document.querySelector("#view [data-hero]"), ht=document.getElementById("heroText");
  ht.innerHTML=h?h.innerHTML:""; h?.remove();
  document.querySelectorAll("details").forEach(d=>{ if(open.includes(d.querySelector("b").textContent)) d.open=true; });
  document.querySelectorAll("nav button").forEach(b=>b.dataset.tab===S.tab?b.setAttribute("aria-current","page"):b.removeAttribute("aria-current"));
}
function addName(){
  const el=document.getElementById("addName"), n=el&&el.value.trim();
  if(!n) return;
  el.value="";
  if(!S.form.people.includes(n)) S.form.people.push(n);
  render(); document.getElementById("addName")?.focus();
}
const H={
  tab(el){ S.tab=el.dataset.tab; try{location.hash=S.tab}catch{} render(); scrollTo(0,0); },
  what(el){ S.form.what=el.dataset.v; render(); },
  day(el){ S.form.day=el.dataset.v; render(); },
  budget(el){ S.form.budget=Number(el.dataset.v); render(); },
  rm(el){ S.form.people.splice(Number(el.dataset.i),1); render(); },
  start(){ addName(); const f=S.form; if(!f.people.length){ toast("Add at least one name"); return; }
    const options=shortlist(f); if(!options.length){ toast("Nothing matches. Try another day."); return; }
    newPlan({...f,people:[...f.people],options,seen:options,votes:{},finished:false}); },
  me(el){ S.me=el.dataset.n; if(S.code){S.names[S.code]=S.me;persist()} render(); scrollTo(0,0); },
  share(){ const t=shareUrl(); (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>toast("Link copied. Paste it in the group chat."),()=>toast(t)); },
  vote(el){ vote(el.dataset.id,Number(el.dataset.v)); },
  finish(){ changePlan({...S.plan,finished:true}); },
  reset(){ clearPlan(); },
  again(){ const p=S.plan, options=shortlist(p,p.seen||p.options); if(!options.length){ toast("That's everything for these choices."); return; }
    changePlan({...p,options,seen:[...(p.seen||[]),...options],votes:{},finished:false},true); },
  copy(){ const it=results(S.plan)[0].item, where=it.cat?it.venue:it.addr, when=parse(S.plan.day).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"});
    const t=`${it.name}, ${where}. ${when}.`;
    (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>toast("Copied"),()=>toast(t)); },
  hot(el){ S.hot=el.dataset.v; render(); },
  hotView(el){ S.hotView=el.dataset.v; render(); },
  zoneMap(el){ S.zone=el.dataset.z; render(); },
  ev(el){ S.ev=el.dataset.v; render(); },
  save(el){ const id=el.dataset.id; S.saved.has(id)?S.saved.delete(id):S.saved.add(id); persist(); render();
  }
};
document.addEventListener("click",e=>{const el=e.target.closest("[data-act]");if(el) H[el.dataset.act]?.(el)});
document.addEventListener("change",e=>{const c=e.target.dataset.change; if(c==="area"){S.form.area=e.target.value}});
document.addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.id==="addName"){e.preventDefault();addName()} if(e.key==="Enter"&&e.target.id==="joinName"){e.preventDefault();joinByName()} if((e.key==="Enter"||e.key===" ")&&e.target.matches?.("g[data-act]")){e.preventDefault();H.zoneMap(e.target)}});
document.addEventListener("focusout",()=>setTimeout(()=>{if(render.later)render()},0));
addEventListener("hashchange",()=>{const t=location.hash.slice(1);if(["decide","hotspots","events"].includes(t)&&t!==S.tab){S.tab=t;render()}});
{const t=location.hash.slice(1);if(["decide","hotspots","events"].includes(t))S.tab=t}
render();

const code=planFromUrl();
if(code) openPlan(code);
setInterval(refresh,2500);
document.addEventListener("visibilitychange",refresh);
addEventListener("popstate",()=>{const c=planFromUrl(); if(c) openPlan(c); else {S.code=null;S.plan=null;S.me=null;render()}});
