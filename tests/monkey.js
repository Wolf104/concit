const {chromium}=require("playwright-core"); const fs=require("fs"); const makeFake=require("./fake.js");
const testPlaces=require("./places.js");
function rng(seed){ let s=seed; return ()=>{ s=(s*1664525+1013904223)%4294967296; return s/4294967296; }; }
async function run({seed,theme,w,h,steps,label,opts}){
  const b=await chromium.launch({executablePath:process.env.CHROME||"/usr/bin/google-chrome",args:["--no-sandbox"]});
  const ctx=await b.newContext({viewport:{width:w,height:h}}); const pg=await ctx.newPage(); const R=rng(seed);
  const fake=makeFake({admin:true,places:testPlaces(),...(opts||{})}); const problems=[], trail=[];
  const note=m=>{ const k=m.slice(0,140); if(!problems.some(p=>p.k===k)) problems.push({k,m,at:trail.slice(-4).join(" > ")}); };
  pg.on("pageerror",e=>note("JS ERROR: "+e.message)); pg.on("console",m=>{ if(m.type()==="error"&&!/net::|Failed to load resource|favicon/.test(m.text())) note("CONSOLE: "+m.text()); });
  pg.on("dialog",d=>d.dismiss());
  await ctx.addInitScript(([s,th])=>{ localStorage.setItem("concit.session",s); localStorage.setItem("concit.theme",th);
    document.addEventListener("click",e=>{ const a=e.target.closest&&e.target.closest("a[href]"); if(a) e.preventDefault(); },false);
    try{ navigator.share=async()=>{}; Object.defineProperty(navigator,"clipboard",{value:{writeText:async()=>{}},configurable:true}); }catch{} },[JSON.stringify(fake.sess()),theme]);
  await pg.route("**/*",fake.handle);
  await pg.goto("http://localhost:8765/"); await pg.waitForTimeout(2500);
  const SKIP=["logout","deleteAccount","guestLogin","viewAv","cropSave"];
  for(let i=0;i<steps;i++){
    const pick=await pg.evaluate(([r,SKIP])=>{
      const vis=e=>{ const q=e.getBoundingClientRect(); return q.width>2&&q.height>2&&!e.disabled&&getComputedStyle(e).visibility!=="hidden"&&getComputedStyle(e).pointerEvents!=="none"; };
      const els=[...document.querySelectorAll("[data-act],nav button,select,#view input[type=text],#view textarea,details>summary,#coach [data-c],#tour button,.photoclose,.calday")].filter(e=>vis(e)&&!SKIP.includes(e.dataset.act)&&!(e.tagName==="INPUT"&&e.type==="file"));
      if(!els.length) return null; const deep=els.filter(x=>!x.closest("nav")&&x.dataset.act!=="home"&&x.dataset.act!=="account"); const pool=deep.length&&(r*997%1)<.88?deep:els; const e=pool[Math.floor(r*pool.length)]; e.setAttribute("data-mk","1");
      return {tag:e.tagName,act:e.dataset.act||e.dataset.tab||e.id||e.className||e.tagName,opts:e.tagName==="SELECT"?[...e.options].map(o=>o.value):null}; },[R(),SKIP]);
    if(!pick){ note("STUCK: nothing to tap"); break; }
    trail.push(pick.act+(pick.tag==="SELECT"?"(select)":""));
    try{ const el=pg.locator("[data-mk='1']").first();
      if(pick.tag==="SELECT") await el.selectOption(pick.opts[Math.floor(R()*pick.opts.length)],{timeout:1500});
      else if(pick.tag==="INPUT"||pick.tag==="TEXTAREA"){ await el.fill(["pizza","nav","hello there","19:30","7","zzzz",""][Math.floor(R()*7)],{timeout:1500}); if(R()<.5) await el.press("Enter",{timeout:1500}); }
      else await el.click({timeout:1500,force:true});
    }catch(e){ /* element went away mid-tap: fine */ }
    await pg.evaluate(()=>document.querySelectorAll("[data-mk]").forEach(e=>e.removeAttribute("data-mk")));
    await pg.waitForTimeout(90);
    const chk=await pg.evaluate(()=>{ const v=document.getElementById("view"), txt=(document.getElementById("heroText").innerText+" "+(v?v.innerText:"")), bad=txt.match(/\bundefined\b|\bNaN\b|\[object Object\]|\bnull\b|Invalid Date/);
      const ctx=bad?txt.slice(Math.max(0,bad.index-50),bad.index+40).replace(/\s+/g," "):"";
      const W=innerWidth, cul=document.documentElement.scrollWidth>W+1?[...document.querySelectorAll("body *")].filter(e=>{const q=e.getBoundingClientRect(); if(!(q.width>0&&q.right>W+1)) return false; for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement){ const o=getComputedStyle(p); if(/(auto|hidden|scroll|clip)/.test(o.overflowX)) return false; } return true; }).slice(0,4).map(e=>e.tagName+"."+String(e.className).slice(0,30)+"#"+e.id+" right="+Math.round(e.getBoundingClientRect().right)+" «"+(e.innerText||"").slice(0,20).replace(/\n/g," ")+"»").join(" | "):"";
      return {cul,over:document.documentElement.scrollWidth>innerWidth+1,empty:!v||v.innerHTML.trim().length<20,bad:bad?bad[0]+" in «"+ctx+"»":"",title:(document.querySelector("#heroText h1")||{}).innerText||"",authed:!document.body.classList.contains("noauth")}; });
    if(chk.over) note("OVERFLOW sideways on «"+chk.title+"» "+chk.cul);
    if(chk.empty) note("EMPTY screen «"+chk.title+"»");
    if(chk.bad) note("BAD TEXT "+chk.bad);
  }
  fake.st.log.forEach(l=>note("BACKEND: "+l));
  console.log(`\n== ${label}: ${steps} taps, ${problems.length} problem(s), screens seen: ${[...new Set(trail)].length} kinds of action`);
  problems.forEach(p=>console.log(" - "+p.m.slice(0,300)+"\n     after: "+p.at)); console.log("   actions:",[...new Set(trail)].sort().join(" ")); console.log("   backend calls:",[...new Set(fake.st.calls)].sort().join(" "));
  await b.close(); return problems.length;
}
(async()=>{
  const runs=[{seed:1,theme:"dark",w:390,h:844,steps:420,label:"dark iPhone"},{seed:7,theme:"light",w:320,h:568,steps:420,label:"light small phone"},{seed:23,theme:"dark",w:430,h:932,steps:420,label:"dark big phone"},{seed:101,theme:"light",w:393,h:852,steps:500,label:"light iPhone, new sequence"},{seed:202,theme:"dark",w:360,h:740,steps:500,label:"dark Android-size, new sequence"}];
  const pick=process.argv[2]; for(const r of runs.filter((_,i)=>pick===undefined||String(i)===pick)) await run(r);
})();
