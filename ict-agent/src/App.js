import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";

// NOTE: In a CRA/Vercel setup, these imports work because webpack bundles them.
// If deploying as single file, paste the contents of these files directly below.
// For GitHub deployment: place all files in src/ folder.

// ═══════════════════════════════════════════════════════════════
// INLINE IMPORTS (for single-file deployment compatibility)
// When splitting into multiple files, extract these into separate modules
// ═══════════════════════════════════════════════════════════════

/* ──────────────────────────────────────────────────────────────
   SECTION 1: CONFIGURATION & CONSTANTS
   ────────────────────────────────────────────────────────────── */

const VERSION = "4.0.0";
const APP_NAME = "Sovereign Trader";
const REFRESH_MS = 2000;
const ANALYSIS_MS = 45000;

const SYMBOLS = [
  { id: "XAUUSD", name: "Gold", yf: "GC=F", color: "#e2b340", icon: "⬙", pipMult: 10, pipDigit: 2, lotPipVal: 10 },
  { id: "XAGUSD", name: "Silver", yf: "SI=F", color: "#94a3b8", icon: "◈", pipMult: 100, pipDigit: 3, lotPipVal: 50 },
  { id: "USOIL", name: "Crude", yf: "CL=F", color: "#f97316", icon: "◉", pipMult: 100, pipDigit: 2, lotPipVal: 10 },
  { id: "NATGAS", name: "NatGas", yf: "NG=F", color: "#22c55e", icon: "◆", pipMult: 1000, pipDigit: 3, lotPipVal: 10 },
];

const fmt = (n, d = 2) => (n == null || isNaN(n)) ? "—" : Number(n).toFixed(d);
const fmtINR = (n) => {
  if (n == null || isNaN(n)) return "—";
  return (n < 0 ? "-" : "") + "₹" + Math.abs(Math.round(n)).toLocaleString("en-IN");
};
const calcPips = (symId, diff) => { const s = SYMBOLS.find(x => x.id === symId); return s ? +(Math.abs(diff) * s.pipMult).toFixed(1) : 0; };
const pipsToINR = (symId, pips, lots = 0.01) => { const s = SYMBOLS.find(x => x.id === symId); return s ? Math.round(pips * s.lotPipVal * lots * 83) : 0; };

const LS = {
  get: (k, d = null) => { try { return JSON.parse(localStorage.getItem("sov_" + k)) || d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem("sov_" + k, JSON.stringify(v)); } catch {} },
};

const getSession = () => {
  const m = new Date().getUTCHours() * 60 + new Date().getUTCMinutes();
  if (m < 300) return { name: "Asian", active: true };
  if (m >= 420 && m < 600) return { name: "London KZ", active: true };
  if (m >= 720 && m < 1020) return { name: "NY KZ", active: true };
  return { name: "Off Hours", active: false };
};

const sendWhatsApp = (phone, msg) => {
  if (!phone) return false;
  const clean = phone.replace(/[^0-9+]/g, "");
  window.open(`https://wa.me/${clean}?text=${encodeURIComponent(msg)}`, "_blank");
  return true;
};

/* ──────────────────────────────────────────────────────────────
   SECTION 2: DATA FETCHERS
   ────────────────────────────────────────────────────────────── */

const fetchPrice = async (symId, workerUrl) => {
  if (!workerUrl) return null;
  const sym = SYMBOLS.find(s => s.id === symId);
  try {
    const r = await fetch(`${workerUrl}?source=yf&sym=${encodeURIComponent(sym.yf)}`, { signal: AbortSignal.timeout(8000) });
    const d = await r.json();
    return d.price ? { price: +d.price, change: d.changePct || 0, live: true } : null;
  } catch { return null; }
};

const fetchCandles = async (symId, tf, workerUrl, range = "5d") => {
  if (!workerUrl) return [];
  const sym = SYMBOLS.find(s => s.id === symId);
  try {
    const r = await fetch(`${workerUrl}?source=yf&sym=${encodeURIComponent(sym.yf)}&type=candle&tf=${tf}&range=${range}`, { signal: AbortSignal.timeout(15000) });
    const d = await r.json();
    return d.candles || [];
  } catch { return []; }
};

/* ──────────────────────────────────────────────────────────────
   SECTION 3: ICT ANALYSIS ENGINE
   ────────────────────────────────────────────────────────────── */

