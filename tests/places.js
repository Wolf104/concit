const fs=require("fs"); const dataJs=fs.readFileSync(require("path").join(__dirname,"..","data.js"),"utf8");
function testPlaces(){ const base=new Function(dataJs+";return PLACES")(); const kinds=["eat","cheap","cafe","drink","wine","beer","club","culture"], zones=["bicocca","bovisa","brera","centrale","cittastudi","duomo","forlanini","garibaldi","isola","lambrate","lodi","navigli","nolo","romana","sansiro","santagiulia","sarpi","sempione","tortona","venezia"];
  const hrs=["1200-1500,1900-2330|=|=|=|=|=|C","C|1800-0200|=|=|=|=|=","0700-1900|=|=|=|=|0800-2000|=","2300-0500|=|=|=|2000-0500|=|C","0000-2359|=|=|=|=|=|=",null,"C|C|C|C|2300-0400|=|C","1000-1930|=|=|=|=|=|="];
  const occ={eat:["dinner","lunch"],cheap:["cheap","lunch"],cafe:["coffee"],drink:["drinks","night"],wine:["drinks"],beer:["drinks"],club:["night"],culture:["culture"]}, cui=["asian","fine","meat","milanese","pasta","pizza","seafood","street","sushi","veggie","world"];
  const out=[]; for(let i=0;i<160;i++){ const b=base[i%base.length], k=kinds[i%8];
    out.push({id:"p:t"+i,name:(i%9===0?"A very long place name that goes on and on Trattoria Osteria ":"")+b.name+" "+i,kind:k,zone:zones[i%20],addr:b.addr,metro:i%4?b.metro:[],price:1+i%4,hot:1+i%3,why:b.why,detail:i%5?b.detail:"",src:"https://example.com/src",closed:i%6?[]:[0],occ:occ[k],cuisine:k==="eat"||k==="cheap"?[cui[i%11],cui[(i+3)%11]].slice(0,1+i%2):[],
      lat:i%31?45.44+((i*37)%100)/1000:null,lng:i%31?9.15+((i*53)%100)/1000:null,hours:hrs[i%8],stars:i%17?Math.round((3.5+(i%15)/10)*10)/10:null,reviews:i%17?(i*137)%5000:null,
      web:i%4===0?null:i%7===0?"https://www.instagram.com/place"+i:"https://example.com/p"+i,costs:k==="club"?(i%2?{}:{entry:20}):k==="culture"?{entry:i%3?12:0}:k==="cafe"?{coffee:3}:k==="eat"||k==="cheap"?{meal:12+i%40}:{drink:8+i%10}}); }
  return out; }
/* The same shapes moved to Madrid, for the two-city tests. */
function madridPlaces(){ const z=["sol","malasana","chueca","latina","lavapies","letras","chamberi","salamanca"];
  return testPlaces().slice(0,96).map((p,i)=>({...p,id:"p:mad-t"+i,name:"Madrid place "+i,why:"A test place in Madrid",detail:"Open every day.",addr:"Calle de Prueba "+i,zone:z[i%z.length],city:"madrid",metro:i%4?[["L"+(1+i%12),"Sol"]]:[],
    lat:p.lat==null?null:40.40+((i*37)%60)/1000,lng:p.lng==null?null:-3.72+((i*53)%60)/1000,cuisine:(p.cuisine||[]).map(c=>c==="milanese"?"spanish":c)})); }
const madridEvents=()=>[0,1,2,3,4,5].map(i=>({id:"e:mad-t"+i,name:"Madrid test event "+i,cat:["music","sport","art","theatre","festival","music"][i],start_date:new Date(Date.now()+i*3*864e5).toISOString().slice(0,10),end_date:new Date(Date.now()+(i*3+(i===2?40:0))*864e5).toISOString().slice(0,10),
  venue:"Movistar Arena",zone:"goya",time:i%2?"21:00":"",price_num:i%3?25:null,price_text:i%3?"From €25":"",sold:false,src:"https://example.com/e"+i,checked:"2026-11-16",type:"",descr:"A test event",wiki:"",city:"madrid"}));
module.exports=testPlaces; module.exports.madrid=madridPlaces; module.exports.madridEvents=madridEvents;
