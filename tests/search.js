/* Hotspots search: find a place by name, area, food or street, without losing the keyboard. */
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
  const data={places:[...M(),...M.madrid()],events:[]};
  let {b}=await open(data);
  const q=()=>pg.locator("#hotQ"), found=()=>pg.locator("#hotFound details").count(), type=async t=>{ await q().click(); await pg.keyboard.type(t,{delay:25}); await pg.waitForTimeout(250); };
  const clear=async()=>{ await q().fill(""); await pg.waitForTimeout(400); };
  const focused=()=>pg.evaluate(()=>document.activeElement&&document.activeElement.id==="hotQ");
  await flow("search box on Hotspots",async()=>{ await tab("hotspots"); expect(await q().count()===1,"box is there"); expect(/Search places in Milan/.test(await q().getAttribute("placeholder")),"says the city"); expect(!(await wide()),"no sideways scroll"); });
  await flow("typing a name finds it and keeps the keyboard",async()=>{ await type("campar"); expect(await found()>=1,"results shown"); expect(/Camparino/.test(await pg.locator("#hotFound details").first().innerText()),"Camparino first"); expect(await focused(),"still typing in the box"); expect(await q().inputValue()==="campar","text kept");
    expect(await pg.locator("#hotNormal").isHidden(),"normal list hidden"); expect(await pg.locator(".hottypes").isHidden(),"chips hidden"); });
  await flow("accents and capitals don't matter",async()=>{ await clear(); await type("MAG CAFE"); expect(/Mag Cafè/.test(await pg.locator("#hotFound").innerText()),"Mag Cafè found without the accent"); });
  await flow("search by area",async()=>{ await clear(); await type("brera"); const t=await pg.locator("#hotFound").innerText(); expect(await found()>=1&&/Brera/i.test(t),"places in Brera"); });
  await flow("search by food and by street",async()=>{ await clear(); await type("sushi"); const n=await found(); expect(n>=1,"sushi places"); await clear(); await type("porta ticinese 43"); expect(await found()>=1,"by street"); });
  await flow("ignores the type chip",async()=>{ await clear(); await pg.locator(".hottypes [data-v=club]").click(); await pg.waitForTimeout(400); await type("campar"); expect(/Camparino/.test(await pg.locator("#hotFound").innerText()),"a bar is found while Clubs is picked"); });
  await flow("no match says so",async()=>{ await clear(); await type("zzqqxx"); expect(/No places in Milan match/.test(await pg.locator("#hotFound").innerText()),"message"); });
  await flow("emptying the box brings the page back",async()=>{ await q().click(); for(let i=0;i<6;i++) await pg.keyboard.press("Backspace"); await pg.waitForTimeout(400); expect(await pg.locator(".hottypes").isVisible(),"chips back"); expect(await pg.locator("#hotNormal details").count()>3,"list back"); expect(await focused(),"box still focused"); expect(await pg.locator(".hottypes [data-v=club]").getAttribute("aria-pressed")==="true","Clubs still picked"); });
  await flow("the X clears it",async()=>{ await type("duomo"); await pg.locator("[data-act=hotClear]").click(); await pg.waitForTimeout(400); expect(await q().inputValue()===""&&await pg.locator(".hottypes").isVisible(),"cleared"); expect(await pg.locator("[data-act=hotClear]").isHidden(),"X gone"); });
  await flow("open a result and save it, search stays",async()=>{ await type("campar"); const d=pg.locator("#hotFound details").first(); await d.locator("summary").click(); await pg.waitForTimeout(200); await d.locator("[data-act=heart]").click(); await pg.waitForTimeout(900);
    expect(await q().inputValue()==="campar"&&await found()>=1,"results still there after saving"); expect(/Saved/.test(await pg.locator("#hotFound [data-act=heart]").first().innerText()),"saved"); });
  await flow("map view: search then clear brings the map back",async()=>{ await pg.locator("[data-act=hotClear]").click(); await pg.waitForTimeout(300); await pg.locator("[data-act=hotView][data-v=map]").click(); await pg.waitForTimeout(900); await type("mag"); expect(await found()>=1,"results over the map"); await clear(); expect(await pg.locator("#mapSlot, .mapwrap").count()>=1,"map is back"); });
  await flow("leaving the tab clears the search",async()=>{ await type("mag"); await tab("events"); await tab("hotspots"); expect(await q().inputValue()==="","empty again"); });
  await flow("Madrid searches Madrid only",async()=>{ await tab("home"); await pg.selectOption(".citypick select","madrid"); await pg.waitForTimeout(900); await tab("hotspots"); expect(/Madrid/.test(await q().getAttribute("placeholder")),"placeholder says Madrid"); await type("madrid place 1"); expect(await found()>=1,"Madrid places"); await clear(); await type("campar"); expect(/No places in Madrid match/.test(await pg.locator("#hotFound").innerText()),"no Milan places"); });
  await b.close();
  for(const [n,r] of out) console.log((r==="ok"?"  ok   ":"  FAIL ")+n+(r==="ok"?"":"  -> "+r));
  console.log(out.filter(x=>x[1]==="ok").length+" of "+out.length+" search checks passed");
})();