const analyzeICT = (candles, symId, weights = {}) => {
  if (!candles || candles.length < 25) return { score: 0, bias: "NEUTRAL", factors: [] };
  const len = candles.length;
  const c = candles[len - 1], p1 = candles[len - 2];
  if (!c || !p1) return { score: 0, bias: "NEUTRAL", factors: [] };

  const sym = SYMBOLS.find(s => s.id === symId);
  const swH = Math.max(...candles.slice(-12).map(x => x.h));
  const swL = Math.min(...candles.slice(-12).map(x => x.l));
  const range = swH - swL;
  if (range <= 0) return { score: 0, bias: "NEUTRAL", factors: [] };

  const eq = (swH + swL) / 2;
  const factors = [];
  let bull = 0, bear = 0;

  // Market Structure
  if (c.c > (candles[len - 5]?.h || 0)) { bull += 12; factors.push({ p: "Structure", s: "BOS above swing high", t: "bull" }); }
  if (c.c < (candles[len - 5]?.l || Infinity)) { bear += 12; factors.push({ p: "Structure", s: "BOS below swing low", t: "bear" }); }

  // Order Blocks
  for (let i = len - 8; i < len - 1; i++) {
    const ci = candles[i], cn = candles[i + 1];
    if (!ci || !cn) continue;
    if (ci.c < ci.o && cn.c > cn.o && (cn.c - cn.o) > range * 0.12) {
      const ob50 = (ci.o + ci.c) / 2;
      if (c.l <= ob50 * 1.002 && c.c > ob50) { bull += 10; factors.push({ p: "Order Block", s: `Bullish OB 50% @ ${fmt(ob50, sym.pipDigit)}`, t: "bull" }); break; }
    }
    if (ci.c > ci.o && cn.c < cn.o && (cn.o - cn.c) > range * 0.12) {
      const ob50 = (ci.o + ci.c) / 2;
      if (c.h >= ob50 * 0.998 && c.c < ob50) { bear += 10; factors.push({ p: "Order Block", s: `Bearish OB 50% @ ${fmt(ob50, sym.pipDigit)}`, t: "bear" }); break; }
    }
  }

  // FVG
  for (let i = len - 8; i < len - 2; i++) {
    const c1 = candles[i], c3 = candles[i + 2];
    if (!c1 || !c3) continue;
    if (c3.l > c1.h) { const ce = (c3.l + c1.h) / 2; if (c.l <= ce && c.c > ce) { bull += 10; factors.push({ p: "FVG", s: `Bullish FVG CE @ ${fmt(ce, sym.pipDigit)}`, t: "bull" }); break; } }
    if (c3.h < c1.l) { const ce = (c3.h + c1.l) / 2; if (c.h >= ce && c.c < ce) { bear += 10; factors.push({ p: "FVG", s: `Bearish FVG CE @ ${fmt(ce, sym.pipDigit)}`, t: "bear" }); break; } }
  }

  // Liquidity
  const eqLo = candles.slice(-15).filter(x => Math.abs(x.l - swL) < range * 0.015).length;
  const eqHi = candles.slice(-15).filter(x => Math.abs(x.h - swH) < range * 0.015).length;
  if (eqLo >= 2 && c.l < swL && c.c > swL) { bull += 11; factors.push({ p: "Liquidity", s: "SSL swept — reversal up", t: "bull" }); }
  if (eqHi >= 2 && c.h > swH && c.c < swH) { bear += 11; factors.push({ p: "Liquidity", s: "BSL swept — reversal down", t: "bear" }); }

  // Premium/Discount
  if (c.c < eq) { bull += 7; factors.push({ p: "P/D Zone", s: "In discount", t: "bull" }); }
  else { bear += 7; factors.push({ p: "P/D Zone", s: "In premium", t: "bear" }); }

  // Session
  const sess = getSession();
  if (sess.active) {
    const pts = 6;
    if (bull >= bear) { bull += pts; factors.push({ p: "Session", s: `${sess.name} active`, t: "bull" }); }
    else { bear += pts; factors.push({ p: "Session", s: `${sess.name} active`, t: "bear" }); }
  }

  // OTE
  const retL = (swH - c.c) / range;
  if (retL >= 0.618 && retL <= 0.786) { bull += 9; factors.push({ p: "OTE", s: `Bullish OTE (${(retL * 100).toFixed(0)}%)`, t: "bull" }); }
  const retS = (c.c - swL) / range;
  if (retS >= 0.618 && retS <= 0.786) { bear += 9; factors.push({ p: "OTE", s: `Bearish OTE (${(retS * 100).toFixed(0)}%)`, t: "bear" }); }

  const score = Math.min(Math.max(bull, bear), 100);
  const bias = bull > bear + 3 ? "LONG" : bear > bull + 3 ? "SHORT" : "NEUTRAL";

  let entry = c.c, sl = null, tp1 = null, tp2 = null;
  if (bias === "LONG") { sl = swL - range * 0.03; tp1 = entry + (entry - sl) * 1.5; tp2 = entry + (entry - sl) * 3; }
  if (bias === "SHORT") { sl = swH + range * 0.03; tp1 = entry - (sl - entry) * 1.5; tp2 = entry - (sl - entry) * 3; }

  return { score, bias, factors, entry, sl, tp1, tp2, swH, swL, eq };
};

/* ──────────────────────────────────────────────────────────────
   SECTION 4: KNOWLEDGE BASE (from "The Sovereign Trader" book)
   ────────────────────────────────────────────────────────────── */

