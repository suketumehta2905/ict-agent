import{useState,useEffect,useRef,useCallback,useMemo}from"react";
// ═══════════════════════════════════════════════════════════════
//  ICT SOVEREIGN TRADER — v12
//  Knowledge source: "The Sovereign Trader" by Suketu Mehta
//  ICT concepts: Liquidity pools, OBs, FVGs, AMD, OTE, Killzones
// ═══════════════════════════════════════════════════════════════
const WORKER="https://ict-data-proxy.suketu29.workers.dev";
const IST=5.5*60*60*1000;
const ENV_AI=process.env.REACT_APP_ANTHROPIC_KEY||"";
const SYM_SRC={XAUUSD:"fh",XAGUSD:"fh",USOIL:"fh",NATGAS:"fh"};
const FH_RES={"1m":"1","5m":"5","15m":"15","30m":"30","1H":"60","4H":"240","1D":"D","1W":"W"};
const TD_INT={"1m":"1min","5m":"5min","15m":"15min","30m":"30min","1H":"1h","2H":"2h","4H":"4h","1D":"1day","1W":"1week"};
function nowIST(){return new Date(Date.now()+IST);}
function pad(n){return String(n).padStart(2,"0");}
function istStr(d){return`${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} IST`;}
function fmtT(ts){const d=new Date(ts+IST);return`${pad(d.getUTCDate())}/${pad(d.getUTCMonth()+1)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;}
function toMins(s){const[h,m]=s.split(":").map(Number);return h*60+m;}
function inWin(d,s,e){const c=d.getUTCHours()*60+d.getUTCMinutes(),st=toMins(s),et=toMins(e);return et>st?(c>=st&&c<et):(c>=st||c<et);}
function winPct(d,s,e){const c=d.getUTCHours()*60+d.getUTCMinutes(),st=toMins(s),et=toMins(e);if(et<=st)return 0;return Math.min(100,Math.max(0,Math.round(((c-st)/(et-st))*100)));}
function getT(){const now=new Date(),m=now.getMonth()+1,d=now.getDate();const ukBST=(m>3)||(m===3&&d>=29)||(m<10)||(m===10&&d<25);const usEDT=(m>3)||(m===3&&d>=8)||(m<11)||(m===11&&d<1);if(!ukBST&&usEDT)return{london:{s:"13:30",e:"18:30"},ny:{s:"18:30",e:"00:30"},overlap:{s:"18:30",e:"21:30"},asian:{s:"02:30",e:"06:30"},sb1:{s:"14:00",e:"15:00"},sb2:{s:"20:00",e:"21:00"},sb3:{s:"00:00",e:"01:00"},note:"UK GMT·US EDT"};if(ukBST&&usEDT)return{london:{s:"12:30",e:"17:30"},ny:{s:"18:30",e:"00:30"},overlap:{s:"18:30",e:"21:30"},asian:{s:"02:30",e:"06:30"},sb1:{s:"13:00",e:"14:00"},sb2:{s:"20:00",e:"21:00"},sb3:{s:"00:00",e:"01:00"},note:"UK BST·US EDT"};if(!ukBST&&!usEDT)return{london:{s:"13:30",e:"18:30"},ny:{s:"19:30",e:"01:30"},overlap:{s:"19:30",e:"22:30"},asian:{s:"02:30",e:"06:30"},sb1:{s:"14:00",e:"15:00"},sb2:{s:"21:00",e:"22:00"},sb3:{s:"01:00",e:"02:00"},note:"UK GMT·US EST"};return{london:{s:"12:30",e:"17:30"},ny:{s:"19:30",e:"01:30"},overlap:{s:"19:30",e:"22:30"},asian:{s:"02:30",e:"06:30"},sb1:{s:"13:00",e:"14:00"},sb2:{s:"21:00",e:"22:00"},sb3:{s:"01:00",e:"02:00"},note:"UK BST·US EST"};}
const TF_ORDER=["1m","5m","15m","30m","1H","2H","4H","1D","1W"];
const ALL_TF=TF_ORDER;
const tfMins=tf=>({"1m":1,"5m":5,"15m":15,"30m":30,"1H":60,"2H":120,"4H":240,"1D":1440,"1W":10080}[tf]||15);
const SYMS={
  XAUUSD:{label:"Gold",    color:"#92400E",accent:"#B45309",bg:"#FFFBEB",border:"#FDE68A",td:"XAU/USD", fh:"XAU_USD",fallback:3020,vol:0.0018,pip:0.01},
  XAGUSD:{label:"Silver",  color:"#374151",accent:"#4B5563",bg:"#F9FAFB",border:"#D1D5DB",td:"XAG/USD", fh:"XAG_USD",fallback:33.5, vol:0.003, pip:0.001},
  USOIL: {label:"Crude Oil",color:"#9A3412",accent:"#C2410C",bg:"#FFF7ED",border:"#FED7AA",td:"XTI/USD", fh:"USOIL",  fallback:71.2, vol:0.003, pip:0.01},
  NATGAS:{label:"Nat Gas", color:"#075985",accent:"#0369A1",bg:"#F0F9FF",border:"#BAE6FD",td:"XNG/USD", fh:"NATGAS", fallback:2.18, vol:0.006, pip:0.001},
};
const SK={brain:"ict_v12_brain",key:"ict_v12_tdkey",fhkey:"ict_v12_fhkey",aikey:"ict_v12_aikey",cache:"ict_v12_cache",done:"ict_v12_done",user:"ict_v12_user",tlog:"ict_v12_tlog",signals:"ict_v12_signals"};
const ls={get:k=>{try{const r=localStorage.getItem(k);return r?JSON.parse(r):null;}catch{}return null;},set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}},str:k=>{try{return localStorage.getItem(k)||"";}catch{}return"";},setStr:(k,v)=>{try{localStorage.setItem(k,v);}catch{}}};
// ── API ──────────────────────────────────────────────────────
async function wFetch(p){try{const r=await fetch(`${WORKER}?${new URLSearchParams(p)}`);if(!r.ok)throw new Error(`HTTP ${r.status}`);return{data:await r.json(),error:null};}catch(e){return{data:null,error:e.message};}}
async function fetchPrice(sk,tdK,fhK){const sv=SYMS[sk],src=SYM_SRC[sk];if(src==="fh"&&fhK){const{data,error}=await wFetch({source:"fh",symbol:sv.fh,type:"price",apikey:fhK});if(data?.price&&!error)return{price:parseFloat(data.price),error:null};}if(tdK){const{data,error}=await wFetch({source:"td",symbol:sv.td,type:"price",apikey:tdK});if(data?.price&&!error)return{price:parseFloat(data.price),error:null};}return{price:null,error:"No key"};}
async function fetchCandles(sk,tfK,tdK,fhK,count=300){const sv=SYMS[sk],src=SYM_SRC[sk];if(src==="fh"&&fhK&&FH_RES[tfK]){const now=Math.floor(Date.now()/1000),from=now-count*tfMins(tfK)*60;const{data,error}=await wFetch({source:"fh",symbol:sv.fh,type:"candles",resolution:FH_RES[tfK],from,to:now,apikey:fhK});if(data?.values?.length&&!error)return{candles:data.values.map(v=>({t:new Date(v.datetime).getTime(),o:parseFloat(v.open),h:parseFloat(v.high),l:parseFloat(v.low),c:parseFloat(v.close),v:v.volume||0})),error:null};}if(tdK&&TD_INT[tfK]){const{data,error}=await wFetch({source:"td",symbol:sv.td,interval:TD_INT[tfK],outputsize:count,type:"candles",apikey:tdK});if(data?.values?.length&&!error)return{candles:data.values.map(v=>({t:new Date(v.datetime).getTime(),o:parseFloat(v.open),h:parseFloat(v.high),l:parseFloat(v.low),c:parseFloat(v.close),v:v.volume||0})),error:null};}return{candles:null,error:"No data"};}
async function testConn(fhK,tdK){if(fhK){const{data}=await wFetch({source:"fh",symbol:"XAU/USD",type:"price",apikey:fhK});if(data?.price)return{ok:true,msg:`✅ Finnhub Gold: $${parseFloat(data.price).toFixed(2)}`};}if(tdK){const{data}=await wFetch({source:"td",symbol:"XAU%2FUSD",type:"price",apikey:tdK});if(data?.price)return{ok:true,msg:`✅ Twelve Data Gold: $${parseFloat(data.price).toFixed(2)}`};}return{ok:false,msg:"❌ Both keys failed"};}
// ── BRAIN / WEIGHTS ──────────────────────────────────────────
const DW={htfBias:{weight:20,wins:0,losses:0,label:"HTF MA Bias",desc:"Price above/below MA50 directional filter"},premDisc:{weight:18,wins:0,losses:0,label:"Premium/Discount Zone",desc:"Buy in discount (<50% range), sell in premium (>50%)"},ote:{weight:22,wins:0,losses:0,label:"OTE 62–79% Fib",desc:"Optimal Trade Entry — Sovereign Setup retracement zone"},midnightBias:{weight:15,wins:0,losses:0,label:"Midnight Open Bias",desc:"Price vs 00:00 open — discount below, premium above"},bullOB:{weight:28,wins:0,losses:0,label:"Bullish Order Block",desc:"Last bearish candle before institutional upside displacement"},bearOB:{weight:28,wins:0,losses:0,label:"Bearish Order Block",desc:"Last bullish candle before institutional downside displacement"},bullFVG:{weight:20,wins:0,losses:0,label:"Bullish FVG",desc:"Bullish imbalance gap — CE (50%) is high-probability entry"},bearFVG:{weight:20,wins:0,losses:0,label:"Bearish FVG",desc:"Bearish imbalance gap — CE is high-probability entry"},liqSweepBSL:{weight:25,wins:0,losses:0,label:"BSL Sweep (Buy-Side)",desc:"Buy-side liquidity swept above equal highs — institutional sell signal"},liqSweepSSL:{weight:25,wins:0,losses:0,label:"SSL Sweep (Sell-Side)",desc:"Sell-side liquidity swept below equal lows — institutional buy signal"},bosBull:{weight:16,wins:0,losses:0,label:"Bullish BOS",desc:"Break of Structure — higher high confirms uptrend"},bosBear:{weight:16,wins:0,losses:0,label:"Bearish BOS",desc:"Break of Structure — lower low confirms downtrend"},chochBull:{weight:20,wins:0,losses:0,label:"CHoCH Bullish",desc:"Change of Character — institutional turn signal (bullish)"},chochBear:{weight:20,wins:0,losses:0,label:"CHoCH Bearish",desc:"Change of Character — institutional turn signal (bearish)"},displacement:{weight:14,wins:0,losses:0,label:"Displacement",desc:"Impulsive move >2×ATR — institutional order flow confirmed"},asianBreak:{weight:12,wins:0,losses:0,label:"Asian Range Break",desc:"Break of Asian session range — directional bias signal"},judas:{weight:18,wins:0,losses:0,label:"Judas Swing",desc:"False move at London open to sweep liquidity before reversal"},amd:{weight:15,wins:0,losses:0,label:"AMD Phase",desc:"Accumulation→Manipulation→Distribution cycle alignment"}};
const DT={minConf:40,minRR:1.0,slMult:1.5,tp1Mult:2.0,tp2Mult:3.5};
function freshBrain(){return{weights:JSON.parse(JSON.stringify(DW)),thresholds:{...DT},kzPerf:Object.fromEntries(Object.keys(SYMS).map(k=>[k,{asian:{w:0,l:0},london:{w:0,l:0},overlap:{w:0,l:0},ny:{w:0,l:0},sb:{w:0,l:0}}])),generations:0,totalTrades:0,overallWR:0,learningLog:[],bestMode:"intraday"};}
function genCandles(base,mins,count=300,vol=0.0018){const sv=vol*Math.sqrt(mins/15);const out=[];let p=base;const now=Date.now();for(let i=count;i>=0;i--){const chg=(Math.random()-0.499+Math.sin(i*0.04)*0.0002)*p*sv;const o=p;p=Math.max(p+chg,base*0.75);const h=Math.max(o,p)+Math.random()*p*sv*0.3,l=Math.min(o,p)-Math.random()*p*sv*0.3;out.push({t:now-i*mins*60000,o:+o.toFixed(4),h:+h.toFixed(4),l:+l.toFixed(4),c:+p.toFixed(4),v:Math.floor(Math.random()*8000+1000)});}return out;}
// ── ICT ENGINE (Sovereign Book knowledge) ───────────────────
// ── UPGRADED ICT ENGINE v2 ──────────────────────────────────────
// Sources: joshyattridge/smart-money-concepts (smc.py),
//          smtlab/smartmoneyconcepts, Agent F (TradingView 25-pt),
//          ICT Gold Strategy Guide, "The Sovereign Trader"
// ──────────────────────────────────────────────────────────────

// SWING HIGHS/LOWS — joshyattridge exact algorithm
// "A swing high is when current high is highest of swing_length candles BEFORE AND AFTER"
// swing_length=5 means checking 5 candles each side = 11-candle window
function detectSwingPoints(candles,swingLen=5){const swings=[];for(let i=swingLen;i<candles.length-swingLen;i++){const c=candles[i];const wH=candles.slice(i-swingLen,i+swingLen+1).map(x=>x.h);if(c.h===Math.max(...wH))swings.push({type:"high",price:c.h,idx:i});const wL=candles.slice(i-swingLen,i+swingLen+1).map(x=>x.l);if(c.l===Math.min(...wL))swings.push({type:"low",price:c.l,idx:i});}return swings;}

// BOS / CHoCH — trend-aware classification (joshyattridge smc.py)
// BOS = break IN trend direction (continuation)
// CHoCH = break AGAINST trend (reversal signal — most important for entries)
// USE CLOSE PRICE for body break to filter false wick breaks
function detectBOSCHoCH(candles,swings){
  const results=[];if(swings.length<2)return results;
  let trend="NEUTRAL";
  const highs=swings.filter(s=>s.type==="high").sort((a,b)=>a.idx-b.idx);
  const lows=swings.filter(s=>s.type==="low").sort((a,b)=>a.idx-b.idx);
  for(let i=50;i<candles.length;i++){
    const c=candles[i];
    const lastHigh=highs.filter(s=>s.idx<i-1).slice(-1)[0];
    const lastLow=lows.filter(s=>s.idx<i-1).slice(-1)[0];
    if(lastHigh&&c.c>lastHigh.price){// close-based break for clean signal
      const type=trend==="BEARISH"?"CHoCH":"BOS";
      results.push({type,dir:"bullish",price:lastHigh.price,idx:i,level:lastHigh.price});
      trend="BULLISH";}
    if(lastLow&&c.c<lastLow.price){
      const type=trend==="BULLISH"?"CHoCH":"BOS";
      results.push({type,dir:"bearish",price:lastLow.price,idx:i,level:lastLow.price});
      trend="BEARISH";}}
  return results.slice(-10);}

// FVG — joshyattridge exact definition + CE levels
// "Bullish FVG: prev.high < next.low (gap above prev candle)"
// "Bearish FVG: prev.low > next.high (gap below prev candle)"
// CE = Consequent Encroachment = 50% fill level (highest probability entry per ICT)
function detectFVGs(candles){
  const fvgs=[];
  for(let i=1;i<candles.length-1;i++){
    const p=candles[i-1],cur=candles[i],n=candles[i+1];
    if(cur.c>cur.o&&n.l>p.h){// Bullish FVG
      const top=n.l,bot=p.h,ce=(top+bot)/2;
      const filled=candles.slice(i+2).some(x=>x.l<=ce);
      fvgs.push({type:"bullish",top,bot,ce,mid:ce,idx:i,filled,size:top-bot});}
    if(cur.c<cur.o&&n.h<p.l){// Bearish FVG
      const top=p.l,bot=n.h,ce=(top+bot)/2;
      const filled=candles.slice(i+2).some(x=>x.h>=ce);
      fvgs.push({type:"bearish",top,bot,ce,mid:ce,idx:i,filled,size:top-bot});}}
  // Merge consecutive same-type FVGs (join_consecutive logic from joshyattridge)
  const merged=[];
  for(const f of fvgs){
    const last=merged[merged.length-1];
    if(last&&last.type===f.type&&Math.abs(f.idx-last.idx)<=2){
      last.top=Math.max(last.top,f.top);last.bot=Math.min(last.bot,f.bot);
      last.ce=(last.top+last.bot)/2;last.size=last.top-last.bot;
    }else{merged.push({...f});}}
  return merged.slice(-8);}

// ORDER BLOCKS — joshyattridge + "The Sovereign Trader" combined
// "The OB is the LAST OPPOSITE candle before a BOS/CHoCH"
// Mean Threshold (CE) = 50% of OB body = institutional defense line
// OB quality = volume-weighted strength score
function detectOBs(candles,bosChoch){
  const obs=[];
  if(!bosChoch.length){
    // Fallback: basic displacement-based detection
    for(let i=3;i<candles.length-3;i++){
      const a=candles[i],b=candles[i+1];
      const atr=candles.slice(Math.max(0,i-10),i).reduce((s,x)=>s+(x.h-x.l),0)/10||0.1;
      if(Math.abs(b.c-b.o)>atr*1.5){
        if(a.c>a.o&&b.c<b.o)obs.push({type:"bearish",hi:a.h,lo:a.l,mid:(a.h+a.l)/2,ce:(a.h+a.l)/2,idx:i,valid:true,quality:"B",obVolume:(a.v||0)+(b.v||0)});
        if(a.c<a.o&&b.c>b.o)obs.push({type:"bullish",hi:a.h,lo:a.l,mid:(a.h+a.l)/2,ce:(a.h+a.l)/2,idx:i,valid:true,quality:"B",obVolume:(a.v||0)+(b.v||0)});}}
    return obs.slice(-6);}
  // Primary: OB linked to BOS/CHoCH
  for(const bos of bosChoch){
    if(bos.dir==="bullish"){
      for(let i=bos.idx-1;i>=Math.max(0,bos.idx-20);i--){
        const c=candles[i];
        if(c.c<c.o){// last bearish candle before bullish BOS
          const vol=(c.v||1)+((candles[i-1]?.v||0)+(candles[i-2]?.v||0));
          const q=Math.min(c.c,c.o)/(Math.max(c.c,c.o)||1);
          obs.push({type:"bullish",hi:c.h,lo:c.l,mid:(c.h+c.l)/2,ce:(c.h+c.l)/2,idx:i,valid:true,obVolume:vol,quality:q>0.8?"A+":q>0.6?"A":"B"});break;}
    }}else{
      for(let i=bos.idx-1;i>=Math.max(0,bos.idx-20);i--){
        const c=candles[i];
        if(c.c>c.o){// last bullish candle before bearish BOS
          const vol=(c.v||1)+((candles[i-1]?.v||0)+(candles[i-2]?.v||0));
          const q=Math.min(c.c,c.o)/(Math.max(c.c,c.o)||1);
          obs.push({type:"bearish",hi:c.h,lo:c.l,mid:(c.h+c.l)/2,ce:(c.h+c.l)/2,idx:i,valid:true,obVolume:vol,quality:q>0.8?"A+":q>0.6?"A":"B"});break;}}}}
  return obs.slice(-6);}

// LIQUIDITY — joshyattridge exact: equal highs/lows within range_percent
// range_percent=0.003 (0.3%) works well for Gold/Silver
function getLiquidity(candles){
  const swings=detectSwingPoints(candles,5);
  const highs=swings.filter(s=>s.type==="high");
  const lows=swings.filter(s=>s.type==="low");
  const eqH=[],eqL=[];const rng=0.003;
  for(let i=0;i<highs.length;i++){for(let j=i+1;j<highs.length;j++){
    if(Math.abs(highs[i].price-highs[j].price)/highs[i].price<=rng)
      eqH.push({price:(highs[i].price+highs[j].price)/2,idx:highs[j].idx});}}
  for(let i=0;i<lows.length;i++){for(let j=i+1;j<lows.length;j++){
    if(Math.abs(lows[i].price-lows[j].price)/lows[i].price<=rng)
      eqL.push({price:(lows[i].price+lows[j].price)/2,idx:lows[j].idx});}}
  const r=candles.slice(-60),last=candles[candles.length-1];
  const BSL=Math.max(...r.map(x=>x.h)),SSL=Math.min(...r.map(x=>x.l));
  const pH=Math.max(...candles.slice(-11,-1).map(x=>x.h));
  const pL=Math.min(...candles.slice(-11,-1).map(x=>x.l));
  const sweepBSL=last.h>pH&&last.c<pH; // wick above but closed below = BSL swept
  const sweepSSL=last.l<pL&&last.c>pL; // wick below but closed above = SSL swept
  return{BSL:+BSL.toFixed(3),SSL:+SSL.toFixed(3),sweepBSL,sweepSSL,eqH:eqH.slice(-4),eqL:eqL.slice(-4)};}

function getPD(c){const r=c.slice(-60);const maxH=Math.max(...r.map(x=>x.h)),minL=Math.min(...r.map(x=>x.l)),range=maxH-minL||1;const eq=minL+range*0.5;const last=c[c.length-1].c;const pct=Math.round(((last-minL)/range)*100);const inOTE_bull=last>=minL+range*0.62&&last<=minL+range*0.79;const inOTE_bear=last>=maxH-range*0.79&&last<=maxH-range*0.62;const fib236=+(minL+range*0.236).toFixed(3),fib382=+(minL+range*0.382).toFixed(3);const fib618=+(minL+range*0.618).toFixed(3),fib705=+(minL+range*0.705).toFixed(3),fib786=+(minL+range*0.786).toFixed(3);return{zone:last>eq?"PREMIUM":"DISCOUNT",pct,eq:+eq.toFixed(3),inOTE_bull,inOTE_bear,maxH:+maxH.toFixed(3),minL:+minL.toFixed(3),fib236,fib382,fib618,fib705,fib786};}
function getHTF(c){if(c.length<50)return{bias:"NEUTRAL",ma20:0,ma50:0};const ma20=+(c.slice(-20).reduce((s,x)=>s+x.c,0)/20).toFixed(3);const ma50=+(c.slice(-50).reduce((s,x)=>s+x.c,0)/50).toFixed(3);const last=c[c.length-1].c;let sc=0;if(last>ma20)sc++;if(last>ma50)sc++;if(ma20>ma50)sc++;return{bias:sc>=2?"BULLISH":sc<=1?"BEARISH":"NEUTRAL",ma20,ma50};}
function getAsian(c){const a=c.slice(-25,-10);if(!a.length)return{hi:0,lo:0,mid:0};const hi=Math.max(...a.map(x=>x.h)),lo=Math.min(...a.map(x=>x.l));return{hi:+hi.toFixed(3),lo:+lo.toFixed(3),mid:+((hi+lo)/2).toFixed(3)};}
function getMidnightBias(c){const now=Date.now();const dayStart=now-((new Date(now+IST).getUTCHours()*60+new Date(now+IST).getUTCMinutes())*60000);const mc=c.slice().reverse().find(x=>x.t<=dayStart);if(!mc)return{bias:"NEUTRAL",open:null};const last=c[c.length-1].c;return{bias:last>mc.c?"BULLISH_ABOVE_OPEN":"BEARISH_BELOW_OPEN",open:+mc.c.toFixed(3)};}
function detectJudas(candles){if(candles.length<10)return{found:false};const recent=candles.slice(-5);const atr=candles.slice(-20).reduce((s,x)=>s+(x.h-x.l),0)/20||1;const hasBull=recent.some(x=>x.c>x.o&&(x.h-x.l)>atr*1.8);const hasBear=recent.some(x=>x.c<x.o&&(x.h-x.l)>atr*1.8);return{found:hasBull||hasBear,dir:hasBull?"bull_then_bear":"bear_then_bull"};}
function detectAMD(c){if(c.length<30)return{phase:"UNKNOWN"};const r=c.slice(-30);const avgR=r.reduce((s,x)=>s+(x.h-x.l),0)/r.length;const lastR=c.slice(-3).reduce((s,x)=>s+(x.h-x.l),0)/3;const last=c[c.length-1];if(lastR<avgR*0.65)return{phase:"ACCUMULATION",desc:"Range phase — institutions building positions"};if(lastR>avgR*1.9)return{phase:"MANIPULATION",desc:"Spike/Judas swing — liquidity hunt active",dir:last.c>last.o?"BULLISH":"BEARISH"};return{phase:"DISTRIBUTION",desc:"Trend delivery — follow institutional flow",dir:last.c>last.o?"BULLISH":"BEARISH"};}

function analyze(candles,weights,thresh,times){
  if(!candles?.length)return null;
  // ── Use research-backed algorithms ──────────────────────────
  const swings=detectSwingPoints(candles,5);          // joshyattridge exact
  const bosChoch=detectBOSCHoCH(candles,swings);      // trend-aware BOS/CHoCH
  const fvgs=detectFVGs(candles);                      // merged FVG with CE
  const obs=detectOBs(candles,bosChoch);               // OB linked to BOS
  const liq=getLiquidity(candles);                     // equal highs/lows liquidity
  const pd=getPD(candles),htf=getHTF(candles);
  const asian=getAsian(candles),mb=getMidnightBias(candles);
  const amd=detectAMD(candles),judas=detectJudas(candles);
  const structs=bosChoch; // expose for chart
  const last=candles[candles.length-1];
  const atr=candles.slice(-14).reduce((s,c)=>s+(c.h-c.l),0)/14||0.1;
  
  // ── 25-POINT CONFLUENCE SCORING (Agent F model) ─────────────
  let bull=0,bear=0;const fr={bull:[],bear:[]};
  const fire=(k,d)=>{const w=weights[k]?.weight||10;if(d==="bull"){bull+=w;fr.bull.push(k);}else{bear+=w;fr.bear.push(k);}};

  // 1. HTF MA Bias (2pts)
  if(htf.bias==="BULLISH")fire("htfBias","bull");else if(htf.bias==="BEARISH")fire("htfBias","bear");
  // 2. Premium/Discount Zone (1pt)
  if(pd.zone==="DISCOUNT")fire("premDisc","bull");else fire("premDisc","bear");
  // 3. OTE 62-79% Sovereign Setup (2pts) 
  if(pd.inOTE_bull)fire("ote","bull");if(pd.inOTE_bear)fire("ote","bear");
  // 4. Midnight Open Bias (1pt)
  if(mb.bias==="BULLISH_ABOVE_OPEN")fire("midnightBias","bull");else if(mb.bias==="BEARISH_BELOW_OPEN")fire("midnightBias","bear");
  // 5. Order Blocks — OB linked to BOS (3-4pts based on quality)
  const bOB=obs.find(o=>o.type==="bullish"&&last.c>=o.lo&&last.c<=o.hi*1.003);
  const beOB=obs.find(o=>o.type==="bearish"&&last.c<=o.hi&&last.c>=o.lo*0.997);
  if(bOB){fire("bullOB","bull");} if(beOB){fire("bearOB","bear");}
  // 6. FVG at CE level — strong if price within 50% fill (1-3pts)
  const bFVG=fvgs.find(f=>f.type==="bullish"&&!f.filled&&last.c>=f.bot&&last.c<=f.top);
  const beFVG=fvgs.find(f=>f.type==="bearish"&&!f.filled&&last.c>=f.bot&&last.c<=f.top);
  if(bFVG){fire("bullFVG","bull");} if(beFVG){fire("bearFVG","bear");}
  // 7. Liquidity Sweeps — BSL/SSL swept = institutional signal (2pts)
  if(liq.sweepSSL){fire("liqSweepSSL","bull");}
  if(liq.sweepBSL){fire("liqSweepBSL","bear");}
  // 8. BOS/CHoCH — trend-aware from swing points (2pts each)
  const lB=[...bosChoch].reverse().find(s=>s.type==="BOS");
  const lC=[...bosChoch].reverse().find(s=>s.type==="CHoCH");
  if(lB?.dir==="bullish")fire("bosBull","bull");if(lB?.dir==="bearish")fire("bosBear","bear");
  if(lC?.dir==="bullish")fire("chochBull","bull");if(lC?.dir==="bearish")fire("chochBear","bear");
  // 9. Displacement >2x ATR (2pts)
  const disp=candles.slice(-5).find(x=>Math.abs(x.c-x.o)>atr*2);
  if(disp){if(disp.c>disp.o)fire("displacement","bull");else fire("displacement","bear");}
  // 10. Asian Range Break (1pt)
  if(last.c>asian.hi&&asian.hi>0)fire("asianBreak","bull");else if(last.c<asian.lo&&asian.lo>0)fire("asianBreak","bear");
  // 11. Judas Swing at session open (1pt)
  if(judas.found){if(judas.dir==="bull_then_bear")fire("judas","bear");else fire("judas","bull");}
  // 12. AMD phase alignment (1pt)
  if(amd.phase==="DISTRIBUTION"){if(amd.dir==="BULLISH")fire("amd","bull");else if(amd.dir==="BEARISH")fire("amd","bear");}

  const total=bull+bear||1,dir=bull>=bear?"LONG":"SHORT";
  const conf=Math.min(96,Math.max(38,Math.round(Math.max(bull,bear)/total*100)));
  
  // ── Entry/SL/TP calculation ──────────────────────────────────
  // If OB found, use OB CE as entry (higher precision per ICT)
  const entryOB=dir==="LONG"?bOB:beOB;
  const entryFVG=dir==="LONG"?bFVG:beFVG;
  const rawEntry=last.c;
  const sl=dir==="LONG"?+(rawEntry-atr*thresh.slMult).toFixed(3):+(rawEntry+atr*thresh.slMult).toFixed(3);
  const tp1=dir==="LONG"?+(rawEntry+atr*thresh.tp1Mult).toFixed(3):+(rawEntry-atr*thresh.tp1Mult).toFixed(3);
  const tp2=dir==="LONG"?+(rawEntry+atr*thresh.tp2Mult).toFixed(3):+(rawEntry-atr*thresh.tp2Mult).toFixed(3);
  const tp3=dir==="LONG"?+(rawEntry+atr*thresh.tp2Mult*1.6).toFixed(3):+(rawEntry-atr*thresh.tp2Mult*1.6).toFixed(3);
  const rr=+(Math.abs(tp1-rawEntry)/Math.abs(sl-rawEntry)).toFixed(2);
  const slPips=+(Math.abs(rawEntry-sl)*100).toFixed(0);
  const tp1Pips=+(Math.abs(tp1-rawEntry)*100).toFixed(0);

  const RL={htfBias:"HTF MA Bias",premDisc:"Premium/Discount",ote:"OTE 62–79%",midnightBias:"Midnight Open",bullOB:"Bullish OB",bearOB:"Bearish OB",bullFVG:"Bullish FVG (CE)",bearFVG:"Bearish FVG (CE)",liqSweepBSL:"BSL Swept",liqSweepSSL:"SSL Swept",bosBull:"BOS Bullish",bosBear:"BOS Bearish",chochBull:"CHoCH Bullish",chochBear:"CHoCH Bearish",displacement:"Displacement",asianBreak:"Asian Range Break",judas:"Judas Swing",amd:"AMD Phase"};
  const DESCS={
    htfBias:`MA50=${htf.ma50} — ${htf.bias} trend`,
    premDisc:`${pd.zone} at ${pd.pct}% of range — ${pd.zone==="DISCOUNT"?"buy zone":"sell zone"}`,
    ote:`OTE ${pd.pct}% — Sovereign Setup retracement (62–79% per The Sovereign Trader)`,
    midnightBias:`${mb.bias==="BULLISH_ABOVE_OPEN"?"Above":"Below"} midnight open ${mb.open} — ${mb.bias==="BULLISH_ABOVE_OPEN"?"bullish":"bearish"} daily bias`,
    bullOB:`Bullish OB [${bOB?.quality||""}] at ${bOB?.lo?.toFixed(3)}–${bOB?.hi?.toFixed(3)} | 50% CE: ${bOB?.ce?.toFixed(3)}`,
    bearOB:`Bearish OB [${beOB?.quality||""}] at ${beOB?.lo?.toFixed(3)}–${beOB?.hi?.toFixed(3)} | 50% CE: ${beOB?.ce?.toFixed(3)}`,
    bullFVG:`Bullish FVG gap ${bFVG?.bot?.toFixed(3)}–${bFVG?.top?.toFixed(3)} | CE (50%): ${bFVG?.ce?.toFixed(3)}`,
    bearFVG:`Bearish FVG gap ${beFVG?.bot?.toFixed(3)}–${beFVG?.top?.toFixed(3)} | CE (50%): ${beFVG?.ce?.toFixed(3)}`,
    liqSweepBSL:"BSL swept above equal highs — smart money shorting into retail buy stops",
    liqSweepSSL:"SSL swept below equal lows — smart money buying retail sell stops",
    bosBull:`Bullish BOS at ${lB?.price?.toFixed(3)} — trend continuation confirmed`,
    bosBear:`Bearish BOS at ${lB?.price?.toFixed(3)} — trend continuation confirmed`,
    chochBull:`CHoCH bullish at ${lC?.price?.toFixed(3)} — FIRST reversal signal (highest priority)`,
    chochBear:`CHoCH bearish at ${lC?.price?.toFixed(3)} — FIRST reversal signal (highest priority)`,
    displacement:"Candle >2×ATR — institutional order flow | displacement confirmed",
    asianBreak:`${last.c>asian.hi?"Above Asian Hi":"Below Asian Lo"} (${last.c>asian.hi?asian.hi:asian.lo}) — session directional break`,
    judas:"Judas swing at session open — false move to sweep liquidity before true direction",
    amd:`AMD ${amd.phase}: ${amd.desc}`};
  const reasons=fr[dir==="LONG"?"bull":"bear"].map(k=>({key:k,label:RL[k],desc:DESCS[k]||""}));
  return{dir,conf,reasons,firedRules:fr,entry:rawEntry,sl,tp1,tp2,tp3,rr,atr:+atr.toFixed(3),slPips,tp1Pips,obs,fvgs,structs,liq,pd,htf,asian,mb,amd,judas,candle:last,entryOB,entryFVG,swings:swings.slice(-20)};}

function learnFromBT(prev,trades,winRate,total,sym){
  const brain=JSON.parse(JSON.stringify(prev));const log=[];
  if(total===0){log.push("No trades found. Chart data loaded but no ICT setups triggered.");brain.generations++;brain.learningLog=[{gen:brain.generations,sym,date:istStr(nowIST()),winRate:0,totalTrades:0,changes:log},...(brain.learningLog||[])].slice(0,30);return{brain,log};}
  if(winRate<50&&brain.thresholds.minConf<72){const o=brain.thresholds.minConf;brain.thresholds.minConf=Math.min(72,o+2);log.push(`📈 WR ${winRate}%<50% → raised min confidence: ${o}→${brain.thresholds.minConf}%`);}
  else if(winRate>72&&brain.thresholds.minConf>38){const o=brain.thresholds.minConf;brain.thresholds.minConf=Math.max(38,o-2);log.push(`✅ WR ${winRate}%>72% → relaxed confidence: ${o}→${brain.thresholds.minConf}%`);}
  else log.push(`⚙️ Confidence stable at ${brain.thresholds.minConf}%`);
  const rs={};Object.keys(brain.weights).forEach(k=>{rs[k]={w:0,l:0};});
  trades.forEach(t=>{(t.firedRules?.[t.dir==="LONG"?"bull":"bear"]||[]).forEach(rule=>{if(!rs[rule])return;if(t.outcome==="WIN"){rs[rule].w++;brain.weights[rule].wins++;}else{rs[rule].l++;brain.weights[rule].losses++;}});});
  let changed=0;
  Object.entries(rs).forEach(([k,s])=>{const rt=s.w+s.l;if(rt<2)return;const wr=s.w/rt,old=brain.weights[k].weight;let nw=old;if(wr>0.72)nw=Math.min(40,Math.round(old*1.15));else if(wr>0.62)nw=Math.min(36,Math.round(old*1.08));else if(wr<0.38)nw=Math.max(4,Math.round(old*0.82));else if(wr<0.50)nw=Math.max(6,Math.round(old*0.92));if(nw!==old){brain.weights[k].weight=nw;log.push(`${nw>old?"↑":"↓"} "${brain.weights[k].label}" ${old}→${nw} (${Math.round(wr*100)}% WR)`);changed++;}});
  if(!changed)log.push("⚖️ All weights stable");
  if(!brain.kzPerf[sym])brain.kzPerf[sym]={asian:{w:0,l:0},london:{w:0,l:0},overlap:{w:0,l:0},ny:{w:0,l:0},sb:{w:0,l:0}};
  trades.forEach(t=>{if(t.kzId&&t.kzId!=="none"&&brain.kzPerf[sym]?.[t.kzId]){if(t.outcome==="WIN")brain.kzPerf[sym][t.kzId].w++;else brain.kzPerf[sym][t.kzId].l++;}});
  brain.generations++;brain.totalTrades+=total;brain.overallWR=winRate;
  brain.learningLog=[{gen:brain.generations,sym,date:istStr(nowIST()),winRate,totalTrades:total,changes:log},...(brain.learningLog||[])].slice(0,30);
  return{brain,log};}
function runBacktest(candles,brain,times,config={}){
  const{slMult=brain.thresholds.slMult,tp1Mult=brain.thresholds.tp1Mult,minRR=0.8,maxSlPips=50000,lookback=40,holdBars=8,strategyRules=null}=config;
  const thresh={...brain.thresholds,slMult,tp1Mult};
  const trades=[];
  for(let i=Math.max(lookback,50);i<candles.length-holdBars;i++){
    const a=analyze(candles.slice(i-lookback,i),brain.weights,thresh,times);
    if(!a||a.rr<minRR)continue;
    const slPips=Math.abs(a.entry-a.sl)*100;
    if(slPips>maxSlPips)continue;
    if(strategyRules){const fired=a.firedRules[a.dir==="LONG"?"bull":"bear"];if(!strategyRules.some(r=>fired.includes(r)))continue;}
    const{entry,sl,tp1}=a;
    const ist2=new Date(candles[i].t+IST);
    let kzId="none";
    if(inWin(ist2,times.asian.s,times.asian.e))kzId="asian";
    else if(inWin(ist2,times.overlap.s,times.overlap.e))kzId="overlap";
    else if(inWin(ist2,times.london.s,times.london.e))kzId="london";
    else if(inWin(ist2,times.ny.s,times.ny.e))kzId="ny";
    else if(inWin(ist2,times.sb2.s,times.sb2.e))kzId="sb";
    let outcome=null,pnl=0;
    for(let j=i;j<Math.min(i+holdBars,candles.length);j++){
      if(a.dir==="LONG"){if(candles[j].l<=sl){outcome="LOSS";pnl=+(sl-entry).toFixed(3);break;}if(candles[j].h>=tp1){outcome="WIN";pnl=+(tp1-entry).toFixed(3);break;}}
      else{if(candles[j].h>=sl){outcome="LOSS";pnl=+(entry-sl).toFixed(3);break;}if(candles[j].l<=tp1){outcome="WIN";pnl=+(entry-tp1).toFixed(3);break;}}
    }
    if(outcome)trades.push({...a,outcome,pnl,kzId,slPips:+slPips.toFixed(0),tp1Pips:+(Math.abs(tp1-entry)*100).toFixed(0),ts:candles[i].t});}
  const wins=trades.filter(t=>t.outcome==="WIN").length,losses=trades.filter(t=>t.outcome==="LOSS").length,total=wins+losses;
  const winRate=total?Math.round(wins/total*100):0;
  const pf=losses>0?+(trades.filter(t=>t.pnl>0).reduce((s,t)=>s+t.pnl,0)/Math.abs(trades.filter(t=>t.pnl<0).reduce((s,t)=>s+t.pnl,0))).toFixed(2):wins>0?99:0;
  return{trades:trades.slice(-50),wins,losses,total,winRate,profitFactor:pf,avgRR:total?+(trades.reduce((s,t)=>s+t.rr,0)/total).toFixed(2):0,avgSlPips:total?+(trades.reduce((s,t)=>s+t.slPips,0)/total).toFixed(0):0};}
// ── POSITION CALCULATOR ─────────────────────────────────────
function calcPos(capital,riskPct,entry,sl,tp1,tp2){
  if(!capital||!riskPct||!entry||!sl)return null;
  const riskAmt=capital*(riskPct/100);
  const slDist=Math.abs(entry-sl);const tp1Dist=Math.abs(tp1-entry);const tp2Dist=Math.abs(tp2-entry);
  const slPips=+(slDist*100).toFixed(1);const tp1Pips=+(tp1Dist*100).toFixed(1);
  const lotSize=+(riskAmt/(slDist*entry*0.1)).toFixed(2);
  const maxLoss=+riskAmt.toFixed(2);
  const maxProfit1=+(riskAmt*(tp1Dist/slDist)).toFixed(2);
  const maxProfit2=+(riskAmt*(tp2Dist/slDist)).toFixed(2);
  const rr1=+(tp1Dist/slDist).toFixed(2);const rr2=+(tp2Dist/slDist).toFixed(2);
  return{riskAmt,lotSize,slPips,tp1Pips,maxLoss,maxProfit1,maxProfit2,rr1,rr2,maxDD:+(riskAmt*3).toFixed(2),ddPct:+(riskPct*3).toFixed(1)};}
function useClock(){const[t,setT]=useState(nowIST());useEffect(()=>{const id=setInterval(()=>setT(nowIST()),1000);return()=>clearInterval(id);},[]);return t;}
// ═══════════════════════════════════════════════════════════════
//  LOGIN PAGE
// ═══════════════════════════════════════════════════════════════
function LoginPage({onLogin}){
  const[email,setEmail]=useState("");const[pass,setPass]=useState("");const[err,setErr]=useState("");const[loading,setLoading]=useState(false);
  const handleLogin=async()=>{
    if(!email.trim()||!pass.trim()){setErr("Please enter email and password");return;}
    setLoading(true);setErr("");
    await new Promise(r=>setTimeout(r,800));
    const stored=ls.get(SK.user);
    if(!stored){ls.set(SK.user,{email:email.trim(),pass:pass});onLogin(email.trim());}
    else if(stored.email===email.trim()&&stored.pass===pass){onLogin(email.trim());}
    else{setErr("Invalid credentials");setLoading(false);}};
  const handleRegister=()=>{if(!email.trim()||!pass.trim()){setErr("Please fill both fields");return;}ls.set(SK.user,{email:email.trim(),pass});ls.setStr(SK.done,"1");onLogin(email.trim());};
  return(
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0F172A 0%,#1E293B 50%,#0F172A 100%)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter','Segoe UI',sans-serif"}}>
      <div style={{width:"420px",background:"rgba(255,255,255,0.03)",backdropFilter:"blur(20px)",borderRadius:"20px",padding:"40px",border:"1px solid rgba(255,255,255,0.08)",boxShadow:"0 25px 50px rgba(0,0,0,0.5)"}}>
        <div style={{textAlign:"center",marginBottom:"32px"}}>
          <div style={{width:"64px",height:"64px",background:"linear-gradient(135deg,#F59E0B,#D97706)",borderRadius:"16px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"28px",margin:"0 auto 16px",boxShadow:"0 8px 24px rgba(245,158,11,0.4)"}}>🥇</div>
          <div style={{color:"white",fontWeight:"800",fontSize:"24px",letterSpacing:"-0.5px"}}>ICT Sovereign Trader</div>
          <div style={{color:"#64748B",fontSize:"13px",marginTop:"4px"}}>Professional Smart Money Platform</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:"12px"}}>
          <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email address" type="email"
            style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"10px",padding:"13px 16px",color:"white",fontSize:"14px",outline:"none",fontFamily:"inherit"}}
            onKeyDown={e=>e.key==="Enter"&&handleLogin()}/>
          <input value={pass} onChange={e=>setPass(e.target.value)} placeholder="Password" type="password"
            style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"10px",padding:"13px 16px",color:"white",fontSize:"14px",outline:"none",fontFamily:"inherit"}}
            onKeyDown={e=>e.key==="Enter"&&handleLogin()}/>
          {err&&<div style={{color:"#EF4444",fontSize:"13px",textAlign:"center"}}>{err}</div>}
          <button onClick={handleLogin} disabled={loading}
            style={{background:"linear-gradient(135deg,#1D4ED8,#7C3AED)",color:"white",border:"none",borderRadius:"10px",padding:"13px",fontSize:"15px",fontWeight:"700",cursor:"pointer",marginTop:"4px"}}>
            {loading?"Signing in...":"Sign In"}
          </button>
          <button onClick={handleRegister}
            style={{background:"transparent",border:"1px solid rgba(255,255,255,0.15)",color:"#94A3B8",borderRadius:"10px",padding:"11px",fontSize:"14px",cursor:"pointer"}}>
            Create Account
          </button>
        </div>
        <div style={{marginTop:"24px",padding:"14px",background:"rgba(245,158,11,0.05)",borderRadius:"10px",border:"1px solid rgba(245,158,11,0.15)"}}>
          <div style={{color:"#F59E0B",fontSize:"12px",fontWeight:"600",marginBottom:"4px"}}>📚 Based on: The Sovereign Trader</div>
          <div style={{color:"#64748B",fontSize:"12px"}}>ICT · Smart Money Concepts · Institutional Order Flow</div>
        </div>
      </div>
    </div>);
}
// ═══════════════════════════════════════════════════════════════
//  SETTINGS MODAL
// ═══════════════════════════════════════════════════════════════
function SettingsModal({onClose,onSave,times}){
  const[tdKey,setTdKey]=useState(ls.str(SK.key));
  const[fhKey,setFhKey]=useState(ls.str(SK.fhkey));
  const[aiKey,setAiKey]=useState(ls.str(SK.aikey)||ENV_AI);
  const[testing,setTesting]=useState(false);const[result,setResult]=useState(null);
  const doTest=async()=>{setTesting(true);setResult(null);const r=await testConn(fhKey.trim(),tdKey.trim());setResult(r);setTesting(false);};
  const doSave=()=>{ls.setStr(SK.key,tdKey.trim());ls.setStr(SK.fhkey,fhKey.trim());ls.setStr(SK.aikey,aiKey.trim());ls.setStr(SK.done,"1");onSave(tdKey.trim(),fhKey.trim(),aiKey.trim());onClose();};
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',sans-serif"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"white",borderRadius:"16px",padding:"28px",maxWidth:"520px",width:"90%",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"20px"}}>
          <div style={{fontWeight:"800",fontSize:"18px",color:"#1E293B"}}>⚙️ API Keys & Settings</div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:"20px",cursor:"pointer",color:"#94A3B8"}}>✕</button>
        </div>
        <div style={{background:"#F0FDF4",border:"1px solid #BBF7D0",borderRadius:"8px",padding:"10px 14px",marginBottom:"16px",fontSize:"13px",color:"#16A34A",fontWeight:"600"}}>
          🔒 Keys saved locally in your browser. Never uploaded anywhere. Permanent once saved.
        </div>
        {[{label:"⚡ Finnhub API Key",hint:"Gold + Silver — instant prices — free at finnhub.io",val:fhKey,set:setFhKey,color:"#16A34A"},{label:"📊 Twelve Data Key",hint:"Crude Oil + Natural Gas — free at twelvedata.com",val:tdKey,set:setTdKey,color:"#D97706"},{label:"🤖 Anthropic AI Key",hint:"ICT AI Analyst chat — from console.anthropic.com",val:aiKey,set:setAiKey,color:"#7C3AED"}].map(f=>(
          <div key={f.label} style={{marginBottom:"12px"}}>
            <label style={{display:"block",fontSize:"13px",fontWeight:"700",color:"#374151",marginBottom:"4px"}}>{f.label}<span style={{fontWeight:"400",color:"#94A3B8",marginLeft:"6px"}}>({f.hint})</span></label>
            <input value={f.val} onChange={e=>f.set(e.target.value)} type="password" placeholder="Paste key here..."
              style={{width:"100%",background:"#F8FAFC",border:`2px solid #E2E8F0`,borderRadius:"8px",padding:"10px 12px",fontSize:"13px",fontFamily:"monospace",outline:"none",boxSizing:"border-box",color:"#1E293B"}}
              onFocus={e=>e.target.style.borderColor=f.color} onBlur={e=>e.target.style.borderColor="#E2E8F0"}/>
          </div>
        ))}
        {result&&<div style={{background:result.ok?"#F0FDF4":"#FEF2F2",border:`1px solid ${result.ok?"#86EFAC":"#FCA5A5"}`,borderRadius:"8px",padding:"10px",marginBottom:"12px",color:result.ok?"#16A34A":"#DC2626",fontSize:"13px",fontWeight:"600"}}>{result.msg}</div>}
        <div style={{display:"flex",gap:"8px"}}>
          <button onClick={doTest} disabled={testing||(!fhKey.trim()&&!tdKey.trim())} style={{flex:1,background:"#F1F5F9",border:"1px solid #E2E8F0",borderRadius:"8px",padding:"10px",fontSize:"13px",fontWeight:"600",cursor:"pointer",color:"#374151"}}>
            {testing?"Testing...":"🔌 Test Connection"}
          </button>
          <button onClick={doSave} style={{flex:2,background:"linear-gradient(135deg,#1D4ED8,#7C3AED)",color:"white",border:"none",borderRadius:"8px",padding:"10px",fontSize:"14px",fontWeight:"700",cursor:"pointer"}}>
            ✅ Save Keys Permanently
          </button>
        </div>
      </div>
    </div>);
}
// ═══════════════════════════════════════════════════════════════
//  PROFESSIONAL CHART COMPONENT
// ═══════════════════════════════════════════════════════════════
function Chart({data,analysis,tfLabel,chartTF,onTFChange,allTFs,fullscreen,onToggleFS}){
  const[chartH,setChartH]=useState(460);
  const[showFVG,setShowFVG]=useState(true);const[showOB,setShowOB]=useState(true);
  const[showFib,setShowFib]=useState(false);const[showLiq,setShowLiq]=useState(true);
  const[showStr,setShowStr]=useState(true);const[showMA,setShowMA]=useState(true);
  const[showAsian,setShowAsian]=useState(true);const[nCandles,setNCandles]=useState(60);
  const isDrag=useRef(false);const dragY=useRef(0);const dragH0=useRef(0);
  const recent=useMemo(()=>data?data.slice(-nCandles):[],[data,nCandles]);
  useEffect(()=>{
    const onMove=e=>{if(!isDrag.current)return;setChartH(Math.max(280,dragH0.current+(e.clientY-dragY.current)));};
    const onUp=()=>{isDrag.current=false;};
    document.addEventListener("mousemove",onMove);document.addEventListener("mouseup",onUp);
    return()=>{document.removeEventListener("mousemove",onMove);document.removeEventListener("mouseup",onUp);};
  },[]);
  const effH=fullscreen?window.innerHeight-50:chartH;
  if(!data?.length)return(
    <div style={{height:`${effH}px`,display:"flex",alignItems:"center",justifyContent:"center",background:"#0D1117",borderRadius:"8px",border:"1px solid #21262D",color:"#8B949E",flexDirection:"column",gap:"8px"}}>
      <div style={{fontSize:"32px"}}>📊</div><div style={{fontSize:"14px"}}>Loading {tfLabel}...</div>
    </div>);
  const maxP=Math.max(...recent.map(c=>c.h)),minP=Math.min(...recent.map(c=>c.l)),range=maxP-minP||1;
  // Full width SVG — no fixed W, use 100% viewBox with dynamic calculation
  const W=1200,pL=70,pR=72,pT=12,pB=52;
  const cH=effH-110;// chart body height
  const cW=W-pL-pR;
  const cw=Math.max(cW/recent.length-0.8,2);
  const py=v=>pT+cH-((v-minP)/range)*cH;
  const px=i=>pL+i*(cW/recent.length)+cw/2;
  const priceGrid=Array.from({length:7},(_,i)=>minP+(range/6)*i);
  // Color theme — TradingView dark
  const BG="#0D1117",GRID="#161B22",TEXT="#8B949E",BULL="#26A69A",BEAR="#EF5350";
  return(
    <div style={{background:BG,borderRadius:"8px",border:"1px solid #21262D",overflow:"hidden",
      position:fullscreen?"fixed":"relative",inset:fullscreen?0:undefined,zIndex:fullscreen?1000:undefined,
      width:"100%",boxSizing:"border-box"}}>
      {/* Toolbar — TradingView style */}
      <div style={{padding:"6px 12px",borderBottom:"1px solid #21262D",display:"flex",alignItems:"center",gap:"6px",background:"#161B22",flexWrap:"wrap"}}>
        {/* TF buttons */}
        <div style={{display:"flex",gap:"2px"}}>
          {(allTFs||["1m","5m","15m","30m","1H","4H","1D"]).map(tf=>(
            <button key={tf} onClick={()=>onTFChange(tf)}
              style={{padding:"3px 9px",borderRadius:"4px",border:"none",
                background:chartTF===tf?"#1D4ED8":"transparent",
                color:chartTF===tf?"white":"#8B949E",
                fontSize:"12px",fontWeight:chartTF===tf?"700":"400",cursor:"pointer",fontFamily:"monospace"}}>
              {tf}
            </button>))}
        </div>
        <div style={{width:"1px",height:"18px",background:"#21262D",margin:"0 4px"}}/>
        {/* Candle count */}
        <select value={nCandles} onChange={e=>setNCandles(Number(e.target.value))}
          style={{background:"#21262D",border:"1px solid #30363D",borderRadius:"4px",padding:"3px 7px",fontSize:"12px",color:"#C9D1D9",cursor:"pointer",outline:"none"}}>
          {[20,30,50,60,80,100,150,200].map(n=><option key={n} value={n}>{n}</option>)}
        </select>
        <div style={{width:"1px",height:"18px",background:"#21262D",margin:"0 4px"}}/>
        {/* Layer toggles */}
        {[["FVG","#26A69A",showFVG,setShowFVG],["OB","#3B82F6",showOB,setShowOB],["LIQ","#EF5350",showLiq,setShowLiq],
          ["STR","#A78BFA",showStr,setShowStr],["MA","#F59E0B",showMA,setShowMA],
          ["FIB","#D97706",showFib,setShowFib],["ASIAN","#7C3AED",showAsian,setShowAsian]].map(([lbl,color,val,setter])=>(
          <button key={lbl} onClick={()=>setter(!val)}
            style={{padding:"2px 8px",borderRadius:"3px",border:`1px solid ${val?color:"#30363D"}`,
              background:val?`${color}20`:"transparent",color:val?color:"#484F58",
              fontSize:"11px",fontWeight:"600",cursor:"pointer"}}>
            {lbl}
          </button>))}
        {/* Signal badges */}
        {analysis&&<div style={{marginLeft:"auto",display:"flex",gap:"8px",alignItems:"center"}}>
          <span style={{background:analysis.dir==="LONG"?"rgba(38,166,154,0.2)":"rgba(239,83,80,0.2)",
            color:analysis.dir==="LONG"?"#26A69A":"#EF5350",padding:"2px 10px",borderRadius:"3px",fontSize:"12px",fontWeight:"700",border:`1px solid ${analysis.dir==="LONG"?"#26A69A":"#EF5350"}33`}}>
            {analysis.dir==="LONG"?"▲ LONG":"▼ SHORT"} {analysis.conf}%
          </span>
          {[{k:"entry",c:"#3B82F6"},{k:"sl",c:"#EF5350"},{k:"tp1",c:"#26A69A"}].map(x=>(
            <span key={x.k} style={{color:x.c,fontSize:"11px",fontFamily:"monospace"}}>{x.k.toUpperCase()}:{analysis[x.k]}</span>))}
        </div>}
        <button onClick={onToggleFS}
          style={{background:"transparent",border:"1px solid #30363D",borderRadius:"4px",padding:"3px 8px",fontSize:"12px",cursor:"pointer",color:"#8B949E",marginLeft:analysis?"0":"auto"}}>
          {fullscreen?"⊠":"⊞"}
        </button>
      </div>

      {/* Chart SVG — stretches full width */}
      <div style={{width:"100%",height:`${effH-42}px`,overflow:"hidden",background:BG}}>
        <svg width="100%" height="100%" viewBox={`0 0 ${W} ${cH+pT+pB}`} preserveAspectRatio="none"
          style={{display:"block"}}>
          {/* Background */}
          <rect width={W} height={cH+pT+pB} fill={BG}/>
          {/* Grid lines */}
          {priceGrid.map((p,i)=>(
            <g key={i}>
              <line x1={pL} y1={py(p)} x2={W-pR} y2={py(p)} stroke={GRID} strokeWidth="1"/>
              <text x={pL-6} y={py(p)+4} textAnchor="end" fill={TEXT} fontSize="10" fontFamily="'Roboto Mono',monospace">
                {p>100?p.toFixed(2):p.toFixed(3)}
              </text>
            </g>))}

          {/* MA lines */}
          {showMA&&analysis?.htf?.ma20>0&&(()=>{const n=Math.min(20,recent.length);const pts=recent.slice(-n).map((c,i)=>`${px(recent.length-n+i)},${py(c.c)}`).join(" ");return<polyline points={pts} fill="none" stroke="#F59E0B" strokeWidth="1.3" opacity="0.8"/>;})()} 
          {showMA&&analysis?.htf?.ma50>0&&(()=>{const n=Math.min(50,recent.length);const pts=recent.slice(-n).map((c,i)=>`${px(recent.length-n+i)},${py(c.c)}`).join(" ");return<polyline points={pts} fill="none" stroke="#6366F1" strokeWidth="1.3" opacity="0.8"/>;})()} 

          {/* FVGs with CE level */}
          {showFVG&&analysis?.fvgs?.filter(f=>!f.filled).slice(-5).map((f,i)=>(
            <g key={`fvg${i}`}>
              <rect x={pL} y={py(f.top)} width={cW} height={Math.max(Math.abs(py(f.bot)-py(f.top)),1)}
                fill={f.type==="bullish"?"rgba(38,166,154,0.12)":"rgba(239,83,80,0.12)"}
                stroke={f.type==="bullish"?"#26A69A44":"#EF535044"} strokeWidth="1"/>
              <line x1={pL} y1={py(f.ce)} x2={W-pR} y2={py(f.ce)}
                stroke={f.type==="bullish"?"#26A69A":"#EF5350"} strokeWidth="0.8" strokeDasharray="3,4" opacity="0.7"/>
              <rect x={pL+4} y={py(f.top)+2} width={28} height={12} fill={f.type==="bullish"?"#26A69A22":"#EF535022"} rx="2"/>
              <text x={pL+18} y={py(f.top)+11} textAnchor="middle" fill={f.type==="bullish"?"#26A69A":"#EF5350"} fontSize="9" fontWeight="700">FVG</text>
              <text x={W-pR+2} y={py(f.ce)-2} fill={f.type==="bullish"?"#26A69A":"#EF5350"} fontSize="8.5">CE</text>
            </g>))}

          {/* OBs with 50% mean threshold */}
          {showOB&&analysis?.obs?.slice(-4).map((ob,i)=>(
            <g key={`ob${i}`}>
              <rect x={pL} y={py(ob.hi)} width={cW} height={Math.max(Math.abs(py(ob.lo)-py(ob.hi)),1)}
                fill={ob.type==="bullish"?"rgba(59,130,246,0.1)":"rgba(239,83,80,0.1)"}
                stroke={ob.type==="bullish"?"#3B82F644":"#EF535044"} strokeWidth="1"/>
              <line x1={pL} y1={py(ob.ce)} x2={W-pR} y2={py(ob.ce)}
                stroke={ob.type==="bullish"?"#3B82F6":"#EF5350"} strokeWidth="0.8" strokeDasharray="3,4" opacity="0.6"/>
              <text x={W-pR+3} y={py(ob.hi)+11} fill={ob.type==="bullish"?"#3B82F6":"#EF5350"} fontSize="9" fontWeight="700">OB {ob.quality||""}</text>
              <text x={W-pR+3} y={py(ob.ce)-2} fill={ob.type==="bullish"?"#3B82F6":"#EF5350"} fontSize="8">50%</text>
            </g>))}

          {/* Fibonacci */}
          {showFib&&analysis?.pd&&[
            {v:analysis.pd.fib236,l:"23.6%",c:"#4B5563"},{v:analysis.pd.fib382,l:"38.2%",c:"#F59E0B"},
            {v:analysis.pd.eq,    l:"50% EQ",c:"#6B7280"},{v:analysis.pd.fib618,l:"61.8%",c:"#3B82F6"},
            {v:analysis.pd.fib705,l:"70.5% OTE",c:"#A78BFA"},{v:analysis.pd.fib786,l:"78.6% OTE",c:"#A78BFA"}
          ].map((f,i)=>(
            <g key={`fib${i}`}>
              <line x1={pL} y1={py(f.v)} x2={W-pR} y2={py(f.v)} stroke={f.c} strokeWidth="0.7" strokeDasharray="2,6" opacity="0.6"/>
              <text x={pL+4} y={py(f.v)-2} fill={f.c} fontSize="8.5" fontFamily="monospace" opacity="0.8">{f.l}</text>
            </g>))}

          {/* Liquidity levels */}
          {showLiq&&analysis?.liq&&<>
            <line x1={pL} y1={py(analysis.liq.BSL)} x2={W-pR} y2={py(analysis.liq.BSL)} stroke="#EF5350" strokeWidth="1.2" strokeDasharray="6,3" opacity="0.8"/>
            <rect x={W-pR+2} y={py(analysis.liq.BSL)-9} width={30} height={14} fill="#EF535033" rx="3" stroke="#EF5350" strokeWidth="0.5"/>
            <text x={W-pR+17} y={py(analysis.liq.BSL)+2} textAnchor="middle" fill="#EF5350" fontSize="9" fontWeight="700">BSL</text>
            <line x1={pL} y1={py(analysis.liq.SSL)} x2={W-pR} y2={py(analysis.liq.SSL)} stroke="#26A69A" strokeWidth="1.2" strokeDasharray="6,3" opacity="0.8"/>
            <rect x={W-pR+2} y={py(analysis.liq.SSL)-9} width={30} height={14} fill="#26A69A33" rx="3" stroke="#26A69A" strokeWidth="0.5"/>
            <text x={W-pR+17} y={py(analysis.liq.SSL)+2} textAnchor="middle" fill="#26A69A" fontSize="9" fontWeight="700">SSL</text>
          </>}

          {/* Structure BOS/CHoCH labels */}
          {showStr&&analysis?.structs?.slice(-6).map((s,i)=>{
            const ci=recent.length-(analysis.structs.length-i);if(ci<0||ci>=recent.length)return null;
            const x=px(ci);
            return(<g key={`str${i}`}>
              <line x1={x} y1={py(s.price)-8} x2={x} y2={py(s.price)+8} stroke={s.dir==="bullish"?"#26A69A":"#EF5350"} strokeWidth="1" opacity="0.5"/>
              <rect x={x-18} y={py(s.price)-(s.type==="BOS"?9:11)} width={36} height={14} rx="3"
                fill={s.type==="BOS"?"#1D4ED8CC":"#F59E0BCC"}/>
              <text x={x} y={py(s.price)-(s.type==="BOS"?0:2)} textAnchor="middle" fill="white" fontSize="8.5" fontWeight="700">{s.type}</text>
            </g>);})}

          {/* Asian range */}
          {showAsian&&analysis?.asian?.hi>0&&<>
            <line x1={pL} y1={py(analysis.asian.hi)} x2={W-pR} y2={py(analysis.asian.hi)} stroke="#7C3AED" strokeWidth="1" strokeDasharray="4,4" opacity="0.7"/>
            <text x={pL+4} y={py(analysis.asian.hi)-3} fill="#7C3AED" fontSize="8.5">Asia Hi {analysis.asian.hi}</text>
            <line x1={pL} y1={py(analysis.asian.lo)} x2={W-pR} y2={py(analysis.asian.lo)} stroke="#7C3AED" strokeWidth="1" strokeDasharray="4,4" opacity="0.7"/>
            <text x={pL+4} y={py(analysis.asian.lo)+12} fill="#7C3AED" fontSize="8.5">Asia Lo {analysis.asian.lo}</text>
          </>}

          {/* Equilibrium */}
          {analysis?.pd?.eq>0&&<>
            <line x1={pL} y1={py(analysis.pd.eq)} x2={W-pR} y2={py(analysis.pd.eq)} stroke="#374151" strokeWidth="0.8" strokeDasharray="6,4"/>
            <text x={W-pR+3} y={py(analysis.pd.eq)+4} fill="#4B5563" fontSize="8.5">EQ</text>
          </>}

          {/* Signal lines */}
          {analysis?.entry&&<>
            <line x1={pL} y1={py(analysis.entry)} x2={W-pR} y2={py(analysis.entry)} stroke="#3B82F6" strokeWidth="1.5" strokeDasharray="7,4"/>
            <rect x={W-pR+2} y={py(analysis.entry)-9} width={66} height={15} fill="#1D4ED8" rx="3"/>
            <text x={W-pR+35} y={py(analysis.entry)+2} textAnchor="middle" fill="white" fontSize="9" fontWeight="700">ENTRY {analysis.entry}</text>
          </>}
          {analysis?.sl&&<>
            <line x1={pL} y1={py(analysis.sl)} x2={W-pR} y2={py(analysis.sl)} stroke="#EF5350" strokeWidth="1.5" strokeDasharray="5,3"/>
            <rect x={W-pR+2} y={py(analysis.sl)-9} width={56} height={15} fill="#B91C1C" rx="3"/>
            <text x={W-pR+30} y={py(analysis.sl)+2} textAnchor="middle" fill="white" fontSize="9" fontWeight="700">SL {analysis.sl}</text>
          </>}
          {analysis?.tp1&&<>
            <line x1={pL} y1={py(analysis.tp1)} x2={W-pR} y2={py(analysis.tp1)} stroke="#26A69A" strokeWidth="1.5" strokeDasharray="5,3"/>
            <rect x={W-pR+2} y={py(analysis.tp1)-9} width={56} height={15} fill="#0F766E" rx="3"/>
            <text x={W-pR+30} y={py(analysis.tp1)+2} textAnchor="middle" fill="white" fontSize="9" fontWeight="700">TP1 {analysis.tp1}</text>
          </>}
          {analysis?.tp2&&<>
            <line x1={pL} y1={py(analysis.tp2)} x2={W-pR} y2={py(analysis.tp2)} stroke="#059669" strokeWidth="1.2" strokeDasharray="4,5"/>
            <rect x={W-pR+2} y={py(analysis.tp2)-9} width={56} height={15} fill="#065F46" rx="3"/>
            <text x={W-pR+30} y={py(analysis.tp2)+2} textAnchor="middle" fill="white" fontSize="9" fontWeight="700">TP2 {analysis.tp2}</text>
          </>}

          {/* Candles */}
          {recent.map((c,i)=>{
            const x=px(i),bull=c.c>=c.o;
            const col=bull?BULL:BEAR;
            const bodyH=Math.max(Math.abs(py(c.o)-py(c.c)),1.5);
            return(<g key={i}>
              <line x1={x} y1={py(c.h)} x2={x} y2={py(c.l)} stroke={col} strokeWidth="1.2" opacity="0.9"/>
              <rect x={x-cw/2} y={Math.min(py(c.o),py(c.c))} width={Math.max(cw-0.5,2)} height={bodyH} fill={col} opacity="0.95"/>
            </g>);})}

          {/* Timestamps — readable, every candle, rotated 45° */}
          {recent.map((c,i)=>{
            const x=px(i),d=new Date(c.t+IST);
            const hm=`${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
            const dm=`${pad(d.getUTCDate())}/${pad(d.getUTCMonth()+1)}`;
            const prev=i>0?new Date(recent[i-1].t+IST):null;
            const dayChange=!prev||prev.getUTCDate()!==d.getUTCDate();
            // Show label every 5 candles to avoid crowding, always on day change
            const showLabel = dayChange || i%5===0;
            if(!showLabel)return(<line key={`t${i}`} x1={x} y1={pT+cH} x2={x} y2={pT+cH+3} stroke="#21262D" strokeWidth="1"/>);
            return(<g key={`t${i}`} transform={`translate(${x},${pT+cH+4})`}>
              <line x1={0} y1={0} x2={0} y2={4} stroke="#30363D" strokeWidth="1"/>
              <text transform="rotate(-40)" x={-2} y={3} textAnchor="end" fill={dayChange?"#C9D1D9":"#6E7681"} fontSize={dayChange?"10":"9"} fontFamily="'Roboto Mono',monospace" fontWeight={dayChange?"700":"400"}>
                {dayChange?`${dm} ${hm}`:hm}
              </text>
            </g>);})}

          {/* Axes */}
          <line x1={pL} y1={pT+cH} x2={W-pR} y2={pT+cH} stroke="#21262D" strokeWidth="1.5"/>
          <line x1={pL} y1={pT} x2={pL} y2={pT+cH} stroke="#21262D" strokeWidth="1.5"/>

          {/* Legend */}
          {[{c:"#F59E0B",l:"MA20"},{c:"#6366F1",l:"MA50"},{c:"#26A69A",l:"FVG↑"},{c:"#3B82F6",l:"OB↑"},{c:"#EF5350",l:"BSL"},{c:"#26A69A",l:"SSL"},{c:"#7C3AED",l:"Asian"}].map((item,i)=>(
            <g key={i} transform={`translate(${pL+i*70},${pT+cH+38})`}>
              <rect x={0} y={-7} width={8} height={8} fill={item.c} rx="1.5" opacity="0.85"/>
              <text x={12} y={0} fill="#484F58" fontSize="9">{item.l}</text>
            </g>))}
        </svg>
      </div>

      {/* Resize handle */}
      {!fullscreen&&(
        <div onMouseDown={e=>{isDrag.current=true;dragY.current=e.clientY;dragH0.current=chartH;}}
          style={{height:"5px",background:"#161B22",cursor:"ns-resize",display:"flex",alignItems:"center",justifyContent:"center",userSelect:"none"}}>
          <div style={{width:"36px",height:"2px",background:"#30363D",borderRadius:"1px"}}/>
        </div>)}
    </div>);}


const ICT_STRATEGIES=[
  {id:"silver_bullet",name:"Silver Bullet",icon:"🥈",desc:"FVG CE entry during Silver Bullet window. Mark BSL/SSL → sweep → MSS on 1m → FVG CE entry.",color:"#7C3AED",thresholds:{slMult:0.8,tp1Mult:1.2,tp2Mult:2.0},rules:["bullFVG","bearFVG","chochBull","chochBear","liqSweepSSL","liqSweepBSL"],minConf:55},
  {id:"ob_retest",name:"OB Mean Threshold",icon:"🏦",desc:"Order Block mitigation at 50% CE level during Killzone. Institutional footprint entry.",color:"#2563EB",thresholds:{slMult:1.2,tp1Mult:2.0,tp2Mult:3.5},rules:["bullOB","bearOB","liqSweepBSL","liqSweepSSL","bosBull","bosBear"],minConf:60},
  {id:"ote_sovereign",name:"Sovereign OTE",icon:"👑",desc:"OTE 62–79% retracement + FVG — The Sovereign Trader highest probability setup.",color:"#D97706",thresholds:{slMult:1.5,tp1Mult:2.5,tp2Mult:4.0},rules:["ote","premDisc","bullOB","bearOB","bullFVG","bearFVG"],minConf:65},
  {id:"london_sweep",name:"London Liq Sweep",icon:"🇬🇧",desc:"BSL/SSL sweep at London open + CHoCH. Judas swing reversal — fade the false move.",color:"#2563EB",thresholds:{slMult:1.0,tp1Mult:2.0,tp2Mult:3.0},rules:["liqSweepBSL","liqSweepSSL","chochBull","chochBear","judas"],minConf:58},
  {id:"ny_open",name:"NY Open Reversal",icon:"🗽",desc:"Judas swing at NY open + BOS + FVG. AMD Manipulation → Distribution. Midnight open bias.",color:"#D97706",thresholds:{slMult:1.2,tp1Mult:2.0,tp2Mult:3.5},rules:["judas","bosBull","bosBear","bullFVG","bearFVG","midnightBias"],minConf:58},
  {id:"scalp_fvg",name:"Scalp FVG CE",icon:"⚡",desc:"FVG Consequent Encroachment scalp. 200–500 pip targets. Tight SL beyond FVG boundary.",color:"#16A34A",thresholds:{slMult:0.5,tp1Mult:0.8,tp2Mult:1.5},rules:["bullFVG","bearFVG","displacement","chochBull","chochBear"],minConf:50},
  {id:"unicorn",name:"Unicorn Reversal",icon:"🦄",desc:"SSL/BSL sweep + CHoCH + OB — rarest highest-probability reversal. All three required.",color:"#DC2626",thresholds:{slMult:1.8,tp1Mult:3.0,tp2Mult:5.0},rules:["liqSweepSSL","liqSweepBSL","chochBull","chochBear","bullOB","bearOB","ote"],minConf:70},
];

export default function App(){
  const[loggedIn,setLoggedIn]=useState(()=>!!ls.get(SK.user));
  const[userEmail,setUserEmail]=useState(()=>ls.get(SK.user)?.email||"");
  const times=getT();
  const KZS=[{id:"asian",name:"Asian Range",start:times.asian.s,end:times.asian.e,color:"#7C3AED",desc:"Consolidation — institutions building positions"},{id:"london",name:"London Open KZ",start:times.london.s,end:times.london.e,color:"#2563EB",desc:"Primary trend & Judas swing window"},{id:"overlap",name:"London–NY Overlap",start:times.overlap.s,end:times.overlap.e,color:"#059669",desc:"Highest volume — best ICT setups"},{id:"ny",name:"NY Session",start:times.ny.s,end:times.ny.e,color:"#D97706",desc:"AMD distribution phase"},{id:"sb1",name:"Silver Bullet 1",start:times.sb1.s,end:times.sb1.e,color:"#9333EA",desc:"FVG CE entry window — London SB"},{id:"sb2",name:"Silver Bullet 2",start:times.sb2.s,end:times.sb2.e,color:"#9333EA",desc:"FVG CE entry window — NY SB"},{id:"sb3",name:"Silver Bullet 3",start:times.sb3.s,end:times.sb3.e,color:"#9333EA",desc:"FVG CE entry window — NY PM SB"}];
  const[tdKey,setTdKey]=useState(ls.str(SK.key));const[fhKey,setFhKey]=useState(ls.str(SK.fhkey));const[aiKey,setAiKey]=useState(()=>ls.str(SK.aikey)||ENV_AI);
  const[showSettings,setShowSettings]=useState(false);
  const[brain,setBrain]=useState(()=>ls.get(SK.brain)||freshBrain());
  const[sym,setSym]=useState("XAUUSD");const[chartTF,setChartTF]=useState("15m");
  const[selTFs,setSelTFs]=useState({htf:"1D",bias:"4H",entry:"1H",execution:"15m"});
  const[tab,setTab]=useState("signal");
  const[candleData,setCandleData]=useState({});const[prices,setPrices]=useState({});const[changes,setChanges]=useState({});const[symStatus,setSymStatus]=useState({});
  const[loadMsg,setLoadMsg]=useState("");const[refreshing,setRefreshing]=useState(false);const[lastFetch,setLastFetch]=useState(null);
  const[analysis,setAnalysis]=useState(null);const[btResult,setBtResult]=useState(null);const[learnLog,setLearnLog]=useState([]);
  const[analyzing,setAnalyzing]=useState(false);const[bting,setBting]=useState(false);const[learning,setLearning]=useState(false);
  const[fullscreen,setFullscreen]=useState(false);
  const[capital,setCapital]=useState(100000);const[riskPct,setRiskPct]=useState(1);const[posCalc,setPosCalc]=useState(null);
  const[selStrategy,setSelStrategy]=useState(null);
  const[btConfig,setBtConfig]=useState({slMult:1.5,tp1Mult:2.0,minRR:0.8,lookback:40,holdBars:8,maxSlPips:10000,mode:"intraday"});
  const[tradeLog,setTradeLog]=useState(()=>ls.get(SK.tlog)||[]);
  const[signals,setSignals]=useState(()=>ls.get(SK.signals)||[]);
  const[newTrade,setNewTrade]=useState({date:"",sym:"XAUUSD",dir:"LONG",entry:"",sl:"",tp1:"",tp2:"",result:"",pnl:"",notes:""});
  const[showAddTrade,setShowAddTrade]=useState(false);
  const[autobt,setAutobt]=useState(false);const autoRef=useRef(null);
  // ── TRADE SIMULATOR STATE ─────────────────────────────────
  const[simTrades,setSimTrades]=useState(()=>ls.get('ict_v12_simtrades')||[]);
  const[activeSim,setActiveSim]=useState(null); // currently tracking trade
  const saveSimTrades=useCallback((trades)=>{setSimTrades(trades);ls.set('ict_v12_simtrades',trades);},[]);
  
  const[chatOpen,setChatOpen]=useState(false);
  const[chat,setChat]=useState([{role:"assistant",content:`🥇 ICT Sovereign Trader\n\nKnowledge Base: "The Sovereign Trader" — Liquidity, OBs, FVGs, AMD, OTE\n\nLondon: ${times.london.s}–${times.london.e} IST · NY: ${times.ny.s}–${times.ny.e} IST\n${(tdKey||fhKey)?"Loading real market data...":"Add API keys in Settings to get live prices."}`}]);
  const[chatInput,setChatInput]=useState("");const[chatLoading,setChatLoading]=useState(false);
  const istNow=useClock();const chatRef=useRef(null);
  const activeKZ=KZS.find(kz=>inWin(istNow,kz.start,kz.end));
  const inSB=KZS.filter(kz=>kz.id.startsWith("sb")).find(kz=>inWin(istNow,kz.start,kz.end));
  const liveCount=Object.values(symStatus).filter(s=>s==="live").length;
  const isLive=liveCount>0;
  // Load candles
  const loadAll=useCallback(async()=>{
    const cache=ls.get(SK.cache)||{};
    for(const[sk,sv] of Object.entries(SYMS)){
      setSymStatus(p=>({...p,[sk]:"loading"}));setLoadMsg(`Loading ${sk}...`);
      const src=SYM_SRC[sk],key=src==="fh"?fhKey:tdKey;
      const nd={};
      if(key||fhKey||tdKey){
        const acts=[...new Set([chartTF,selTFs.execution,selTFs.entry])];
        for(const tfK of acts){
          const ck=`${sk}_${tfK}`,cached=cache[ck];
          if(cached?.candles?.length&&(Date.now()-cached.fetchedAt)<18*60*1000){nd[tfK]=cached.candles;continue;}
          await new Promise(r=>setTimeout(r,src==="fh"?1500:8000));
          const{candles}=await fetchCandles(sk,tfK,tdKey,fhKey,300);
          if(candles?.length){nd[tfK]=candles;cache[ck]={candles,fetchedAt:Date.now()};}
          else nd[tfK]=genCandles(sv.fallback,tfMins(tfK),300,sv.vol);}
        ALL_TF.forEach(tf=>{if(!nd[tf])nd[tf]=genCandles(sv.fallback,tfMins(tf),300,sv.vol);});
        const{price}=await fetchPrice(sk,tdKey,fhKey);
        const p=price||nd[chartTF]?.slice(-1)[0]?.c||sv.fallback;
        setPrices(prev=>({...prev,[sk]:p}));setChanges(prev=>({...prev,[sk]:+(((p-sv.fallback)/sv.fallback)*100).toFixed(2)}));
        setSymStatus(prev=>({...prev,[sk]:price?"live":"error"}));
        await new Promise(r=>setTimeout(r,500));
      }else{
        ALL_TF.forEach(tf=>{nd[tf]=genCandles(sv.fallback,tfMins(tf),300,sv.vol);});
        const p=nd["15m"].slice(-1)[0]?.c||sv.fallback;
        setPrices(prev=>({...prev,[sk]:p}));setChanges(prev=>({...prev,[sk]:0}));
        setSymStatus(prev=>({...prev,[sk]:"sim"}));}
      setCandleData(prev=>({...prev,[sk]:nd}));}
    ls.set(SK.cache,cache);setLastFetch(new Date());setLoadMsg("");
  },[tdKey,fhKey,chartTF,selTFs]);
  useEffect(()=>{if(loggedIn)loadAll();},[loggedIn]);
  const handleRefresh=useCallback(async()=>{if(refreshing)return;setRefreshing(true);setLoadMsg("Refreshing...");for(const[sk,sv] of Object.entries(SYMS)){const{price}=await fetchPrice(sk,tdKey,fhKey);if(price){setPrices(p=>({...p,[sk]:price}));setChanges(p=>({...p,[sk]:+(((price-sv.fallback)/sv.fallback)*100).toFixed(2)}));setSymStatus(p=>({...p,[sk]:"live"}));}const src=SYM_SRC[sk];await new Promise(r=>setTimeout(r,src==="fh"?1000:8000));}setLastFetch(new Date());setLoadMsg("");setRefreshing(false);},[tdKey,fhKey,refreshing]);
  useEffect(()=>{if(!(tdKey||fhKey)||!loggedIn)return;const id=setInterval(handleRefresh,90000);return()=>clearInterval(id);},[tdKey,fhKey,loggedIn,handleRefresh]);
  useEffect(()=>{if((tdKey||fhKey)||!loggedIn)return;const id=setInterval(()=>{setPrices(prev=>{const n={...prev},ch={};Object.entries(SYMS).forEach(([k,v])=>{n[k]=+(prev[k]*(1+(Math.random()-0.4995)*v.vol*0.4)).toFixed(k==="NATGAS"?3:2);ch[k]=+(((n[k]-v.fallback)/v.fallback)*100).toFixed(2);});setChanges(ch);return n;});},2000);return()=>clearInterval(id);},[tdKey,fhKey,loggedIn]);
  useEffect(()=>{chatRef.current?.scrollIntoView({behavior:"smooth"});},[chat]);
  useEffect(()=>{if(analysis){setPosCalc(calcPos(capital,riskPct,analysis.entry,analysis.sl,analysis.tp1,analysis.tp2));}},[ analysis,capital,riskPct]);
  // Auto BT
  useEffect(()=>{if(!autobt){clearInterval(autoRef.current);return;}autoRef.current=setInterval(async()=>{const cd=candleData[sym]?.[chartTF];if(!cd?.length)return;const bt=runBacktest(cd,brain,times,{...btConfig,strategyRules:selStrategy?ICT_STRATEGIES.find(s=>s.id===selStrategy)?.rules:null});setBtResult(bt);},(btConfig.mode==="scalp"?5:15)*60*1000);return()=>clearInterval(autoRef.current);},[autobt,sym,chartTF,candleData,brain,times,btConfig,selStrategy]);
  const handleChartTFChange=useCallback(async(tf)=>{setChartTF(tf);const cache=ls.get(SK.cache)||{};const ck=`${sym}_${tf}`,cached=cache[ck];if(cached?.candles?.length&&(Date.now()-cached.fetchedAt)<18*60*1000){setCandleData(prev=>({...prev,[sym]:{...(prev[sym]||{}),[tf]:cached.candles}}));return;}setLoadMsg(`Loading ${sym} ${tf}...`);const{candles}=await fetchCandles(sym,tf,tdKey,fhKey,300);if(candles?.length){setCandleData(prev=>({...prev,[sym]:{...(prev[sym]||{}),[tf]:candles}}));cache[ck]={candles,fetchedAt:Date.now()};ls.set(SK.cache,cache);}setLoadMsg("");},[sym,tdKey,fhKey]);
  const handleAnalyze=async(stratId=null)=>{
    const cd=candleData[sym]?.[chartTF]||candleData[sym]?.[selTFs.execution];if(!cd?.length)return;
    setAnalyzing(true);await new Promise(r=>setTimeout(r,400));
    const strat=stratId?ICT_STRATEGIES.find(s=>s.id===stratId):null;
    const thresh=strat?{...brain.thresholds,...strat.thresholds}:brain.thresholds;
    const a=analyze(cd,brain.weights,thresh,times);
    if(a){
      setAnalysis(a);setTab("signal");
      // Save signal
      const sig={id:Date.now(),sym,tf:chartTF,dir:a.dir,conf:a.conf,entry:a.entry,sl:a.sl,tp1:a.tp1,tp2:a.tp2,rr:a.rr,slPips:a.slPips,tp1Pips:a.tp1Pips,reasons:a.reasons.map(r=>r.label),strategy:stratId||"custom",timestamp:istStr(nowIST()),amd:a.amd?.phase,kz:activeKZ?.name||"None"};
      const newSigs=[sig,...(ls.get(SK.signals)||[])].slice(0,100);setSignals(newSigs);ls.set(SK.signals,newSigs);}
    setAnalyzing(false);};
  const handleBTLearn=async()=>{const cd=candleData[sym]?.[chartTF]||candleData[sym]?.[selTFs.execution];if(!cd?.length)return;setBting(true);await new Promise(r=>setTimeout(r,400));const stratRules=selStrategy?ICT_STRATEGIES.find(s=>s.id===selStrategy)?.rules:null;const bt=runBacktest(cd,brain,times,{...btConfig,strategyRules:stratRules});setBtResult(bt);setBting(false);setLearning(true);await new Promise(r=>setTimeout(r,500));const{brain:nb,log}=learnFromBT(brain,bt.trades,bt.winRate,bt.total,sym);setBrain(nb);ls.set(SK.brain,nb);setLearnLog(log);setLearning(false);setTab("learning");};
  const handleChat=async()=>{if(!chatInput.trim())return;const effectiveKey=aiKey||ls.str(SK.aikey)||ENV_AI;if(!effectiveKey){setChat(p=>[...p,{role:"user",content:chatInput},{role:"assistant",content:"⚠️ Add Anthropic API key in Settings (⚙️)."}]);setChatInput("");return;}const msg=chatInput.trim();setChatInput("");setChat(p=>[...p,{role:"user",content:msg}]);setChatLoading(true);try{const sys=`You are an elite ICT Sovereign Trader analyst trained on "The Sovereign Trader" by Suketu Mehta. Always use Mumbai IST. Now: ${istStr(istNow)} (${times.note}). London: ${times.london.s}–${times.london.e} IST. NY: ${times.ny.s}–${times.ny.e} IST. Active session: ${activeKZ?.name||"none"}. ${inSB?"Silver Bullet ACTIVE: "+inSB.name:""}. Symbol: ${sym}@${prices[sym]}. ${isLive?"REAL data":"Simulated"}. Gen${brain.generations}. ${analysis?`Signal: ${analysis.dir} ${analysis.conf}% | E:${analysis.entry} SL:${analysis.sl} TP1:${analysis.tp1} RR:${analysis.rr} | AMD:${analysis.amd?.phase} | Zone:${analysis.pd?.zone}(${analysis.pd?.pct}%) | Reasons: ${analysis.reasons.map(r=>r.label).join(", ")}`:"No signal generated."}. Key concepts from The Sovereign Trader: Liquidity pools (BSL/SSL), OB Mean Threshold (50% CE), FVG Consequent Encroachment, OTE 62-79% Sovereign Setup, AMD cycle, Judas Swing, Midnight Open bias, Killzones. Focus on scalping 200-1000 pip moves. Always explain WHY with ICT logic.`;// Route through Cloudflare Worker to bypass CORS
const res=await fetch(`${WORKER}/anthropic`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({apiKey:effectiveKey,model:"claude-sonnet-4-20250514",max_tokens:1200,system:sys,messages:chat.filter(m=>m.role==="user"||m.role==="assistant").concat([{role:"user",content:msg}])})});if(!res.ok)throw new Error(`API ${res.status}`);const data=await res.json();setChat(p=>[...p,{role:"assistant",content:data.content?.find(b=>b.type==="text")?.text||"Error."}]);}catch(e){setChat(p=>[...p,{role:"assistant",content:`⚠️ ${e.message}`}]);}setChatLoading(false);};
  const saveTradeLog=useCallback((log)=>{setTradeLog(log);ls.set(SK.tlog,log);},[]);
  if(!loggedIn)return <LoginPage onLogin={e=>{setLoggedIn(true);setUserEmail(e);}}/>;
  const S=SYMS[sym];
  const badge=st=>{if(st==="live")return{bg:"#DCFCE7",c:"#16A34A",t:"● LIVE"};if(st==="loading")return{bg:"#FEF9C3",c:"#D97706",t:"⟳"};if(st==="error")return{bg:"#FEE2E2",c:"#DC2626",t:"⚠"};return{bg:"#F1F5F9",c:"#64748B",t:"◌ SIM"};};
  const TABS=["signal","strategies","sessions","position","weights","backtest","tradelog","simulator","learning"];
  return(
    <div style={{background:"#F8FAFC",minHeight:"100vh",fontFamily:"'Inter','Segoe UI',system-ui,sans-serif",color:"#1E293B"}}>
      {showSettings&&<SettingsModal onClose={()=>setShowSettings(false)} onSave={(td,fh,ai)=>{setTdKey(td);setFhKey(fh);setAiKey(ai);}} times={times}/>}
      {/* TOP BAR */}
      <div style={{background:"white",borderBottom:"1px solid #E2E8F0",padding:"0 16px",display:"flex",alignItems:"stretch",boxShadow:"0 1px 4px rgba(0,0,0,0.06)",position:"sticky",top:0,zIndex:100,flexWrap:"wrap"}}>
        {/* Logo */}
        <div style={{display:"flex",alignItems:"center",gap:"10px",padding:"8px 14px 8px 0",borderRight:"1px solid #F1F5F9",marginRight:"10px"}}>
          <div style={{width:"34px",height:"34px",background:"linear-gradient(135deg,#1D4ED8,#7C3AED)",borderRadius:"9px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"16px"}}>🥇</div>
          <div><div style={{fontWeight:"800",fontSize:"14px",letterSpacing:"-0.3px"}}>ICT SOVEREIGN</div><div style={{fontSize:"10px",color:"#64748B"}}>Mumbai · v12 · Gen {brain.generations}</div></div>
        </div>
        {/* Symbols */}
        {Object.entries(SYMS).map(([k,v])=>{const st=symStatus[k]||"sim",active=sym===k,p=prices[k],ch=changes[k]||0,b=badge(st);return(
          <div key={k} onClick={()=>{setSym(k);setAnalysis(null);setPosCalc(null);}} style={{cursor:"pointer",padding:"6px 12px",borderBottom:`3px solid ${active?v.accent:"transparent"}`,background:active?v.bg:"transparent",minWidth:"118px",display:"flex",flexDirection:"column",justifyContent:"center",borderRight:"1px solid #F8FAFC"}}>
            <div style={{display:"flex",alignItems:"center",gap:"4px",marginBottom:"2px"}}>
              <span style={{fontSize:"11px",fontWeight:"700",color:active?v.color:"#64748B"}}>{k}</span>
              <span style={{fontSize:"9px",padding:"1px 4px",borderRadius:"3px",fontWeight:"700",background:b.bg,color:b.c}}>{b.t}</span>
            </div>
            <div style={{fontWeight:"800",fontSize:"17px",color:active?v.color:"#1E293B",fontFamily:"monospace",letterSpacing:"-0.5px"}}>{p!=null?Number(p).toFixed(k==="NATGAS"?3:2):"—"}</div>
            <div style={{fontSize:"11px",fontWeight:"600",color:ch>=0?"#16A34A":"#DC2626"}}>{ch>=0?"▲":"▼"} {Math.abs(ch).toFixed(2)}%</div>
          </div>);})}
        {/* TF selectors */}
        <div style={{display:"flex",gap:"7px",alignItems:"center",padding:"0 12px",borderLeft:"1px solid #F1F5F9",marginLeft:"6px"}}>
          {[{role:"htf",color:"#7C3AED",tip:"HTF: Overall directional bias"},{role:"bias",color:"#2563EB",tip:"Bias: Confirms HTF direction"},{role:"entry",color:"#D97706",tip:"Entry: Where you identify ICT setup (OB, FVG)"},{role:"execution",color:"#16A34A",tip:"Execution: Precise trigger TF. ICT: max 2-3 TFs below Entry"}].map(({role,color,tip})=>(
            <div key={role} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"2px"}} title={tip}>
              <span style={{fontSize:"9px",fontWeight:"700",color,textTransform:"uppercase"}}>{role}</span>
              <select value={selTFs[role]} onChange={e=>setSelTFs(p=>({...p,[role]:e.target.value}))} style={{background:`${color}10`,border:`1.5px solid ${color}44`,color,borderRadius:"6px",padding:"3px 5px",fontSize:"12px",fontWeight:"700",cursor:"pointer",outline:"none",fontFamily:"monospace",minWidth:"48px"}}>{ALL_TF.map(tf=><option key={tf} value={tf}>{tf}</option>)}</select>
            </div>))}
        </div>
        {/* Right controls */}
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:"7px",padding:"6px 0 6px 10px",flexWrap:"wrap"}}>
          {loadMsg&&<div style={{background:"#FFFBEB",border:"1px solid #FDE047",borderRadius:"6px",padding:"3px 9px",fontSize:"11px",color:"#92400E",maxWidth:"180px"}}>{loadMsg}</div>}
          {activeKZ&&<div style={{background:`${activeKZ.color}12`,border:`1px solid ${activeKZ.color}33`,borderRadius:"6px",padding:"3px 9px",fontSize:"11px",color:activeKZ.color,fontWeight:"700"}}>● {activeKZ.name}</div>}
          {inSB&&<div style={{background:"#F5F3FF",border:"1px solid #DDD6FE",borderRadius:"6px",padding:"3px 9px",fontSize:"11px",color:"#7C3AED",fontWeight:"700"}}>🥈 {inSB.name}</div>}
          <div style={{textAlign:"right"}}>
            <div style={{fontWeight:"700",fontSize:"14px",color:"#1D4ED8",fontFamily:"monospace"}}>{istStr(istNow)}</div>
            <div style={{fontSize:"10px",color:"#94A3B8"}}>{times.note}{lastFetch?` ↺${pad(new Date(lastFetch.getTime()+IST).getUTCHours())}:${pad(new Date(lastFetch.getTime()+IST).getUTCMinutes())}`:""}</div>
          </div>
          <button onClick={handleRefresh} disabled={refreshing||!!loadMsg} title="Refresh all prices" style={{background:"#EFF6FF",border:"1.5px solid #BFDBFE",color:"#1D4ED8",borderRadius:"8px",padding:"6px 12px",fontSize:"12px",fontWeight:"700",cursor:"pointer",whiteSpace:"nowrap"}}>{refreshing?"⟳":"↺"} Refresh</button>
          <button onClick={()=>setShowSettings(true)} title="API Keys & Settings" style={{background:(tdKey||fhKey)?"#F0FDF4":"#FFFBEB",border:`1.5px solid ${(tdKey||fhKey)?"#BBF7D0":"#FDE047"}`,color:(tdKey||fhKey)?"#16A34A":"#92400E",borderRadius:"8px",padding:"6px 12px",fontSize:"12px",fontWeight:"700",cursor:"pointer"}}>⚙️ {(tdKey||fhKey)?`${liveCount}/4 Live`:"Add Keys"}</button>
          <div style={{fontSize:"11px",color:"#64748B",padding:"0 4px"}}>{userEmail}</div>
        </div>
      </div>

      {/* BODY — scrollable */}
      <div style={{padding:"14px 16px",display:"flex",flexDirection:"column",gap:"12px",maxWidth:"1800px",margin:"0 auto"}}>

        {/* Symbol header + analyze buttons */}
        <div style={{background:"white",borderRadius:"12px",padding:"14px 18px",border:"1px solid #E2E8F0",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"10px",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
          <div style={{display:"flex",alignItems:"center",gap:"14px",flexWrap:"wrap"}}>
            <div style={{background:S.bg,border:`2px solid ${S.border}`,borderRadius:"10px",padding:"10px 16px",minWidth:"120px"}}>
              <div style={{fontWeight:"700",fontSize:"11px",color:S.color,letterSpacing:"1px"}}>{sym} · {S.label}</div>
              <div style={{fontWeight:"800",fontSize:"26px",color:S.accent,fontFamily:"monospace",letterSpacing:"-1px"}}>{prices[sym]!=null?Number(prices[sym]).toFixed(sym==="NATGAS"?3:2):"—"}</div>
              <div style={{fontSize:"12px",fontWeight:"600",color:changes[sym]>=0?"#16A34A":"#DC2626"}}>{changes[sym]>=0?"▲":"▼"} {Math.abs(changes[sym]||0).toFixed(2)}%</div>
            </div>
            {analysis&&<div style={{padding:"10px 14px",background:analysis.dir==="LONG"?"#F0FDF4":"#FEF2F2",borderRadius:"10px",border:`1.5px solid ${analysis.dir==="LONG"?"#86EFAC":"#FCA5A5"}`}}>
              <div style={{fontWeight:"800",fontSize:"20px",color:analysis.dir==="LONG"?"#16A34A":"#DC2626"}}>{analysis.dir==="LONG"?"▲ LONG":"▼ SHORT"} · {analysis.conf}%</div>
              <div style={{fontSize:"12px",color:"#64748B",marginTop:"2px"}}>R:R {analysis.rr} · SL {analysis.slPips}p · TP {analysis.tp1Pips}p · {analysis.amd?.phase||""}</div>
              {posCalc&&<div style={{fontSize:"11px",color:"#7C3AED",marginTop:"2px",fontWeight:"600"}}>Risk ₹{posCalc.riskAmt.toLocaleString()} · Lots {posCalc.lotSize} · Max P ₹{posCalc.maxProfit1.toLocaleString()}</div>}
            </div>}
          </div>
          <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
            <button onClick={()=>handleAnalyze()} disabled={analyzing} style={{background:"linear-gradient(135deg,#1D4ED8,#4338CA)",color:"white",border:"none",borderRadius:"10px",padding:"11px 22px",fontWeight:"700",fontSize:"14px",cursor:"pointer",opacity:analyzing?0.6:1,boxShadow:"0 2px 8px rgba(29,78,216,0.2)"}}>
              {analyzing?"⚙️ Analyzing...":"🔬 Analyze"}
            </button>
            <button onClick={handleBTLearn} disabled={bting||learning} style={{background:"linear-gradient(135deg,#7C3AED,#9333EA)",color:"white",border:"none",borderRadius:"10px",padding:"11px 22px",fontWeight:"700",fontSize:"14px",cursor:"pointer",opacity:(bting||learning)?0.6:1}}>
              {learning?"🧠 Learning...":(bting?"⚙️ Running...":"🧠 BT + Learn")}
            </button>
            <button onClick={()=>setAutobt(!autobt)} style={{background:autobt?"#DCFCE7":"#F1F5F9",border:`1.5px solid ${autobt?"#86EFAC":"#E2E8F0"}`,color:autobt?"#16A34A":"#64748B",borderRadius:"10px",padding:"11px 14px",fontWeight:"700",fontSize:"13px",cursor:"pointer"}} title={`Auto BT every ${btConfig.mode==="scalp"?5:15} min`}>
              {autobt?"⏸ Auto":"▶ Auto"}
            </button>
          </div>
        </div>

        {/* CHART */}
        <Chart data={candleData[sym]?.[chartTF]||candleData[sym]?.[selTFs.execution]} analysis={analysis} tfLabel={`${sym} · ${chartTF}`} chartTF={chartTF} onTFChange={handleChartTFChange} allTFs={["1m","5m","15m","30m","1H","4H","1D"]} fullscreen={fullscreen} onToggleFS={()=>setFullscreen(!fullscreen)}/>

        {/* TABS */}
        <div style={{background:"white",borderRadius:"10px",padding:"4px",border:"1px solid #E2E8F0",display:"flex",gap:"2px",flexWrap:"wrap"}}>
          {TABS.map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{flex:1,minWidth:"80px",padding:"8px 4px",borderRadius:"7px",border:"none",background:tab===t?"#EFF6FF":"transparent",color:tab===t?"#1D4ED8":"#64748B",fontSize:"12px",fontWeight:tab===t?"700":"500",cursor:"pointer"}}>
              {t==="signal"?"📡 Signal":t==="strategies"?"🎯 Strategies":t==="sessions"?"🕐 Sessions":t==="position"?"💰 Position":t==="weights"?"⚖️ Weights":t==="backtest"?"📊 Backtest":t==="tradelog"?"📓 Trade Log":t==="simulator"?"🎮 Simulator":"🧠 Learn"}
            </button>))}
        </div>

        {/* ── SIGNAL TAB ── */}
        {tab==="signal"&&analysis&&(
          <div style={{background:"white",borderRadius:"12px",padding:"18px",border:`2px solid ${analysis.dir==="LONG"?"#86EFAC":"#FCA5A5"}`,boxShadow:`0 2px 12px ${analysis.dir==="LONG"?"rgba(22,163,74,0.07)":"rgba(220,38,38,0.07)"}`}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"10px",marginBottom:"14px"}}>
              {[{l:"ENTRY PRICE",v:analysis.entry,c:"#1D4ED8",bg:"#EFF6FF"},{l:"STOP LOSS",v:analysis.sl,c:"#DC2626",bg:"#FEF2F2"},{l:"TAKE PROFIT 1",v:analysis.tp1,c:"#16A34A",bg:"#F0FDF4"},{l:"TAKE PROFIT 2",v:analysis.tp2,c:"#059669",bg:"#F0FDF4"}].map(x=>(
                <div key={x.l} style={{background:x.bg,borderRadius:"10px",padding:"12px",textAlign:"center",border:`1px solid ${x.c}22`}}>
                  <div style={{color:"#64748B",fontSize:"11px",fontWeight:"600",letterSpacing:"0.5px",marginBottom:"5px"}}>{x.l}</div>
                  <div style={{color:x.c,fontWeight:"800",fontSize:"18px",fontFamily:"monospace"}}>{x.v}</div>
                </div>))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:"8px",marginBottom:"14px"}}>
              {[{l:"SL PIPS",v:analysis.slPips,c:"#EF4444",tip:"Stop Loss distance in pips"},{l:"TP1 PIPS",v:analysis.tp1Pips,c:"#16A34A",tip:"Take Profit 1 distance in pips"},{l:"R:R RATIO",v:analysis.rr,c:"#7C3AED",tip:"Risk to Reward ratio"},{l:"CONFIDENCE",v:`${analysis.conf}%`,c:analysis.conf>=70?"#16A34A":"#D97706",tip:"ICT confluence score"},{l:"ATR",v:analysis.atr,c:"#D97706",tip:"Average True Range — market volatility"}].map(x=>(
                <div key={x.l} title={x.tip} style={{background:"#F8FAFC",borderRadius:"8px",padding:"8px",textAlign:"center",border:"1px solid #F1F5F9",cursor:"help"}}>
                  <div style={{color:"#94A3B8",fontSize:"10px",fontWeight:"600",marginBottom:"3px"}}>{x.l}</div>
                  <div style={{color:x.c,fontWeight:"700",fontSize:"14px"}}>{x.v}</div>
                </div>))}
            </div>
            <div style={{display:"flex",gap:"12px",padding:"10px 14px",background:"#F8FAFC",borderRadius:"8px",marginBottom:"14px",flexWrap:"wrap",fontSize:"13px"}}>
              <span title="Price zone relative to range">Zone <strong style={{color:analysis.pd.zone==="DISCOUNT"?"#16A34A":"#EF4444"}}>{analysis.pd.zone} ({analysis.pd.pct}%)</strong></span>
              <span title="Higher timeframe directional bias">HTF <strong style={{color:analysis.htf.bias==="BULLISH"?"#16A34A":analysis.htf.bias==="BEARISH"?"#DC2626":"#94A3B8"}}>{analysis.htf.bias}</strong></span>
              <span title="Midnight open price filter">Midnight <strong style={{color:"#7C3AED"}}>{analysis.mb?.open}</strong></span>
              <span title="Accumulation, Manipulation, Distribution cycle phase">AMD <strong style={{color:"#D97706"}}>{analysis.amd?.phase}</strong></span>
              {analysis.liq.sweepSSL&&<span style={{color:"#16A34A",fontWeight:"700"}}>💧 SSL Swept</span>}
              {analysis.liq.sweepBSL&&<span style={{color:"#DC2626",fontWeight:"700"}}>💧 BSL Swept</span>}
              {activeKZ&&<span style={{color:activeKZ.color,fontWeight:"700"}}>● {activeKZ.name}</span>}
              {inSB&&<span style={{color:"#7C3AED",fontWeight:"700"}}>🥈 {inSB.name} ACTIVE</span>}
            </div>
            <div style={{borderTop:"1px solid #F1F5F9",paddingTop:"12px"}}>
              <div style={{fontSize:"12px",fontWeight:"700",color:"#94A3B8",marginBottom:"10px",letterSpacing:"0.5px"}}>ICT CONFLUENCES — {analysis.reasons.length} factors ({selTFs.entry} entry, {selTFs.execution} execution, {selTFs.bias} bias, {selTFs.htf} HTF)</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
                {analysis.reasons.map((r,i)=>(
                  <div key={i} title={r.desc} style={{display:"flex",gap:"8px",alignItems:"flex-start",background:analysis.dir==="LONG"?"#F0FDF4":"#FEF2F2",padding:"8px 12px",borderRadius:"8px",border:`1px solid ${analysis.dir==="LONG"?"#BBF7D0":"#FECACA"}`,cursor:"help"}}>
                    <span style={{color:analysis.dir==="LONG"?"#16A34A":"#DC2626",fontWeight:"800",fontSize:"14px",flexShrink:0}}>✓</span>
                    <div><div style={{fontSize:"13px",fontWeight:"600",color:"#1E293B"}}>{r.label}</div><div style={{fontSize:"11px",color:"#64748B",marginTop:"1px"}}>{r.desc}</div></div>
                  </div>))}
              </div>
            </div>
          </div>)}
        {tab==="signal"&&!analysis&&<div style={{background:"white",borderRadius:"12px",padding:"50px 20px",textAlign:"center",border:"1px solid #E2E8F0"}}><div style={{fontSize:"52px",marginBottom:"12px"}}>🔬</div><div style={{fontSize:"17px",fontWeight:"700",marginBottom:"8px"}}>Ready to Analyze {sym}</div><div style={{fontSize:"14px",color:"#64748B"}}>Click <strong style={{color:"#1D4ED8"}}>Analyze</strong> for full ICT Sovereign analysis with all levels on chart</div></div>}

        {/* ── STRATEGIES TAB ── */}
        {tab==="strategies"&&(
          <div style={{display:"grid",gap:"12px"}}>
            <div style={{background:"#EFF6FF",borderRadius:"12px",padding:"14px 18px",border:"1px solid #BFDBFE"}}>
              <div style={{fontWeight:"700",fontSize:"15px",color:"#1D4ED8",marginBottom:"6px"}}>🎯 ICT Strategy Library — From "The Sovereign Trader"</div>
              <div style={{fontSize:"13px",color:"#374151"}}>Each strategy targets specific ICT setups. Click to generate that specific signal. The agent adjusts SL/TP multipliers and minimum confluence rules per strategy.</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"10px"}}>
              {(ICT_STRATEGIES||[]).map(strat=>(
                <div key={strat.id} style={{background:"white",borderRadius:"12px",padding:"16px",border:`2px solid ${selStrategy===strat.id?strat.color:"#E2E8F0"}`,cursor:"pointer",transition:"all 0.15s"}} onClick={()=>setSelStrategy(selStrategy===strat.id?null:strat.id)}>
                  <div style={{display:"flex",justify:"space-between",alignItems:"flex-start",marginBottom:"8px"}}>
                    <div style={{fontSize:"24px"}}>{strat.icon}</div>
                    {selStrategy===strat.id&&<span style={{background:strat.color,color:"white",fontSize:"10px",padding:"2px 8px",borderRadius:"20px",fontWeight:"700"}}>ACTIVE</span>}
                  </div>
                  <div style={{fontWeight:"700",fontSize:"14px",color:strat.color,marginBottom:"4px"}}>{strat.name}</div>
                  <div style={{fontSize:"12px",color:"#64748B",lineHeight:"1.5",marginBottom:"10px"}}>{strat.desc}</div>
                  <div style={{display:"flex",gap:"8px",marginBottom:"8px",fontSize:"11px"}}>
                    <span style={{background:"#F1F5F9",padding:"2px 7px",borderRadius:"4px",color:"#374151"}}>SL×{strat.thresholds.slMult}</span>
                    <span style={{background:"#F1F5F9",padding:"2px 7px",borderRadius:"4px",color:"#374151"}}>TP×{strat.thresholds.tp1Mult}</span>
                    <span style={{background:"#F1F5F9",padding:"2px 7px",borderRadius:"4px",color:"#374151"}}>Min {strat.minConf}%</span>
                  </div>
                  <button onClick={e=>{e.stopPropagation();handleAnalyze(strat.id);}} style={{width:"100%",background:`${strat.color}15`,border:`1px solid ${strat.color}44`,color:strat.color,borderRadius:"7px",padding:"7px",fontSize:"12px",fontWeight:"700",cursor:"pointer"}}>
                    {analyzing?"⚙️ Analyzing...":"Generate Signal →"}
                  </button>
                </div>))}
            </div>
            {/* Backtest config */}
            <div style={{background:"white",borderRadius:"12px",padding:"16px 18px",border:"1px solid #E2E8F0"}}>
              <div style={{fontWeight:"700",fontSize:"15px",marginBottom:"12px"}}>⚙️ Backtest Configuration</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"8px",marginBottom:"12px"}}>
                {[{id:"scalp",icon:"⚡",label:"Scalp",desc:"200–500 pips",sl:0.6,tp:1.0,bars:5,look:30,max:2000},{id:"intraday",icon:"📊",label:"Intraday",desc:"500–1500 pips",sl:1.5,tp:2.0,bars:8,look:40,max:10000},{id:"swing",icon:"📈",label:"Swing",desc:"1500+ pips",sl:2.0,tp:3.5,bars:15,look:60,max:50000}].map(m=>(
                  <button key={m.id} onClick={()=>setBtConfig(p=>({...p,mode:m.id,slMult:m.sl,tp1Mult:m.tp,holdBars:m.bars,lookback:m.look,maxSlPips:m.max}))} style={{padding:"10px",borderRadius:"8px",border:`2px solid ${btConfig.mode===m.id?"#1D4ED8":"#E2E8F0"}`,background:btConfig.mode===m.id?"#EFF6FF":"white",cursor:"pointer",textAlign:"center"}}>
                    <div style={{fontSize:"20px",marginBottom:"4px"}}>{m.icon}</div>
                    <div style={{fontWeight:"700",fontSize:"13px",color:btConfig.mode===m.id?"#1D4ED8":"#374151"}}>{m.label}</div>
                    <div style={{fontSize:"11px",color:"#94A3B8"}}>{m.desc}</div>
                  </button>))}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"10px"}}>
                {[{l:"SL Multiplier (ATR×)",k:"slMult",step:0.1,min:0.3,max:5},{l:"TP1 Multiplier (ATR×)",k:"tp1Mult",step:0.1,min:0.5,max:8},{l:"Max SL (pips)",k:"maxSlPips",step:500,min:100,max:50000},{l:"Hold Bars",k:"holdBars",step:1,min:2,max:50},{l:"Lookback Window",k:"lookback",step:5,min:20,max:120},{l:"Min R:R",k:"minRR",step:0.1,min:0.5,max:5}].map(f=>(
                  <div key={f.k}>
                    <label style={{fontSize:"11px",fontWeight:"600",color:"#64748B",display:"block",marginBottom:"3px"}}>{f.l}</label>
                    <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                      <input type="range" min={f.min} max={f.max} step={f.step} value={btConfig[f.k]} onChange={e=>setBtConfig(p=>({...p,[f.k]:Number(e.target.value)}))} style={{flex:1,accentColor:"#1D4ED8"}}/>
                      <span style={{fontSize:"13px",fontWeight:"700",color:"#1D4ED8",minWidth:"42px",textAlign:"right",fontFamily:"monospace"}}>{btConfig[f.k]}</span>
                    </div>
                  </div>))}
              </div>
              <div style={{marginTop:"10px",padding:"8px 12px",background:"#FFFBEB",borderRadius:"8px",fontSize:"12px",color:"#92400E",border:"1px solid #FDE047"}}>
                Active: {btConfig.mode.toUpperCase()} · SL×{btConfig.slMult} · TP×{btConfig.tp1Mult} · Max {btConfig.maxSlPips}p SL · {btConfig.holdBars} bars · {btConfig.lookback} lookback {selStrategy?`· Strategy: ${ICT_STRATEGIES.find(s=>s.id===selStrategy)?.name}`:"· All setups"}
              </div>
            </div>
          </div>)}

        {/* ── SESSIONS TAB ── */}
        {tab==="sessions"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"}}>
            <div style={{background:"white",borderRadius:"12px",padding:"16px 18px",border:"1px solid #E2E8F0"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"12px"}}>
                <span style={{fontWeight:"700",fontSize:"16px"}}>🕐 Sessions — Mumbai IST</span>
                <div style={{textAlign:"right"}}><div style={{fontWeight:"700",fontSize:"16px",color:"#1D4ED8",fontFamily:"monospace"}}>{istStr(istNow)}</div><div style={{fontSize:"11px",color:"#94A3B8"}}>{times.note}</div></div>
              </div>
              {KZS.filter(kz=>!kz.id.startsWith("sb")).map(kz=>{const active=inWin(istNow,kz.start,kz.end),pct=active?winPct(istNow,kz.start,kz.end):0;return(
                <div key={kz.id} style={{background:active?`${kz.color}08`:"#FAFAFA",borderRadius:"10px",padding:"12px 14px",marginBottom:"7px",border:`2px solid ${active?kz.color:"#E2E8F0"}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{color:active?kz.color:"#94A3B8",fontWeight:active?"700":"500",fontSize:"14px"}}>{active?"● ":"○ "}{kz.name}</span>
                    <span style={{color:"#374151",fontFamily:"monospace",fontSize:"13px",fontWeight:"700",background:"#F1F5F9",padding:"2px 10px",borderRadius:"6px"}}>{kz.start}–{kz.end} IST</span>
                  </div>
                  {active&&<><div style={{height:"4px",background:"#E2E8F0",borderRadius:"2px",marginTop:"8px"}}><div style={{height:"100%",width:`${pct}%`,background:kz.color,borderRadius:"2px",transition:"width 1s"}}/></div><div style={{display:"flex",justifyContent:"space-between",marginTop:"4px",fontSize:"12px"}}><span style={{color:kz.color,fontWeight:"600"}}>{kz.desc}</span><span style={{color:"#94A3B8"}}>{pct}%</span></div></>}
                </div>);})}
            </div>
            <div style={{display:"grid",gap:"12px",alignContent:"start"}}>
              <div style={{background:"white",borderRadius:"12px",padding:"16px 18px",border:"1px solid #E2E8F0"}}>
                <div style={{fontWeight:"700",fontSize:"15px",marginBottom:"10px"}}>🥈 Silver Bullet Windows</div>
                {KZS.filter(kz=>kz.id.startsWith("sb")).map(kz=>{const active=inWin(istNow,kz.start,kz.end);return(
                  <div key={kz.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:active?"#F5F3FF":"#FAFAFA",borderRadius:"9px",marginBottom:"6px",border:`2px solid ${active?"#7C3AED":"#E2E8F0"}`}}>
                    <span style={{color:active?"#7C3AED":"#94A3B8",fontWeight:active?"700":"500",fontSize:"14px"}}>{active?"● ":"○ "}{kz.name}</span>
                    <span style={{color:"#374151",fontFamily:"monospace",fontSize:"13px",fontWeight:"700"}}>{kz.start}–{kz.end}</span>
                    {active&&<span style={{background:"#7C3AED",color:"white",fontSize:"11px",padding:"2px 10px",borderRadius:"20px",fontWeight:"700"}}>ACTIVE</span>}
                  </div>);})}
                <div style={{marginTop:"8px",padding:"8px 12px",background:"#F5F3FF",borderRadius:"8px",fontSize:"12px",color:"#7C3AED",lineHeight:"1.6"}}>
                  <strong>Silver Bullet Protocol:</strong> Look for FVG CE entry during this window. Wait for CHoCH on LTF after SSH/BSL sweep. Target unmitigated OBs or FVGs below/above current price.
                </div>
              </div>
              <div style={{background:"#FFFBEB",borderRadius:"12px",padding:"14px",border:"1px solid #FDE047"}}>
                <div style={{fontWeight:"700",fontSize:"14px",color:"#92400E",marginBottom:"8px"}}>⚠️ DST Schedule</div>
                <div style={{fontSize:"12px",color:"#A16207",lineHeight:"1.8"}}>
                  Currently: <strong>{times.note}</strong><br/>
                  After March 29: UK→BST → London shifts to <strong>12:30 IST</strong><br/>
                  Note: Silver Bullet windows also shift by 1 hour
                </div>
              </div>
            </div>
          </div>)}

        {/* ── POSITION CALCULATOR TAB ── */}
        {tab==="position"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"}}>
            <div style={{background:"white",borderRadius:"12px",padding:"18px",border:"1px solid #E2E8F0"}}>
              <div style={{fontWeight:"700",fontSize:"16px",marginBottom:"14px"}}>💰 Position Size Calculator</div>
              <div style={{display:"grid",gap:"12px"}}>
                <div>
                  <label style={{fontSize:"12px",fontWeight:"600",color:"#64748B",display:"block",marginBottom:"5px"}}>TRADING CAPITAL (₹ INR)</label>
                  <input type="number" value={capital} onChange={e=>setCapital(Number(e.target.value))} style={{width:"100%",background:"#F8FAFC",border:"2px solid #E2E8F0",borderRadius:"8px",padding:"10px 14px",fontSize:"16px",fontWeight:"700",fontFamily:"monospace",outline:"none",color:"#1E293B",boxSizing:"border-box"}} onFocus={e=>e.target.style.borderColor="#1D4ED8"} onBlur={e=>e.target.style.borderColor="#E2E8F0"}/>
                </div>
                <div>
                  <label style={{fontSize:"12px",fontWeight:"600",color:"#64748B",display:"block",marginBottom:"5px"}}>RISK PER TRADE (%)</label>
                  <div style={{display:"flex",gap:"6px"}}>
                    {[0.5,1,1.5,2,3].map(r=>(
                      <button key={r} onClick={()=>setRiskPct(r)} style={{flex:1,padding:"8px",borderRadius:"7px",border:`2px solid ${riskPct===r?"#1D4ED8":"#E2E8F0"}`,background:riskPct===r?"#EFF6FF":"white",color:riskPct===r?"#1D4ED8":"#64748B",fontWeight:"700",fontSize:"13px",cursor:"pointer"}}>{r}%</button>))}
                    <input type="number" step="0.1" min="0.1" max="10" value={riskPct} onChange={e=>setRiskPct(Number(e.target.value))} style={{width:"56px",background:"#F8FAFC",border:"2px solid #E2E8F0",borderRadius:"7px",padding:"8px",fontSize:"13px",fontWeight:"700",fontFamily:"monospace",outline:"none",color:"#1E293B",textAlign:"center"}}/>
                  </div>
                </div>
              </div>
              {analysis&&posCalc?(
                <div style={{marginTop:"14px",display:"grid",gap:"8px"}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
                    {[{l:"Risk Amount",v:`₹${posCalc.riskAmt.toLocaleString()}`,c:"#EF4444",bg:"#FEF2F2",tip:"Maximum you can lose on this trade"},{l:"Lot Size",v:posCalc.lotSize,c:"#1D4ED8",bg:"#EFF6FF",tip:"Recommended position size"},{l:"SL Distance",v:`${posCalc.slPips} pips`,c:"#EF4444",bg:"#FEF2F2",tip:"Distance to stop loss"},{l:"Pip Value",v:`₹${posCalc.riskAmt/posCalc.slPips>0?(posCalc.riskAmt/posCalc.slPips).toFixed(2):0}`,c:"#D97706",bg:"#FFFBEB",tip:"Value per pip movement"}].map(x=>(
                      <div key={x.l} title={x.tip} style={{background:x.bg,borderRadius:"8px",padding:"10px",textAlign:"center",cursor:"help"}}><div style={{color:"#94A3B8",fontSize:"11px",fontWeight:"600",marginBottom:"4px"}}>{x.l}</div><div style={{color:x.c,fontWeight:"800",fontSize:"16px",fontFamily:"monospace"}}>{x.v}</div></div>))}
                  </div>
                  <div style={{padding:"12px",background:"#F0FDF4",borderRadius:"8px",border:"1px solid #BBF7D0"}}>
                    <div style={{fontWeight:"700",fontSize:"13px",color:"#16A34A",marginBottom:"6px"}}>📈 Maximum Profit Scenarios</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px",fontSize:"13px"}}>
                      <div>TP1 (R:R {posCalc.rr1}): <strong style={{color:"#16A34A"}}>₹{posCalc.maxProfit1.toLocaleString()}</strong></div>
                      <div>TP2 (R:R {posCalc.rr2}): <strong style={{color:"#059669"}}>₹{posCalc.maxProfit2.toLocaleString()}</strong></div>
                    </div>
                  </div>
                  <div style={{padding:"12px",background:"#FEF2F2",borderRadius:"8px",border:"1px solid #FECACA"}}>
                    <div style={{fontWeight:"700",fontSize:"13px",color:"#DC2626",marginBottom:"6px"}}>⚠️ Drawdown Risk Analysis</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px",fontSize:"13px"}}>
                      <div>Single loss: <strong style={{color:"#DC2626"}}>₹{posCalc.maxLoss.toLocaleString()}</strong></div>
                      <div>3 losses (max DD): <strong style={{color:"#DC2626"}}>₹{posCalc.maxDD.toLocaleString()} ({posCalc.ddPct}%)</strong></div>
                    </div>
                  </div>
                </div>):<div style={{marginTop:"14px",padding:"20px",background:"#F8FAFC",borderRadius:"8px",textAlign:"center",color:"#94A3B8",fontSize:"14px"}}>Run <strong style={{color:"#1D4ED8"}}>Analyze</strong> first to calculate position size</div>}
            </div>
            {/* Recent signals log */}
            <div style={{background:"white",borderRadius:"12px",padding:"16px 18px",border:"1px solid #E2E8F0"}}>
              <div style={{fontWeight:"700",fontSize:"15px",marginBottom:"12px"}}>📡 Recent Signals ({signals.length})</div>
              <div style={{maxHeight:"400px",overflowY:"auto"}}>
                {signals.slice(0,20).map((s,i)=>(
                  <div key={i} style={{background:"#F8FAFC",borderRadius:"8px",padding:"10px",marginBottom:"7px",border:"1px solid #F1F5F9"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"4px"}}>
                      <div style={{display:"flex",gap:"6px",alignItems:"center"}}>
                        <span style={{fontWeight:"700",fontSize:"13px",color:"#1E293B"}}>{s.sym} {s.tf}</span>
                        <span style={{background:s.dir==="LONG"?"#DCFCE7":"#FEE2E2",color:s.dir==="LONG"?"#16A34A":"#DC2626",padding:"1px 7px",borderRadius:"20px",fontSize:"11px",fontWeight:"700"}}>{s.dir==="LONG"?"▲":"▼"} {s.dir}</span>
                        <span style={{fontSize:"11px",color:"#7C3AED"}}>{s.conf}%</span>
                      </div>
                      <span style={{fontSize:"11px",color:"#94A3B8"}}>{s.timestamp}</span>
                    </div>
                    <div style={{display:"flex",gap:"10px",fontSize:"12px",color:"#64748B",flexWrap:"wrap"}}>
                      <span>E: <strong style={{color:"#1D4ED8",fontFamily:"monospace"}}>{s.entry}</strong></span>
                      <span>SL: <strong style={{color:"#EF4444",fontFamily:"monospace"}}>{s.sl}</strong></span>
                      <span>TP: <strong style={{color:"#16A34A",fontFamily:"monospace"}}>{s.tp1}</strong></span>
                      <span>RR: <strong>{s.rr}</strong></span>
                      <span>KZ: {s.kz}</span>
                    </div>
                  </div>))}</div>
              {signals.length===0&&<div style={{textAlign:"center",color:"#94A3B8",padding:"30px",fontSize:"14px"}}>No signals generated yet. Click Analyze to create one.</div>}
            </div>
          </div>)}

        {/* ── WEIGHTS TAB ── */}
        {tab==="weights"&&(
          <div style={{display:"grid",gap:"12px"}}>
            <div style={{background:"#EFF6FF",borderRadius:"12px",padding:"16px 18px",border:"1px solid #BFDBFE"}}>
              <div style={{fontWeight:"700",fontSize:"15px",color:"#1D4ED8",marginBottom:"8px"}}>⚖️ Adaptive ICT Rule Weights — The Sovereign Scoring System</div>
              <div style={{fontSize:"13px",color:"#374151",lineHeight:"1.7"}}>
                Each ICT concept (from your book "The Sovereign Trader") carries a <strong>weight score (4–40)</strong> that determines its influence on signals.<br/>
                After every <strong>BT + Learn</strong>: concepts with &gt;70% win rate get <span style={{color:"#16A34A",fontWeight:"700"}}>boosted ↑</span>, under 50% get <span style={{color:"#DC2626",fontWeight:"700"}}>penalised ↓</span>.<br/>
                The agent tracks which ICT concepts work best for each symbol, session, and market phase automatically.
              </div>
            </div>
            <div style={{background:"white",borderRadius:"12px",padding:"16px 18px",border:"1px solid #E2E8F0"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"14px"}}>
                <div><div style={{fontWeight:"700",fontSize:"15px"}}>Generation {brain.generations} · {brain.totalTrades} trades analyzed</div><div style={{fontSize:"13px",color:"#64748B",marginTop:"2px"}}>Overall win rate: {brain.overallWR}% · Best mode: {brain.bestMode}</div></div>
                <button onClick={()=>{if(window.confirm("Reset all weights to ICT defaults?")){{const nb=freshBrain();setBrain(nb);ls.set(SK.brain,nb);}}}} style={{background:"#FEF2F2",border:"1px solid #FECACA",color:"#DC2626",borderRadius:"7px",padding:"6px 14px",fontSize:"12px",cursor:"pointer",fontWeight:"600"}}>Reset Brain</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
                {Object.entries(brain.weights).sort((a,b)=>b[1].weight-a[1].weight).map(([k,rule])=>{
                  const total=rule.wins+rule.losses,wr=total>0?Math.round(rule.wins/total*100):null,delta=rule.weight-(DW[k]?.weight||15);
                  return(
                    <div key={k} title={rule.desc} style={{padding:"10px 12px",background:"#F8FAFC",borderRadius:"8px",border:"1px solid #F1F5F9",cursor:"help"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"5px"}}>
                        <div><span style={{fontSize:"13px",fontWeight:"600",color:"#1E293B"}}>{rule.label}</span><div style={{fontSize:"11px",color:"#94A3B8",marginTop:"1px"}}>{rule.desc}</div></div>
                        <div style={{display:"flex",gap:"6px",alignItems:"center",flexShrink:0,marginLeft:"8px"}}>
                          {wr!==null&&<span style={{fontSize:"11px",fontWeight:"600",color:wr>=60?"#16A34A":wr>=50?"#D97706":"#DC2626",background:wr>=60?"#F0FDF4":wr>=50?"#FFFBEB":"#FEF2F2",padding:"1px 6px",borderRadius:"20px"}}>{wr}%</span>}
                          {delta!==0&&<span style={{fontSize:"12px",fontWeight:"700",color:delta>0?"#16A34A":"#DC2626"}}>{delta>0?"+":""}{delta}</span>}
                          <span style={{fontWeight:"800",fontSize:"15px",color:"#1D4ED8",fontFamily:"monospace",minWidth:"26px",textAlign:"right"}}>{rule.weight}</span>
                        </div>
                      </div>
                      <div style={{height:"6px",background:"#E2E8F0",borderRadius:"3px"}}><div style={{height:"100%",width:`${Math.round((rule.weight/40)*100)}%`,background:delta>0?"#16A34A":delta<0?"#DC2626":"#94A3B8",borderRadius:"3px",transition:"width 0.5s"}}/></div>
                    </div>);})}
              </div>
            </div>
          </div>)}

        {/* ── BACKTEST TAB ── */}
        {tab==="backtest"&&btResult&&(
          <div style={{display:"grid",gap:"12px"}}>
            {/* Summary cards */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:"8px"}}>
              {[
                {l:"WIN RATE",v:`${btResult.winRate}%`,c:btResult.winRate>=65?"#16A34A":btResult.winRate>=50?"#D97706":"#DC2626",bg:btResult.winRate>=65?"#F0FDF4":btResult.winRate>=50?"#FFFBEB":"#FEF2F2",tip:"Percentage of winning trades"},
                {l:"TRADES",v:btResult.total,c:"#1D4ED8",bg:"#EFF6FF",tip:"Total completed trades"},
                {l:"PROFIT FACTOR",v:btResult.profitFactor,c:btResult.profitFactor>=1.5?"#16A34A":"#DC2626",bg:btResult.profitFactor>=1.5?"#F0FDF4":"#FEF2F2",tip:"Gross profit divided by gross loss"},
                {l:"AVG R:R",v:btResult.avgRR,c:"#7C3AED",bg:"#F5F3FF",tip:"Average risk to reward ratio"},
                {l:"AVG SL PIPS",v:btResult.avgSLPips,c:"#EF4444",bg:"#FEF2F2",tip:"Average stop loss distance in pips"},
                {l:"MODE",v:btConfig.mode.toUpperCase(),c:"#374151",bg:"#F8FAFC",tip:"Backtest mode used"},
              ].map(x=>(
                <div key={x.l} title={x.tip} style={{background:x.bg,borderRadius:"8px",padding:"10px",textAlign:"center",cursor:"help",border:`1px solid ${x.c}22`}}>
                  <div style={{color:"#94A3B8",fontSize:"10px",fontWeight:"600",letterSpacing:"0.5px",marginBottom:"5px"}}>{x.l}</div>
                  <div style={{color:x.c,fontWeight:"800",fontSize:"18px",fontFamily:"monospace"}}>{x.v}</div>
                </div>))}
            </div>

            {/* TABLE — proper format with entry + execution TF */}
            <div style={{background:"white",borderRadius:"12px",border:"1px solid #E2E8F0",overflow:"hidden"}}>
              <div style={{padding:"10px 14px",borderBottom:"1px solid #F1F5F9",display:"flex",justifyContent:"space-between",alignItems:"center",background:"#FAFAFA"}}>
                <span style={{fontWeight:"700",fontSize:"14px"}}>Trade Log — {btResult.total} trades</span>
                <span style={{fontSize:"12px",color:"#94A3B8"}}>Entry TF: <strong style={{color:"#D97706"}}>{selTFs.entry}</strong> · Execution TF: <strong style={{color:"#16A34A"}}>{selTFs.execution}</strong> · Mode: {btConfig.mode}</span>
              </div>
              <div style={{overflowX:"auto",maxHeight:"380px",overflowY:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:"12px"}}>
                  <thead style={{position:"sticky",top:0,zIndex:1}}>
                    <tr style={{background:"#F8FAFC"}}>
                      {["#","RESULT","DIRECTION","ENTRY PRICE","STOP LOSS","TP1","R:R","SL PIPS","TP PIPS","SESSION","ENTRY TF","EXEC TF","CONFLUENCES"].map(h=>(
                        <th key={h} style={{padding:"8px 10px",textAlign:"left",fontSize:"11px",fontWeight:"700",color:"#64748B",letterSpacing:"0.3px",borderBottom:"2px solid #E2E8F0",whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {btResult.trades.slice().reverse().map((t,i)=>(
                      <tr key={i} style={{borderBottom:"1px solid #F1F5F9",background:i%2===0?"white":"#FAFAFA",transition:"background 0.1s"}}
                        onMouseEnter={e=>e.currentTarget.style.background="#EFF6FF"}
                        onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"white":"#FAFAFA"}>
                        <td style={{padding:"7px 10px",color:"#94A3B8",fontSize:"11px"}}>{btResult.total-i}</td>
                        <td style={{padding:"7px 10px"}}>
                          <span style={{background:t.outcome==="WIN"?"#DCFCE7":"#FEE2E2",color:t.outcome==="WIN"?"#16A34A":"#DC2626",padding:"2px 8px",borderRadius:"20px",fontSize:"11px",fontWeight:"700"}}>
                            {t.outcome==="WIN"?"✅ WIN":"❌ LOSS"}
                          </span>
                        </td>
                        <td style={{padding:"7px 10px"}}>
                          <span style={{color:t.dir==="LONG"?"#16A34A":"#DC2626",fontWeight:"700",fontSize:"12px"}}>{t.dir==="LONG"?"▲ LONG":"▼ SHORT"}</span>
                        </td>
                        <td style={{padding:"7px 10px",fontFamily:"monospace",fontWeight:"600",color:"#1D4ED8"}}>{t.entry}</td>
                        <td style={{padding:"7px 10px",fontFamily:"monospace",color:"#EF4444"}}>{t.sl}</td>
                        <td style={{padding:"7px 10px",fontFamily:"monospace",color:"#16A34A"}}>{t.tp1}</td>
                        <td style={{padding:"7px 10px",fontWeight:"700",color:"#7C3AED"}}>{t.rr}</td>
                        <td style={{padding:"7px 10px",fontFamily:"monospace",color:"#EF4444"}}>{t.slPips}</td>
                        <td style={{padding:"7px 10px",fontFamily:"monospace",color:"#16A34A"}}>{t.tp1Pips}</td>
                        <td style={{padding:"7px 10px",color:"#64748B",fontSize:"11px"}}>{t.kzId||"—"}</td>
                        <td style={{padding:"7px 10px"}}>
                          <span style={{background:"#FFFBEB",color:"#D97706",padding:"1px 6px",borderRadius:"4px",fontSize:"11px",fontWeight:"600",fontFamily:"monospace"}}>{selTFs.entry}</span>
                        </td>
                        <td style={{padding:"7px 10px"}}>
                          <span style={{background:"#F0FDF4",color:"#16A34A",padding:"1px 6px",borderRadius:"4px",fontSize:"11px",fontWeight:"600",fontFamily:"monospace"}}>{selTFs.execution}</span>
                        </td>
                        <td style={{padding:"7px 10px",color:"#94A3B8",fontSize:"11px",maxWidth:"160px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={t.reasons?.map(r=>r.label).join(", ")}>
                          {t.reasons?.slice(0,2).map(r=>r.label).join(", ")||"—"}
                        </td>
                      </tr>))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>)}
        
        {tab==="backtest"&&!btResult&&(<div style={{background:"white",borderRadius:"12px",padding:"50px 20px",textAlign:"center",border:"1px solid #E2E8F0"}}><div style={{fontSize:"48px",marginBottom:"12px"}}>📊</div><div style={{fontSize:"17px",fontWeight:"700",marginBottom:"8px"}}>No Backtest Yet</div><div style={{fontSize:"14px",color:"#64748B"}}>Go to <strong style={{color:"#1D4ED8"}}>🎯 Strategies</strong> tab → pick a strategy → click <strong style={{color:"#7C3AED"}}>🧠 BT + Learn</strong></div></div>)}

        {tab==="tradelog"&&(
          <div style={{display:"grid",gap:"12px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{fontWeight:"700",fontSize:"16px"}}>📓 Trade Journal — {tradeLog.length} trades</div><button onClick={()=>setShowAddTrade(!showAddTrade)} style={{background:"#1D4ED8",color:"white",border:"none",borderRadius:"8px",padding:"8px 16px",fontSize:"13px",fontWeight:"700",cursor:"pointer"}}>+ Add Trade</button></div>
            {showAddTrade&&(<div style={{background:"white",borderRadius:"12px",padding:"18px",border:"1px solid #E2E8F0"}}><div style={{fontWeight:"700",fontSize:"15px",marginBottom:"14px"}}>Record a Trade</div><div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"10px",marginBottom:"10px"}}>{[{l:"Date",k:"date",type:"date"},{l:"Symbol",k:"sym",type:"select",opts:Object.keys(SYMS)},{l:"Direction",k:"dir",type:"select",opts:["LONG","SHORT"]},{l:"Entry",k:"entry",type:"number"},{l:"Stop Loss",k:"sl",type:"number"},{l:"TP1",k:"tp1",type:"number"},{l:"TP2",k:"tp2",type:"number"},{l:"P&L (₹)",k:"pnl",type:"number"},{l:"Result",k:"result",type:"select",opts:["WIN","LOSS","BREAKEVEN","RUNNING"]}].map(f=>(<div key={f.k}><label style={{fontSize:"11px",fontWeight:"600",color:"#64748B",display:"block",marginBottom:"3px"}}>{f.l}</label>{f.type==="select"?<select value={newTrade[f.k]} onChange={e=>setNewTrade(p=>({...p,[f.k]:e.target.value}))} style={{width:"100%",background:"#F8FAFC",border:"1.5px solid #E2E8F0",borderRadius:"7px",padding:"8px",fontSize:"13px",outline:"none",color:"#1E293B"}}>{f.opts.map(o=><option key={o} value={o}>{o}</option>)}</select>:<input type={f.type} value={newTrade[f.k]} onChange={e=>setNewTrade(p=>({...p,[f.k]:e.target.value}))} style={{width:"100%",background:"#F8FAFC",border:"1.5px solid #E2E8F0",borderRadius:"7px",padding:"8px",fontSize:"13px",outline:"none",color:"#1E293B",boxSizing:"border-box"}}/>}</div>))}</div><div style={{marginBottom:"10px"}}><label style={{fontSize:"11px",fontWeight:"600",color:"#64748B",display:"block",marginBottom:"3px"}}>Notes</label><textarea value={newTrade.notes} onChange={e=>setNewTrade(p=>({...p,notes:e.target.value}))} rows={2} style={{width:"100%",background:"#F8FAFC",border:"1.5px solid #E2E8F0",borderRadius:"7px",padding:"8px",fontSize:"13px",outline:"none",color:"#1E293B",boxSizing:"border-box",resize:"vertical"}}/></div><div style={{display:"flex",gap:"8px"}}><button onClick={()=>{const t={...newTrade,id:Date.now()};const log=[t,...tradeLog];saveTradeLog(log);setShowAddTrade(false);setNewTrade({date:"",sym:"XAUUSD",dir:"LONG",entry:"",sl:"",tp1:"",tp2:"",result:"",pnl:"",notes:""}); }} style={{background:"#16A34A",color:"white",border:"none",borderRadius:"8px",padding:"9px 20px",fontSize:"13px",fontWeight:"700",cursor:"pointer"}}>Save Trade</button><button onClick={()=>setShowAddTrade(false)} style={{background:"#F1F5F9",border:"1px solid #E2E8F0",color:"#374151",borderRadius:"8px",padding:"9px 16px",fontSize:"13px",cursor:"pointer"}}>Cancel</button></div></div>)}
            {tradeLog.length>0?(<div style={{background:"white",borderRadius:"12px",border:"1px solid #E2E8F0",overflow:"hidden"}}><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:"12px"}}><thead><tr style={{background:"#F8FAFC"}}>{["DATE","SYM","DIR","ENTRY","SL","TP1","RESULT","P&L (₹)","NOTES",""].map(h=>(<th key={h} style={{padding:"8px 10px",textAlign:"left",fontSize:"11px",fontWeight:"700",color:"#64748B",borderBottom:"2px solid #E2E8F0",whiteSpace:"nowrap"}}>{h}</th>))}</tr></thead><tbody>{tradeLog.map((t,i)=>(<tr key={t.id} style={{borderBottom:"1px solid #F1F5F9",background:i%2===0?"white":"#FAFAFA"}}><td style={{padding:"7px 10px",fontFamily:"monospace",fontSize:"11px",color:"#374151"}}>{t.date}</td><td style={{padding:"7px 10px",fontWeight:"700",color:SYMS[t.sym]?.color||"#374151"}}>{t.sym}</td><td style={{padding:"7px 10px",color:t.dir==="LONG"?"#16A34A":"#DC2626",fontWeight:"700"}}>{t.dir==="LONG"?"▲":"▼"}</td><td style={{padding:"7px 10px",fontFamily:"monospace",fontWeight:"600",color:"#1D4ED8"}}>{t.entry}</td><td style={{padding:"7px 10px",fontFamily:"monospace",color:"#EF4444"}}>{t.sl}</td><td style={{padding:"7px 10px",fontFamily:"monospace",color:"#16A34A"}}>{t.tp1}</td><td style={{padding:"7px 10px"}}><span style={{background:t.result==="WIN"?"#DCFCE7":t.result==="LOSS"?"#FEE2E2":"#F1F5F9",color:t.result==="WIN"?"#16A34A":t.result==="LOSS"?"#DC2626":"#64748B",padding:"2px 8px",borderRadius:"20px",fontSize:"11px",fontWeight:"700"}}>{t.result}</span></td><td style={{padding:"7px 10px",fontWeight:"700",color:parseFloat(t.pnl)>=0?"#16A34A":"#DC2626",fontFamily:"monospace"}}>{t.pnl?"₹"+Number(t.pnl).toLocaleString():"-"}</td><td style={{padding:"7px 10px",color:"#64748B",fontSize:"11px",maxWidth:"150px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.notes}</td><td style={{padding:"7px 10px"}}><button onClick={()=>{if(window.confirm("Delete?"))saveTradeLog(tradeLog.filter(x=>x.id!==t.id));}} style={{background:"#FEF2F2",border:"1px solid #FECACA",color:"#DC2626",borderRadius:"5px",padding:"3px 7px",fontSize:"11px",cursor:"pointer"}}>✕</button></td></tr>))}</tbody></table></div><div style={{padding:"10px 14px",background:"#F8FAFC",borderTop:"2px solid #E2E8F0",display:"flex",gap:"20px",fontSize:"13px"}}><span>Total: <strong>{tradeLog.length}</strong></span><span style={{color:"#16A34A"}}>Wins: <strong>{tradeLog.filter(t=>t.result==="WIN").length}</strong></span><span style={{color:"#DC2626"}}>Losses: <strong>{tradeLog.filter(t=>t.result==="LOSS").length}</strong></span><span>Net P&L: <strong style={{color:tradeLog.reduce((s,t)=>s+Number(t.pnl||0),0)>=0?"#16A34A":"#DC2626"}}>₹{tradeLog.reduce((s,t)=>s+Number(t.pnl||0),0).toLocaleString()}</strong></span></div></div>):<div style={{background:"white",borderRadius:"12px",padding:"40px 20px",textAlign:"center",border:"1px solid #E2E8F0",color:"#94A3B8",fontSize:"14px"}}>No trades logged. Click <strong>+ Add Trade</strong> to start your journal.</div>}
          </div>)}


        {tab==="simulator"&&(<div style={{display:"grid",gap:"12px"}}>
          {analysis?(<div style={{background:"white",borderRadius:"12px",padding:"18px",border:`2px solid ${analysis.dir==="LONG"?"#86EFAC":"#FCA5A5"}`}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"14px",flexWrap:"wrap",gap:"10px"}}><div><div style={{fontWeight:"800",fontSize:"18px",color:analysis.dir==="LONG"?"#16A34A":"#DC2626",marginBottom:"4px"}}>{analysis.dir==="LONG"?"▲ LONG":"▼ SHORT"} Signal — {sym}</div><div style={{fontSize:"13px",color:"#64748B"}}>Entry: <strong style={{fontFamily:"monospace",color:"#1D4ED8"}}>{analysis.entry}</strong> · SL: <strong style={{fontFamily:"monospace",color:"#EF4444"}}>{analysis.sl}</strong> · TP1: <strong style={{fontFamily:"monospace",color:"#16A34A"}}>{analysis.tp1}</strong> · TP2: <strong style={{fontFamily:"monospace",color:"#059669"}}>{analysis.tp2}</strong></div><div style={{fontSize:"12px",color:"#94A3B8",marginTop:"4px"}}>R:R {analysis.rr} · SL {analysis.slPips}p · TP {analysis.tp1Pips}p · Conf {analysis.conf}%</div></div><button onClick={()=>{if(activeSim){alert("Close active simulation first");return;}const trade={id:Date.now(),sym,dir:analysis.dir,entry:analysis.entry,sl:analysis.sl,tp1:analysis.tp1,tp2:analysis.tp2,rr:analysis.rr,slPips:analysis.slPips,tp1Pips:analysis.tp1Pips,conf:analysis.conf,tf:chartTF,entryTF:selTFs.entry,execTF:selTFs.execution,reasons:analysis.reasons.map(r=>r.label),kz:activeKZ?.name||"None",amd:analysis.amd?.phase||"",openTime:istStr(nowIST()),openPrice:prices[sym]||analysis.entry,capital,riskPct,riskAmt:posCalc?.riskAmt||0,status:"OPEN",result:null,pnl:null,closePrice:null,closeTime:null};setActiveSim(trade);}} style={{background:"linear-gradient(135deg,#1D4ED8,#7C3AED)",color:"white",border:"none",borderRadius:"10px",padding:"12px 24px",fontWeight:"700",fontSize:"14px",cursor:"pointer"}}>🎮 Take This Trade</button></div>{posCalc&&<div style={{display:"flex",gap:"16px",padding:"10px 14px",background:"#F8FAFC",borderRadius:"8px",fontSize:"13px",flexWrap:"wrap"}}><span>Risk: <strong style={{color:"#EF4444"}}>{"₹"}{posCalc.riskAmt?.toLocaleString()}</strong></span><span>Max Profit TP1: <strong style={{color:"#16A34A"}}>{"₹"}{posCalc.maxProfit1?.toLocaleString()}</strong></span><span>Max Profit TP2: <strong style={{color:"#059669"}}>{"₹"}{posCalc.maxProfit2?.toLocaleString()}</strong></span><span>Max DD: <strong style={{color:"#DC2626"}}>{"₹"}{posCalc.maxDD?.toLocaleString()}</strong></span></div>}</div>):(<div style={{background:"white",borderRadius:"12px",padding:"30px",textAlign:"center",border:"1px solid #E2E8F0",color:"#94A3B8"}}>Click <strong style={{color:"#1D4ED8"}}>Analyze</strong> first to generate a signal, then take the trade here.</div>)}
          {activeSim&&(<div style={{background:"white",borderRadius:"12px",padding:"18px",border:"2px solid #FDE047"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"14px",flexWrap:"wrap",gap:"8px"}}><div style={{fontWeight:"700",fontSize:"16px",color:"#92400E"}}>⏱ Live Simulation — {activeSim.sym}</div><div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>{[{label:"✅ TP1 Hit",result:"WIN_TP1",pnl:posCalc?.maxProfit1||0},{label:"✅ TP2 Hit",result:"WIN_TP2",pnl:posCalc?.maxProfit2||0},{label:"❌ SL Hit",result:"LOSS",pnl:posCalc?-posCalc.maxLoss:0},{label:"⚡ Close",result:"MANUAL",pnl:null}].map(btn=>(<button key={btn.result} onClick={()=>{const closed={...activeSim,status:"CLOSED",result:btn.result,pnl:btn.pnl,closePrice:prices[activeSim.sym]||activeSim.entry,closeTime:istStr(nowIST())};saveSimTrades([closed,...simTrades]);setActiveSim(null);}} style={{background:btn.result.startsWith("WIN")?"#F0FDF4":btn.result==="LOSS"?"#FEF2F2":"#FFFBEB",border:"1.5px solid #E2E8F0",color:btn.result.startsWith("WIN")?"#16A34A":btn.result==="LOSS"?"#DC2626":"#D97706",borderRadius:"7px",padding:"6px 11px",fontSize:"12px",fontWeight:"700",cursor:"pointer"}}>{btn.label}</button>))}</div></div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:"10px",marginBottom:"12px"}}>{[{l:"ENTRY",v:activeSim.entry,c:"#1D4ED8"},{l:"CURRENT",v:prices[activeSim.sym]?.toFixed?.(activeSim.sym==="NATGAS"?3:2)||"—",c:"#374151"},{l:"STOP LOSS",v:activeSim.sl,c:"#DC2626"},{l:"TP1",v:activeSim.tp1,c:"#16A34A"},{l:"TP2",v:activeSim.tp2,c:"#059669"}].map(x=>(<div key={x.l} style={{background:"#F8FAFC",borderRadius:"8px",padding:"10px",textAlign:"center"}}><div style={{color:"#94A3B8",fontSize:"10px",fontWeight:"600",marginBottom:"4px"}}>{x.l}</div><div style={{color:x.c,fontWeight:"800",fontSize:"16px",fontFamily:"monospace"}}>{x.v}</div></div>))}</div>
          {(()=>{const cur=prices[activeSim.sym];if(!cur||!posCalc)return null;const dist=activeSim.dir==="LONG"?cur-activeSim.entry:activeSim.entry-cur;const slDist=Math.abs(activeSim.entry-activeSim.sl)||1;const livePnl=+(dist/slDist*posCalc.riskAmt).toFixed(0);const livePips=+(dist*100).toFixed(1);const isProfit=livePnl>=0;return(<div style={{padding:"12px 16px",background:isProfit?"#F0FDF4":"#FEF2F2",borderRadius:"8px",border:`1px solid ${isProfit?"#86EFAC":"#FECACA"}`,display:"flex",gap:"24px",alignItems:"center",flexWrap:"wrap"}}><div><div style={{fontSize:"11px",color:"#64748B",marginBottom:"2px"}}>LIVE P&L</div><div style={{fontWeight:"800",fontSize:"24px",color:isProfit?"#16A34A":"#DC2626",fontFamily:"monospace"}}>{isProfit?"+":" "}{"₹"}{Math.abs(livePnl).toLocaleString()}</div></div><div><div style={{fontSize:"11px",color:"#64748B",marginBottom:"2px"}}>PIPS</div><div style={{fontWeight:"700",fontSize:"20px",color:isProfit?"#16A34A":"#DC2626",fontFamily:"monospace"}}>{isProfit?"+":""}{livePips}</div></div><div><div style={{fontSize:"11px",color:"#64748B",marginBottom:"2px"}}>OPEN SINCE</div><div style={{fontSize:"13px"}}>{activeSim.openTime}</div></div></div>);})()} 
          </div>)}
          <div style={{background:"white",borderRadius:"12px",border:"1px solid #E2E8F0",overflow:"hidden"}}><div style={{padding:"10px 14px",borderBottom:"1px solid #F1F5F9",display:"flex",justifyContent:"space-between",alignItems:"center",background:"#FAFAFA"}}><span style={{fontWeight:"700",fontSize:"14px"}}>📊 Simulation History ({simTrades.length} trades)</span><div style={{display:"flex",gap:"12px",fontSize:"13px",alignItems:"center"}}><span style={{color:"#16A34A"}}>Wins: <strong>{simTrades.filter(t=>t.result?.startsWith("WIN")).length}</strong></span><span style={{color:"#DC2626"}}>Losses: <strong>{simTrades.filter(t=>t.result==="LOSS").length}</strong></span><span>Net P&L: <strong style={{color:simTrades.reduce((s,t)=>s+Number(t.pnl||0),0)>=0?"#16A34A":"#DC2626"}}>{"₹"}{simTrades.reduce((s,t)=>s+Number(t.pnl||0),0).toLocaleString()}</strong></span>{simTrades.length>0&&<button onClick={()=>{if(window.confirm("Clear simulations?"))saveSimTrades([]);}} style={{background:"#FEF2F2",border:"1px solid #FECACA",color:"#DC2626",borderRadius:"5px",padding:"2px 8px",fontSize:"11px",cursor:"pointer"}}>Clear</button>}</div></div>
          {simTrades.length===0?<div style={{padding:"40px",textAlign:"center",color:"#94A3B8",fontSize:"14px"}}>No simulations yet — click "Take This Trade" after analyzing.</div>:(<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:"12px"}}><thead><tr style={{background:"#F8FAFC"}}>{["TIME","SYM","DIR","RESULT","ENTRY","CLOSE","SL","TP1","PIPS","P&L (₹)","R:R","ENTRY TF","EXEC TF","KZ","CONFLUENCES"].map(h=>(<th key={h} style={{padding:"7px 10px",textAlign:"left",fontSize:"11px",fontWeight:"700",color:"#64748B",borderBottom:"2px solid #E2E8F0",whiteSpace:"nowrap"}}>{h}</th>))}</tr></thead><tbody>{simTrades.map((t,i)=>{const isWin=t.result?.startsWith("WIN");return(<tr key={t.id} style={{borderBottom:"1px solid #F1F5F9",background:i%2===0?"white":"#FAFAFA"}}><td style={{padding:"7px 10px",fontSize:"11px",color:"#94A3B8",whiteSpace:"nowrap"}}>{t.closeTime||t.openTime}</td><td style={{padding:"7px 10px",fontWeight:"700"}}>{t.sym}</td><td style={{padding:"7px 10px",color:t.dir==="LONG"?"#16A34A":"#DC2626",fontWeight:"700"}}>{t.dir==="LONG"?"▲":"▼"} {t.dir}</td><td style={{padding:"7px 10px"}}><span style={{background:isWin?"#DCFCE7":t.result==="LOSS"?"#FEE2E2":"#F1F5F9",color:isWin?"#16A34A":t.result==="LOSS"?"#DC2626":"#64748B",padding:"2px 8px",borderRadius:"20px",fontSize:"11px",fontWeight:"700"}}>{t.result||"OPEN"}</span></td><td style={{padding:"7px 10px",fontFamily:"monospace",color:"#1D4ED8",fontWeight:"600"}}>{t.entry}</td><td style={{padding:"7px 10px",fontFamily:"monospace"}}>{t.closePrice||"—"}</td><td style={{padding:"7px 10px",fontFamily:"monospace",color:"#EF4444"}}>{t.sl}</td><td style={{padding:"7px 10px",fontFamily:"monospace",color:"#16A34A"}}>{t.tp1}</td><td style={{padding:"7px 10px",fontFamily:"monospace"}}>{t.slPips}</td><td style={{padding:"7px 10px",fontWeight:"700",color:isWin?"#16A34A":"#DC2626",fontFamily:"monospace"}}>{t.pnl!=null?(isWin?"+":"")+"₹"+Math.abs(Number(t.pnl)).toLocaleString():"—"}</td><td style={{padding:"7px 10px",color:"#7C3AED",fontWeight:"700"}}>{t.rr}</td><td style={{padding:"7px 10px"}}><span style={{background:"#FFFBEB",color:"#D97706",padding:"1px 6px",borderRadius:"4px",fontSize:"11px",fontWeight:"600",fontFamily:"monospace"}}>{t.entryTF||"—"}</span></td><td style={{padding:"7px 10px"}}><span style={{background:"#F0FDF4",color:"#16A34A",padding:"1px 6px",borderRadius:"4px",fontSize:"11px",fontWeight:"600",fontFamily:"monospace"}}>{t.execTF||"—"}</span></td><td style={{padding:"7px 10px",fontSize:"11px",color:"#64748B"}}>{t.kz||"—"}</td><td style={{padding:"7px 10px",fontSize:"11px",color:"#94A3B8",maxWidth:"130px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={t.reasons?.join(", ")}>{t.reasons?.slice(0,2).join(", ")||"—"}</td></tr>);})}  </tbody></table></div>)}
          </div>
        </div>)}

        {tab==="learning"&&(
          <div style={{display:"grid",gap:"12px"}}>
            {learnLog.length>0&&<div style={{background:"#F5F3FF",borderRadius:"12px",padding:"16px 18px",border:"1.5px solid #DDD6FE"}}><div style={{fontWeight:"700",fontSize:"15px",color:"#7C3AED",marginBottom:"10px"}}>🧠 Latest Learning Session</div>{learnLog.map((e,i)=><div key={i} style={{fontSize:"13px",padding:"5px 0",color:e.startsWith("↑")||e.startsWith("✅")||e.startsWith("📈")?"#16A34A":e.startsWith("↓")||e.startsWith("⚠️")?"#DC2626":"#374151",lineHeight:"1.6",borderBottom:i<learnLog.length-1?"1px solid #EDE9FE":"none"}}>{e}</div>)}</div>}
            <div style={{background:"white",borderRadius:"12px",padding:"16px 18px",border:"1px solid #E2E8F0"}}>
              <div style={{fontWeight:"700",fontSize:"15px",marginBottom:"10px"}}>📚 Learning History ({brain.learningLog?.length||0} sessions)</div>
              {!brain.learningLog?.length&&<div style={{color:"#94A3B8",fontSize:"14px",textAlign:"center",padding:"28px"}}>No history. Click BT + Learn to start.</div>}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
                {brain.learningLog?.map((s,i)=>(<div key={i} style={{background:"#F8FAFC",borderRadius:"10px",padding:"12px",border:"1px solid #E2E8F0"}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:"5px"}}><span style={{color:"#7C3AED",fontWeight:"700",fontSize:"14px"}}>Gen {s.gen} · {s.sym}</span><span style={{color:"#94A3B8",fontSize:"12px"}}>{s.date}</span></div><div style={{display:"flex",gap:"12px",marginBottom:"4px"}}><span style={{color:s.winRate>=65?"#16A34A":s.winRate>=50?"#D97706":"#DC2626",fontWeight:"700",fontSize:"15px"}}>{s.winRate}% WR</span><span style={{color:"#64748B",fontSize:"13px"}}>{s.totalTrades} trades</span></div>{s.changes?.slice(0,3).map((c,j)=><div key={j} style={{color:"#64748B",fontSize:"12px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>· {c}</div>)}</div>))}
              </div>
            </div>
          </div>)}

        <div style={{height:"80px"}}/>
      </div>

      {/* ── FLOATING CHAT — bottom right corner ── */}
      <div style={{position:"fixed",bottom:"20px",right:"20px",zIndex:500,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:"8px",fontFamily:"'Inter','Segoe UI',sans-serif"}}>
        {chatOpen&&(
          <div style={{width:"380px",background:"white",borderRadius:"16px",border:"1px solid #E2E8F0",boxShadow:"0 8px 32px rgba(0,0,0,0.12)",display:"flex",flexDirection:"column",maxHeight:"520px"}}>
            <div style={{padding:"12px 16px",borderBottom:"1px solid #F1F5F9",display:"flex",justifyContent:"space-between",alignItems:"center",background:"linear-gradient(135deg,#1D4ED8,#7C3AED)",borderRadius:"15px 15px 0 0"}}>
              <div><div style={{fontWeight:"700",fontSize:"14px",color:"white"}}>🤖 ICT Sovereign Analyst</div><div style={{fontSize:"11px",color:"rgba(255,255,255,0.75)",marginTop:"1px"}}>{isLive?`${liveCount}/4 Live`:"Sim"} · {activeKZ?activeKZ.name:"No session"} · Gen {brain.generations}</div></div>
              <button onClick={()=>setChatOpen(false)} style={{background:"rgba(255,255,255,0.2)",border:"none",borderRadius:"6px",color:"white",padding:"4px 8px",cursor:"pointer",fontSize:"14px"}}>✕</button>
            </div>
            {!aiKey&&<div style={{padding:"10px 14px",background:"#FFFBEB",borderBottom:"1px solid #FDE047",fontSize:"12px",color:"#92400E",textAlign:"center"}}>⚠️ Add Anthropic key in ⚙️ Settings to enable AI chat</div>}
            <div style={{flex:1,overflowY:"auto",padding:"12px",display:"flex",flexDirection:"column",gap:"8px",minHeight:"200px",maxHeight:"340px"}}>
              {chat.map((m,i)=>(<div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}><div style={{maxWidth:"88%",padding:"9px 13px",borderRadius:m.role==="user"?"13px 13px 2px 13px":"13px 13px 13px 2px",background:m.role==="user"?"linear-gradient(135deg,#1D4ED8,#4338CA)":"#F8FAFC",color:m.role==="user"?"white":"#1E293B",fontSize:"13px",lineHeight:"1.6",whiteSpace:"pre-wrap",border:m.role==="assistant"?"1px solid #E2E8F0":"none",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>{m.content}</div></div>))}
              {chatLoading&&<div style={{display:"flex",gap:"4px",padding:"9px 13px",background:"#F8FAFC",borderRadius:"13px",width:"fit-content",border:"1px solid #E2E8F0"}}>{[0,1,2].map(i=><div key={i} style={{width:"7px",height:"7px",borderRadius:"50%",background:"#7C3AED",animation:`dot ${0.5+i*0.15}s infinite alternate`}}/>)}</div>}
              <div ref={chatRef}/>
            </div>
            <div style={{padding:"8px 12px",borderTop:"1px solid #F1F5F9",display:"flex",flexWrap:"wrap",gap:"4px"}}>
              {["Gold signal?","London KZ open?","Explain OTE","Judas swing?","Silver Bullet?","AMD phase?"].map(q=>(<button key={q} onClick={()=>setChatInput(q)} style={{background:"#F1F5F9",border:"1px solid #E2E8F0",color:"#64748B",borderRadius:"20px",padding:"3px 8px",fontSize:"11px",cursor:"pointer",whiteSpace:"nowrap"}}>{q}</button>))}
            </div>
            <div style={{padding:"8px 12px 12px",display:"flex",gap:"6px"}}>
              <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&handleChat()} placeholder={aiKey?"Ask about ICT setups...":"Add API key first"} style={{flex:1,background:"#F8FAFC",border:"1.5px solid #E2E8F0",borderRadius:"10px",padding:"9px 12px",color:"#1E293B",fontSize:"13px",outline:"none",fontFamily:"inherit"}} onFocus={e=>e.target.style.borderColor="#1D4ED8"} onBlur={e=>e.target.style.borderColor="#E2E8F0"}/>
              <button onClick={handleChat} disabled={chatLoading||!aiKey} style={{background:aiKey?"linear-gradient(135deg,#1D4ED8,#4338CA)":"#E2E8F0",color:aiKey?"white":"#94A3B8",border:"none",borderRadius:"10px",padding:"9px 14px",fontWeight:"700",cursor:aiKey?"pointer":"not-allowed",fontSize:"16px"}}>➤</button>
            </div>
          </div>)}

        {/* Chat toggle button */}
        <button onClick={()=>setChatOpen(!chatOpen)}
          style={{width:"56px",height:"56px",borderRadius:"50%",background:"linear-gradient(135deg,#1D4ED8,#7C3AED)",border:"none",color:"white",fontSize:"24px",cursor:"pointer",boxShadow:"0 4px 16px rgba(29,78,216,0.4)",display:"flex",alignItems:"center",justifyContent:"center",transition:"transform 0.2s"}}
          onMouseEnter={e=>e.target.style.transform="scale(1.1)"}
          onMouseLeave={e=>e.target.style.transform="scale(1)"}
          title="ICT AI Analyst Chat">
          {chatOpen?"✕":"🤖"}
        </button>
      </div>

      <style>{`@keyframes dot{from{transform:scale(0.7);opacity:0.4}to{transform:scale(1.3);opacity:1}}::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-track{background:#F1F5F9}::-webkit-scrollbar-thumb{background:#CBD5E1;border-radius:4px}::-webkit-scrollbar-thumb:hover{background:#94A3B8}select option{background:white;color:#1E293B}input[type=range]{accent-color:#1D4ED8}table tr:hover td{background:#EFF6FF!important}`}</style>
    </div>
  );
}
