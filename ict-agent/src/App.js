import { useState, useEffect, useRef, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════
//  CONFIG — edit WORKER_URL if you redeploy your Cloudflare Worker
// ═══════════════════════════════════════════════════════════════
const WORKER_URL = "https://ict-data-proxy.suketu29.workers.dev";
const IST_OFFSET = 5.5 * 60 * 60 * 1000;

function nowIST() { return new Date(Date.now() + IST_OFFSET); }
function istTimeStr(d) {
  return `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}:${String(d.getUTCSeconds()).padStart(2,"0")} IST`;
}
function istHHMM(d) {
  return `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`;
}
function timeToMins(str) { const [h,m]=str.split(":").map(Number); return h*60+m; }
function isInWindow(istDate, start, end) {
  const cur=istDate.getUTCHours()*60+istDate.getUTCMinutes();
  const st=timeToMins(start), et=timeToMins(end);
  return et>st ? (cur>=st&&cur<et) : (cur>=st||cur<et);
}
function windowPct(istDate, start, end) {
  const cur=istDate.getUTCHours()*60+istDate.getUTCMinutes();
  const st=timeToMins(start), et=timeToMins(end);
  if(et<=st)return 0;
  return Math.min(100,Math.max(0,Math.round(((cur-st)/(et-st))*100)));
}

// ── DST-aware session times ──────────────────────────────────
function getSessionTimes() {
  const now=new Date(), month=now.getMonth()+1, day=now.getDate();
  const ukBST=(month>3)||(month===3&&day>=29)||(month<10)||(month===10&&day<25);
  const usEDT=(month>3)||(month===3&&day>=8)||(month<11)||(month===11&&day<1);
  if(!ukBST&&usEDT)  return { london:{s:"13:30",e:"18:30"}, ny:{s:"18:30",e:"00:30"}, overlap:{s:"18:30",e:"21:30"}, asian:{s:"02:30",e:"06:30"}, sb1:{s:"14:00",e:"15:00"}, sb2:{s:"20:00",e:"21:00"}, sb3:{s:"00:00",e:"01:00"}, note:"UK GMT + US EDT" };
  if(ukBST&&usEDT)   return { london:{s:"12:30",e:"17:30"}, ny:{s:"18:30",e:"00:30"}, overlap:{s:"18:30",e:"21:30"}, asian:{s:"02:30",e:"06:30"}, sb1:{s:"13:00",e:"14:00"}, sb2:{s:"20:00",e:"21:00"}, sb3:{s:"00:00",e:"01:00"}, note:"UK BST + US EDT" };
  if(!ukBST&&!usEDT) return { london:{s:"13:30",e:"18:30"}, ny:{s:"19:30",e:"01:30"}, overlap:{s:"19:30",e:"22:30"}, asian:{s:"02:30",e:"06:30"}, sb1:{s:"14:00",e:"15:00"}, sb2:{s:"21:00",e:"22:00"}, sb3:{s:"01:00",e:"02:00"}, note:"UK GMT + US EST" };
  return                { london:{s:"12:30",e:"17:30"}, ny:{s:"19:30",e:"01:30"}, overlap:{s:"19:30",e:"22:30"}, asian:{s:"02:30",e:"06:30"}, sb1:{s:"13:00",e:"14:00"}, sb2:{s:"21:00",e:"22:00"}, sb3:{s:"01:00",e:"02:00"}, note:"UK BST + US EST" };
}

// ═══════════════════════════════════════════════════════════════
//  API CALLS via Cloudflare Worker (no CORS issues here!)
// ═══════════════════════════════════════════════════════════════
async function wFetch(params) {
  try {
    const res = await fetch(`${WORKER_URL}?${new URLSearchParams(params)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { data: await res.json(), error: null };
  } catch(e) { return { data:null, error:e.message }; }
}
async function fetchPrice(sym, key) {
  const {data,error}=await wFetch({symbol:sym,type:"price",apikey:key});
  if(error||!data?.price) return {price:null,error:error||data?.message||"no price"};
  const p=parseFloat(data.price); return {price:isNaN(p)?null:p,error:null};
}
async function fetchCandles(sym, interval, key, outputsize=150) {
  const {data,error}=await wFetch({symbol:sym,interval,outputsize,type:"candles",apikey:key});
  if(error||data?.status==="error"||!data?.values?.length) return {candles:null,error:error||data?.message};
  return {candles:data.values.map(v=>({t:new Date(v.datetime).getTime(),o:parseFloat(v.open),h:parseFloat(v.high),l:parseFloat(v.low),c:parseFloat(v.close),v:parseFloat(v.volume)||0})),error:null};
}
async function testConn(key) {
  const {price,error}=await fetchPrice("XAU/USD",key);
  return price ? {ok:true,msg:`✅ Connected! Gold: $${price.toFixed(2)}`} : {ok:false,msg:`❌ ${error}`};
}

// ═══════════════════════════════════════════════════════════════
//  SYMBOLS & TIMEFRAMES
// ═══════════════════════════════════════════════════════════════
const SYMBOLS = {
  XAUUSD:{label:"Gold",     icon:"🥇",color:"#F5C842",td:"XAU/USD",fallback:3020,vol:0.0018},
  XAGUSD:{label:"Silver",   icon:"🥈",color:"#C0C0C0",td:"XAG/USD",fallback:33.5,vol:0.003},
  USOIL: {label:"Crude Oil",icon:"🛢️",color:"#FF6B35",td:"WTI/USD",fallback:71.2,vol:0.003},
  NATGAS:{label:"Nat Gas",  icon:"🔥",color:"#4FC3F7",td:"XNG/USD",fallback:2.18,vol:0.006},
};
const TF_TD={"1m":"1min","5m":"5min","15m":"15min","30m":"30min","1H":"1h","2H":"2h","4H":"4h","1D":"1day","1W":"1week"};
const ALL_TF=Object.keys(TF_TD);
const DEFAULT_TFS={htf:"1D",bias:"4H",entry:"1H",execution:"15m"};
const ROLE_COLORS={htf:"#a855f7",bias:"#3b82f6",entry:"#F5C842",execution:"#22c55e"};
const tfMins=tf=>({"1m":1,"5m":5,"15m":15,"30m":30,"1H":60,"2H":120,"4H":240,"1D":1440,"1W":10080}[tf]||15);

// ═══════════════════════════════════════════════════════════════
//  STORAGE
// ═══════════════════════════════════════════════════════════════
const SK={brain:"ict_v9_brain",key:"ict_v9_key",cache:"ict_v9_cache"};
const ls={
  get:k=>{try{const r=localStorage.getItem(k);return r?JSON.parse(r):null;}catch{}return null;},
  set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}},
  getKey:()=>{try{return localStorage.getItem(SK.key)||"";}catch{}return ""},
  setKey:k=>{try{localStorage.setItem(SK.key,k);}catch{}},
};

// ═══════════════════════════════════════════════════════════════
//  ADAPTIVE BRAIN
// ═══════════════════════════════════════════════════════════════
const DW={
  htfBias:      {weight:20,wins:0,losses:0,label:"HTF MA Bias"},
  premDisc:     {weight:15,wins:0,losses:0,label:"Premium/Discount"},
  ote:          {weight:20,wins:0,losses:0,label:"OTE 62–79%"},
  bullOB:       {weight:25,wins:0,losses:0,label:"Bullish Order Block"},
  bearOB:       {weight:25,wins:0,losses:0,label:"Bearish Order Block"},
  bullFVG:      {weight:18,wins:0,losses:0,label:"Bullish FVG"},
  bearFVG:      {weight:18,wins:0,losses:0,label:"Bearish FVG"},
  liqSweep:     {weight:22,wins:0,losses:0,label:"Liquidity Sweep"},
  bosBull:      {weight:15,wins:0,losses:0,label:"Bullish BOS"},
  bosBear:      {weight:15,wins:0,losses:0,label:"Bearish BOS"},
  chochBull:    {weight:18,wins:0,losses:0,label:"CHoCH Bullish"},
  chochBear:    {weight:18,wins:0,losses:0,label:"CHoCH Bearish"},
  displacement: {weight:12,wins:0,losses:0,label:"Displacement"},
  asianBreak:   {weight:10,wins:0,losses:0,label:"Asian Range Break"},
};
const DT={minConfidence:62,minRR:1.5,slMult:1.8,tp1Mult:2.0,tp2Mult:3.5};
function freshBrain(){return{weights:JSON.parse(JSON.stringify(DW)),thresholds:{...DT},kzPerf:Object.fromEntries(Object.keys(SYMBOLS).map(k=>[k,{asian:{w:0,l:0},london:{w:0,l:0},overlap:{w:0,l:0},ny:{w:0,l:0}}])),generations:0,totalTrades:0,overallWinRate:0,learningLog:[],bestATR:{sl:1.8,tp1:2.0,tp2:3.5}};}

// ═══════════════════════════════════════════════════════════════
//  FALLBACK CANDLES
// ═══════════════════════════════════════════════════════════════
function genCandles(base,mins,count=150,vol=0.0018){const sv=vol*Math.sqrt(mins/15);const out=[];let p=base;const now=Date.now();for(let i=count;i>=0;i--){const chg=(Math.random()-0.499+Math.sin(i*0.04)*0.0002)*p*sv;const o=p;p=Math.max(p+chg,base*0.75);const h=Math.max(o,p)+Math.random()*p*sv*0.3,l=Math.min(o,p)-Math.random()*p*sv*0.3;out.push({t:now-i*mins*60000,o:+o.toFixed(4),h:+h.toFixed(4),l:+l.toFixed(4),c:+p.toFixed(4),v:Math.floor(Math.random()*8000+1000)});}return out;}

// ═══════════════════════════════════════════════════════════════
//  ICT ENGINE
// ═══════════════════════════════════════════════════════════════
function detectOBs(c){const o=[];for(let i=2;i<c.length-3;i++){const a=c[i],b=c[i+1];if(Math.abs(b.c-b.o)>Math.abs(a.c-a.o)*1.6){if(a.c>a.o&&b.c<b.o)o.push({type:"bearish",hi:a.h,lo:a.l});if(a.c<a.o&&b.c>b.o)o.push({type:"bullish",hi:a.h,lo:a.l});}}return o.slice(-6);}
function detectFVGs(c){const f=[];for(let i=1;i<c.length-1;i++){const p=c[i-1],n=c[i+1];if(n.l>p.h)f.push({type:"bullish",top:n.l,bot:p.h,filled:false});if(n.h<p.l)f.push({type:"bearish",top:p.l,bot:n.h,filled:false});}return f.slice(-8);}
function detectStr(c){const s=[];for(let i=3;i<c.length-1;i++){const a=c[i],p=c[i-1],p2=c[i-2];if(a.h>p.h&&a.h>p2.h&&a.c>p.h)s.push({type:"BOS",dir:"bullish",price:a.h});if(a.l<p.l&&a.l<p2.l&&a.c<p.l)s.push({type:"BOS",dir:"bearish",price:a.l});if(p2.c<p2.o&&p.c<p.o&&a.c>p.h)s.push({type:"CHoCH",dir:"bullish",price:a.c});if(p2.c>p2.o&&p.c>p.o&&a.c<p.l)s.push({type:"CHoCH",dir:"bearish",price:a.c});}return s.slice(-6);}
function getLiq(c){const r=c.slice(-40),ph=Math.max(...r.slice(-10,-1).map(x=>x.h)),pl=Math.min(...r.slice(-10,-1).map(x=>x.l)),last=r[r.length-1];return{bsl:Math.max(...r.map(x=>x.h)),ssl:Math.min(...r.map(x=>x.l)),sweepBuy:last.l<pl&&last.c>pl,sweepSell:last.h>ph&&last.c<ph};}
function getPD(c){const r=c.slice(-60),maxH=Math.max(...r.map(x=>x.h)),minL=Math.min(...r.map(x=>x.l)),range=maxH-minL||1,eq=minL+range*0.5,last=c[c.length-1].c;return{zone:last>eq?"PREMIUM":"DISCOUNT",eq:+eq.toFixed(3),inOTE_bull:last>=minL+range*0.62&&last<=minL+range*0.79,inOTE_bear:last>=maxH-range*0.79&&last<=maxH-range*0.62,maxH:+maxH.toFixed(3),minL:+minL.toFixed(3)};}
function getHTF(c){if(c.length<50)return{bias:"NEUTRAL"};const ma20=c.slice(-20).reduce((s,x)=>s+x.c,0)/20,ma50=c.slice(-50).reduce((s,x)=>s+x.c,0)/50,last=c[c.length-1].c;let sc=0;if(last>ma20)sc++;if(last>ma50)sc++;if(ma20>ma50)sc++;return{bias:sc>=2?"BULLISH":sc<=1?"BEARISH":"NEUTRAL"};}
function getAsian(c){const a=c.slice(-20,-10),hi=Math.max(...a.map(x=>x.h)),lo=Math.min(...a.map(x=>x.l));return{hi:+hi.toFixed(3),lo:+lo.toFixed(3)};}
function getDisp(c){const r=c.slice(-10),atr=r.reduce((s,x)=>s+(x.h-x.l),0)/r.length||1,last=r[r.length-1],move=Math.abs(last.c-last.o);return move>atr*2?{found:true,dir:last.c>last.o?"bullish":"bearish"}:{found:false};}

function analyze(candles,weights,thresh){
  if(!candles?.length)return null;
  const obs=detectOBs(candles),fvgs=detectFVGs(candles),structs=detectStr(candles),liq=getLiq(candles),pd=getPD(candles),disp=getDisp(candles),htf=getHTF(candles),asian=getAsian(candles);
  const last=candles[candles.length-1],atr=candles.slice(-14).reduce((s,c)=>s+(c.h-c.l),0)/14||0.1;
  let bull=0,bear=0;const fr={bull:[],bear:[]};
  const fire=(k,d)=>{const w=weights[k]?.weight||10;if(d==="bull"){bull+=w;fr.bull.push(k);}else{bear+=w;fr.bear.push(k);}};
  if(htf.bias==="BULLISH")fire("htfBias","bull");else if(htf.bias==="BEARISH")fire("htfBias","bear");
  if(pd.zone==="DISCOUNT")fire("premDisc","bull");else fire("premDisc","bear");
  if(pd.inOTE_bull)fire("ote","bull");if(pd.inOTE_bear)fire("ote","bear");
  const bOB=obs.find(o=>o.type==="bullish"&&last.c>=o.lo&&last.c<=o.hi*1.003);
  const beOB=obs.find(o=>o.type==="bearish"&&last.c<=o.hi&&last.c>=o.lo*0.997);
  if(bOB)fire("bullOB","bull");if(beOB)fire("bearOB","bear");
  const bFVG=fvgs.find(f=>f.type==="bullish"&&!f.filled&&last.c>=f.bot&&last.c<=f.top);
  const beFVG=fvgs.find(f=>f.type==="bearish"&&!f.filled&&last.c>=f.bot&&last.c<=f.top);
  if(bFVG)fire("bullFVG","bull");if(beFVG)fire("bearFVG","bear");
  if(liq.sweepBuy)fire("liqSweep","bull");if(liq.sweepSell)fire("liqSweep","bear");
  const lBOS=[...structs].reverse().find(s=>s.type==="BOS");
  const lCH=[...structs].reverse().find(s=>s.type==="CHoCH");
  if(lBOS?.dir==="bullish")fire("bosBull","bull");if(lBOS?.dir==="bearish")fire("bosBear","bear");
  if(lCH?.dir==="bullish")fire("chochBull","bull");if(lCH?.dir==="bearish")fire("chochBear","bear");
  if(disp.found){if(disp.dir==="bullish")fire("displacement","bull");else fire("displacement","bear");}
  if(last.c>asian.hi)fire("asianBreak","bull");else if(last.c<asian.lo)fire("asianBreak","bear");
  const total=bull+bear||1,dir=bull>=bear?"LONG":"SHORT",conf=Math.min(96,Math.max(38,Math.round(Math.max(bull,bear)/total*100)));
  const sl=dir==="LONG"?+(last.c-atr*thresh.slMult).toFixed(3):+(last.c+atr*thresh.slMult).toFixed(3);
  const tp1=dir==="LONG"?+(last.c+atr*thresh.tp1Mult).toFixed(3):+(last.c-atr*thresh.tp1Mult).toFixed(3);
  const tp2=dir==="LONG"?+(last.c+atr*thresh.tp2Mult).toFixed(3):+(last.c-atr*thresh.tp2Mult).toFixed(3);
  const rr=+(Math.abs(tp1-last.c)/Math.abs(sl-last.c)).toFixed(2);
  const RL={htfBias:"HTF MA Bias",premDisc:"Premium/Discount",ote:"OTE 62–79%",bullOB:"Bullish OB",bearOB:"Bearish OB",bullFVG:"Bullish FVG",bearFVG:"Bearish FVG",liqSweep:"Liquidity Sweep",bosBull:"Bullish BOS",bosBear:"Bearish BOS",chochBull:"CHoCH Bullish",chochBear:"CHoCH Bearish",displacement:"Displacement",asianBreak:"Asian Range Break"};
  return{dir,conf,reasons:fr[dir==="LONG"?"bull":"bear"].map(k=>RL[k]),firedRules:fr,entry:last.c,sl,tp1,tp2,rr,atr:+atr.toFixed(3),obs,fvgs,structs,liq,pd,htf,asian};
}

// ═══════════════════════════════════════════════════════════════
//  LEARNING ENGINE
// ═══════════════════════════════════════════════════════════════
function learnFromBT(prev,trades,winRate,total,sym){
  const brain=JSON.parse(JSON.stringify(prev));const log=[];
  if(total<5)return{brain,log:["Need ≥5 trades."]};
  if(winRate<55&&brain.thresholds.minConfidence<80){const o=brain.thresholds.minConfidence;brain.thresholds.minConfidence=Math.min(80,o+3);log.push(`📈 WR ${winRate}%<55% → min conf ${o}→${brain.thresholds.minConfidence}%`);}
  else if(winRate>72&&brain.thresholds.minConfidence>55){const o=brain.thresholds.minConfidence;brain.thresholds.minConfidence=Math.max(55,o-2);log.push(`✅ WR ${winRate}%>72% → min conf ${o}→${brain.thresholds.minConfidence}%`);}
  else log.push(`⚙️ Confidence stable: ${brain.thresholds.minConfidence}%`);
  const rs={};Object.keys(brain.weights).forEach(k=>{rs[k]={w:0,l:0};});
  trades.forEach(t=>{(t.firedRules?.[t.dir==="LONG"?"bull":"bear"]||[]).forEach(rule=>{if(!rs[rule])return;if(t.outcome==="WIN"){rs[rule].w++;brain.weights[rule].wins++;}else{rs[rule].l++;brain.weights[rule].losses++;}});});
  let changed=0;
  Object.entries(rs).forEach(([k,s])=>{const rt=s.w+s.l;if(rt<3)return;const wr=s.w/rt,old=brain.weights[k].weight;let nw=old;if(wr>0.70)nw=Math.min(40,Math.round(old*1.15));else if(wr>0.60)nw=Math.min(35,Math.round(old*1.07));else if(wr<0.40)nw=Math.max(4,Math.round(old*0.80));else if(wr<0.50)nw=Math.max(6,Math.round(old*0.92));if(nw!==old){brain.weights[k].weight=nw;log.push(`${nw>old?"↑":"↓"} "${brain.weights[k].label}" ${old}→${nw} (${Math.round(wr*100)}% WR)`);changed++;}});
  if(!changed)log.push("⚖️ All weights stable.");
  if(!brain.kzPerf[sym])brain.kzPerf[sym]={asian:{w:0,l:0},london:{w:0,l:0},overlap:{w:0,l:0},ny:{w:0,l:0}};
  trades.forEach(t=>{if(t.kzId&&t.kzId!=="none"&&brain.kzPerf[sym]?.[t.kzId]){if(t.outcome==="WIN")brain.kzPerf[sym][t.kzId].w++;else brain.kzPerf[sym][t.kzId].l++;}});
  brain.generations++;brain.totalTrades+=total;brain.overallWinRate=winRate;
  const ist=nowIST();
  brain.learningLog=[{gen:brain.generations,sym,date:istTimeStr(ist),winRate,totalTrades:total,changes:log},...(brain.learningLog||[])].slice(0,20);
  return{brain,log};
}

function runBacktest(candles,brain,times){
  const trades=[];
  for(let i=80;i<candles.length-15;i++){
    const a=analyze(candles.slice(i-80,i),brain.weights,brain.thresholds);
    if(!a||a.conf<brain.thresholds.minConfidence||a.rr<brain.thresholds.minRR)continue;
    const{entry,sl,tp1}=a;
    const ist=new Date(candles[i].t+IST_OFFSET);
    let kzId="none";
    if(isInWindow(ist,times.asian.s,times.asian.e))kzId="asian";
    else if(isInWindow(ist,times.overlap.s,times.overlap.e))kzId="overlap";
    else if(isInWindow(ist,times.london.s,times.london.e))kzId="london";
    else if(isInWindow(ist,times.ny.s,times.ny.e))kzId="ny";
    let outcome=null,pnl=0;
    for(const bar of candles.slice(i,i+15)){
      if(a.dir==="LONG"){if(bar.l<=sl){outcome="LOSS";pnl=+(sl-entry).toFixed(3);break;}if(bar.h>=tp1){outcome="WIN";pnl=+(tp1-entry).toFixed(3);break;}}
      else{if(bar.h>=sl){outcome="LOSS";pnl=+(entry-sl).toFixed(3);break;}if(bar.l<=tp1){outcome="WIN";pnl=+(entry-tp1).toFixed(3);break;}}
    }
    if(outcome)trades.push({...a,outcome,pnl,kzId});
  }
  const wins=trades.filter(t=>t.outcome==="WIN").length,losses=trades.filter(t=>t.outcome==="LOSS").length,total=wins+losses;
  const winRate=total?Math.round(wins/total*100):0;
  const pf=losses>0?+(trades.filter(t=>t.pnl>0).reduce((s,t)=>s+t.pnl,0)/Math.abs(trades.filter(t=>t.pnl<0).reduce((s,t)=>s+t.pnl,0))).toFixed(2):wins>0?99:0;
  return{trades:trades.slice(-30),wins,losses,total,winRate,profitFactor:pf,avgRR:total?+(trades.reduce((s,t)=>s+t.rr,0)/total).toFixed(2):0};
}

// ═══════════════════════════════════════════════════════════════
//  MINI CHART
// ═══════════════════════════════════════════════════════════════
function MiniChart({data,color,analysis}){
  if(!data?.length)return null;
  const r=data.slice(-50),maxP=Math.max(...r.map(c=>c.h)),minP=Math.min(...r.map(c=>c.l)),range=maxP-minP||1;
  const W=500,H=110,cw=W/r.length-0.5,py=v=>H-((v-minP)/range)*H;
  return(<svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{display:"block"}}>
    {analysis?.fvgs?.filter(f=>!f.filled).slice(-3).map((f,i)=><rect key={i} x={0} y={py(f.top)} width={W} height={Math.abs(py(f.bot)-py(f.top))} fill={f.type==="bullish"?"#22c55e18":"#ef444418"}/>)}
    {analysis?.obs?.slice(-2).map((ob,i)=><rect key={i} x={0} y={py(ob.hi)} width={W} height={Math.abs(py(ob.lo)-py(ob.hi))} fill={ob.type==="bullish"?"#22c55e22":"#ef444422"} stroke={ob.type==="bullish"?"#22c55e":"#ef4444"} strokeWidth="0.5" strokeDasharray="3,2"/>)}
    {analysis&&<line x1={0} y1={py(analysis.pd.eq)} x2={W} y2={py(analysis.pd.eq)} stroke="#ffffff15" strokeWidth="0.8" strokeDasharray="4,3"/>}
    {r.map((c,i)=>{const x=i*(W/r.length)+cw/2,bull=c.c>=c.o;return(<g key={i}><line x1={x} y1={py(c.h)} x2={x} y2={py(c.l)} stroke={bull?color:"#ef4444"} strokeWidth="0.8" opacity="0.6"/><rect x={x-cw/2} y={Math.min(py(c.o),py(c.c))} width={Math.max(cw-0.5,1)} height={Math.max(Math.abs(py(c.o)-py(c.c)),1)} fill={bull?color:"#ef4444"} opacity="0.88"/></g>);})}
    {analysis&&<><line x1={0} y1={py(analysis.entry)} x2={W} y2={py(analysis.entry)} stroke="#60a5fa" strokeWidth="1" strokeDasharray="5,3"/><line x1={0} y1={py(analysis.sl)} x2={W} y2={py(analysis.sl)} stroke="#ef4444" strokeWidth="1" strokeDasharray="3,3"/><line x1={0} y1={py(analysis.tp1)} x2={W} y2={py(analysis.tp1)} stroke="#22c55e" strokeWidth="1" strokeDasharray="3,3"/></>}
  </svg>);
}

function useClock(){const[t,setT]=useState(nowIST());useEffect(()=>{const id=setInterval(()=>setT(nowIST()),1000);return()=>clearInterval(id);},[]);return t;}

// ═══════════════════════════════════════════════════════════════
//  SETUP SCREEN
// ═══════════════════════════════════════════════════════════════
function SetupScreen({onSave,times}){
  const[k,setK]=useState("");
  const[testing,setTesting]=useState(false);
  const[result,setResult]=useState(null);
  const doTest=async()=>{setTesting(true);setResult(null);const r=await testConn(k.trim());setResult(r);setTesting(false);};
  return(
    <div style={{minHeight:"100vh",background:"#020817",display:"flex",alignItems:"center",justifyContent:"center",padding:"20px",fontFamily:"'JetBrains Mono',monospace"}}>
      <div style={{maxWidth:"480px",width:"100%",background:"#0f172a",borderRadius:"16px",padding:"28px",border:"1px solid #1e293b"}}>
        <div style={{textAlign:"center",marginBottom:"20px"}}>
          <div style={{fontSize:"36px",marginBottom:"6px"}}>🥇</div>
          <div style={{color:"#F5C842",fontWeight:"bold",fontSize:"16px",letterSpacing:"3px"}}>ICT TRADING AGENT</div>
          <div style={{color:"#22c55e",fontSize:"10px",marginTop:"3px"}}>Mumbai IST · Live Data · Self-Learning</div>
        </div>
        <div style={{background:"#0a2e0a",border:"1px solid #22c55e33",borderRadius:"8px",padding:"10px 12px",marginBottom:"12px"}}>
          <div style={{color:"#22c55e",fontSize:"11px",fontWeight:"bold"}}>✅ Running on your own domain — no CSP restrictions</div>
          <div style={{color:"#334155",fontSize:"10px",marginTop:"2px"}}>Worker: {WORKER_URL}</div>
        </div>
        <div style={{background:"#020817",borderRadius:"8px",padding:"10px",border:"1px solid #1e293b",marginBottom:"14px"}}>
          <div style={{color:"#94a3b8",fontSize:"9px",letterSpacing:"1px",marginBottom:"6px"}}>🕐 TODAY'S SESSION TIMES — IST ({times.note})</div>
          {[
            {label:"Asian Range",     s:times.asian.s,  e:times.asian.e,  color:"#7c3aed"},
            {label:"London Open KZ",  s:times.london.s, e:times.london.e, color:"#3b82f6"},
            {label:"London–NY Overlap",s:times.overlap.s,e:times.overlap.e,color:"#22c55e"},
            {label:"NY Session",      s:times.ny.s,     e:times.ny.e,     color:"#F5C842"},
            {label:"Silver Bullet 1", s:times.sb1.s,    e:times.sb1.e,    color:"#C0C0C0"},
            {label:"Silver Bullet 2", s:times.sb2.s,    e:times.sb2.e,    color:"#C0C0C0"},
            {label:"Silver Bullet 3", s:times.sb3.s,    e:times.sb3.e,    color:"#C0C0C0"},
          ].map(row=>(
            <div key={row.label} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",borderBottom:"1px solid #0f172a"}}>
              <span style={{color:row.color,fontSize:"10px"}}>● {row.label}</span>
              <span style={{color:"#475569",fontSize:"10px",fontFamily:"monospace"}}>{row.s} – {row.e} IST</span>
            </div>
          ))}
        </div>
        <div style={{marginBottom:"10px"}}>
          <div style={{color:"#94a3b8",fontSize:"9px",letterSpacing:"1px",marginBottom:"5px"}}>TWELVE DATA API KEY</div>
          <input value={k} onChange={e=>setK(e.target.value)} placeholder="Paste your Twelve Data API key..." type="password"
            style={{width:"100%",background:"#020817",border:"1px solid #1e293b",borderRadius:"7px",padding:"10px 12px",color:"#e2e8f0",fontSize:"12px",outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
        </div>
        {result&&<div style={{background:result.ok?"#14532d22":"#450a0a22",border:`1px solid ${result.ok?"#22c55e44":"#ef444444"}`,borderRadius:"6px",padding:"9px 12px",marginBottom:"10px"}}><span style={{color:result.ok?"#22c55e":"#ef4444",fontSize:"12px"}}>{result.msg}</span></div>}
        <div style={{display:"flex",gap:"8px"}}>
          <button onClick={doTest} disabled={testing||!k.trim()} style={{flex:1,background:"#1e293b",border:"1px solid #334155",color:"#94a3b8",borderRadius:"7px",padding:"10px",fontSize:"11px",cursor:"pointer",fontFamily:"inherit",opacity:!k.trim()||testing?0.5:1}}>{testing?"Testing...":"🔌 Test"}</button>
          <button onClick={()=>{ls.setKey(k.trim());onSave(k.trim());}} disabled={!k.trim()} style={{flex:2,background:"linear-gradient(135deg,#1e40af,#6d28d9)",color:"white",border:"none",borderRadius:"7px",padding:"10px",fontSize:"11px",fontWeight:"bold",cursor:"pointer",fontFamily:"inherit",opacity:!k.trim()?0.5:1}}>✅ Launch Agent</button>
        </div>
        <div style={{textAlign:"center",marginTop:"10px"}}>
          <button onClick={()=>onSave("")} style={{background:"transparent",border:"none",color:"#334155",fontSize:"10px",cursor:"pointer",fontFamily:"inherit",textDecoration:"underline"}}>Skip — use simulated data</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════════════════════════
export default function App(){
  const times=getSessionTimes();
  const KZS=[
    {id:"asian",   name:"Asian Range",       start:times.asian.s,   end:times.asian.e,   color:"#7c3aed",desc:"Consolidation — builds liquidity"},
    {id:"london",  name:"London Open KZ",    start:times.london.s,  end:times.london.e,  color:"#3b82f6",desc:"Primary trend & reversal"},
    {id:"overlap", name:"London–NY Overlap", start:times.overlap.s, end:times.overlap.e, color:"#22c55e",desc:"Highest volume window"},
    {id:"ny",      name:"NY Session",        start:times.ny.s,      end:times.ny.e,      color:"#F5C842",desc:"Continuation & reversal"},
  ];
  const SBS=[
    {label:"London SB",  start:times.sb1.s,end:times.sb1.e},
    {label:"NY Open SB", start:times.sb2.s,end:times.sb2.e},
    {label:"NY PM SB",   start:times.sb3.s,end:times.sb3.e},
  ];

  const[apiKey,setApiKey]=useState(ls.getKey);
  const[showSetup,setShowSetup]=useState(()=>!ls.getKey());
  const[brain,setBrain]=useState(()=>ls.get(SK.brain)||freshBrain());
  const[sym,setSym]=useState("XAUUSD");
  const[selTFs,setSelTFs]=useState(DEFAULT_TFS);
  const[tab,setTab]=useState("signal");
  const[candleData,setCandleData]=useState({});
  const[prices,setPrices]=useState({});
  const[changes,setChanges]=useState({});
  const[symStatus,setSymStatus]=useState({});
  const[lastFetch,setLastFetch]=useState(null);
  const[refreshing,setRefreshing]=useState(false);
  const[loadMsg,setLoadMsg]=useState("");
  const[analysis,setAnalysis]=useState(null);
  const[btResult,setBtResult]=useState(null);
  const[learnLog,setLearnLog]=useState([]);
  const[analyzing,setAnalyzing]=useState(false);
  const[bting,setBting]=useState(false);
  const[learning,setLearning]=useState(false);
  const[chat,setChat]=useState([{role:"assistant",content:`🥇 ICT Agent — Mumbai IST (${times.note})\n\nLondon: ${times.london.s}–${times.london.e} IST\nNY: ${times.ny.s}–${times.ny.e} IST\n\n${ls.getKey()?"✅ Loading real prices...":"Add your Twelve Data key to get started."}`}]);
  const[chatInput,setChatInput]=useState("");
  const[chatLoading,setChatLoading]=useState(false);
  const istNow=useClock();
  const chatRef=useRef(null);

  const activeKZ=KZS.find(kz=>isInWindow(istNow,kz.start,kz.end));
  const activeSB=SBS.find(sb=>isInWindow(istNow,sb.start,sb.end));
  const isLive=apiKey&&symStatus[sym]==="live";

  const loadAll=useCallback(async(key)=>{
    const cache=ls.get(SK.cache)||{};
    const nd={},np={},nc={};
    for(const[sk,si] of Object.entries(SYMBOLS)){
      nd[sk]={};setSymStatus(p=>({...p,[sk]:"loading"}));setLoadMsg(`Loading ${sk}...`);
      if(key){
        const acts=[...new Set(Object.values(selTFs))];
        for(const tfKey of acts){
          const ck=`${sk}_${tfKey}`,cached=cache[ck];
          if(cached?.candles?.length&&(Date.now()-cached.fetchedAt)<14*60*1000){nd[sk][tfKey]=cached.candles;}
          else{const{candles}=await fetchCandles(si.td,TF_TD[tfKey],key,150);if(candles?.length){nd[sk][tfKey]=candles;cache[ck]={candles,fetchedAt:Date.now()};}else nd[sk][tfKey]=genCandles(si.fallback,tfMins(tfKey),150,si.vol);await new Promise(r=>setTimeout(r,1200));}
        }
        const{price}=await fetchPrice(si.td,key);await new Promise(r=>setTimeout(r,500));
        if(price){np[sk]=price;nc[sk]=+(((price-si.fallback)/si.fallback)*100).toFixed(2);setSymStatus(p=>({...p,[sk]:"live"}));}
        else{const last=nd[sk][selTFs.execution]?.slice(-1)[0];np[sk]=last?.c||si.fallback;nc[sk]=0;setSymStatus(p=>({...p,[sk]:"error"}));}
      }else{
        ALL_TF.forEach(tfKey=>{nd[sk][tfKey]=genCandles(si.fallback,tfMins(tfKey),150,si.vol);});
        const last=nd[sk]["15m"].slice(-1)[0];np[sk]=last?.c||si.fallback;nc[sk]=+(((np[sk]-si.fallback)/si.fallback)*100).toFixed(2);setSymStatus(p=>({...p,[sk]:"sim"}));
      }
    }
    if(key)ls.set(SK.cache,cache);setCandleData(nd);setPrices(np);setChanges(nc);setLastFetch(new Date());setLoadMsg("");
  },[selTFs]);

  useEffect(()=>{if(!showSetup)loadAll(apiKey);},[showSetup,apiKey]);
  useEffect(()=>{if(!apiKey||showSetup)return;const id=setInterval(async()=>{setRefreshing(true);for(const[sk,si] of Object.entries(SYMBOLS)){const{price}=await fetchPrice(si.td,apiKey);if(price){setPrices(p=>({...p,[sk]:price}));setChanges(p=>({...p,[sk]:+(((price-si.fallback)/si.fallback)*100).toFixed(2)}));setSymStatus(p=>({...p,[sk]:"live"}));}await new Promise(r=>setTimeout(r,600));}setLastFetch(new Date());setRefreshing(false);},60000);return()=>clearInterval(id);},[apiKey,showSetup]);
  useEffect(()=>{if(apiKey||showSetup)return;const id=setInterval(()=>{setPrices(prev=>{const n={...prev},ch={};Object.entries(SYMBOLS).forEach(([k,v])=>{n[k]=+(prev[k]*(1+(Math.random()-0.4995)*v.vol*0.4)).toFixed(k==="NATGAS"?3:2);ch[k]=+(((n[k]-v.fallback)/v.fallback)*100).toFixed(2);});setChanges(ch);return n;});},2000);return()=>clearInterval(id);},[apiKey,showSetup]);
  useEffect(()=>{chatRef.current?.scrollIntoView({behavior:"smooth"});},[chat]);

  const handleAnalyze=async()=>{const cdata=candleData[sym]?.[selTFs.execution];if(!cdata?.length)return;setAnalyzing(true);await new Promise(r=>setTimeout(r,300));setAnalysis(analyze(cdata,brain.weights,brain.thresholds));setTab("signal");setAnalyzing(false);};
  const handleBTLearn=async()=>{const cdata=candleData[sym]?.[selTFs.execution];if(!cdata?.length)return;setBting(true);await new Promise(r=>setTimeout(r,400));const bt=runBacktest(cdata,brain,times);setBtResult(bt);setBting(false);setLearning(true);await new Promise(r=>setTimeout(r,500));const{brain:nb,log}=learnFromBT(brain,bt.trades,bt.winRate,bt.total,sym);setBrain(nb);ls.set(SK.brain,nb);setLearnLog(log);setLearning(false);setTab("learning");};
  const handleChat=async()=>{
    if(!chatInput.trim())return;
    const msg=chatInput.trim();setChatInput("");setChat(p=>[...p,{role:"user",content:msg}]);setChatLoading(true);
    try{
      const sys=`Elite ICT commodities analyst for Mumbai trader. ALWAYS use IST times. Now: ${istTimeStr(istNow)} (${times.note}). London: ${times.london.s}–${times.london.e} IST. NY: ${times.ny.s}–${times.ny.e} IST. Active: ${activeKZ?.name||"none"}. SB: ${activeSB?.label||"none"}. ${sym}@${prices[sym]}. Data:${isLive?"LIVE":"sim"}. Gen${brain.generations}. ${analysis?`Signal:${analysis.dir} ${analysis.conf}% Entry:${analysis.entry} SL:${analysis.sl} TP:${analysis.tp1} RR:${analysis.rr}`:""}`;
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,system:sys,messages:chat.concat([{role:"user",content:msg}])})});
      const data=await res.json();setChat(p=>[...p,{role:"assistant",content:data.content?.find(b=>b.type==="text")?.text||"Error."}]);
    }catch{setChat(p=>[...p,{role:"assistant",content:"⚠️ Error."}]);}
    setChatLoading(false);
  };

  if(showSetup)return <SetupScreen onSave={k=>{setApiKey(k);setShowSetup(false);}} times={times}/>;
  const S=SYMBOLS[sym],st=symStatus[sym];
  const TABS=["signal","sessions","weights","learning","backtest"];

  return(
    <div style={{background:"#020817",minHeight:"100vh",fontFamily:"'JetBrains Mono',monospace",color:"#e2e8f0"}}>
      <div style={{background:"#050d1a",borderBottom:"1px solid #1e293b",padding:"7px 12px",display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
          <div style={{width:"7px",height:"7px",borderRadius:"50%",background:isLive?"#22c55e":"#F5C842",boxShadow:`0 0 8px ${isLive?"#22c55e":"#F5C842"}`,animation:"blink 2s infinite"}}/>
          <span style={{color:"#F5C842",fontWeight:"bold",fontSize:"12px",letterSpacing:"3px"}}>ICT AGENT</span>
          <span style={{fontSize:"9px",padding:"1px 6px",borderRadius:"3px",background:isLive?"#0a2e0a":"#1a1a0a",color:isLive?"#22c55e":"#F5C842",border:`1px solid ${isLive?"#22c55e44":"#F5C84244"}`}}>{isLive?"● LIVE":"◌ SIM"}</span>
          <span style={{background:"#1a0a2e",color:"#a855f7",fontSize:"9px",padding:"1px 6px",borderRadius:"3px",border:"1px solid #a855f766"}}>GEN {brain.generations}</span>
          {activeKZ&&<span style={{fontSize:"9px",padding:"1px 7px",borderRadius:"3px",background:`${activeKZ.color}22`,color:activeKZ.color,border:`1px solid ${activeKZ.color}44`}}>● {activeKZ.name}</span>}
          {activeSB&&<span style={{fontSize:"9px",padding:"1px 6px",borderRadius:"3px",background:"#C0C0C015",color:"#C0C0C0",border:"1px solid #C0C0C033"}}>🥈 {activeSB.label}</span>}
        </div>
        {loadMsg&&<span style={{color:"#475569",fontSize:"9px"}}>{loadMsg}</span>}
        {Object.entries(SYMBOLS).map(([k,v])=>(
          <div key={k} onClick={()=>{setSym(k);setAnalysis(null);}} style={{cursor:"pointer",padding:"3px 8px",borderRadius:"5px",background:sym===k?"#0f172a":"transparent",border:`1px solid ${sym===k?v.color:"#1e293b"}`,minWidth:"76px"}}>
            <div style={{display:"flex",alignItems:"center",gap:"3px"}}><span style={{color:"#334155",fontSize:"8px"}}>{v.icon} {k}</span><span style={{fontSize:"7px",color:symStatus[k]==="live"?"#22c55e":symStatus[k]==="error"?"#ef4444":"#F5C842"}}>{symStatus[k]==="live"?"●":symStatus[k]==="error"?"⚠":"~"}</span></div>
            <div style={{color:v.color,fontWeight:"bold",fontSize:"12px"}}>{prices[k]!=null?Number(prices[k]).toFixed(k==="NATGAS"?3:2):"-"}</div>
            <div style={{color:(changes[k]||0)>=0?"#22c55e":"#ef4444",fontSize:"9px"}}>{(changes[k]||0)>=0?"▲":"▼"} {Math.abs(changes[k]||0)}%</div>
          </div>
        ))}
        <div style={{display:"flex",gap:"4px",alignItems:"center"}}>
          {Object.entries(selTFs).map(([role])=>(
            <div key={role} style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
              <span style={{color:ROLE_COLORS[role],fontSize:"7px",marginBottom:"1px"}}>{role}</span>
              <select value={selTFs[role]} onChange={e=>setSelTFs(p=>({...p,[role]:e.target.value}))} style={{background:"#0f172a",border:`1px solid ${ROLE_COLORS[role]}44`,color:ROLE_COLORS[role],borderRadius:"4px",padding:"2px 3px",fontSize:"10px",fontFamily:"inherit",cursor:"pointer",outline:"none"}}>
                {ALL_TF.map(tf=><option key={tf} value={tf}>{tf}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:"5px",alignItems:"center"}}>
          {lastFetch&&<span style={{color:"#1e293b",fontSize:"8px"}}>↺{istHHMM(new Date(lastFetch.getTime()+IST_OFFSET))} IST{refreshing?" ⟳":""}</span>}
          <button onClick={()=>loadAll(apiKey)} disabled={refreshing||!!loadMsg} style={{background:"#0f172a",border:"1px solid #1e293b",color:"#334155",borderRadius:"4px",padding:"3px 7px",fontSize:"9px",cursor:"pointer",fontFamily:"inherit"}}>↺</button>
          <button onClick={()=>setShowSetup(true)} style={{background:"#0f172a",border:`1px solid ${apiKey?"#22c55e44":"#F5C84244"}`,color:apiKey?"#22c55e":"#F5C842",borderRadius:"4px",padding:"3px 7px",fontSize:"9px",cursor:"pointer",fontFamily:"inherit"}}>⚙️{apiKey?" Key✓":" Add Key"}</button>
          <div style={{textAlign:"right"}}><div style={{color:"#F5C842",fontFamily:"monospace",fontSize:"11px"}}>{istTimeStr(istNow)}</div><div style={{color:"#1e293b",fontSize:"7px"}}>Mumbai · {times.note}</div></div>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 320px",height:"calc(100vh - 54px)"}}>
        <div style={{overflowY:"auto",padding:"10px",display:"flex",flexDirection:"column",gap:"8px",borderRight:"1px solid #1e293b"}}>
          {!apiKey&&<div style={{background:"#1a1a08",border:"1px solid #F5C84233",borderRadius:"8px",padding:"9px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{color:"#F5C842",fontSize:"11px",fontWeight:"bold"}}>◌ Simulated data</div><div style={{color:"#475569",fontSize:"10px"}}>Add Twelve Data key for real prices</div></div><button onClick={()=>setShowSetup(true)} style={{background:"#F5C842",color:"#020817",border:"none",borderRadius:"5px",padding:"5px 10px",fontSize:"10px",fontWeight:"bold",cursor:"pointer",fontFamily:"inherit"}}>Connect →</button></div>}
          <div style={{background:"#0f172a",borderRadius:"10px",padding:"12px",border:"1px solid #1e293b"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"7px"}}>
              <div><span style={{color:S.color,fontSize:"15px",fontWeight:"bold"}}>{S.icon} {sym}</span><span style={{color:"#334155",fontSize:"10px",marginLeft:"8px"}}>{selTFs.execution} · {isLive?"Twelve Data":"Sim"}</span></div>
              {analysis&&<span style={{background:analysis.dir==="LONG"?"#14532d":"#450a0a",color:analysis.dir==="LONG"?"#22c55e":"#ef4444",padding:"2px 9px",borderRadius:"4px",fontSize:"11px",fontWeight:"bold"}}>{analysis.dir==="LONG"?"▲":"▼"} {analysis.dir} {analysis.conf}%</span>}
            </div>
            <div style={{background:"#020817",borderRadius:"5px",padding:"5px"}}><MiniChart data={candleData[sym]?.[selTFs.execution]} color={S.color} analysis={analysis}/></div>
            <div style={{display:"flex",gap:"7px",marginTop:"8px"}}>
              <button onClick={handleAnalyze} disabled={analyzing} style={{flex:2,background:"linear-gradient(135deg,#1e40af,#6d28d9)",color:"white",border:"none",borderRadius:"7px",padding:"9px",fontWeight:"bold",fontSize:"11px",cursor:"pointer",opacity:analyzing?0.6:1}}>{analyzing?"⚙️ ANALYZING...":"🔬 ANALYZE"}</button>
              <button onClick={handleBTLearn} disabled={bting||learning} style={{flex:1,background:"linear-gradient(135deg,#7c3aed,#a855f7)",color:"white",border:"none",borderRadius:"7px",padding:"9px",fontWeight:"bold",fontSize:"11px",cursor:"pointer",opacity:(bting||learning)?0.6:1}}>{learning?"🧠...":(bting?"⚙️...":"🧠 BT+LEARN")}</button>
            </div>
          </div>
          <div style={{display:"flex",gap:"2px",background:"#0f172a",padding:"3px",borderRadius:"6px"}}>
            {TABS.map(t=><button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:"5px 2px",borderRadius:"4px",border:"none",background:tab===t?"#1e293b":"transparent",color:tab===t?"#e2e8f0":"#475569",fontSize:"9px",cursor:"pointer",textTransform:"uppercase",letterSpacing:"0.3px",fontFamily:"inherit"}}>{t==="signal"?"📡 Signal":t==="sessions"?"🕐 Sessions":t==="weights"?"⚖️ Weights":t==="learning"?"🧠 Learn":"📊 BT"}</button>)}
          </div>

          {tab==="signal"&&analysis&&(
            <div style={{background:"#0f172a",borderRadius:"9px",padding:"13px",border:`1px solid ${analysis.dir==="LONG"?"#22c55e44":"#ef444444"}`}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"7px",marginBottom:"10px"}}>
                {[{l:"ENTRY",v:analysis.entry,c:"#60a5fa"},{l:"STOP",v:analysis.sl,c:"#ef4444"},{l:"TP 1",v:analysis.tp1,c:"#22c55e"},{l:"TP 2",v:analysis.tp2,c:"#4ade80"}].map(x=><div key={x.l} style={{background:"#020817",borderRadius:"5px",padding:"8px",textAlign:"center"}}><div style={{color:"#334155",fontSize:"8px"}}>{x.l}</div><div style={{color:x.c,fontWeight:"bold",fontSize:"11px",marginTop:"2px"}}>{x.v}</div></div>)}
              </div>
              <div style={{display:"flex",gap:"10px",marginBottom:"8px",flexWrap:"wrap"}}>
                <span style={{color:"#475569",fontSize:"10px"}}>R:R <span style={{color:"#F5C842"}}>{analysis.rr}</span></span>
                <span style={{color:"#475569",fontSize:"10px"}}>ATR <span style={{color:"#F5C842"}}>{analysis.atr}</span></span>
                <span style={{color:"#475569",fontSize:"10px"}}>Conf≥<span style={{color:"#a855f7"}}>{brain.thresholds.minConfidence}%</span></span>
                {activeKZ&&<span style={{color:activeKZ.color,fontSize:"10px"}}>● {activeKZ.name}</span>}
                {activeSB&&<span style={{color:"#C0C0C0",fontSize:"10px"}}>🥈 {activeSB.label}</span>}
              </div>
              {analysis.reasons.map((r,i)=><div key={i} style={{display:"flex",gap:"7px",padding:"4px 0",borderBottom:i<analysis.reasons.length-1?"1px solid #0d1421":"none"}}><div style={{width:"4px",height:"4px",borderRadius:"50%",background:analysis.dir==="LONG"?"#22c55e":"#ef4444",marginTop:"5px",flexShrink:0}}/><span style={{color:"#94a3b8",fontSize:"10px"}}>{r}</span></div>)}
            </div>
          )}
          {tab==="signal"&&!analysis&&<div style={{textAlign:"center",padding:"40px",color:"#1e293b"}}><div style={{fontSize:"40px"}}>🔬</div><div style={{color:"#334155",fontSize:"12px",marginTop:"8px"}}>Hit <strong style={{color:"#6d28d9"}}>ANALYZE</strong> to generate a signal</div></div>}

          {tab==="sessions"&&(
            <div style={{display:"grid",gap:"8px"}}>
              <div style={{background:"#0f172a",borderRadius:"9px",padding:"12px",border:"1px solid #1e293b"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
                  <span style={{color:"#94a3b8",fontSize:"10px",letterSpacing:"1px"}}>🕐 SESSIONS — MUMBAI IST</span>
                  <div style={{textAlign:"right"}}><div style={{color:"#F5C842",fontFamily:"monospace",fontSize:"12px"}}>{istTimeStr(istNow)}</div><div style={{color:"#334155",fontSize:"8px"}}>{times.note}</div></div>
                </div>
                {KZS.map(kz=>{
                  const active=isInWindow(istNow,kz.start,kz.end),pct=active?windowPct(istNow,kz.start,kz.end):0;
                  return(<div key={kz.id} style={{background:active?"#0d1f35":"#020817",borderRadius:"7px",padding:"9px 11px",marginBottom:"5px",border:`1px solid ${active?kz.color+"55":"#1e293b"}`,boxShadow:active?`0 0 10px ${kz.color}20`:"none"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{color:active?kz.color:"#334155",fontWeight:active?"bold":"normal",fontSize:"11px"}}>{active?"● ":"○ "}{kz.name}</span>
                      <span style={{color:"#475569",fontFamily:"monospace",fontSize:"10px"}}>{kz.start}–{kz.end} IST</span>
                    </div>
                    {active&&<><div style={{height:"3px",background:"#1e293b",borderRadius:"2px",marginTop:"5px"}}><div style={{height:"100%",width:`${pct}%`,background:kz.color,borderRadius:"2px",transition:"width 1s"}}/></div><div style={{color:"#475569",fontSize:"9px",marginTop:"3px"}}>{kz.desc}</div></>}
                  </div>);
                })}
              </div>
              <div style={{background:"#0f172a",borderRadius:"9px",padding:"12px",border:"1px solid #1e293b"}}>
                <div style={{color:"#94a3b8",fontSize:"10px",letterSpacing:"1px",marginBottom:"8px"}}>🥈 SILVER BULLET WINDOWS — IST</div>
                {SBS.map(sb=>{const active=isInWindow(istNow,sb.start,sb.end);return(<div key={sb.label} style={{display:"flex",justifyContent:"space-between",padding:"7px 10px",background:active?"#1a1205":"#020817",borderRadius:"5px",marginBottom:"4px",border:`1px solid ${active?"#F5C84244":"#1e293b"}`}}><span style={{color:active?"#F5C842":"#334155",fontSize:"11px"}}>{active?"● ":"○ "}{sb.label}</span><span style={{color:"#334155",fontFamily:"monospace",fontSize:"11px"}}>{sb.start}–{sb.end} IST</span>{active&&<span style={{color:"#F5C842",fontSize:"10px",fontWeight:"bold"}}>ACTIVE</span>}</div>);})}
                <div style={{color:"#1e293b",fontSize:"9px",marginTop:"5px"}}>⚠️ After Mar 29: UK moves to BST → London shifts to 12:30 IST</div>
              </div>
            </div>
          )}

          {tab==="weights"&&(
            <div style={{background:"#0f172a",borderRadius:"9px",padding:"12px",border:"1px solid #1e293b"}}>
              <div style={{color:"#94a3b8",fontSize:"10px",letterSpacing:"1px",marginBottom:"8px"}}>⚖️ ADAPTIVE WEIGHTS — Gen {brain.generations}</div>
              {Object.entries(brain.weights).sort((a,b)=>b[1].weight-a[1].weight).map(([k,rule])=>{const total=rule.wins+rule.losses,wr=total>0?Math.round(rule.wins/total*100):null,delta=rule.weight-(DW[k]?.weight||15);return(<div key={k} style={{marginBottom:"7px"}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:"2px"}}><span style={{color:"#cbd5e1",fontSize:"10px"}}>{rule.label}</span><div style={{display:"flex",gap:"6px"}}>{wr!==null&&<span style={{color:wr>=60?"#22c55e":wr>=50?"#F5C842":"#ef4444",fontSize:"9px"}}>{wr}%</span>}{delta!==0&&<span style={{color:delta>0?"#22c55e":"#ef4444",fontSize:"9px"}}>{delta>0?"+":""}{delta}</span>}<span style={{color:"#F5C842",fontWeight:"bold",fontSize:"11px",minWidth:"20px",textAlign:"right"}}>{rule.weight}</span></div></div><div style={{height:"4px",background:"#1e293b",borderRadius:"2px"}}><div style={{height:"100%",width:`${Math.round((rule.weight/40)*100)}%`,background:delta>0?"#22c55e":delta<0?"#ef4444":"#334155",borderRadius:"2px",transition:"width 0.5s"}}/></div></div>);})}
            </div>
          )}

          {tab==="learning"&&(
            <div style={{display:"grid",gap:"8px"}}>
              {learnLog.length>0&&<div style={{background:"#0a0f1e",borderRadius:"8px",padding:"12px",border:"1px solid #a855f744"}}><div style={{color:"#a855f7",fontSize:"10px",letterSpacing:"1px",marginBottom:"7px"}}>🧠 LATEST SESSION</div>{learnLog.map((e,i)=><div key={i} style={{color:e.startsWith("↑")||e.startsWith("✅")||e.startsWith("📈")?"#22c55e":e.startsWith("↓")||e.startsWith("⚠️")?"#ef4444":"#94a3b8",fontSize:"10px",padding:"3px 0",lineHeight:"1.5"}}>{e}</div>)}</div>}
              <div style={{background:"#0f172a",borderRadius:"8px",padding:"12px",border:"1px solid #1e293b"}}>
                <div style={{color:"#94a3b8",fontSize:"10px",letterSpacing:"1px",marginBottom:"7px"}}>📚 HISTORY ({brain.learningLog?.length||0} sessions)</div>
                {!brain.learningLog?.length&&<div style={{color:"#1e293b",fontSize:"10px"}}>No history. Run BT+Learn.</div>}
                {brain.learningLog?.map((s,i)=><div key={i} style={{background:"#020817",borderRadius:"5px",padding:"8px",marginBottom:"5px",border:"1px solid #1e293b"}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:"3px"}}><span style={{color:"#a855f7",fontSize:"10px",fontWeight:"bold"}}>Gen {s.gen} · {s.sym}</span><span style={{color:"#1e293b",fontSize:"8px"}}>{s.date}</span></div><div style={{display:"flex",gap:"8px"}}><span style={{color:s.winRate>=65?"#22c55e":s.winRate>=50?"#F5C842":"#ef4444",fontSize:"10px"}}>{s.winRate}% WR</span><span style={{color:"#334155",fontSize:"9px"}}>{s.totalTrades} trades</span></div>{s.changes?.slice(0,2).map((c,j)=><div key={j} style={{color:"#334155",fontSize:"9px",marginTop:"2px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>· {c}</div>)}</div>)}
              </div>
            </div>
          )}

          {tab==="backtest"&&btResult&&(
            <div style={{display:"grid",gap:"8px"}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"7px"}}>
                {[{l:"WIN RATE",v:`${btResult.winRate}%`,c:btResult.winRate>=65?"#22c55e":btResult.winRate>=50?"#F5C842":"#ef4444"},{l:"TRADES",v:btResult.total,c:"#60a5fa"},{l:"P.FACTOR",v:btResult.profitFactor,c:btResult.profitFactor>=1.5?"#22c55e":"#ef4444"},{l:"AVG R:R",v:btResult.avgRR,c:"#F5C842"}].map(x=><div key={x.l} style={{background:"#0f172a",borderRadius:"6px",padding:"10px",textAlign:"center",border:"1px solid #1e293b"}}><div style={{color:"#334155",fontSize:"8px"}}>{x.l}</div><div style={{color:x.c,fontWeight:"bold",fontSize:"16px",marginTop:"3px"}}>{x.v}</div></div>)}
              </div>
              <div style={{background:"#0f172a",borderRadius:"8px",padding:"10px",border:"1px solid #1e293b",maxHeight:"260px",overflowY:"auto"}}>
                {btResult.trades.slice().reverse().map((t,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"60px 60px 65px 50px 1fr",gap:"4px",padding:"4px 5px",background:i%2===0?"#020817":"transparent",borderRadius:"3px",fontSize:"9px",alignItems:"center"}}><span style={{color:t.outcome==="WIN"?"#22c55e":"#ef4444",fontWeight:"bold"}}>{t.outcome==="WIN"?"✅":"❌"} {t.outcome}</span><span style={{color:t.dir==="LONG"?"#22c55e":"#ef4444"}}>{t.dir==="LONG"?"▲":"▼"} {t.dir}</span><span style={{color:"#60a5fa"}}>@ {t.entry}</span><span style={{color:"#F5C842"}}>RR {t.rr}</span><span style={{color:"#334155",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.conf}% · {t.kzId}</span></div>)}
              </div>
            </div>
          )}
          {tab==="backtest"&&!btResult&&<div style={{textAlign:"center",padding:"40px",color:"#1e293b"}}><div style={{fontSize:"40px"}}>📊</div><div style={{color:"#334155",fontSize:"11px",marginTop:"8px"}}>Click <strong style={{color:"#a855f7"}}>🧠 BT+LEARN</strong></div></div>}
        </div>

        <div style={{display:"flex",flexDirection:"column",background:"#040b18"}}>
          <div style={{padding:"9px 12px",borderBottom:"1px solid #1e293b",background:"#050d1a"}}><div style={{color:"#F5C842",fontWeight:"bold",fontSize:"11px",letterSpacing:"1px"}}>🤖 ICT AI ANALYST</div><div style={{color:"#1e3a5f",fontSize:"9px"}}>Mumbai IST · Gen {brain.generations} · {isLive?"Live":"Sim"} · {activeKZ?.name||"No active KZ"}</div></div>
          <div style={{flex:1,overflowY:"auto",padding:"9px",display:"flex",flexDirection:"column",gap:"6px"}}>
            {chat.map((m,i)=><div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}><div style={{maxWidth:"90%",padding:"8px 10px",borderRadius:m.role==="user"?"10px 10px 2px 10px":"10px 10px 10px 2px",background:m.role==="user"?"#1e40af":"#0f172a",color:"#e2e8f0",fontSize:"11px",lineHeight:"1.6",whiteSpace:"pre-wrap",border:m.role==="assistant"?"1px solid #1e293b":"none"}}>{m.content}</div></div>)}
            {chatLoading&&<div style={{display:"flex",gap:"4px",padding:"9px",background:"#0f172a",borderRadius:"10px",width:"fit-content",border:"1px solid #1e293b"}}>{[0,1,2].map(i=><div key={i} style={{width:"5px",height:"5px",borderRadius:"50%",background:"#a855f7",animation:`dot ${0.5+i*0.15}s infinite alternate`}}/>)}</div>}
            <div ref={chatRef}/>
          </div>
          <div style={{padding:"8px",borderTop:"1px solid #1e293b",display:"flex",gap:"6px"}}>
            <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&handleChat()} placeholder="Ask anything in IST..." style={{flex:1,background:"#0f172a",border:"1px solid #1e293b",borderRadius:"6px",padding:"8px 10px",color:"#e2e8f0",fontSize:"11px",outline:"none",fontFamily:"inherit"}}/>
            <button onClick={handleChat} disabled={chatLoading} style={{background:"#F5C842",color:"#020817",border:"none",borderRadius:"6px",padding:"8px 11px",fontWeight:"bold",cursor:"pointer"}}>➤</button>
          </div>
          <div style={{padding:"0 8px 8px",display:"flex",gap:"3px",flexWrap:"wrap"}}>
            {["London KZ open?","Gold signal now?","When does NY open?","SB active?","Best session?"].map(q=><button key={q} onClick={()=>setChatInput(q)} style={{background:"#0f172a",border:"1px solid #1e293b",color:"#334155",borderRadius:"20px",padding:"2px 7px",fontSize:"9px",cursor:"pointer",whiteSpace:"nowrap"}}>{q}</button>)}
          </div>
        </div>
      </div>
      <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:0.2}}@keyframes dot{from{transform:scale(0.8);opacity:0.4}to{transform:scale(1.2);opacity:1}}::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:#020817}::-webkit-scrollbar-thumb{background:#1e293b;border-radius:2px}`}</style>
    </div>
  );
}