const KB = [
  { id: "liquidity", ch: "Ch.4", title: "Liquidity — The Lifeblood", w: 12,
    summary: "Price moves in search of liquidity. Institutions drive price toward stop-loss clusters to fill large positions.",
    body: "Liquidity is the availability of opposing orders. Institutions need large clusters of stop losses to fill their positions without moving price.\n\n• Buy-Side Liquidity (BSL): Stops above equal highs — price sweeps up to trigger them\n• Sell-Side Liquidity (SSL): Stops below equal lows — price sweeps down to trigger them\n• Equal Highs/Lows: Visible shelves that the algorithm targets\n\nThe Internal-to-External Loop: Algorithm cycles between FVGs/OBs inside a range (internal) and the range highs/lows (external)." },
  { id: "structure", ch: "Ch.3", title: "Market Structure — The Map", w: 11,
    summary: "The sequence of highs and lows defines the trend. BOS confirms continuation; CHoCH signals reversal.",
    body: "UPTREND: Higher Highs + Higher Lows\nDOWNTREND: Lower Highs + Lower Lows\n\n• BOS (Break of Structure): Price breaks a swing point WITH the trend\n• CHoCH (Change of Character): First break AGAINST the trend — early reversal signal\n• MSS (Market Structure Shift): Aggressive CHoCH with displacement\n\nStrong High/Low: Created after sweeping liquidity + breaking structure with displacement\nWeak High/Low: Failed to break opposing structure" },
  { id: "order_blocks", ch: "Ch.5", title: "Order Blocks — The Giant's Footprint", w: 10,
    summary: "The last opposing candle before displacement. Where institutions built their positions.",
    body: "Bullish OB: Last bearish candle before bullish displacement\nBearish OB: Last bullish candle before bearish displacement\n\nMean Threshold: The 50% level of the OB body — optimal entry point\n\nValid OB requires:\n✓ Followed by displacement (large candles)\n✓ Creates FVG as byproduct\n✓ In correct pricing zone (discount for bullish, premium for bearish)\n✓ Aligned with HTF bias\n\nInvalid if: No displacement, already mitigated, wrong zone, against HTF" },
  { id: "fvg", ch: "Ch.6", title: "Fair Value Gaps — The Imbalance", w: 10,
    summary: "Three-candle pattern where the middle candle creates a gap. The algorithm must return to fill this inefficiency.",
    body: "The algorithm's mandate: offer price EFFICIENTLY to both buyers and sellers.\n\n• Bullish FVG: Candle 3 low ABOVE candle 1 high\n• Bearish FVG: Candle 3 high BELOW candle 1 low\n\nConsequent Encroachment (CE): 50% level of the FVG — key reaction zone\n\nTrading: Wait for retracement into gap → Enter at CE → SL beyond gap → TP at next liquidity\n\nHTF FVG > LTF FVG — Daily gap matters far more than 5-minute gap" },
  { id: "manipulation", ch: "Ch.7", title: "Manipulation — The Engineered Trap", w: 9,
    summary: "Stop hunts, Judas swings, and AMD cycles are the primary tools used to trap retail traders.",
    body: "The market is engineered. Retail traders are the fuel.\n\n• Stop Hunts: Price targets obvious SL clusters\n• Judas Swing: False move at session open — opposite of intended direction\n• Inducement: Small liquidity traps near OBs\n\nAMD CYCLE:\n1. Accumulation — Range builds, liquidity on both sides\n2. Manipulation — False breakout grabs liquidity (THE TRAP)\n3. Distribution — Real move in the intended direction" },
  { id: "time_price", ch: "Ch.8", title: "Time & Price — The Institutional Clock", w: 9,
    summary: "The market is a timed auction. Killzones are when institutions are active. Wrong time = wrong trade.",
    body: "KILLZONES (IST):\n• Asian: 05:30–10:30 — Builds the range\n• London: 12:30–15:30 — First big move, sweeps Asian range\n• NY AM: 17:30–20:30 — Highest volume, strongest moves\n\nSILVER BULLET: London 13:30–14:30 | NY 20:30–21:30\nLook for FVG to form within window, enter on retest\n\nDAILY: Asia→range, London→manipulate, NY→distribute\nWEEKLY: Mon→range, Tue/Wed→power days, Fri→reversal\n90-MIN CYCLE: From NY midnight, every 90min = potential turn" },
  { id: "premium_discount", ch: "Ch.9", title: "Premium & Discount — The Value Zone", w: 8,
    summary: "Smart money buys below the 50% mark (discount) and sells above it (premium).",
    body: "Equilibrium = 50% of dealing range\n\n• DISCOUNT (below 50%): Only look for LONGS here\n• PREMIUM (above 50%): Only look for SHORTS here\n\nOTE (Optimal Trade Entry): 61.8%–78.6% Fib retracement\nSweet spot: 70.5% — must overlap with OB or FVG\n\nBullish OB in discount + HTF bullish = HIGH PROBABILITY\nBearish OB in premium + HTF bearish = HIGH PROBABILITY" },
  { id: "risk", ch: "Ch.11", title: "Risk Management — The Shield", w: 0,
    summary: "Never risk more than 1% per trade. This is non-negotiable.",
    body: "IRON LAWS:\n• Max 1% risk per trade (2% for A+ setups only)\n• Max 3% daily loss → stop trading\n• Max 5% weekly loss → stop for the week\n• Max 10% drawdown → cut size by 50%\n\nPOSITION SIZING:\nLot Size = (Account × Risk%) ÷ (SL pips × Pip Value × 83)\n\nR-MULTIPLES: Every trade measured in R (amount risked)\nMinimum target: 1.5R per trade. Ideal: 3R+" },
  { id: "psychology", ch: "Ch.13", title: "Psychology — The Mental Fortress", w: 0,
    summary: "The market transfers wealth from emotional traders to disciplined ones.",
    body: "• FOMO is the #1 killer — missing a trade costs nothing\n• After a loss: DO NOT revenge trade\n• After a win: DO NOT press your luck\n• Best traders are BORED most of the time\n• Your job: REACT to the algorithm, not PREDICT\n• Max 3 trades per day. Zero is acceptable.\n• Capital preservation above all else" },
  { id: "mtf", ch: "Ch.16", title: "Multi-Timeframe — The Fractal Symphony", w: 0,
    summary: "Daily for narrative, 4H for structure, 15m for refinement, 5m for precision. All must agree.",
    body: "HIERARCHY:\n• Daily: The narrative — bullish or bearish this week?\n• 4-Hour: Key OBs, FVGs, liquidity pools\n• 15-Minute: Refine setup zone, confirm 4H bias\n• 5-Minute: Precise entry during Killzones\n\nRULE: NEVER trade against Daily bias\nCONFLICT: Higher TF always wins. Wait for alignment." },
];

/* ──────────────────────────────────────────────────────────────
   SECTION 5: CSS THEME (inline for single-file deployment)
   ────────────────────────────────────────────────────────────── */

