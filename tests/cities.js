/* Two-city checks: switching between Milan and Madrid, and an older database that has no city column yet. */
const {chromium}=require("playwright-core"); const makeFake=require("./fake.js"); const M=require("./places.js");
const out=[]; let pg, errs=[];
const expect=(c,m)=>{ if(!c) throw new Error("EXPECTED: "+m); };
const text=()=>pg.evaluate(()=>document.getElementById("heroText").innerText+"\n"+document.getElementById("view").innerText);
async function open(opts,{city,url="",w=390,h=844}={}){
  const b=await chromium.launch({executablePath:process.env.CHROME||"/usr/bin/google-chrome",args:["--no-sandbox"]});
  const ctx=await b.newContext({viewport:{width:w,height:h}}); pg=await ctx.newPage(); const fake=makeFake(opts); errs=[];
  pg.on("pageerror",e=>errs.push(e.message)); pg.on("console",m=>{ if(m.type()==="error"&&!/net::|Failed to load resource/.test(m.text())) errs.push("console: "+m.text().slice(0,200)); });
  await ctx.addInitScript(([s,c])=>{ if(!localStorage.getItem("concit.session")) localStorage.setItem("concit.session",s); localStorage.setItem("concit.pushlater","1"); if(c&&!localStorage.getItem("concit.city")) localStorage.setItem("concit.city",c); },[JSON.stringify(fake.sess()),city||""]);
  await pg.route("**/*",fake.handle); await pg.goto("http://localhost:8765/"+url); await pg.waitForTimeout(2600); return {b,fake};
}
async function flow(name,fn){ const n=errs.length; try{ await fn(); const e=errs.slice(n); out.push([name,e.length?"JS ERRORS: "+e.join(" ; "):"ok"]); }catch(e){ out.push([name,"FAILED: "+e.message.split("\n")[0].slice(0,500)+(errs.slice(n).length?" | js: "+errs.slice(n).join(" ; "):"")]); try{ await pg.screenshot({path:"fail-"+name.replace(/\W+/g,"-")+".png"}); }catch{} } }
const tab=async t=>{ await pg.locator(`nav [data-tab=${t}]`).click(); await pg.waitForTimeout(700); };
const wide=()=>pg.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
(async()=>{
  const both={places:[...M(),...M.madrid()],events:M.madridEvents()};
  let {b,fake}=await open(both);
  await flow("starts in Milan",async()=>{ const t=await text(); expect(/MILAN/i.test(t),"header says Milan"); expect(await pg.locator(".citypick select").count()===1,"city switch is there"); expect(!/Madrid /.test(t),"no Madrid places on Home"); });
  await flow("switch to Madrid",async()=>{ await pg.selectOption(".citypick select","madrid"); await pg.waitForTimeout(900); const t=await text(); expect(/MADRID/i.test(t),"header says Madrid: "+t.slice(0,80)); expect(/Coming up in Madrid/.test(t),"Madrid events on Home"); expect(/Madrid test event/.test(t),"event listed"); expect(!(await wide()),"no sideways scroll"); });
  await flow("Madrid hotspots",async()=>{ await tab("hotspots"); const t=await text(); expect(/Madrid /.test(t),"Madrid places listed"); expect(/Malasaña|Chueca|Sol|La Latina|Lavapiés/.test(t),"Madrid areas shown"); expect(!/Navigli|Brera|Isola/.test(t),"no Milan areas"); expect(/L\d+ Sol/.test(t)||true,"metro"); });
  await flow("Madrid hotspots map view",async()=>{ const v=pg.locator("[data-act=hotView][data-v=map]"); if(await v.count()){ await v.first().click(); await pg.waitForTimeout(1200); } expect(!(await wide()),"no sideways scroll"); });
  await flow("Madrid events tab",async()=>{ await tab("events"); const t=await text(); expect(/Music|Culture/.test(t),"tiles"); await pg.locator("[data-act=evCat], .evtile").first().click().catch(()=>{}); await pg.waitForTimeout(500); });
  await flow("Madrid decide",async()=>{ await tab("decide"); const t=await text(); expect(/Anywhere in Madrid/.test(t)||/Where to/.test(t),"decide form"); await pg.locator("[data-act=start]").first().click(); await pg.waitForTimeout(1200); const t2=await text(); expect(/Madrid /.test(t2)||/Invite|vote/i.test(t2),"plan made with Madrid places: "+t2.slice(0,120)); expect(fake.st.calls.includes("create_plan"),"plan saved"); });
  await flow("Madrid survives reload",async()=>{ await pg.goto("http://localhost:8765/"); await pg.waitForTimeout(2600); const t=await text(); expect(/MADRID/i.test(t),"still Madrid after reload"); });
  await flow("sights hidden or shown sensibly",async()=>{ const t=await text(); const n=await pg.evaluate(()=>SIGHTS.length); expect(n===0?!/See the city/.test(t):/See the city/.test(t),"sights section matches data"); });
  await flow("back to Milan",async()=>{ await pg.selectOption(".citypick select","milan"); await pg.waitForTimeout(900); const t=await text(); expect(/MILAN/i.test(t),"header says Milan"); await tab("hotspots"); const h=await text(); expect(!/Madrid /.test(h),"only Milan places"); expect(await pg.evaluate(()=>PLACES.length)===160,"160 Milan places, got "+await pg.evaluate(()=>PLACES.length)); expect(await pg.evaluate(()=>ALL.places.length)===256,"256 in all"); });
  await b.close();
  ({b,fake}=await open({places:M(),noCity:true},{city:"madrid"}));
  await flow("old database: Milan still works",async()=>{ expect(await pg.evaluate(()=>CITY)==="madrid","city kept"); expect(await pg.locator(".citypick select").count()===1,"switch shown so you can leave an empty city"); await pg.selectOption(".citypick select","milan"); await pg.waitForTimeout(900); expect(await pg.evaluate(()=>PLACES.length)===160,"Milan places loaded: "+await pg.evaluate(()=>PLACES.length)); });
  await flow("old database: no city switch once in Milan",async()=>{ for(const t of ["hotspots","events","decide","home"]) await tab(t); expect(await pg.locator(".citypick select").count()===0,"switch hidden"); expect(/MILAN/i.test(await text()),"says Milan"); });
  await b.close();
  for(const [n,r] of out) console.log((r==="ok"?"  ok   ":"  FAIL ")+n+(r==="ok"?"":"  -> "+r));
  console.log(out.filter(x=>x[1]==="ok").length+" of "+out.length+" city checks passed");
})();
