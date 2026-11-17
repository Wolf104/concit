// A small stand-in for the Concit backend, enough for the app to run every flow.
const fs=require("fs");
module.exports=function makeFake(opts={}){
  const me=opts.uid||"u1"; let anon=!!opts.guest, name=opts.name||"Cris", tourDone=opts.tourDone!==false, email=opts.email||"cris@x.it";
  const P={u1:"Cris",u2:"Luca Bianchi",u3:"Giulia",u4:"Marco"};
  const st={groups:[{id:"g1",name:"Calcetto",code:"k3x9ab2m",members:["u1","u2","u3","u4"],muted:false,last_read:0},{id:"g2",name:"Famiglia",code:"p0o9i8u7",members:["u1","u2"],muted:true,last_read:0}],plans:{},msgs:[],reacts:[],n:1,calls:[],log:[]};
  const t=m=>new Date(Date.now()-m*6e4).toISOString();
  const say=(g,by,body,x={})=>{ const m={id:st.n++,group:g,by,body,at:x.at||new Date().toISOString(),...x}; st.msgs.push(m); return m; };
  say("g1","u2","Ragazzi dinner tonight?",{at:t(90)}); say("g1","u1","yes I'm in",{at:t(80),reply:1}); say("g1","u3","Photo",{at:t(60),img:true}); say("g1","u4","check https://example.com/menu and https://www.concit.app/?plan=abcdefgh12345678",{at:t(30)}); say("g2","u2","ciao",{at:t(4000)});
  const png="data:image/jpeg;base64,"+fs.readFileSync(__dirname+"/ph.jpg").toString("base64");
  const user=()=>({id:me,is_anonymous:anon,email:anon?"":email,created_at:opts.created||"2026-01-01T00:00:00Z",user_metadata:{name,...(tourDone?{tour_done:true}:{})}});
  const sess=()=>({access_token:"tok",refresh_token:"r",expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:user()});
  const others=p=>p.people.filter(x=>x!==me&&!p.out.includes(x));
  const planOut=(c)=>{ const p=st.plans[c]; if(!p) return null; const g=st.groups.find(x=>x.id===p.group); return {...p.data,people:p.people,out:p.out,left:p.left,v:2,votes:p.votes,names:Object.fromEntries(p.people.concat(p.left).map(x=>[x,x===me?name:P[x]||"Someone"])),group_id:p.group||null,group_name:g?g.name:null,mine:p.by===me}; };
  const doneCount=p=>p.people.filter(x=>!p.out.includes(x)&&Object.keys(p.votes[x]||{}).length>=p.data.options.length).length;
  const rpc={
    my_boards:()=>{ if(opts.noBoards) throw 404; return (st.boards=st.boards||[]).filter(b=>b.owner===me).map(({owner,...b})=>b); },
    save_board:a=>{ if(opts.noBoards) throw 404; st.boards=st.boards||[]; const b=st.boards.find(x=>x.id===a.p_id); if(b&&b.owner!==me) throw 400;
      if(b){ b.name=a.p_name; b.items=a.p_items; } else st.boards.unshift({id:a.p_id,owner:me,name:a.p_name,items:a.p_items}); return null; },
    delete_board:a=>{ st.boards=(st.boards||[]).filter(b=>!(b.id===a.p_id&&b.owner===me)); return null; },
    get_board:a=>{ const b=(st.boards||[]).find(x=>x.id===a.p_id); return b?{id:b.id,name:b.name,items:b.items,owner:b.owner===me?"Tester":"Giulia",mine:b.owner===me}:null; },
    my_groups:()=>st.groups.filter(g=>g.members.includes(me)).map(g=>{ const ms=st.msgs.filter(m=>m.group===g.id), last=ms[ms.length-1];
      return {id:g.id,name:g.name,invite_code:g.code,muted:g.muted,av:null,members:g.members.map(x=>({id:x,name:x===me?name:P[x],online:x!==me&&x==="u2",av:null})),unread:ms.filter(m=>m.id>g.last_read&&m.by!==me).length,
        last:last?{name:last.by===me?name:P[last.by],body:last.body.slice(0,80),mine:last.by===me,at:last.at,kind:last.kind||null}:null,
        plans:Object.entries(st.plans).filter(([,p])=>p.group===g.id&&!p.left.includes(me)).map(([code,p])=>({code,what:p.data.what,day:p.data.day,time:p.data.time||null,cuisine:p.data.cuisine||null,finished:!!p.data.finished,by:p.by===me?name:P[p.by],made:p.by===me,people:p.people.length-p.out.length,options:p.data.options.length,in_plan:p.people.includes(me),me_out:p.out.includes(me),mine:Object.keys(p.votes[me]||{}).length,done:doneCount(p)}))}; }),
    create_plan:a=>{ if(anon) throw 1; const code=[...Array(16)].map(()=>"0123456789abcdef"[Math.random()*16|0]).join(""), g=st.groups.find(x=>x.id===a.p_group);
      st.plans[code]={data:{...a.p_data},group:a.p_group||null,by:me,people:g?[...g.members]:[me],out:[],left:[],votes:{}}; if(g) say(g.id,me,"Started a plan: Food",{kind:"plan",plan:code}); return code; },
    join_plan:a=>{ const p=st.plans[a.p_code]; if(p&&!p.group&&!p.people.includes(me)&&!p.left.includes(me)) p.people.push(me); return null; },
    get_plan:a=>{ const p=st.plans[a.p_code]; if(!p||(!p.people.includes(me)&&!p.left.includes(me))) return null;
      // the other people vote as time passes
      if(opts.othersVote!==false) for(const o of others(p)){ const left=p.data.options.filter(x=>(p.votes[o]||{})[x]===undefined); if(left.length&&Math.random()<.5) (p.votes[o]=p.votes[o]||{})[left[0]]=Math.random()<.6?1:0; }
      return planOut(a.p_code); },
    cast_vote:a=>{ const p=st.plans[a.p_code]; if(!p) throw 1; (p.votes[me]=p.votes[me]||{})[a.p_place]=a.p_value; return null; },
    undo_vote:a=>{ const p=st.plans[a.p_code]; if(p&&p.votes[me]) delete p.votes[me][a.p_place]; return null; },
    set_attending:a=>{ const p=st.plans[a.p_code]; if(!p) throw 1; p.out=p.out.filter(x=>x!==me); if(!a.p_going){ p.out.push(me); delete p.votes[me]; } return null; },
    update_plan:a=>{ const p=st.plans[a.p_code]; if(!p) throw 1; const d={...a.p_data}; for(const k of ["votes","names","group_id","group_name","out","left","mine","people"]) delete d[k]; p.data=d; if(a.p_reset_votes) p.votes={}; return null; },
    leave_plan:a=>{ const p=st.plans[a.p_code]; if(p){ p.people=p.people.filter(x=>x!==me); p.left.push(me); delete p.votes[me]; } return null; },
    rejoin_plan:a=>{ const p=st.plans[a.p_code]; if(p){ p.left=p.left.filter(x=>x!==me); if(!p.people.includes(me)) p.people.push(me); } return null; },
    delete_plan:a=>{ delete st.plans[a.p_code]; return null; },
    create_group:a=>{ if(anon) throw 1; const id="g"+(st.groups.length+1)+Date.now()%1000; st.groups.push({id,name:a.p_name,code:"c"+id,members:[me],muted:false,last_read:0}); return id; },
    join_group:a=>{ const g=st.groups.find(x=>x.code===String(a.p_code).trim().toLowerCase()); if(!g) return null; if(!g.members.includes(me)) g.members.push(me); return {id:g.id,name:g.name}; },
    leave_group:a=>{ const g=st.groups.find(x=>x.id===a.p_group); if(g) g.members=g.members.filter(x=>x!==me); return null; },
    rename_group:a=>{ const g=st.groups.find(x=>x.id===a.p_group); if(g) g.name=a.p_name; return null; },
    set_group_muted:a=>{ const g=st.groups.find(x=>x.id===a.p_group); if(g) g.muted=!!a.p_muted; return null; },
    chat_poll:a=>{ const g=st.groups.find(x=>x.id===a.p_group); if(!g||!g.members.includes(me)) return null; const ms=st.msgs.filter(m=>m.group===g.id); g.last_read=Math.max(0,...ms.map(m=>m.id));
      return {messages:ms.filter(m=>m.id>(a.p_after||0)).map(m=>({id:m.id,body:m.body,at:m.at,by:m.by,name:m.by===me?name:P[m.by],kind:m.kind||null,plan:m.plan||null,reply:m.reply||null,img:!!m.img})),
        people:g.members.filter(x=>x!==me).map(x=>({id:x,name:P[x],online:x==="u2",typing:false,read:x==="u2"?g.last_read:0,av:null})),reacts:st.reacts.filter(r=>ms.some(m=>m.id===r[0]))}; },
    send_message:a=>{ const g=st.groups.find(x=>x.id===a.p_group); if(!g||!g.members.includes(me)) throw 1; const m=say(g.id,me,a.p_body||"Photo",{reply:a.p_reply||null,img:!!a.p_image}); return {id:m.id,body:m.body,at:m.at,by:me,name,reply:m.reply,img:m.img}; },
    react:a=>{ const i=st.reacts.findIndex(r=>r[0]===a.p_msg&&r[2]===me); const same=i>=0&&st.reacts[i][1]===a.p_emoji; if(i>=0) st.reacts.splice(i,1); if(!same) st.reacts.push([a.p_msg,a.p_emoji,me]); return null; },
    get_message_image:()=>png, set_typing:()=>null, heartbeat:()=>null, track:()=>null, is_admin:()=>!!opts.admin,
    admin_stats:a=>({days:a.p_days||14,totals:{people:23,guests:4,groups:6,plans:41,decided:27,votes:512,messages:1204},period:{active:17,new_people:9,plans:22,decided:14,messages:380,book_taps:11,book_plans:8,directions:19,shares:12,guest_joins:4,guest_upgrades:1,push_on:7},daily:[...Array(a.p_days||14)].map((_,i)=>({day:new Date(Date.now()-((a.p_days||14)-1-i)*864e5).toISOString().slice(0,10),active:3+i%5,plans:i%3,books:i%2})),top_places:[{name:"Dry Milano",taps:4,people:3}],tabs:[{tab:"home",views:60,people:17}]}),
    set_name:a=>{ name=a.p_name; return null; }, my_avatar:()=>null, get_avatars:()=>[], get_group_avatars:()=>[], get_avatar_large:()=>null, get_group_avatar_large:()=>null, set_avatar:()=>Date.now(), set_group_avatar:()=>Date.now(),
    push_subscribe:()=>null, push_unsubscribe:()=>null, delete_account:()=>null,
  };
  async function handle(r){
    const req=r.request(), u=req.url(), body=req.postData()||"";
    if(u.includes("challenges.cloudflare.com")||u.includes("/api/push")) return u.includes("/api/push")?r.fulfill({json:{ok:true,sent:0}}):r.abort();
    if(u.includes("/auth/v1/")){ const p=u.split("/auth/v1/")[1].split("?")[0]; let j={}; try{ j=JSON.parse(body||"{}"); }catch{}
      if(p==="signup"){ if(!j.email){ anon=true; name=j.data?.name||"Guest"; } else { anon=false; name=j.data?.name||name; email=j.email; tourDone=false; opts.created=new Date().toISOString(); } return r.fulfill({json:sess()}); }
      if(p==="token"){ if(u.includes("grant_type=password")&&j.password==="wrongwrong") return r.fulfill({status:400,json:{msg:"Invalid login credentials"}}); return r.fulfill({json:sess()}); }
      if(p==="user"){ if(j.email){ email=j.email; anon=false; } if(j.data){ if(j.data.name) name=j.data.name; if(j.data.tour_done) tourDone=true; } return r.fulfill({json:user()}); }
      return r.fulfill({json:{}}); }
    if(u.includes("/rest/v1/rpc/")){ const fn=u.split("/rpc/")[1].split("?")[0]; let a={}; try{ a=JSON.parse(body||"{}"); }catch{}
      st.calls.push(fn); if(!rpc[fn]){ st.log.push("UNKNOWN RPC "+fn); return r.fulfill({status:404,json:{message:"no function"}}); }
      try{ return r.fulfill({json:rpc[fn](a)}); }catch(e){ st.log.push("RPC FAILED "+fn+" "+(e&&e.message||"")); return r.fulfill({status:400,json:{message:"refused"}}); } }
    if(u.includes("/rest/v1/places")||u.includes("/rest/v1/events")){
      const rows=(u.includes("/rest/v1/places")?opts.places:opts.events)||[], m=u.match(/[?&]city=(eq|neq)\.(\w+)/);
      if(!m) return r.fulfill({json:opts.noCity?rows.map(({city,...x})=>x):rows});
      if(opts.noCity) return r.fulfill({status:400,json:{message:"column city does not exist"}});
      return r.fulfill({json:rows.filter(x=>((x.city||"milan")===m[2])===(m[1]==="eq"))}); }
    if(u.includes("supabase.co")) return r.fulfill({json:[]});
    if(u.startsWith("http://localhost")) return r.continue();
    return r.abort();
  }
  return {handle,st,sess,setAnon:v=>{anon=v}};
};