const getCSS = (dark) => `
@import url('https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=swap');
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');
:root{
--s0:${dark?"#09090b":"#f5f5f7"};--s1:${dark?"#111114":"#fff"};--s2:${dark?"#18181c":"#f8f8fa"};
--s3:${dark?"#222228":"#eeeef0"};--s4:${dark?"#2c2c35":"#e0e0e4"};--hov:${dark?"#2a2a34":"#ececf0"};
--b1:${dark?"#27272f":"#dddde2"};--b2:${dark?"#35353f":"#c8c8d0"};
--t1:${dark?"#fafafa":"#0f0f12"};--t2:${dark?"#a1a1aa":"#5a5a6e"};--t3:${dark?"#63637a":"#9393a0"};
--gold:#e2b340;--gold-s:rgba(226,179,64,${dark?.12:.08});
--grn:#22c55e;--grn-s:rgba(34,197,94,${dark?.14:.08});
--red:#ef4444;--red-s:rgba(239,68,68,${dark?.14:.08});
--blu:#3b82f6;--blu-s:rgba(59,130,246,${dark?.14:.08});
--fn:'Satoshi',-apple-system,BlinkMacSystemFont,sans-serif;--mo:'JetBrains Mono',monospace;
--r:12px;--rs:8px;
}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--s0);color:var(--t1);font-family:var(--fn);font-size:15px;line-height:1.6;-webkit-font-smoothing:antialiased}
.shell{min-height:100vh;display:flex;flex-direction:column}
.hdr{background:var(--s1);border-bottom:1px solid var(--b1);padding:0 28px;height:60px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100}
.logo{display:flex;align-items:center;gap:14px}
.logo-m{width:36px;height:36px;background:linear-gradient(145deg,var(--gold),#c99a20);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 2px 12px rgba(226,179,64,.2)}
.logo-t{font-size:17px;font-weight:900;letter-spacing:-.4px}
.logo-v{font-size:10px;font-family:var(--mo);color:var(--gold);background:var(--gold-s);padding:2px 8px;border-radius:20px;font-weight:600}
.ps{display:flex;gap:14px;align-items:center}
.pc{display:flex;align-items:center;gap:8px;padding:6px 14px;border-radius:24px;background:var(--s2);border:1px solid var(--b1);font-family:var(--mo);font-size:13px;font-weight:500;cursor:pointer;transition:all .2s;color:var(--t1)}
.pc:hover{border-color:var(--b2);background:var(--hov)}
.pc.act{border-color:rgba(226,179,64,.25);background:var(--gold-s)}
.dl{width:7px;height:7px;border-radius:50%;background:var(--grn);box-shadow:0 0 8px var(--grn);animation:pu 2.5s infinite}
.do{width:7px;height:7px;border-radius:50%;background:var(--t3)}
@keyframes pu{0%,100%{opacity:1}50%{opacity:.35}}
.hr{display:flex;align-items:center;gap:10px}
.sp{padding:5px 12px;border-radius:20px;font-size:12px;font-weight:700;font-family:var(--mo)}
.sp.on{background:var(--grn-s);color:var(--grn)}.sp.off{background:var(--s3);color:var(--t3)}
.tg{width:40px;height:22px;border-radius:11px;background:var(--s3);border:1px solid var(--b1);cursor:pointer;position:relative;transition:all .25s}
.tg.dk{background:var(--gold-s);border-color:rgba(226,179,64,.25)}
.tg::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--t2);transition:all .25s}
.tg.dk::after{transform:translateX(18px);background:var(--gold)}
.nav{display:flex;gap:2px;padding:10px 28px;background:var(--s1);border-bottom:1px solid var(--b1);overflow-x:auto;scrollbar-width:none}
.nav::-webkit-scrollbar{display:none}
.ni{padding:9px 18px;border-radius:var(--rs);font-size:14px;font-weight:500;color:var(--t3);cursor:pointer;transition:all .2s;white-space:nowrap;border:none;background:none;font-family:var(--fn);display:flex;align-items:center;gap:8px}
.ni:hover{color:var(--t2);background:var(--s2)}
.ni.a{color:var(--gold);background:var(--gold-s);font-weight:700}
.main{flex:1;padding:24px 28px;max-width:1480px;margin:0 auto;width:100%}
.card{background:var(--s1);border:1px solid var(--b1);border-radius:var(--r);padding:24px;margin-bottom:16px;transition:border-color .2s}
.card:hover{border-color:var(--b2)}
.ch{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:8px}
.ct{font-size:17px;font-weight:700;letter-spacing:-.3px;display:flex;align-items:center;gap:10px}
.btn{padding:10px 20px;border-radius:var(--rs);font-family:var(--fn);font-size:14px;font-weight:600;cursor:pointer;transition:all .2s;border:1px solid transparent;display:inline-flex;align-items:center;gap:8px}
.btn-g{background:linear-gradient(145deg,var(--gold),#c99a20);color:#000}.btn-g:hover{box-shadow:0 4px 20px rgba(226,179,64,.3);transform:translateY(-1px)}
.btn-o{background:var(--s2);color:var(--t1);border-color:var(--b1)}.btn-o:hover{background:var(--hov);border-color:var(--b2)}
.btn-gr{background:var(--grn-s);color:var(--grn)}.btn-rd{background:var(--red-s);color:var(--red)}
.btn-sm{padding:6px 12px;font-size:12px}
.sg{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.sc{background:var(--s1);border:1px solid var(--b1);border-radius:var(--r);padding:18px;cursor:pointer;transition:all .2s;position:relative;overflow:hidden}
.sc::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;border-radius:var(--r) var(--r) 0 0}
.sc:hover{border-color:var(--b2);transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.08)}
.sc.act{border-color:rgba(226,179,64,.3)}
.sc-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.sc-s{font-size:15px;font-weight:800;display:flex;align-items:center;gap:8px}
.sc-p{font-family:var(--mo);font-size:26px;font-weight:700;margin-bottom:8px}
.cb{width:100%;height:6px;background:var(--s3);border-radius:3px;overflow:hidden;margin:8px 0}
.cf{height:100%;border-radius:3px;transition:width .6s ease}
.sb{padding:8px 14px;border-radius:var(--rs);font-size:13px;font-weight:700;text-align:center;margin-top:12px}
.sb-l{background:var(--grn-s);color:var(--grn)}.sb-s{background:var(--red-s);color:var(--red)}.sb-n{background:var(--s3);color:var(--t3)}
.cw{background:var(--s1);border:1px solid var(--b1);border-radius:var(--r);overflow:hidden}
.ctb{display:flex;align-items:center;justify-content:space-between;padding:10px 18px;border-bottom:1px solid var(--b1);background:var(--s2)}
.ctb-l,.ctb-r{display:flex;align-items:center;gap:6px}
.tf{padding:5px 12px;border-radius:6px;font-size:12px;font-family:var(--mo);font-weight:600;color:var(--t3);background:transparent;border:1px solid transparent;cursor:pointer;transition:all .15s}
.tf:hover{color:var(--t2);background:var(--s3)}.tf.a{color:var(--gold);background:var(--gold-s)}
.ca{width:100%;min-height:460px;position:relative}
.tw{overflow-x:auto;border-radius:var(--rs);border:1px solid var(--b1)}
.dt{width:100%;border-collapse:collapse;font-size:13px}
.dt th{background:var(--s2);padding:12px 14px;text-align:left;font-weight:600;color:var(--t3);border-bottom:1px solid var(--b1);white-space:nowrap;text-transform:uppercase;letter-spacing:.6px;font-size:11px;font-family:var(--mo)}
.dt td{padding:12px 14px;border-bottom:1px solid var(--b1);white-space:nowrap}
.dt tr:hover td{background:var(--hov)}
.tag{display:inline-flex;padding:3px 10px;border-radius:16px;font-size:11px;font-weight:700;font-family:var(--mo)}
.tag-g{background:var(--grn-s);color:var(--grn)}.tag-r{background:var(--red-s);color:var(--red)}.tag-y{background:var(--gold-s);color:var(--gold)}.tag-b{background:var(--blu-s);color:var(--blu)}
.ig{margin-bottom:14px}
.il{font-size:12px;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;display:block}
.inp{background:var(--s2);border:1px solid var(--b1);border-radius:var(--rs);padding:12px 16px;color:var(--t1);font-family:var(--mo);font-size:15px;transition:border-color .2s;outline:none;width:100%}
.inp:focus{border-color:var(--gold);box-shadow:0 0 0 3px var(--gold-s)}
.stg{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px}
.st{background:var(--s2);border-radius:var(--rs);padding:16px;text-align:center;border:1px solid var(--b1)}
.sv{font-family:var(--mo);font-size:24px;font-weight:700}
.sl{font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;margin-top:4px}
.sr{display:flex;align-items:center;gap:10px;padding:8px 14px;background:var(--s2);border-radius:var(--rs);font-size:13px;margin-bottom:4px}
.kb{border:1px solid var(--b1);border-radius:var(--r);margin-bottom:10px;overflow:hidden}
.kb-h{padding:16px 20px;background:var(--s2);cursor:pointer;display:flex;align-items:center;justify-content:space-between;transition:background .2s}
.kb-h:hover{background:var(--hov)}
.kb-t{font-weight:700;font-size:15px;display:flex;align-items:center;gap:10px}
.kb-b{padding:20px;background:var(--s1);font-size:14px;line-height:1.8;color:var(--t2);white-space:pre-wrap}
.g2{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}
.spin{display:inline-block;width:16px;height:16px;border:2px solid var(--b1);border-top-color:var(--gold);border-radius:50%;animation:sp .7s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}
@keyframes fi{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.anim{animation:fi .3s ease forwards}
.empty{text-align:center;padding:48px 24px;color:var(--t3)}
.foot{padding:14px 28px;border-top:1px solid var(--b1);background:var(--s1);text-align:center;font-size:12px;color:var(--t3);font-family:var(--mo)}
@media(max-width:900px){.sg{grid-template-columns:repeat(2,1fr)}.ps{display:none}.sc-p{font-size:20px}}
@media(max-width:640px){.hdr{padding:0 14px;height:52px}.main{padding:14px}.nav{padding:8px 14px}.sg{grid-template-columns:1fr}.card{padding:16px}.stg{grid-template-columns:repeat(2,1fr)}}
::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track{background:var(--s0)}::-webkit-scrollbar-thumb{background:var(--b1);border-radius:3px}
`;

