/* Events search: find an event by name, venue or type, without losing the keyboard. */
const {chromium}=require("playwright-core"); const makeFake=require("./fake.js"); const M=require("./places.js");
const out=[]; let pg, errs=[];
const expect=(c,m)=>{ if(!c) throw new Error("EXPECTED: "+m); };
const text=()=>pg.evaluate(()=>document.getElementById("heroText").innerText+"\n"+document.getElementById("view").innerText);
async function open(opts,{url="",session=true,keep}={}){
  const b=keep?keep.b:await chromium.launch({executablePath:process.env.CHROME||"/usr/bin/google-chrome",args:["--no-sandbox"]});
  const ctx=await b.newContext({viewport:{width:390,height:844}}); await ctx.grantPermissions(["clipboard-read","clipboard-write"]).catch(()=>{});
  pg=await ctx.newPage(); const fake=keep?keep.fake:makeFake(opts);
  pg.on("pageerror",e=>errs.push(e.message)); pg.on("console",m=>{ if(m.type()==="error"&&!/net::|Failed to load resource|maplibre|tiles\./i.test(m.text())) errs.push("console: "+m.text().slice(0,200)); });
  if(session) await ctx.addInitScript(s=>{ if(!localStorage.getItem("concit.session")) localStorage.setItem("concit.session",s); localStorage.setItem("concit.pushlater","1"); },JSON.stringify(fake.sess()));
  await pg.route("**/*",fake.handle); await pg.goto("http://localhost:8765/"+url); await pg.waitForTimeout(2600); return {b,fake};
}
async function flow(name,fn){ const n=errs.length; try{ await fn(); const e=errs.slice(n); out.push([name,e.length?"JS ERRORS: "+e.join(" ; "):"ok"]); }catch(e){ out.push([name,"FAILED: "+e.message.split("\n")[0].slice(0,400)+(errs.slice(n).length?" | js: "+errs.slice(n).join(" ; "):"")]); try{ await pg.screenshot({path:"fail-"+name.replace(/\W+/g,"-")+".png"}); }catch{} } }
const tab=async t=>{ await pg.locator(`nav [data-tab=${t}]`).click(); await pg.waitForTimeout(700); };
const wide=()=>pg.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
(async()=>{
  const day=n=>{ const d=new Date(Date.now()+n*864e5); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
  const ev=(id,name,cat,type,venue,from,to,city="milan")=>({id:"e:"+id,name,cat,type,venue,start_date:day(from),end_date:day(to??from),city,price_num:null,src:"https://example.com/"+id,descr:name+" at "+venue});
  const events=[ev("muse","Muse","music","rock","Unipol Dome",3),ev("cafe","Caffè Sospeso Live","music","jazz","Blue Note Milano",5),ev("inter","Inter vs Juventus","sport","football","San Siro",9),ev("olimpia","Olimpia Milano vs Fenerbahce","sport","basketball","Unipol Forum",2),
    ev("dali","Dalí. Rivoluzione e tradizione","art","painting","Palazzo Reale",-10,40),ev("otello","Otello","theatre","opera","Teatro alla Scala",12,20),ev("old","Muse Old Tour","music","rock","Alcatraz",-5),ev("late","Muse Late Show","music","rock","Fabrique",30),
    ...Array.from({length:45},(_,i)=>ev("gig"+i,"Gig Night "+(i+1),"music","indie","Santeria",1+i)),
    ev("mad-rosalia","Rosalía","music","pop","Movistar Arena",4,4,"madrid"),ev("mad-real","Real Madrid vs Sevilla","sport","football","Santiago Bernabéu",6,6,"madrid")];
  let {b}=await open({places:[...M(),...M.madrid()],events});
  const q=()=>pg.locator("#evQ"), found=()=>pg.locator("#evFound details").count(), type=async t=>{ await q().click(); await pg.keyboard.type(t,{delay:25}); await pg.waitForTimeout(250); };
  const clear=async()=>{ await q().fill(""); await pg.waitForTimeout(400); };
  const focused=()=>pg.evaluate(()=>document.activeElement&&document.activeElement.id==="evQ");
  const res=()=>pg.locator("#evFound").innerText();
  await flow("search box on Events",async()=>{ await tab("events"); expect(await q().count()===1,"box is there"); expect(/Search events in Milan/.test(await q().getAttribute("placeholder")),"says the city"); expect(await pg.locator(".evtiles").isVisible(),"tiles still there"); expect(!(await wide()),"no sideways scroll"); });
  await flow("typing a name finds it and keeps the keyboard",async()=>{ await type("muse"); expect(await found()===2,"two upcoming Muse events, got "+await found()); const t=await res(); expect(/Muse\n/.test(t)&&t.indexOf("Muse Late Show")>t.indexOf("Muse"),"soonest first"); expect(!/Old Tour/.test(t),"past event left out"); expect(await focused(),"still typing in the box"); expect(await q().inputValue()==="muse","text kept"); expect(await pg.locator(".evtiles").isHidden(),"tiles hidden"); });
  await flow("accents and capitals don't matter",async()=>{ await clear(); await type("CAFFE sospeso"); expect(/Caffè Sospeso Live/.test(await res()),"found without the accent"); await clear(); await type("dali"); expect(/Dalí/.test(await res()),"an exhibition already running is found"); });
  await flow("search by venue",async()=>{ await clear(); await type("san siro"); expect(await found()===1&&/Inter vs Juventus/.test(await res()),"the match at San Siro"); });
  await flow("search by type",async()=>{ await clear(); await type("football"); expect(/Inter vs Juventus/.test(await res()),"football"); await clear(); await type("opera"); expect(/Otello/.test(await res()),"opera"); await clear(); await type("sport"); expect(await found()===2,"both sport events"); });
  await flow("long lists stop at 40",async()=>{ await clear(); await type("gig"); expect(await found()===40,"40 shown, got "+await found()); expect(/Showing the first 40/.test(await res())&&/45 events/i.test(await res()),"says there are more"); expect(!(await wide()),"no sideways scroll"); });
  await flow("no match says so",async()=>{ await clear(); await type("zzqqxx"); expect(/No events in Milan match/.test(await res()),"message"); });
  await flow("emptying the box brings the page back",async()=>{ await q().click(); for(let i=0;i<6;i++) await pg.keyboard.press("Backspace"); await pg.waitForTimeout(400); expect(await pg.locator(".evtiles").isVisible(),"tiles back"); expect(await focused(),"box still focused"); });
  await flow("the X clears it",async()=>{ await type("muse"); await pg.locator("[data-act=evClear]").click(); await pg.waitForTimeout(400); expect(await q().inputValue()===""&&await pg.locator(".evtiles").isVisible(),"cleared"); expect(await pg.locator("[data-act=evClear]").isHidden(),"X gone"); });
  await flow("open a result and save it, search stays",async()=>{ await type("otello"); const d=pg.locator("#evFound details").first(); await d.locator("summary").click(); await pg.waitForTimeout(200); expect(/Tickets & info/.test(await d.innerText()),"details open"); await d.locator("[data-act=heart]").click(); await pg.waitForTimeout(900);
    expect(await q().inputValue()==="otello"&&await found()===1,"results still there after saving"); expect(/Saved/.test(await pg.locator("#evFound [data-act=heart]").first().innerText()),"saved"); });
  await flow("opening a category clears the search",async()=>{ await pg.locator("[data-act=evClear]").click(); await pg.waitForTimeout(300); await pg.locator(".evtile[data-v=music]").click(); await pg.waitForTimeout(600); expect(await q().count()===0,"no box inside a category"); expect(/Muse/.test(await text()),"music list"); await pg.locator(".back").click(); await pg.waitForTimeout(500); expect(await q().inputValue()==="","box empty"); });
  await flow("leaving the tab clears the search",async()=>{ await type("muse"); await tab("hotspots"); await tab("events"); expect(await q().inputValue()===""&&await pg.locator(".evtiles").isVisible(),"empty again"); });
  await flow("Hotspots search still works alongside",async()=>{ await tab("hotspots"); await pg.locator("#hotQ").click(); await pg.keyboard.type("campar",{delay:25}); await pg.waitForTimeout(250); expect(/Camparino/.test(await pg.locator("#hotFound").innerText()),"places search unaffected"); });
  await flow("Madrid searches Madrid only",async()=>{ await tab("home"); await pg.selectOption(".citypick select","madrid"); await pg.waitForTimeout(900); await tab("events"); expect(/Madrid/.test(await q().getAttribute("placeholder")),"placeholder says Madrid"); await type("rosalia"); expect(/Rosalía/.test(await res()),"Madrid event"); await clear(); await type("muse"); expect(/No events in Madrid match/.test(await res()),"no Milan events"); });
  await b.close();
  for(const [n,r] of out) console.log((r==="ok"?"  ok   ":"  FAIL ")+n+(r==="ok"?"":"  -> "+r));
  console.log(out.filter(x=>x[1]==="ok").length+" of "+out.length+" event search checks passed");
})();
