#!/usr/bin/env node
/* Looks up each Madrid place's website from Google (Places API, Place Details, field "websiteUri").
   Usage, from the repository folder:
     GOOGLE_MAPS_KEY=your-key node tools/websites.js [how many, default 1000] [start at, default 0]
   Reads supabase/seed/madrid_place_ids.tsv (Concit id, Google place id; most-reviewed first) and adds lines to
   madrid_websites_google.tsv (Concit id, website). Places already in that file are skipped, so it can be run again
   to carry on. Google gives 1,000 of these lookups free each calendar month and charges about $20 per 1,000 after
   that, so the default of 1,000 stays inside the free allowance if nothing else has used it this month. */
const fs=require("fs"), path=require("path");
const key=process.env.GOOGLE_MAPS_KEY, max=+(process.argv[2]||1000), from=+(process.argv[3]||0);
if(!key){ console.error("Set GOOGLE_MAPS_KEY first."); process.exit(1); }
const root=path.join(__dirname,".."), out=path.join(root,"madrid_websites_google.tsv");
const all=fs.readFileSync(path.join(root,"supabase/seed/madrid_place_ids.tsv"),"utf8").trim().split("\n").map(l=>l.split("\t"));
const seen=new Set(fs.existsSync(out)?fs.readFileSync(out,"utf8").split("\n").map(l=>l.split("\t")[0]):[]);
const todo=all.slice(from).filter(([id])=>!seen.has(id)).slice(0,max);
(async()=>{
  let found=0, none=0, failed=0;
  console.log(`Looking up ${todo.length} places (${seen.size} already done)...`);
  for(const [id,gid] of todo){
    try{
      const r=await fetch("https://places.googleapis.com/v1/places/"+encodeURIComponent(gid),{headers:{"X-Goog-Api-Key":key,"X-Goog-FieldMask":"websiteUri"}});
      if(r.status===403||r.status===401||r.status===429){ console.error(`Google refused (${r.status}): ${(await r.text()).slice(0,300)}`); break; }
      if(!r.ok){ failed++; continue; }
      const web=((await r.json()).websiteUri||"").trim();
      fs.appendFileSync(out,id+"\t"+web+"\n");
      web?found++:none++;
    }catch(e){ failed++; }
    if((found+none+failed)%100===0) console.log(`  ${found+none+failed} done`);
    await new Promise(z=>setTimeout(z,60));
  }
  console.log(`Finished: ${found} with a website, ${none} without, ${failed} failed. Saved to madrid_websites_google.tsv`);
})();