/* ──────────────────────────────────────────────────────────────
   SECTION 6: CHART COMPONENT (Script tag injection — NOT ESM import)
   ────────────────────────────────────────────────────────────── */

let LWC_P = null;
const loadLWC = () => {
  if (window.LightweightCharts) return Promise.resolve(window.LightweightCharts);
  if (LWC_P) return LWC_P;
  LWC_P = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://unpkg.com/lightweight-charts@4.1.0/dist/lightweight-charts.standalone.production.js";
    s.onload = () => res(window.LightweightCharts);
    s.onerror = () => rej(new Error("Chart lib failed"));
    document.head.appendChild(s);
  });
  return LWC_P;
};

const ChartView = ({ sym, candles, analysis, onLoad, loading, dark }) => {
  const ref = useRef(null);
  const inst = useRef(null);
  const [tf, setTf] = useState("15m");
  const [h, setH] = useState(460);
  const [ready, setReady] = useState(!!window.LightweightCharts);
  const [err, setErr] = useState(null);
  const s = SYMBOLS.find(x => x.id === sym);

  useEffect(() => { loadLWC().then(() => setReady(true)).catch(e => setErr(e.message)); }, []);
  useEffect(() => { if (onLoad) onLoad(sym, tf); }, [tf, sym]);

  useEffect(() => {
    if (!ref.current || !ready || !candles?.length) return;
    const LWC = window.LightweightCharts; if (!LWC) return;
    if (inst.current) { inst.current.remove(); inst.current = null; }

    try {
      const chart = LWC.createChart(ref.current, {
        width: ref.current.clientWidth, height: h,
        layout: { background: { color: dark ? "#09090b" : "#fff" }, textColor: dark ? "#a1a1aa" : "#5a5a6e", fontFamily: "'JetBrains Mono',monospace", fontSize: 11 },
        grid: { vertLines: { color: dark ? "#18181c" : "#f3f3f5" }, horzLines: { color: dark ? "#18181c" : "#f3f3f5" } },
        crosshair: { mode: 0 },
        rightPriceScale: { borderColor: dark ? "#27272f" : "#dddde2" },
        timeScale: { borderColor: dark ? "#27272f" : "#dddde2", timeVisible: true },
      });

      const ser = chart.addCandlestickSeries({ upColor: "#22c55e", downColor: "#ef4444", wickUpColor: "#22c55e", wickDownColor: "#ef4444", borderVisible: false });

      const data = candles.map(c => ({
        time: typeof c.t === "number" ? (c.t > 1e12 ? Math.floor(c.t / 1000) : c.t) : Math.floor(new Date(c.t).getTime() / 1000),
        open: +c.o, high: +c.h, low: +c.l, close: +c.c,
      })).filter(c => c.time > 0 && c.open > 0).sort((a, b) => a.time - b.time);

      // Deduplicate
      const seen = new Set(), uniq = [];
      for (const c of data) { if (!seen.has(c.time)) { seen.add(c.time); uniq.push(c); } }
      if (uniq.length) ser.setData(uniq);

      // ICT levels
      if (analysis?.bias !== "NEUTRAL") {
        if (analysis.entry) ser.createPriceLine({ price: analysis.entry, color: s?.color || "#e2b340", lineWidth: 2, lineStyle: 0, title: "Entry" });
        if (analysis.sl) ser.createPriceLine({ price: analysis.sl, color: "#ef4444", lineWidth: 1, lineStyle: 2, title: "SL" });
        if (analysis.tp1) ser.createPriceLine({ price: analysis.tp1, color: "#22c55e", lineWidth: 1, lineStyle: 2, title: "TP1" });
        if (analysis.tp2) ser.createPriceLine({ price: analysis.tp2, color: "#22c55e88", lineWidth: 1, lineStyle: 3, title: "TP2" });
      }

      chart.timeScale().fitContent();
      inst.current = chart;
      const ro = new ResizeObserver(() => { if (ref.current) chart.applyOptions({ width: ref.current.clientWidth }); });
      ro.observe(ref.current);
      return () => { ro.disconnect(); if (inst.current) { inst.current.remove(); inst.current = null; } };
    } catch (e) { setErr(e.message); }
  }, [candles, analysis, sym, dark, h, ready]);

  return (
    <div className="cw">
      <div className="ctb">
        <div className="ctb-l">
          <span style={{ fontSize: 15, fontWeight: 700, color: s?.color, marginRight: 12 }}>{s?.icon} {sym}</span>
          {["1m","5m","15m","1h","4h","1d"].map(t => <button key={t} className={`tf ${tf===t?"a":""}`} onClick={() => setTf(t)}>{t}</button>)}
        </div>
        <div className="ctb-r">
          {loading && <span className="spin" />}
          <button className="btn btn-sm btn-o" onClick={() => onLoad?.(sym, tf)}>↻</button>
          <button className="btn btn-sm btn-o" onClick={() => setH(v => Math.max(280, v - 60))}>−</button>
          <button className="btn btn-sm btn-o" onClick={() => setH(v => Math.min(800, v + 60))}>+</button>
        </div>
      </div>
      {err ? <div className="empty"><p>Chart error: {err}</p><button className="btn btn-o" style={{ marginTop: 12 }} onClick={() => { setErr(null); loadLWC().then(() => setReady(true)); }}>Retry</button></div>
      : !ready ? <div style={{ padding: 40, textAlign: "center" }}><span className="spin" /> Loading charts...</div>
      : <div ref={ref} className="ca" style={{ height: h }} />}
    </div>
  );
};

/* ──────────────────────────────────────────────────────────────
   SECTION 7: TAB COMPONENTS
   ────────────────────────────────────────────────────────────── */

// ── SCANNER + CHART ──
const ScannerTab = ({ prices, analyses, activeSym, setActiveSym, candles, workerUrl, setCandles, dark }) => {
  const [loading, setLoading] = useState(false);
  const loadC = useCallback(async (sym, tf) => {
    setLoading(true);
    const d = await fetchCandles(sym, tf, workerUrl);
    if (d.length) setCandles(sym, d);
    setLoading(false);
  }, [workerUrl, setCandles]);

  return (
    <div className="anim">
      <div className="ch"><span className="ct">Market Scanner</span>
        <button className="btn btn-sm btn-o" onClick={() => SYMBOLS.forEach(s => fetchPrice(s.id, workerUrl))}>↻ Refresh</button>
      </div>
      <div className="sg">
        {SYMBOLS.map(s => {
          const p = prices[s.id], a = analyses[s.id] || { score: 0, bias: "NEUTRAL" };
          return (
            <div key={s.id} className={`sc ${activeSym===s.id?"act":""}`} onClick={() => setActiveSym(s.id)}>
              <div className="sc-h">
                <span className="sc-s"><span style={{ color: s.color, fontSize: 20 }}>{s.icon}</span> {s.name}</span>
                <span className={p?.live ? "dl" : "do"} />
              </div>
              <div className="sc-p" style={{ color: s.color }}>${p?.price ? fmt(p.price, s.pipDigit) : "—"}</div>
              {p?.change != null && <div style={{ fontSize: 12, fontFamily: "var(--mo)", color: p.change >= 0 ? "var(--grn)" : "var(--red)", marginBottom: 6 }}>{p.change >= 0 ? "+" : ""}{fmt(p.change, 2)}%</div>}
              <div className="cb"><div className="cf" style={{ width: `${a.score}%`, background: a.score >= 60 ? "var(--grn)" : a.score >= 40 ? "var(--gold)" : "var(--t3)" }} /></div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ fontFamily: "var(--mo)", color: "var(--t3)" }}>{a.score}/100</span>
                <span className={`tag ${a.bias==="LONG"?"tag-g":a.bias==="SHORT"?"tag-r":"tag-y"}`}>{a.bias}</span>
              </div>
              {a.bias !== "NEUTRAL" && <div className={`sb ${a.bias==="LONG"?"sb-l":"sb-s"}`}>{a.bias === "LONG" ? "▲" : "▼"} {a.bias} — {a.score}pts</div>}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 16 }}>
        <ChartView sym={activeSym} candles={candles[activeSym] || []} analysis={analyses[activeSym]} onLoad={loadC} loading={loading} dark={dark} />
      </div>

      {analyses[activeSym]?.bias !== "NEUTRAL" && analyses[activeSym] && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="ch">
            <span className="ct">🎯 Active Signal — {analyses[activeSym].bias} {activeSym}</span>
            <span className={`tag ${analyses[activeSym].bias==="LONG"?"tag-g":"tag-r"}`}>{analyses[activeSym].score}/100</span>
          </div>
          <div className="stg" style={{ marginBottom: 14 }}>
            {[
              { l: "Entry", v: "$" + fmt(analyses[activeSym].entry, SYMBOLS.find(s=>s.id===activeSym)?.pipDigit), c: SYMBOLS.find(s=>s.id===activeSym)?.color },
              { l: "Stop Loss", v: "$" + fmt(analyses[activeSym].sl, SYMBOLS.find(s=>s.id===activeSym)?.pipDigit), c: "var(--red)" },
              { l: "TP1 (1.5R)", v: "$" + fmt(analyses[activeSym].tp1, SYMBOLS.find(s=>s.id===activeSym)?.pipDigit), c: "var(--grn)" },
              { l: "TP2 (3R)", v: "$" + fmt(analyses[activeSym].tp2, SYMBOLS.find(s=>s.id===activeSym)?.pipDigit), c: "var(--grn)" },
            ].map((x, i) => <div key={i} className="st"><div className="sv" style={{ color: x.c, fontSize: 18 }}>{x.v}</div><div className="sl">{x.l}</div></div>)}
          </div>
          {analyses[activeSym].factors.map((f, i) => (
            <div key={i} className="sr"><span style={{ color: f.t==="bull"?"var(--grn)":"var(--red)" }}>{f.t==="bull"?"▲":"▼"}</span><strong>{f.p}</strong>: {f.s}</div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── KNOWLEDGE ──
const KnowledgeTab = () => {
  const [exp, setExp] = useState(null);
  return (
    <div className="anim">
      <div className="card">
        <div className="ch"><span className="ct">📖 The Sovereign Trader — Knowledge Base</span></div>
        <p style={{ fontSize: 14, color: "var(--t2)", marginBottom: 18, lineHeight: 1.7 }}>
          Complete ICT/SMC framework from "The Sovereign Trader: Mastering Smart Money, Price Action & Institutional Trading Strategies."
        </p>
        {KB.map((k, i) => (
          <div key={k.id} className="kb">
            <div className="kb-h" onClick={() => setExp(exp===i?null:i)}>
              <div className="kb-t">
                <span className="tag tag-y">{k.ch}</span>
                {k.w > 0 && <span className="tag tag-b">W:{k.w}</span>}
                {k.title}
              </div>
              <span style={{ color: "var(--t3)", fontSize: 12 }}>{exp===i?"▲":"▼"}</span>
            </div>
            {exp===i && (
              <div className="kb-b">
                <p style={{ fontWeight: 600, color: "var(--t1)", marginBottom: 12 }}>{k.summary}</p>
                {k.body}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ── CALCULATOR ──
const CalcTab = ({ prices }) => {
  const [sym, setSym] = useState("XAUUSD");
  const [entry, setEntry] = useState("");
  const [sl, setSl] = useState("");
  const [tp1, setTp1] = useState("");
  const [tp2, setTp2] = useState("");
  const [lots, setLots] = useState("0.01");

  const s = SYMBOLS.find(x => x.id === sym);
  const e = +entry, slv = +sl, t1 = +tp1, t2 = +tp2, l = +lots;
  const dir = e && slv ? (slv < e ? "LONG" : "SHORT") : null;

  const slPips = e && slv && s ? calcPips(sym, Math.abs(e - slv)) : 0;
  const tp1Pips = e && t1 && s ? calcPips(sym, Math.abs(t1 - e)) : 0;
  const tp2Pips = e && t2 && s ? calcPips(sym, Math.abs(t2 - e)) : 0;

  const slINR = pipsToINR(sym, slPips, l);
  const tp1INR = pipsToINR(sym, tp1Pips, l);
  const tp2INR = pipsToINR(sym, tp2Pips, l);
  const rr1 = slPips > 0 ? (tp1Pips / slPips).toFixed(2) : "—";
  const rr2 = slPips > 0 ? (tp2Pips / slPips).toFixed(2) : "—";

  return (
    <div className="anim">
      <div className="card">
        <div className="ch"><span className="ct">🧮 Position Calculator</span></div>
        <div className="g2">
          <div>
            <div className="ig"><label className="il">Symbol</label><select className="inp" value={sym} onChange={e => setSym(e.target.value)}>{SYMBOLS.map(s => <option key={s.id} value={s.id}>{s.icon} {s.id} ({s.name})</option>)}</select></div>
            <div className="ig"><label className="il">Entry Price</label><input className="inp" type="number" value={entry} onChange={e => setEntry(e.target.value)} placeholder={prices[sym]?.price ? `Current: ${fmt(prices[sym].price, s?.pipDigit)}` : "Enter price"} /></div>
            <div className="ig"><label className="il">Stop Loss</label><input className="inp" type="number" value={sl} onChange={e => setSl(e.target.value)} placeholder="SL price" /></div>
            <div className="ig"><label className="il">Take Profit 1</label><input className="inp" type="number" value={tp1} onChange={e => setTp1(e.target.value)} placeholder="TP1 price" /></div>
            <div className="ig"><label className="il">Take Profit 2</label><input className="inp" type="number" value={tp2} onChange={e => setTp2(e.target.value)} placeholder="TP2 price" /></div>
            <div className="ig"><label className="il">Lot Size</label><input className="inp" type="number" value={lots} onChange={e => setLots(e.target.value)} step="0.01" /></div>
          </div>
          <div>
            {dir && <div style={{ marginBottom: 14, textAlign: "center" }}><span className={`tag ${dir==="LONG"?"tag-g":"tag-r"}`} style={{ fontSize: 14, padding: "6px 16px" }}>{dir}</span></div>}
            <div className="stg">
              <div className="st"><div className="sv" style={{ color: "var(--red)" }}>{slPips}</div><div className="sl">SL Pips</div></div>
              <div className="st"><div className="sv" style={{ color: "var(--red)" }}>{fmtINR(slINR)}</div><div className="sl">Risk (₹)</div></div>
              <div className="st"><div className="sv" style={{ color: "var(--grn)" }}>{tp1Pips}</div><div className="sl">TP1 Pips</div></div>
              <div className="st"><div className="sv" style={{ color: "var(--grn)" }}>{fmtINR(tp1INR)}</div><div className="sl">TP1 Profit</div></div>
              <div className="st"><div className="sv" style={{ color: "var(--grn)" }}>{tp2Pips}</div><div className="sl">TP2 Pips</div></div>
              <div className="st"><div className="sv" style={{ color: "var(--grn)" }}>{fmtINR(tp2INR)}</div><div className="sl">TP2 Profit</div></div>
              <div className="st"><div className="sv" style={{ color: "var(--blu)" }}>{rr1}</div><div className="sl">R:R (TP1)</div></div>
              <div className="st"><div className="sv" style={{ color: "var(--blu)" }}>{rr2}</div><div className="sl">R:R (TP2)</div></div>
            </div>
            <div style={{ marginTop: 14, fontSize: 13, color: "var(--t3)", lineHeight: 1.6 }}>
              Pip value for {sym}: ${s?.lotPipVal}/pip/lot<br/>
              Current price: ${prices[sym]?.price ? fmt(prices[sym].price, s?.pipDigit) : "—"}<br/>
              All fields auto-calculate as you type.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── SETTINGS ──
const SettingsTab = ({ workerUrl, setWorkerUrl, keys, setKeys, dark, toggleDark }) => {
  const [tw, setTw] = useState(workerUrl);
  const [lk, setLk] = useState(keys);
  const [wa, setWa] = useState(() => LS.get("whatsapp", ""));

  const save = () => {
    setWorkerUrl(tw); localStorage.setItem("sov_worker", tw);
    setKeys(lk); LS.set("keys", lk);
    LS.set("whatsapp", wa);
  };

  return (
    <div className="anim">
      <div className="card">
        <div className="ch"><span className="ct">⚙ Settings</span><span className="tag tag-y">v{VERSION}</span></div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Theme</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14 }}>
            <span>☀ Light</span><div className={`tg ${dark?"dk":""}`} onClick={toggleDark} /><span>🌙 Dark</span>
          </div>
        </div>
        <div className="ig"><label className="il">Cloudflare Worker URL</label><input className="inp" value={tw} onChange={e => setTw(e.target.value)} placeholder="https://ict-data-proxy.your.workers.dev" />
        <span style={{ fontSize: 11, color: "var(--t3)", marginTop: 3, display: "block" }}>Yahoo Finance proxy — provides price data for all 4 symbols</span></div>
        {["anthropic","finnhub","twelvedata"].map(k => (
          <div key={k} className="ig"><label className="il">{k} API Key</label><input className="inp" type="password" value={lk[k]||""} onChange={e => setLk({...lk,[k]:e.target.value})} placeholder={`${k} key`} /></div>
        ))}
        <div className="ig"><label className="il">WhatsApp Number (for signal alerts)</label><input className="inp" value={wa} onChange={e => setWa(e.target.value)} placeholder="+91 98765 43210" />
        <span style={{ fontSize: 11, color: "var(--t3)", marginTop: 3, display: "block" }}>When high-confidence signals are detected, they'll open WhatsApp with the signal details pre-filled</span></div>
        <button className="btn btn-g" onClick={save} style={{ marginTop: 12 }}>💾 Save Settings</button>
      </div>
    </div>
  );
};

/* ──────────────────────────────────────────────────────────────
   SECTION 8: MAIN APP
   ────────────────────────────────────────────────────────────── */

export default function App() {
  const [dark, setDark] = useState(() => LS.get("theme", true));
  const [tab, setTab] = useState("scanner");
  const [activeSym, setActiveSym] = useState("XAUUSD");
  const [prices, setPrices] = useState({});
  const [candles, setCS] = useState({});
  const [analyses, setAn] = useState({});
  const [workerUrl, setWorkerUrl] = useState(() => localStorage.getItem("sov_worker") || "");
  const [keys, setKeys] = useState(() => LS.get("keys", {}));

  const setCandles = useCallback((s, d) => setCS(p => ({ ...p, [s]: d })), []);

  // Price refresh
  useEffect(() => {
    if (!workerUrl) return;
    const go = async () => {
      const r = {};
      await Promise.allSettled(SYMBOLS.map(async s => { const p = await fetchPrice(s.id, workerUrl); if (p) r[s.id] = p; }));
      setPrices(p => ({ ...p, ...r }));
    };
    go();
    const iv = setInterval(go, REFRESH_MS);
    return () => clearInterval(iv);
  }, [workerUrl]);

  // Analysis refresh
  useEffect(() => {
    if (!workerUrl) return;
    const go = async () => {
      const na = {};
      await Promise.allSettled(SYMBOLS.map(async s => {
        const c = await fetchCandles(s.id, "15m", workerUrl);
        if (c.length) { setCS(p => ({ ...p, [s.id]: c })); na[s.id] = analyzeICT(c, s.id); }
      }));
      setAn(p => ({ ...p, ...na }));
      // WhatsApp alert for high-score signals
      const wa = LS.get("whatsapp", "");
      if (wa) {
        Object.entries(na).forEach(([sym, a]) => {
          if (a.score >= 70 && a.bias !== "NEUTRAL") {
            sendWhatsApp(wa, `🎯 ${APP_NAME} SIGNAL\n${a.bias} ${sym}\nScore: ${a.score}/100\nEntry: $${fmt(a.entry)}\nSL: $${fmt(a.sl)}\nTP1: $${fmt(a.tp1)}\nTP2: $${fmt(a.tp2)}`);
          }
        });
      }
    };
    go();
    const iv = setInterval(go, ANALYSIS_MS);
    return () => clearInterval(iv);
  }, [workerUrl]);

  const sess = getSession();
  const live = Object.values(prices).filter(p => p?.live).length;

  const TABS = [
    { id: "scanner", l: "Scanner" },
    { id: "knowledge", l: "Knowledge" },
    { id: "calc", l: "Calculator" },
    { id: "settings", l: "Settings" },
  ];

  return (
    <>
      <style>{getCSS(dark)}</style>
      <div className="shell">
        <header className="hdr">
          <div className="logo">
            <div className="logo-m">👑</div>
            <span className="logo-t">{APP_NAME}</span>
            <span className="logo-v">v{VERSION}</span>
          </div>
          <div className="ps">
            {SYMBOLS.map(s => {
              const p = prices[s.id];
              return (
                <div key={s.id} className={`pc ${activeSym===s.id?"act":""}`} onClick={() => { setActiveSym(s.id); setTab("scanner"); }}>
                  <span className={p?.live?"dl":"do"} />
                  <span style={{ color: s.color, fontWeight: 600 }}>{s.icon} {s.name}</span>
                  <span>${p?.price ? fmt(p.price, s.pipDigit) : "—"}</span>
                </div>
              );
            })}
          </div>
          <div className="hr">
            <span className={`sp ${sess.active?"on":"off"}`}>{sess.name}</span>
            <span className="tag tag-g" style={{ fontSize: 11 }}>{live}/4</span>
            <div className={`tg ${dark?"dk":""}`} onClick={() => { setDark(d => { LS.set("theme", !d); return !d; }); }} />
          </div>
        </header>

        <nav className="nav">
          {TABS.map(t => <button key={t.id} className={`ni ${tab===t.id?"a":""}`} onClick={() => setTab(t.id)}>{t.l}</button>)}
        </nav>

        <main className="main">
          {!workerUrl && tab !== "settings" && tab !== "knowledge" && (
            <div className="card" style={{ borderColor: "rgba(226,179,64,.3)", background: "var(--gold-s)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 22 }}>⚠</span>
                <div><div style={{ fontWeight: 700, marginBottom: 3 }}>Worker URL Required</div>
                <div style={{ fontSize: 14, color: "var(--t2)" }}>Go to <strong style={{ cursor: "pointer", color: "var(--gold)" }} onClick={() => setTab("settings")}>Settings</strong> to connect live data.</div></div>
              </div>
            </div>
          )}
          {tab === "scanner" && <ScannerTab prices={prices} analyses={analyses} activeSym={activeSym} setActiveSym={setActiveSym} candles={candles} workerUrl={workerUrl} setCandles={setCandles} dark={dark} />}
          {tab === "knowledge" && <KnowledgeTab />}
          {tab === "calc" && <CalcTab prices={prices} />}
          {tab === "settings" && <SettingsTab workerUrl={workerUrl} setWorkerUrl={setWorkerUrl} keys={keys} setKeys={setKeys} dark={dark} toggleDark={() => setDark(d => { LS.set("theme", !d); return !d; })} />}
        </main>

        <footer className="foot">{APP_NAME} v{VERSION} — ICT/SMC Analysis — Yahoo Finance ~15min delay — Not financial advice</footer>
      </div>
    </>
  );
}
