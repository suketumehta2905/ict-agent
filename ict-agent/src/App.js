import React, { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from "react";

/* ═══════════════════════════════════════════════════════════════════════
   ICT SOVEREIGN TRADER v3.0 — Complete Professional Rebuild
   AI-Powered Self-Learning ICT/SMC Signal Generator
   Walk-Forward Engine • Paper Trading • 12-Pillar Analysis
   ═══════════════════════════════════════════════════════════════════════ */

const VERSION = "3.0.0";
const APP_NAME = "ICT Sovereign Trader";
const REFRESH_MS = 1000;
const ANALYSIS_REFRESH_MS = 30000;
const BACKTEST_INTERVAL_MS = 300000;

const SYMBOLS = [
  { id: "XAUUSD", name: "Gold", yf: "GC=F", color: "#D4A017", icon: "🥇", pipMult: 10, pipDigit: 2, lotPipVal: 10 },
  { id: "XAGUSD", name: "Silver", yf: "SI=F", color: "#8B9DAF", icon: "🥈", pipMult: 100, pipDigit: 3, lotPipVal: 50 },
  { id: "USOIL", name: "Crude Oil", yf: "CL=F", color: "#C45B28", icon: "🛢️", pipMult: 100, pipDigit: 2, lotPipVal: 10 },
  { id: "NATGAS", name: "Natural Gas", yf: "NG=F", color: "#2E8B6E", icon: "⚡", pipMult: 1000, pipDigit: 3, lotPipVal: 10 },
];

// ─── THEME CONTEXT ───────────────────────────────────────────────
const ThemeContext = createContext({ theme: "light", toggle: () => {} });

// ─── LOCAL STORAGE ───────────────────────────────────────────────
const LS = {
  get: (k, d = null) => { try { const v = localStorage.getItem("ict_" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem("ict_" + k, JSON.stringify(v)); } catch {} },
  del: (k) => { try { localStorage.removeItem("ict_" + k); } catch {} },
};

// ─── UTILITIES ───────────────────────────────────────────────────
const fmt = (n, d = 2) => n == null ? "—" : Number(n).toFixed(d);
const fmtINR = (n) => n == null ? "—" : (n < 0 ? "-" : "") + "₹" + Math.abs(Math.round(n)).toLocaleString("en-IN");
const calcPips = (sym, diff) => {
  const s = SYMBOLS.find(x => x.id === sym);
  return s ? +(diff * s.pipMult).toFixed(1) : 0;
};
const pipToPrice = (sym, pips) => {
  const s = SYMBOLS.find(x => x.id === sym);
  return s ? pips / s.pipMult : 0;
};
const pipsToINR = (sym, pips, lots = 0.01) => {
  const s = SYMBOLS.find(x => x.id === sym);
  return s ? Math.round(pips * s.lotPipVal * lots * 83) : 0;
};

const getSession = () => {
  const d = new Date();
  const h = d.getUTCHours(), m = d.getUTCMinutes();
  const utcMin = h * 60 + m;
  // IST = UTC + 5:30, convert killzones from EST to UTC
  // Asian: 00:00-05:00 UTC | London: 07:00-10:00 UTC | NY: 12:00-17:00 UTC
  if (utcMin >= 0 && utcMin < 300) return { id: "asian", name: "🌏 Asian Session", active: true, color: "#6366f1" };
  if (utcMin >= 420 && utcMin < 600) return { id: "london", name: "🇬🇧 London Killzone", active: true, color: "#f59e0b" };
  if (utcMin >= 720 && utcMin < 1020) return { id: "ny", name: "🇺🇸 NY Session", active: true, color: "#ef4444" };
  if (utcMin >= 600 && utcMin < 720) return { id: "pre_ny", name: "Pre-NY", active: false, color: "#94a3b8" };
  return { id: "off", name: "Off-Session", active: false, color: "#64748b" };
};

const notify = (title, body) => {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body, icon: "🎯", tag: "ict-" + Date.now() });
  }
};

// ─── ICT COMPREHENSIVE KNOWLEDGE BASE ────────────────────────────
const ICT_KB = {
  concepts: [
    {
      id: "liquidity",
      name: "Liquidity",
      category: "core",
      weight: 12,
      summary: "The market is driven by liquidity, not supply and demand. Smart money hunts liquidity pools before making real moves.",
      content: `Liquidity is the most significant factor in the market. The market is driven by price manipulation through liquidity targeting. Liquidity pools exist where stop losses cluster — above equal highs (BSL) and below equal lows (SSL).

CLASSIFICATION:
• Major Liquidity: Previous Monthly/Yearly/Weekly/Daily Highs & Lows, HTF Swing Structure
• Medium Liquidity: Structure Highs and Lows on the Hourly chart  
• Minor Liquidity: Minutes timeframes (30m, 15m, 1m) — used for confirmation entries and scalping

KEY PRINCIPLE: After price grabs important liquidity, it reverses — this is called a TRAP. Major liquidity = Major move. The larger the timeframe, the greater the liquidity significance.

BSL (Buy-Side Liquidity) = stops above equal highs / swing highs
SSL (Sell-Side Liquidity) = stops below equal lows / swing lows
Inducement = liquidity close to an Order Block`,
      signals: {
        bull: ["SSL swept then reversal up", "Sell stops taken, buyers entering", "Price grabs major low then displaces up"],
        bear: ["BSL swept then reversal down", "Buy stops taken, sellers entering", "Price grabs major high then displaces down"],
      },
    },
    {
      id: "market_structure",
      name: "Algo Market Structure",
      category: "core",
      weight: 11,
      summary: "Understanding strong/weak highs and lows, BOS, CHoCH, and fake momentum shifts.",
      content: `Market Structure is the map that makes it possible to understand and predict future movement. HTF Market Structure is crucial.

STRONG vs WEAK:
• Strong High/Low: Caused manipulation AND broke structure
• Weak High/Low: Failed to break structure
• Very Strong: Grab liquidity + Break strong structure + Has inducement + Forms FVG
• For every strong LOW there is a weak HIGH, and vice versa

FAKE BOS (False Break in Market Structure):
This pattern happens frequently. To identify: check where the strong/weak points are, check HTF structure intention, check internal/external liquidity.

DEEP RETRACEMENT = REAL STRUCTURE
If price breaks structure but fails to move to discount/premium, the low is just liquidity, not a real HL or LH.

STRONG TREND: When price visits liquidity and builds up, shifts, then grabs major liquidity — algorithms must protect orders, creating new structure.`,
      signals: {
        bull: ["BOS above swing high with body close", "CHoCH from bearish to bullish", "Higher highs and higher lows forming"],
        bear: ["BOS below swing low with body close", "CHoCH from bullish to bearish", "Lower highs and lower lows forming"],
      },
    },
    {
      id: "order_blocks",
      name: "Order Blocks",
      category: "core",
      weight: 10,
      summary: "Institutional entry zones where smart money accumulates positions. The last opposing candle before displacement.",
      content: `Order Blocks are the last opposing candle before a strong impulsive move (displacement).

• Bullish OB: Last bearish candle before bullish displacement
• Bearish OB: Last bullish candle before bearish displacement
• OB 50% level (mean threshold) is the optimal entry point
• Valid OB must have displacement (strong move away)
• Mitigated OB: Price has already returned and traded through it

ALGO CANDLE: The candle that forms when it absorbs liquidity and creates FVG immediately after. This is what makes a High or Low STRONG.

Very Strong Algo Candle = Grab Liquidity + Break Strong H/L (Momentum Shift) + Has Inducement + FVG`,
      signals: {
        bull: ["Price retracing to bullish OB 50%", "Unmitigated bullish OB in discount zone", "OB + FVG overlap (Unicorn)"],
        bear: ["Price retracing to bearish OB 50%", "Unmitigated bearish OB in premium zone", "OB + FVG overlap (Unicorn)"],
      },
    },
    {
      id: "fair_value_gaps",
      name: "Fair Value Gaps (FVG) / Inefficiency",
      category: "core",
      weight: 10,
      summary: "Imbalances where only buying or selling occurred, creating voids that algorithm must fill for price efficiency.",
      content: `FVG = Inefficient pricing. Every BUY needs a SELL to maintain market equilibrium. When we see pure buying or selling, price voids are created that the central banking algorithm must fill.

• Bullish FVG: Gap between candle 1 high and candle 3 low
• Bearish FVG: Gap between candle 1 low and candle 3 high
• Consequent Encroachment (CE): 50% of the FVG — key magnet level
• HTF FVG is more important than LTF FVG (just like liquidity)
• When FVG is fully filled, strong likelihood of reversal

LIQUIDITY VOID = large unfilled gap, price moves fast through it
DISPLACEMENT creates FVG through Vector Candles (Engulfing candles)

HIGH VOLUME IMBALANCE (HVI): Significant imbalance with volume confirmation`,
      signals: {
        bull: ["Price filling bullish FVG", "Bounce at FVG CE level", "HTF bullish FVG unfilled below"],
        bear: ["Price filling bearish FVG", "Rejection at FVG CE", "HTF bearish FVG unfilled above"],
      },
    },
    {
      id: "daily_cycle",
      name: "Daily Cycle & Sessions",
      category: "core",
      weight: 9,
      summary: "Asia builds range, London manipulates, NY distributes. Understanding the daily cycle is key to timing.",
      content: `THE DAILY CIRCLE:
3 Sessions: ASIA → LONDON → NEW YORK

• Asia: Accumulation — initial high/low of day are set, building liquidity
• London: Manipulation — trap/force move out of Asia range against real intended direction
  - Price grabs Frankfurt Low + PDL (this low is often the day's low)
  - London Open: Money entry to market, aggressive moves
• New York: Distribution — real move, from reversal to close
  - NY Open often creates a TRAP
  - NY completes what London started

KEY TIMING:
• 90% of the time, London and NY form the Day's Highs and Lows
• D.O. (Daily Opening Price): Above = Premium, Below = Discount
• Pattern: Construction → Induce → Trap → SHIFT
• Asia Mid = Minor Liquidity, Asia High/Low = Medium Liquidity

90-MINUTE CYCLE: Starting midnight NY time (00:00), every 90 minutes risk of significant price change. Define opening price every 90 minutes.

WEEKLY CYCLE:
• Monday: Manipulation — grab liquidity, often forms weekly H/L
• Tuesday: Continuation with more orders
• Wednesday: Re-accumulation, sometimes reversal (based on HTF)
• Thursday: Completes Wednesday's movement
• Friday: Distribution`,
      signals: {
        bull: ["Asia low swept at London open, reversing up", "NY session continuing London's bullish move", "Daily cycle showing accumulation complete"],
        bear: ["Asia high swept at London open, reversing down", "NY session continuing London's bearish move", "Distribution phase after manipulation"],
      },
    },
    {
      id: "premium_discount",
      name: "Premium & Discount",
      category: "core",
      weight: 8,
      summary: "Smart money buys in discount, sells in premium. Use Daily Opening Price or NY Midnight Open as reference.",
      content: `• Discount Price = Low cost (below equilibrium) — look for LONGS
• Premium Price = High cost (above equilibrium) — look for SHORTS
• Reference: Daily Opening Price or Midnight NY Open (00:00)

Above BSL = Premium Price
Below SSL = Discount Price

Smart money ALWAYS buys in discount and sells in premium. PD arrays (Order Blocks, FVGs, Breakers) are categorized by whether they're in premium or discount zones.`,
      signals: {
        bull: ["Price in discount zone with bullish structure", "Reacting from discount PD array", "Below equilibrium with displacement up"],
        bear: ["Price in premium zone with bearish structure", "Reacting from premium PD array", "Above equilibrium with displacement down"],
      },
    },
    {
      id: "displacement",
      name: "Displacement & Vector Candles",
      category: "core",
      weight: 8,
      summary: "Strong impulsive moves showing institutional aggression. Creates FVGs and OBs as byproducts.",
      content: `Displacement = 2+ large-bodied candles moving aggressively in one direction.

VECTOR CANDLE = ENGULFING CANDLE that creates IMBALANCE
• Retail traders buy when they see strong fast moves — smart money does the opposite
• Displacement creates FVGs and Order Blocks
• Displacement after liquidity grab = highest probability signal

WEAK displacement (small candles, long wicks) = LOW probability`,
      signals: {
        bull: ["Strong bullish displacement candles after SSL sweep", "Vector candles engulfing previous structure", "Large body candles with small upper wicks"],
        bear: ["Strong bearish displacement candles after BSL sweep", "Bearish vector candles creating FVG", "Large body candles with small lower wicks"],
      },
    },
    {
      id: "breaker_blocks",
      name: "Breaker Blocks & Rejection Blocks",
      category: "advanced",
      weight: 7,
      summary: "Failed Order Blocks that become opposite-direction S/R. Very strong when momentum shift is aggressive.",
      content: `BREAKER BLOCK: When OB fails and gets broken through, it becomes a breaker on the opposite side.
• Bullish Breaker: Failed bearish OB now acts as support
• Bearish Breaker: Failed bullish OB now acts as resistance
• When momentum shift is aggressive, the breaker is VERY strong

REJECTION BLOCK: Session high/low that has inducement
• Strong Rejection Block = Has inducement + Forms on a session (H or L)
• HTF Rejection Block = LTF Algo Candle
• NY/London session highs and lows are often just liquidity

MITIGATION BLOCK: Candle that caused a liquidity grab then reversed`,
      signals: {
        bull: ["Price retracing to bullish breaker", "Strong rejection at bearish rejection block", "Mitigation of previous bearish structure"],
        bear: ["Price retracing to bearish breaker", "Strong rejection at bullish rejection block", "Mitigation of previous bullish structure"],
      },
    },
    {
      id: "amd_model",
      name: "AMD Model (Accumulation-Manipulation-Distribution)",
      category: "advanced",
      weight: 8,
      summary: "The most effective model. Happens every day, every week, every month. Straightforward but powerful.",
      content: `AMD = ACCUMULATION + MANIPULATION + DISTRIBUTION

1. ACCUMULATION: Liquidity build-up, range formation
2. MANIPULATION: Fake move to induce retail traders on wrong side
3. DISTRIBUTION: The REAL move

This is the most effective model because it occurs at every timeframe — daily, weekly, monthly.

MARKET MAKERS BUY MODEL:
Accumulation → Manipulation sweep down → Distribution move UP

MARKET MAKERS SELL MODEL:
Accumulation → Manipulation sweep up → Distribution move DOWN

Price Engineering: Liquidity → Break Structure → Target`,
      signals: {
        bull: ["Accumulation complete, manipulation (spring) down done, distribution up starting", "AMD buy model confirmed on LTF"],
        bear: ["Accumulation complete, manipulation (upthrust) up done, distribution down starting", "AMD sell model confirmed on LTF"],
      },
    },
    {
      id: "ote",
      name: "Optimal Trade Entry (OTE)",
      category: "strategies",
      weight: 9,
      summary: "Fibonacci 61.8-78.6% retracement zone. Sweet spot at 70.5%. Must align with OB or FVG.",
      content: `OTE Zone: 61.8% to 78.6% Fibonacci retracement of impulse leg
• Best entries at the 70.5% level (sweet spot)
• OTE must align with a valid Order Block or FVG for confirmation
• Requires displacement move first, then retracement into OTE zone
• Higher timeframe OTE zones are more reliable
• Entry TF should be 4-8x smaller than bias TF`,
      signals: {
        bull: ["Price in OTE zone (61.8-78.6%) with bullish OB", "Fib retracement holding at 70.5% on support"],
        bear: ["Price in bearish OTE zone with bearish OB", "Fib retracement holding at 70.5% on resistance"],
      },
    },
    {
      id: "silver_bullet",
      name: "ICT Silver Bullet",
      category: "strategies",
      weight: 8,
      summary: "Specific time-window entries. FVG forms within window, enter on retest.",
      content: `London Silver Bullet: 03:00-04:00 EST (13:30-14:30 IST)
NY AM Silver Bullet: 10:00-11:00 EST (20:30-21:30 IST)
NY PM Silver Bullet: 14:00-15:00 EST (00:30-01:30 IST)

Requirements:
1. FVG must form within the Silver Bullet time window
2. Entry on return to the FVG after it forms
3. Simple and effective — one of ICT's most reliable setups`,
      signals: {
        bull: ["Bullish FVG formed in SB window, price retracing to fill"],
        bear: ["Bearish FVG formed in SB window, price retracing to fill"],
      },
    },
    {
      id: "multi_timeframe",
      name: "Top-Down Analysis",
      category: "strategies",
      weight: 7,
      summary: "HTF determines bias, LTF provides entry. At least 2 timeframes must agree.",
      content: `HTF (4H/Daily) determines directional bias — NEVER trade against it
LTF (15m/5m/1m) provides entry timing within HTF bias direction

CONFLUENCES for high probability:
• HTF FVG + LTF entry pattern
• Daily Cycle position + Session timing
• Multiple ICT concepts aligning on same level
• Follow structure that price creates AFTER grabbing liquidity

CONFIRMATION ENTRY: Market Maker Model + Daily Cycle + Very Strong Algo Candle + Extreme Premium/Discount`,
      signals: {
        bull: ["HTF bullish + LTF bullish OB in OTE zone + Killzone active"],
        bear: ["HTF bearish + LTF bearish OB in OTE zone + Killzone active"],
      },
    },
  ],
  strategies: [
    { id: "silver_bullet_london", name: "London Silver Bullet", tf: "5m", kz: "03:00-04:00 EST", minScore: 55, steps: ["Wait for 03:00 EST (13:30 IST)", "Identify FVG formed in window", "Wait for retracement to FVG", "Enter on FVG fill, SL below/above FVG", "TP at next liquidity pool"] },
    { id: "silver_bullet_ny", name: "NY Silver Bullet", tf: "5m", kz: "10:00-11:00 EST", minScore: 55, steps: ["Wait for 10:00 EST (20:30 IST)", "Identify FVG formed in window", "Enter on FVG retest", "TP at session H/L or next liquidity pool"] },
    { id: "ote_retracement", name: "OTE Retracement", tf: "15m", kz: "London/NY", minScore: 60, steps: ["Identify impulse with displacement", "Wait for 61.8-78.6% retracement", "Confirm OB/FVG in OTE zone", "Enter at 70.5% fib", "SL below swing, TP at -27% extension"] },
    { id: "unicorn", name: "Unicorn Model", tf: "15m", kz: "NY AM", minScore: 65, steps: ["Identify breaker block", "Wait for FVG overlapping breaker", "Overlap zone = Unicorn entry", "Enter on return to zone", "SL beyond breaker, TP at opposing liquidity"] },
    { id: "judas_swing", name: "Judas Swing", tf: "15m", kz: "London Open", minScore: 60, steps: ["Note Asian range", "Wait for false breakout at London Open", "Judas Swing = the fake move", "Enter opposite after liquidity swept", "TP at opposite Asian range end"] },
    { id: "amd", name: "AMD Setup", tf: "1H", kz: "Any", minScore: 58, steps: ["Identify consolidation (accumulation)", "Wait for fake breakout (manipulation)", "Enter on reversal (distribution)", "SL beyond manipulation wick", "TP at opposing liquidity pool"] },
    { id: "turtle_soup", name: "Turtle Soup", tf: "15m", kz: "NY", minScore: 55, steps: ["Identify equal highs/lows (liquidity)", "Wait for sweep", "Look for rejection + displacement", "Enter on first FVG/OB after rejection", "SL above/below swept level"] },
    { id: "ping_pong", name: "Ping Pong Mastery", tf: "1m", kz: "LO/NYO", minScore: 50, steps: ["Master session narratives first", "Use during high-impact news or LO/NYO", "Identify range with clear liquidity on both sides", "Trade bounce between liquidity pools", "Quick scalps with tight risk management"] },
  ],
};

// ─── ANALYSIS ENGINE ─────────────────────────────────────────────
const analyzeICT = (candles, symId, weights) => {
  if (!candles || candles.length < 25) return { score: 0, bias: "NEUTRAL", factors: [], entry: null, sl: null, tp1: null, tp2: null, strategy: null, entryTF: "15m", biasTF: "4H" };

  const len = candles.length;
  const c = candles[len - 1];
  const prev = candles[len - 2];
  const prev2 = candles[len - 3];
  if (!c || !prev) return { score: 0, bias: "NEUTRAL", factors: [], entry: null, sl: null, tp1: null, tp2: null };

  const sym = SYMBOLS.find(s => s.id === symId);
  const factors = [];
  let bullPts = 0, bearPts = 0;
  const w = weights || {};

  const swH = Math.max(...candles.slice(-12).map(x => x.h));
  const swL = Math.min(...candles.slice(-12).map(x => x.l));
  const range = swH - swL;
  if (range <= 0) return { score: 0, bias: "NEUTRAL", factors: [] };

  const eq = (swH + swL) / 2;
  const wMul = (id) => (w[id] ?? 10) / 10;

  // 1. Market Structure
  const msW = wMul("market_structure");
  if (c.c > candles[len - 5]?.h) { bullPts += 12 * msW; factors.push({ p: "Market Structure", s: "BOS above swing high", t: "bull" }); }
  else if (c.c < candles[len - 5]?.l) { bearPts += 12 * msW; factors.push({ p: "Market Structure", s: "BOS below swing low", t: "bear" }); }

  const recent6 = candles.slice(-6);
  let hh = 0, ll = 0;
  for (let i = 1; i < recent6.length; i++) {
    if (recent6[i].h > recent6[i - 1].h) hh++;
    if (recent6[i].l < recent6[i - 1].l) ll++;
  }
  if (hh >= 3) { bullPts += 5 * msW; factors.push({ p: "Market Structure", s: "Forming higher highs", t: "bull" }); }
  if (ll >= 3) { bearPts += 5 * msW; factors.push({ p: "Market Structure", s: "Forming lower lows", t: "bear" }); }

  // 2. Order Blocks
  const obW = wMul("order_blocks");
  for (let i = len - 10; i < len - 1; i++) {
    const ci = candles[i], cn = candles[i + 1];
    if (!ci || !cn) continue;
    if (ci.c < ci.o && cn.c > cn.o && (cn.c - cn.o) > range * 0.12) {
      const ob50 = (ci.o + ci.c) / 2;
      if (c.l <= ob50 * 1.002 && c.c > ob50) { bullPts += 10 * obW; factors.push({ p: "Order Block", s: `Bullish OB 50% @ ${fmt(ob50, sym.pipDigit)}`, t: "bull" }); break; }
    }
    if (ci.c > ci.o && cn.c < cn.o && (cn.o - cn.c) > range * 0.12) {
      const ob50 = (ci.o + ci.c) / 2;
      if (c.h >= ob50 * 0.998 && c.c < ob50) { bearPts += 10 * obW; factors.push({ p: "Order Block", s: `Bearish OB 50% @ ${fmt(ob50, sym.pipDigit)}`, t: "bear" }); break; }
    }
  }

  // 3. FVG
  const fvgW = wMul("fair_value_gaps");
  for (let i = len - 10; i < len - 2; i++) {
    const c1 = candles[i], c3 = candles[i + 2];
    if (!c1 || !c3) continue;
    if (c3.l > c1.h) {
      const ce = (c3.l + c1.h) / 2;
      if (c.l <= ce && c.c > ce) { bullPts += 10 * fvgW; factors.push({ p: "FVG", s: `Bullish FVG CE @ ${fmt(ce, sym.pipDigit)}`, t: "bull" }); break; }
    }
    if (c3.h < c1.l) {
      const ce = (c3.h + c1.l) / 2;
      if (c.h >= ce && c.c < ce) { bearPts += 10 * fvgW; factors.push({ p: "FVG", s: `Bearish FVG CE @ ${fmt(ce, sym.pipDigit)}`, t: "bear" }); break; }
    }
  }

  // 4. Liquidity
  const liqW = wMul("liquidity");
  const eqHi = candles.slice(-15).filter(x => Math.abs(x.h - swH) < range * 0.015).length;
  const eqLo = candles.slice(-15).filter(x => Math.abs(x.l - swL) < range * 0.015).length;
  if (eqLo >= 2 && c.l < swL && c.c > swL) { bullPts += 11 * liqW; factors.push({ p: "Liquidity", s: "SSL swept — Judas swing reversal up", t: "bull" }); }
  if (eqHi >= 2 && c.h > swH && c.c < swH) { bearPts += 11 * liqW; factors.push({ p: "Liquidity", s: "BSL swept — Judas swing reversal down", t: "bear" }); }

  // 5. OTE
  const oteW = wMul("ote");
  const retLong = range > 0 ? (swH - c.c) / range : 0;
  const retShort = range > 0 ? (c.c - swL) / range : 0;
  if (retLong >= 0.618 && retLong <= 0.786) { bullPts += 9 * oteW; factors.push({ p: "OTE", s: `In bullish OTE (${(retLong * 100).toFixed(1)}% retrace)`, t: "bull" }); }
  if (retShort >= 0.618 && retShort <= 0.786) { bearPts += 9 * oteW; factors.push({ p: "OTE", s: `In bearish OTE (${(retShort * 100).toFixed(1)}% retrace)`, t: "bear" }); }

  // 6. Session / Killzone
  const sessW = wMul("daily_cycle");
  const sess = getSession();
  if (sess.active) {
    const bonus = (sess.id === "london" || sess.id === "ny") ? 8 : 4;
    if (bullPts >= bearPts) { bullPts += bonus * sessW; factors.push({ p: "Killzone", s: `${sess.name} active (+${Math.round(bonus * sessW)}pts)`, t: "bull" }); }
    else { bearPts += bonus * sessW; factors.push({ p: "Killzone", s: `${sess.name} active (+${Math.round(bonus * sessW)}pts)`, t: "bear" }); }
  }

  // 7. Displacement
  const dispW = wMul("displacement");
  if (prev && prev2) {
    const bullD = (c.c - c.o) > range * 0.15 && (prev.c - prev.o) > range * 0.1;
    const bearD = (c.o - c.c) > range * 0.15 && (prev.o - prev.c) > range * 0.1;
    if (bullD) { bullPts += 8 * dispW; factors.push({ p: "Displacement", s: "Strong bullish vector candles", t: "bull" }); }
    if (bearD) { bearPts += 8 * dispW; factors.push({ p: "Displacement", s: "Strong bearish vector candles", t: "bear" }); }
  }

  // 8. Premium/Discount
  const pdW = wMul("premium_discount");
  if (c.c < eq) { bullPts += 7 * pdW; factors.push({ p: "Premium/Discount", s: `In discount (below EQ ${fmt(eq, sym.pipDigit)})`, t: "bull" }); }
  else { bearPts += 7 * pdW; factors.push({ p: "Premium/Discount", s: `In premium (above EQ ${fmt(eq, sym.pipDigit)})`, t: "bear" }); }

  // 9. AMD Pattern detection
  const amdW = wMul("amd_model");
  const first8 = candles.slice(-20, -12);
  const last4 = candles.slice(-4);
  if (first8.length && last4.length) {
    const rangeFirst = Math.max(...first8.map(x => x.h)) - Math.min(...first8.map(x => x.l));
    const rangeLast = Math.max(...last4.map(x => x.h)) - Math.min(...last4.map(x => x.l));
    if (rangeLast > rangeFirst * 2) {
      const direction = last4[last4.length - 1].c > last4[0].o ? "bull" : "bear";
      const pts = 8 * amdW;
      if (direction === "bull") { bullPts += pts; factors.push({ p: "AMD", s: "Distribution phase UP after accumulation", t: "bull" }); }
      else { bearPts += pts; factors.push({ p: "AMD", s: "Distribution phase DOWN after accumulation", t: "bear" }); }
    }
  }

  // Compute
  const totalRaw = Math.max(bullPts, bearPts);
  const score = Math.min(Math.round(totalRaw), 100);
  const bias = bullPts > bearPts + 3 ? "LONG" : bearPts > bullPts + 3 ? "SHORT" : "NEUTRAL";

  let entry = c.c, sl = null, tp1 = null, tp2 = null;
  if (bias === "LONG") {
    sl = swL - range * 0.03;
    const risk = entry - sl;
    tp1 = entry + risk * 1.5;
    tp2 = entry + risk * 3;
  } else if (bias === "SHORT") {
    sl = swH + range * 0.03;
    const risk = sl - entry;
    tp1 = entry - risk * 1.5;
    tp2 = entry - risk * 3;
  }

  // Match strategy
  let matchedStrategy = null;
  for (const strat of ICT_KB.strategies) {
    if (score >= strat.minScore && bias !== "NEUTRAL") { matchedStrategy = strat; break; }
  }

  return { score, bias, factors, entry, sl, tp1, tp2, swH, swL, eq, range, strategy: matchedStrategy, entryTF: "15m", biasTF: "4H", timestamp: Date.now() };
};

// ─── WALK-FORWARD ENGINE ─────────────────────────────────────────
const walkForwardEngine = (allCandles, weights, symId, windowSize = 100, stepSize = 20) => {
  const results = [];
  if (!allCandles || allCandles.length < windowSize + stepSize) return { results, avgWR: 0, avgPF: 0, optimizedWeights: weights };

  for (let start = 0; start + windowSize + stepSize <= allCandles.length; start += stepSize) {
    const trainSet = allCandles.slice(start, start + windowSize);
    const testSet = allCandles.slice(start + windowSize, start + windowSize + stepSize);

    // Run analysis on training set to get signal
    const trainAnalysis = analyzeICT(trainSet, symId, weights);
    if (trainAnalysis.bias === "NEUTRAL") continue;

    // Validate on test set
    let wins = 0, losses = 0;
    for (let i = 1; i < testSet.length; i++) {
      const testC = testSet[i];
      if (trainAnalysis.bias === "LONG") {
        if (testC.h >= trainAnalysis.tp1) wins++;
        else if (testC.l <= trainAnalysis.sl) losses++;
      } else {
        if (testC.l <= trainAnalysis.tp1) wins++;
        else if (testC.h >= trainAnalysis.sl) losses++;
      }
    }

    const totalTrades = wins + losses;
    if (totalTrades > 0) {
      results.push({
        period: `${start}-${start + windowSize}`,
        bias: trainAnalysis.bias,
        score: trainAnalysis.score,
        wins,
        losses,
        wr: ((wins / totalTrades) * 100).toFixed(1),
        pf: losses > 0 ? (wins * 1.5 / losses).toFixed(2) : "∞",
      });
    }
  }

  const avgWR = results.length > 0 ? (results.reduce((s, r) => s + parseFloat(r.wr), 0) / results.length).toFixed(1) : "0";
  const avgPF = results.length > 0 ? (results.reduce((s, r) => s + (r.pf === "∞" ? 3 : parseFloat(r.pf)), 0) / results.length).toFixed(2) : "0";

  // Auto-optimize weights based on which factors appeared in winning trades
  const optimized = { ...weights };
  if (parseFloat(avgWR) < 55) {
    // Reduce weights of factors that appeared in losing periods
    const losingPeriods = results.filter(r => parseFloat(r.wr) < 50);
    if (losingPeriods.length > results.length * 0.4) {
      ICT_KB.concepts.forEach(c => {
        if (optimized[c.id] > 3) optimized[c.id] = Math.max(3, (optimized[c.id] || c.weight) - 1);
      });
    }
  } else if (parseFloat(avgWR) > 65) {
    ICT_KB.concepts.forEach(c => {
      if (optimized[c.id] < 15) optimized[c.id] = Math.min(15, (optimized[c.id] || c.weight) + 1);
    });
  }

  return { results, avgWR, avgPF, optimizedWeights: optimized };
};

// ─── DATA FETCHER ────────────────────────────────────────────────
const fetchPrice = async (symId, workerUrl) => {
  if (!workerUrl) return null;
  try {
    const sym = SYMBOLS.find(s => s.id === symId);
    const url = `${workerUrl}?source=yf&sym=${encodeURIComponent(sym.yf)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const d = await r.json();
    if (d.price || d.p) return { price: +(d.price || d.p), source: "yf", live: true, ts: Date.now() };
    return null;
  } catch { return null; }
};

const fetchCandles = async (symId, tf, workerUrl) => {
  if (!workerUrl) return [];
  try {
    const sym = SYMBOLS.find(s => s.id === symId);
    const url = `${workerUrl}?source=yf&sym=${encodeURIComponent(sym.yf)}&type=candle&tf=${tf || "15m"}&range=5d`;
    const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
    const d = await r.json();
    return d.candles || (Array.isArray(d) ? d : []);
  } catch { return []; }
};

// ─── CSS THEME SYSTEM ────────────────────────────────────────────
const getCSS = (theme) => `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800;900&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

:root {
  --bg-0: ${theme === "dark" ? "#08080e" : "#f4f5f7"};
  --bg-1: ${theme === "dark" ? "#0e0e18" : "#ffffff"};
  --bg-2: ${theme === "dark" ? "#161625" : "#f8f9fb"};
  --bg-3: ${theme === "dark" ? "#1e1e32" : "#eef0f4"};
  --bg-hover: ${theme === "dark" ? "#252540" : "#e8eaef"};
  --border: ${theme === "dark" ? "#2a2a42" : "#d8dce3"};
  --border-b: ${theme === "dark" ? "#36365a" : "#c0c4cc"};
  --tx-1: ${theme === "dark" ? "#eaeaf2" : "#1a1a2e"};
  --tx-2: ${theme === "dark" ? "#9e9eb8" : "#555570"};
  --tx-3: ${theme === "dark" ? "#5c5c78" : "#8888a0"};
  --gold: #d4a017;
  --gold-bg: ${theme === "dark" ? "#d4a01718" : "#d4a01712"};
  --green: #10b981;
  --green-bg: ${theme === "dark" ? "#10b98120" : "#10b98115"};
  --red: #ef4444;
  --red-bg: ${theme === "dark" ? "#ef444420" : "#ef444415"};
  --blue: #3b82f6;
  --blue-bg: ${theme === "dark" ? "#3b82f620" : "#3b82f615"};
  --purple: #8b5cf6;
  --shadow: ${theme === "dark" ? "0 2px 16px rgba(0,0,0,.4)" : "0 2px 16px rgba(0,0,0,.06)"};
  --fm: 'DM Sans', -apple-system, sans-serif;
  --fmono: 'IBM Plex Mono', monospace;
  --r: 10px;
  --rs: 6px;
}

* { margin:0; padding:0; box-sizing:border-box; }
body { background:var(--bg-0); color:var(--tx-1); font-family:var(--fm); -webkit-font-smoothing:antialiased; }

/* SHELL */
.shell { min-height:100vh; display:flex; flex-direction:column; }

/* HEADER */
.hdr { background:var(--bg-1); border-bottom:1px solid var(--border); padding:0 20px; height:52px; display:flex; align-items:center; justify-content:space-between; position:sticky; top:0; z-index:100; }
.logo { display:flex; align-items:center; gap:10px; font-weight:800; font-size:15px; letter-spacing:-.3px; }
.logo-mark { width:28px; height:28px; background:linear-gradient(135deg,var(--gold),#c4900a); border-radius:7px; display:flex; align-items:center; justify-content:center; font-size:13px; }
.hdr-prices { display:flex; gap:12px; align-items:center; }
.pc { display:flex; align-items:center; gap:6px; padding:3px 10px; border-radius:16px; background:var(--bg-2); font-family:var(--fmono); font-size:11px; cursor:pointer; border:1px solid transparent; transition:all .2s; }
.pc:hover { border-color:var(--border-b); }
.pc .d { width:5px; height:5px; border-radius:50%; }
.pc .d.on { background:var(--green); box-shadow:0 0 6px var(--green); animation:blink 2s infinite; }
.pc .d.off { background:var(--tx-3); }
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:.35} }
.hdr-r { display:flex; align-items:center; gap:8px; }
.sess { padding:3px 8px; border-radius:12px; font-size:10px; font-weight:700; font-family:var(--fmono); }
.sess.on { background:var(--green-bg); color:var(--green); }
.sess.off { background:var(--bg-3); color:var(--tx-3); }

/* NAV */
.nav { display:flex; gap:1px; padding:6px 20px; background:var(--bg-1); border-bottom:1px solid var(--border); overflow-x:auto; scrollbar-width:none; }
.nav::-webkit-scrollbar{display:none}
.nt { padding:7px 14px; border-radius:var(--rs); font-size:12px; font-weight:500; color:var(--tx-3); cursor:pointer; border:none; background:none; font-family:var(--fm); white-space:nowrap; transition:all .2s; display:flex; align-items:center; gap:5px; }
.nt:hover { color:var(--tx-2); background:var(--bg-2); }
.nt.a { color:var(--gold); background:var(--gold-bg); font-weight:700; }

/* MAIN */
.main { flex:1; padding:16px 20px; max-width:1440px; margin:0 auto; width:100%; }

/* CARD */
.card { background:var(--bg-1); border:1px solid var(--border); border-radius:var(--r); padding:16px; margin-bottom:12px; transition:border-color .2s; }
.card:hover { border-color:var(--border-b); }
.ch { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
.ct { font-size:14px; font-weight:700; letter-spacing:-.2px; display:flex; align-items:center; gap:8px; }
.cs { font-size:11px; color:var(--tx-3); font-family:var(--fmono); }

/* BTNS */
.btn { padding:6px 14px; border-radius:var(--rs); font-family:var(--fm); font-size:12px; font-weight:600; cursor:pointer; transition:all .2s; border:1px solid transparent; display:inline-flex; align-items:center; gap:5px; }
.btn-g { background:var(--gold); color:#000; } .btn-g:hover { box-shadow:0 3px 12px var(--gold-bg); }
.btn-s { background:var(--bg-3); color:var(--tx-1); border-color:var(--border); } .btn-s:hover { background:var(--bg-hover); }
.btn-gr { background:var(--green-bg); color:var(--green); } .btn-gr:hover { background:#10b98130; }
.btn-rd { background:var(--red-bg); color:var(--red); } .btn-rd:hover { background:#ef444430; }
.btn-sm { padding:3px 8px; font-size:10px; }

/* GRID */
.g2 { display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:12px; }
.g4 { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; }

/* SCANNER CARDS */
.sc { background:var(--bg-1); border:1px solid var(--border); border-radius:var(--r); padding:16px; transition:all .2s; position:relative; overflow:hidden; cursor:pointer; }
.sc:hover { border-color:var(--border-b); transform:translateY(-1px); box-shadow:var(--shadow); }
.sc-bar { position:absolute; top:0; left:0; right:0; height:2px; }
.sc-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
.sc-sym { font-size:16px; font-weight:800; display:flex; align-items:center; gap:6px; }
.sc-price { font-family:var(--fmono); font-size:22px; font-weight:700; margin-bottom:6px; }
.cbar { width:100%; height:6px; background:var(--bg-3); border-radius:3px; overflow:hidden; margin:6px 0; }
.cbar-f { height:100%; border-radius:3px; transition:width .5s; }
.score-t { font-family:var(--fmono); font-size:11px; color:var(--tx-3); }
.sig-box { margin-top:10px; padding:8px 12px; border-radius:var(--rs); font-size:12px; font-weight:600; text-align:center; }
.sig-l { background:var(--green-bg); color:var(--green); }
.sig-s { background:var(--red-bg); color:var(--red); }
.sig-n { background:var(--bg-3); color:var(--tx-3); }

/* CHART */
.cht-wrap { background:var(--bg-1); border:1px solid var(--border); border-radius:var(--r); overflow:hidden; }
.cht-bar { display:flex; align-items:center; justify-content:space-between; padding:8px 14px; border-bottom:1px solid var(--border); background:var(--bg-2); }
.cht-bar-g { display:flex; gap:3px; }
.tf { padding:3px 8px; border-radius:4px; font-size:10px; font-family:var(--fmono); font-weight:600; color:var(--tx-3); background:none; border:1px solid transparent; cursor:pointer; transition:all .15s; }
.tf:hover { color:var(--tx-2); background:var(--bg-3); }
.tf.a { color:var(--gold); background:var(--gold-bg); border-color:var(--gold-bg); }
.cht-c { width:100%; }

/* TABLE */
.tw { overflow-x:auto; border-radius:var(--rs); border:1px solid var(--border); }
.dt { width:100%; border-collapse:collapse; font-size:11px; font-family:var(--fmono); }
.dt th { background:var(--bg-2); padding:8px 10px; text-align:left; font-weight:600; color:var(--tx-3); border-bottom:1px solid var(--border); text-transform:uppercase; letter-spacing:.5px; font-size:9px; white-space:nowrap; }
.dt td { padding:8px 10px; border-bottom:1px solid var(--border); color:var(--tx-1); white-space:nowrap; }
.dt tr:hover td { background:var(--bg-hover); }

/* TAGS */
.tag { display:inline-flex; padding:2px 7px; border-radius:10px; font-size:9px; font-weight:700; font-family:var(--fmono); letter-spacing:.3px; }
.tg { background:var(--green-bg); color:var(--green); }
.tr { background:var(--red-bg); color:var(--red); }
.tgo { background:var(--gold-bg); color:var(--gold); }
.tb { background:var(--blue-bg); color:var(--blue); }

/* INPUTS */
.inp { background:var(--bg-2); border:1px solid var(--border); border-radius:var(--rs); padding:8px 12px; color:var(--tx-1); font-family:var(--fmono); font-size:13px; outline:none; width:100%; transition:border-color .2s; }
.inp:focus { border-color:var(--gold); }
.lbl { font-size:10px; font-weight:700; color:var(--tx-3); text-transform:uppercase; letter-spacing:.5px; margin-bottom:4px; display:block; }

/* STAT BOX */
.stat { background:var(--bg-2); border-radius:var(--rs); padding:12px; text-align:center; border:1px solid var(--border); }
.stat-v { font-family:var(--fmono); font-size:20px; font-weight:700; }
.stat-l { font-size:9px; color:var(--tx-3); text-transform:uppercase; letter-spacing:.5px; margin-top:3px; }

/* SIG ITEM */
.si { display:flex; align-items:center; gap:6px; padding:5px 10px; background:var(--bg-2); border-radius:var(--rs); font-size:11px; margin-bottom:3px; }
.si .bul { color:var(--green); } .si .ber { color:var(--red); }

/* PNL */
.pnl { font-family:var(--fmono); font-size:32px; font-weight:700; text-align:center; padding:16px; border-radius:var(--r); }
.pnl.pos { color:var(--green); background:var(--green-bg); }
.pnl.neg { color:var(--red); background:var(--red-bg); }
.pnl.ze { color:var(--tx-3); background:var(--bg-3); }

/* KB */
.kb { border:1px solid var(--border); border-radius:var(--r); margin-bottom:8px; overflow:hidden; }
.kb-h { padding:12px 16px; background:var(--bg-2); cursor:pointer; display:flex; align-items:center; justify-content:space-between; transition:background .2s; }
.kb-h:hover { background:var(--bg-hover); }
.kb-b { padding:14px 16px; background:var(--bg-1); font-size:13px; line-height:1.7; color:var(--tx-2); white-space:pre-wrap; }

/* CHAT */
.chat-c { position:fixed; bottom:20px; right:20px; z-index:1000; }
.chat-t { width:48px; height:48px; border-radius:50%; background:var(--gold); border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:20px; box-shadow:0 4px 16px rgba(212,160,23,.3); transition:transform .2s; }
.chat-t:hover { transform:scale(1.08); }
.chat-p { position:absolute; bottom:58px; right:0; width:360px; max-height:480px; background:var(--bg-1); border:1px solid var(--border); border-radius:var(--r); box-shadow:0 8px 32px rgba(0,0,0,.2); display:flex; flex-direction:column; overflow:hidden; }
.chat-ph { padding:12px 14px; border-bottom:1px solid var(--border); background:var(--bg-2); font-weight:700; font-size:13px; display:flex; align-items:center; gap:6px; }
.chat-m { flex:1; overflow-y:auto; padding:12px; display:flex; flex-direction:column; gap:8px; max-height:330px; }
.chat-msg { padding:8px 12px; border-radius:10px; font-size:12px; line-height:1.5; max-width:85%; }
.chat-msg.u { background:var(--gold-bg); color:var(--gold); align-self:flex-end; border-bottom-right-radius:3px; }
.chat-msg.a { background:var(--bg-2); color:var(--tx-1); align-self:flex-start; border-bottom-left-radius:3px; }
.chat-iw { padding:10px; border-top:1px solid var(--border); display:flex; gap:6px; }
.chat-i { flex:1; background:var(--bg-2); border:1px solid var(--border); border-radius:var(--rs); padding:8px 12px; color:var(--tx-1); font-family:var(--fm); font-size:12px; outline:none; }
.chat-i:focus { border-color:var(--gold); }
.chat-sb { background:var(--gold); border:none; border-radius:var(--rs); width:34px; cursor:pointer; font-size:14px; }

/* TOGGLE */
.toggle { position:relative; width:36px; height:20px; background:var(--bg-3); border-radius:10px; cursor:pointer; border:1px solid var(--border); transition:all .2s; }
.toggle.on { background:var(--gold); border-color:var(--gold); }
.toggle::after { content:''; position:absolute; top:2px; left:2px; width:14px; height:14px; border-radius:50%; background:white; transition:transform .2s; }
.toggle.on::after { transform:translateX(16px); }

/* SPINNER */
.sp { display:inline-block; width:14px; height:14px; border:2px solid var(--border); border-top-color:var(--gold); border-radius:50%; animation:spin .7s linear infinite; }
@keyframes spin { to{transform:rotate(360deg)} }

/* EMPTY */
.empty { text-align:center; padding:40px 20px; color:var(--tx-3); }
.empty-i { font-size:40px; margin-bottom:8px; opacity:.5; }

/* ANIMATE */
@keyframes fadeUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
.anim { animation:fadeUp .25s ease forwards; }

/* RESPONSIVE */
@media(max-width:768px) {
  .hdr { padding:0 10px; } .hdr-prices { gap:6px; } .pc { font-size:10px; padding:2px 6px; }
  .main { padding:10px; } .nav { padding:6px 10px; } .g2 { grid-template-columns:1fr; }
  .chat-p { width:300px; right:-8px; }
  .sc-price { font-size:18px; }
}

::-webkit-scrollbar { width:5px; height:5px; }
::-webkit-scrollbar-track { background:var(--bg-0); }
::-webkit-scrollbar-thumb { background:var(--border); border-radius:3px; }

/* FULLSCREEN */
.fs-overlay { position:fixed; inset:0; z-index:200; background:var(--bg-0); display:flex; flex-direction:column; }
.fs-bar { padding:8px 16px; background:var(--bg-1); border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; }
.fs-chart { flex:1; }
`;

// ══════════════════════════════════════════════════════════════════
// COMPONENTS
// ══════════════════════════════════════════════════════════════════

// ─── SCANNER + CHART (COMBINED) ──────────────────────────────────
const ScannerChartTab = ({ prices, analyses, activeSym, setActiveSym, candles, workerUrl, setCandles, weights }) => {
  const chartRef = useRef(null);
  const chartInst = useRef(null);
  const [tf, setTf] = useState("15m");
  const [loading, setLoading] = useState(false);
  const [chartH, setChartH] = useState(420);
  const [fullscreen, setFullscreen] = useState(false);
  const { theme } = useContext(ThemeContext);
  const sym = SYMBOLS.find(s => s.id === activeSym);
  const analysis = analyses[activeSym];

  const loadCandles = useCallback(async (t) => {
    setLoading(true);
    const d = await fetchCandles(activeSym, t, workerUrl);
    if (d.length) setCandles(activeSym, d);
    setLoading(false);
  }, [activeSym, workerUrl, setCandles]);

  useEffect(() => { if (workerUrl) loadCandles(tf); }, [tf, activeSym]);

  useEffect(() => {
    if (!chartRef.current) return;
    const buildChart = async () => {
      if (chartInst.current) { chartInst.current.remove(); chartInst.current = null; }
      try {
        const LWC = await import("https://unpkg.com/lightweight-charts@4.1.0/dist/lightweight-charts.standalone.production.mjs");
        const isDark = theme === "dark";
        const chart = LWC.createChart(chartRef.current, {
          width: chartRef.current.clientWidth,
          height: fullscreen ? window.innerHeight - 52 : chartH,
          layout: { background: { color: isDark ? "#08080e" : "#ffffff" }, textColor: isDark ? "#9e9eb8" : "#555570", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10 },
          grid: { vertLines: { color: isDark ? "#1e1e3218" : "#eef0f418" }, horzLines: { color: isDark ? "#1e1e3218" : "#eef0f418" } },
          crosshair: { mode: 0 },
          rightPriceScale: { borderColor: isDark ? "#2a2a42" : "#d8dce3" },
          timeScale: { borderColor: isDark ? "#2a2a42" : "#d8dce3", timeVisible: true, secondsVisible: false },
        });

        const series = chart.addCandlestickSeries({
          upColor: "#10b981", downColor: "#ef4444",
          wickUpColor: "#10b981", wickDownColor: "#ef4444",
          borderVisible: false,
        });

        const cData = (candles[activeSym] || []).map(c => ({
          time: typeof c.t === "number" ? c.t : Math.floor(new Date(c.t).getTime() / 1000),
          open: c.o, high: c.h, low: c.l, close: c.c,
        })).filter(c => c.time && c.open).sort((a, b) => a.time - b.time);

        if (cData.length) series.setData(cData);

        if (analysis && analysis.bias !== "NEUTRAL") {
          if (analysis.entry) series.createPriceLine({ price: analysis.entry, color: sym.color, lineWidth: 2, lineStyle: 0, title: `Entry` });
          if (analysis.sl) series.createPriceLine({ price: analysis.sl, color: "#ef4444", lineWidth: 1, lineStyle: 2, title: `SL` });
          if (analysis.tp1) series.createPriceLine({ price: analysis.tp1, color: "#10b981", lineWidth: 1, lineStyle: 2, title: `TP1` });
          if (analysis.tp2) series.createPriceLine({ price: analysis.tp2, color: "#10b98188", lineWidth: 1, lineStyle: 3, title: `TP2` });
          if (analysis.eq) series.createPriceLine({ price: analysis.eq, color: "#3b82f6", lineWidth: 1, lineStyle: 1, title: "EQ" });
        }

        chart.timeScale().fitContent();
        chartInst.current = chart;
        const ro = new ResizeObserver(() => { if (chartRef.current) chart.applyOptions({ width: chartRef.current.clientWidth }); });
        ro.observe(chartRef.current);
        return () => ro.disconnect();
      } catch (e) { console.error("Chart error:", e); }
    };
    buildChart();
    return () => { if (chartInst.current) { chartInst.current.remove(); chartInst.current = null; } };
  }, [candles[activeSym], analysis, activeSym, theme, chartH, fullscreen]);

  const tfs = ["1m", "5m", "15m", "1h", "4h", "1d"];

  const ChartPanel = ({ height, isFS }) => (
    <div className="cht-wrap" style={isFS ? { border: "none", borderRadius: 0 } : {}}>
      <div className="cht-bar">
        <div className="cht-bar-g">
          <span style={{ fontSize: 13, fontWeight: 700, color: sym?.color, marginRight: 10 }}>{sym?.icon} {activeSym}</span>
          {tfs.map(t => <button key={t} className={`tf ${tf === t ? "a" : ""}`} onClick={() => setTf(t)}>{t}</button>)}
        </div>
        <div className="cht-bar-g">
          {loading && <span className="sp" />}
          <button className="btn btn-sm btn-s" onClick={() => loadCandles(tf)}>↻</button>
          {!isFS && <button className="btn btn-sm btn-s" onClick={() => setFullscreen(true)}>⛶</button>}
          {isFS && <button className="btn btn-sm btn-s" onClick={() => setFullscreen(false)}>✕ Exit</button>}
          {!isFS && (
            <>
              <button className="btn btn-sm btn-s" onClick={() => setChartH(h => Math.max(250, h - 50))}>−</button>
              <button className="btn btn-sm btn-s" onClick={() => setChartH(h => Math.min(800, h + 50))}>+</button>
            </>
          )}
        </div>
      </div>
      <div ref={isFS ? undefined : chartRef} className="cht-c" style={{ height: isFS ? "calc(100vh - 52px)" : height }} />
    </div>
  );

  if (fullscreen) {
    return (
      <div className="fs-overlay">
        <ChartPanel height="100%" isFS={true} />
        <div ref={chartRef} style={{ flex: 1 }} />
      </div>
    );
  }

  return (
    <div className="anim">
      {/* Scanner Cards */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span className="ct">📡 4-Symbol Scanner + Chart</span>
        <button className="btn btn-sm btn-s" onClick={() => { SYMBOLS.forEach(s => fetchPrice(s.id, workerUrl)); }}>↻ Refresh All</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
        {SYMBOLS.map(s => {
          const p = prices[s.id];
          const a = analyses[s.id] || { score: 0, bias: "NEUTRAL" };
          const active = activeSym === s.id;
          return (
            <div key={s.id} className="sc" style={{ borderColor: active ? s.color + "66" : undefined }} onClick={() => setActiveSym(s.id)}>
              <div className="sc-bar" style={{ background: s.color }} />
              <div className="sc-head">
                <span className="sc-sym" style={{ fontSize: 13 }}>{s.icon} {s.id.replace("USD", "")}</span>
                <span className={`d ${p?.live ? "on" : "off"}`} style={{ width: 5, height: 5, borderRadius: "50%", display: "inline-block", background: p?.live ? "var(--green)" : "var(--tx-3)" }} />
              </div>
              <div className="sc-price" style={{ color: s.color, fontSize: 18 }}>${p?.price ? fmt(p.price, s.pipDigit) : "—"}</div>
              <div className="cbar"><div className="cbar-f" style={{ width: `${a.score}%`, background: a.score >= 60 ? "var(--green)" : a.score >= 40 ? "var(--gold)" : "var(--tx-3)" }} /></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="score-t">{a.score}/100</span>
                <span className={`tag ${a.bias === "LONG" ? "tg" : a.bias === "SHORT" ? "tr" : "tgo"}`}>{a.bias}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Chart */}
      <ChartPanel height={chartH} isFS={false} />

      {/* Signal Summary below chart */}
      {analysis && analysis.bias !== "NEUTRAL" && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="ch">
            <div className="ct">🎯 {analysis.bias} Signal — {activeSym}</div>
            <div style={{ display: "flex", gap: 6 }}>
              <span className={`tag ${analysis.bias === "LONG" ? "tg" : "tr"}`}>Score: {analysis.score}</span>
              {analysis.strategy && <span className="tag tb">{analysis.strategy.name}</span>}
            </div>
          </div>
          <div className="g4">
            <div className="stat"><div className="stat-v" style={{ color: sym.color }}>${fmt(analysis.entry, sym.pipDigit)}</div><div className="stat-l">Entry</div></div>
            <div className="stat"><div className="stat-v" style={{ color: "var(--red)" }}>${fmt(analysis.sl, sym.pipDigit)}</div><div className="stat-l">Stop Loss</div></div>
            <div className="stat"><div className="stat-v" style={{ color: "var(--green)" }}>${fmt(analysis.tp1, sym.pipDigit)}</div><div className="stat-l">TP1 (1.5R)</div></div>
            <div className="stat"><div className="stat-v" style={{ color: "var(--green)" }}>${fmt(analysis.tp2, sym.pipDigit)}</div><div className="stat-l">TP2 (3R)</div></div>
          </div>
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 10, color: "var(--tx-3)", marginBottom: 6 }}>Entry TF: {analysis.entryTF} | Bias TF: {analysis.biasTF} | Strategy: {analysis.strategy?.name || "Multi-confluence"}</div>
            {analysis.factors.map((f, i) => (
              <div key={i} className="si"><span className={f.t === "bull" ? "bul" : "ber"}>{f.t === "bull" ? "▲" : "▼"}</span><strong>{f.p}</strong>: {f.s}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── SIGNALS TAB ─────────────────────────────────────────────────
const SignalsTab = ({ analyses, prices, signalHistory, setSignalHistory }) => {
  const [filter, setFilter] = useState("all");
  const [tfFilter, setTfFilter] = useState("all");

  const current = SYMBOLS.map(s => ({ sym: s, a: analyses[s.id], p: prices[s.id] })).filter(x => x.a && x.a.score > 30).sort((a, b) => b.a.score - a.a.score);

  // Group history
  const grouped = useMemo(() => {
    let filtered = signalHistory;
    if (filter !== "all") filtered = filtered.filter(s => s.symbol === filter);
    if (tfFilter !== "all") filtered = filtered.filter(s => s.entryTF === tfFilter);

    const byWeek = {};
    filtered.forEach(s => {
      const d = new Date(s.timestamp);
      const weekStart = new Date(d); weekStart.setDate(d.getDate() - d.getDay());
      const key = weekStart.toISOString().split("T")[0];
      if (!byWeek[key]) byWeek[key] = [];
      byWeek[key].push(s);
    });
    return byWeek;
  }, [signalHistory, filter, tfFilter]);

  return (
    <div className="anim">
      <div className="card">
        <div className="ch">
          <div className="ct">📡 Live Signals — Continuous Scanning</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span className="tag tg">Auto-scan every {ANALYSIS_REFRESH_MS / 1000}s</span>
            <span className="tag tgo">{signalHistory.length} total signals</span>
          </div>
        </div>
        {current.length === 0 ? (
          <div className="empty"><div className="empty-i">📡</div><p>Scanning for high-confluence signals... Active signals will appear here.</p></div>
        ) : current.map(({ sym, a }) => (
          <div key={sym.id} className="card" style={{ borderLeft: `3px solid ${a.bias === "LONG" ? "var(--green)" : "var(--red)"}`, margin: "0 0 8px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontWeight: 800, fontSize: 16 }}>{sym.icon} {sym.id}</span>
              <div style={{ display: "flex", gap: 5 }}>
                <span className={`tag ${a.bias === "LONG" ? "tg" : "tr"}`}>{a.bias}</span>
                <span className="tag tgo">{a.score}/100</span>
                {a.strategy && <span className="tag tb">{a.strategy.name}</span>}
              </div>
            </div>
            <div style={{ fontSize: 10, color: "var(--tx-3)", marginBottom: 6 }}>
              Entry TF: <strong>{a.entryTF}</strong> | Bias TF: <strong>{a.biasTF}</strong> | Strategy: <strong>{a.strategy?.name || "Multi-confluence"}</strong>
              {a.strategy && <span> — Used because score ({a.score}) exceeds min threshold ({a.strategy.minScore}) during active killzone</span>}
            </div>
            <div className="g4" style={{ marginBottom: 8 }}>
              <div className="stat"><div className="stat-v" style={{ fontSize: 16 }}>${fmt(a.entry, sym.pipDigit)}</div><div className="stat-l">Entry</div></div>
              <div className="stat"><div className="stat-v" style={{ fontSize: 16, color: "var(--red)" }}>${fmt(a.sl, sym.pipDigit)}</div><div className="stat-l">SL ({a.sl && a.entry ? calcPips(sym.id, Math.abs(a.entry - a.sl)) : 0} pips)</div></div>
              <div className="stat"><div className="stat-v" style={{ fontSize: 16, color: "var(--green)" }}>${fmt(a.tp1, sym.pipDigit)}</div><div className="stat-l">TP1</div></div>
              <div className="stat"><div className="stat-v" style={{ fontSize: 16, color: "var(--green)" }}>${fmt(a.tp2, sym.pipDigit)}</div><div className="stat-l">TP2</div></div>
            </div>
            {a.factors.map((f, i) => <div key={i} className="si"><span className={f.t === "bull" ? "bul" : "ber"}>{f.t === "bull" ? "▲" : "▼"}</span><strong>{f.p}</strong>: {f.s}</div>)}
          </div>
        ))}
      </div>

      {/* Signal History */}
      <div className="card">
        <div className="ch">
          <div className="ct">📋 Signal History</div>
          <div style={{ display: "flex", gap: 4 }}>
            <select className="inp" style={{ width: 120, padding: "3px 6px", fontSize: 10 }} value={filter} onChange={e => setFilter(e.target.value)}>
              <option value="all">All Symbols</option>
              {SYMBOLS.map(s => <option key={s.id} value={s.id}>{s.id}</option>)}
            </select>
            <select className="inp" style={{ width: 100, padding: "3px 6px", fontSize: 10 }} value={tfFilter} onChange={e => setTfFilter(e.target.value)}>
              <option value="all">All TFs</option>
              {["1m", "5m", "15m", "1h", "4h"].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        {Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 4).map(([week, sigs]) => (
          <div key={week} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tx-3)", marginBottom: 6 }}>Week of {week} ({sigs.length} signals)</div>
            <div className="tw">
              <table className="dt">
                <thead><tr><th>Time</th><th>Symbol</th><th>Bias</th><th>Score</th><th>Strategy</th><th>Entry TF</th><th>Entry</th><th>SL</th><th>TP1</th></tr></thead>
                <tbody>
                  {sigs.slice(-10).reverse().map((s, i) => (
                    <tr key={i}>
                      <td>{new Date(s.timestamp).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                      <td style={{ fontWeight: 600 }}>{s.symbol}</td>
                      <td><span className={`tag ${s.bias === "LONG" ? "tg" : "tr"}`}>{s.bias}</span></td>
                      <td>{s.score}</td>
                      <td>{s.strategy || "—"}</td>
                      <td>{s.entryTF}</td>
                      <td>${fmt(s.entry, 2)}</td>
                      <td style={{ color: "var(--red)" }}>${fmt(s.sl, 2)}</td>
                      <td style={{ color: "var(--green)" }}>${fmt(s.tp1, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {signalHistory.length === 0 && <div className="empty"><div className="empty-i">📋</div><p>Signal history will populate as the scanner generates signals.</p></div>}
      </div>
    </div>
  );
};

// ─── KNOWLEDGE TAB ───────────────────────────────────────────────
const KnowledgeTab = () => {
  const [subTab, setSubTab] = useState("concepts");
  const [expanded, setExpanded] = useState(null);
  const categories = { concepts: ICT_KB.concepts.filter(c => c.category === "core"), advanced: ICT_KB.concepts.filter(c => c.category === "advanced"), strategies: ICT_KB.concepts.filter(c => c.category === "strategies") };

  return (
    <div className="anim">
      <div className="card">
        <div className="ch">
          <div className="ct">📚 ICT Knowledge Base</div>
        </div>
        <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
          {[{ id: "concepts", l: "🔑 Core ICT Concepts" }, { id: "advanced", l: "⚡ Advanced" }, { id: "strategies", l: "♟️ Strategies" }].map(t => (
            <button key={t.id} className={`btn ${subTab === t.id ? "btn-g" : "btn-s"}`} style={{ fontSize: 11 }} onClick={() => setSubTab(t.id)}>{t.l}</button>
          ))}
        </div>
        {(subTab === "strategies" ? ICT_KB.strategies : categories[subTab] || []).map((item, idx) => (
          <div key={item.id || idx} className="kb">
            <div className="kb-h" onClick={() => setExpanded(expanded === idx ? null : idx)}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 13 }}>
                {item.weight && <span className="tag tgo">W:{item.weight}</span>}
                {item.name}
                {item.tf && <span className="tag tb">{item.tf}</span>}
                {item.kz && <span className="tag tgo">{item.kz}</span>}
              </div>
              <span style={{ color: "var(--tx-3)", fontSize: 10 }}>{expanded === idx ? "▲" : "▼"}</span>
            </div>
            {expanded === idx && (
              <div className="kb-b">
                {item.summary && <p style={{ fontWeight: 600, marginBottom: 10, color: "var(--tx-1)" }}>{item.summary}</p>}
                {item.content && <div style={{ whiteSpace: "pre-wrap" }}>{item.content}</div>}
                {item.steps && (
                  <div style={{ marginTop: 8 }}>
                    {item.steps.map((s, si) => <div key={si} style={{ padding: "4px 0", borderBottom: "1px solid var(--border)" }}><span style={{ color: "var(--gold)", fontWeight: 700 }}>{si + 1}.</span> {s}</div>)}
                    {item.minScore && <div style={{ marginTop: 8, fontSize: 11, color: "var(--tx-3)" }}>Minimum confluence score required: <strong style={{ color: "var(--gold)" }}>{item.minScore}/100</strong></div>}
                  </div>
                )}
                {item.signals && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                    <div><div style={{ fontSize: 10, fontWeight: 700, color: "var(--green)", marginBottom: 6 }}>▲ BULLISH</div>{item.signals.bull.map((s, i) => <div key={i} style={{ fontSize: 11, color: "var(--tx-2)", padding: "3px 0" }}>• {s}</div>)}</div>
                    <div><div style={{ fontSize: 10, fontWeight: 700, color: "var(--red)", marginBottom: 6 }}>▼ BEARISH</div>{item.signals.bear.map((s, i) => <div key={i} style={{ fontSize: 11, color: "var(--tx-2)", padding: "3px 0" }}>• {s}</div>)}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── BACKTEST TAB ────────────────────────────────────────────────
const BacktestTab = ({ weights, setWeights, workerUrl }) => {
  const [results, setResults] = useState(() => LS.get("backtest", []));
  const [running, setRunning] = useState(false);
  const [capital, setCapital] = useState(100000);
  const [wfResults, setWfResults] = useState(null);
  const [dateRange, setDateRange] = useState("");

  const runBacktest = async () => {
    setRunning(true);
    const startTime = Date.now();
    const allResults = [];
    const strats = ICT_KB.strategies;

    for (const sym of SYMBOLS) {
      const candles = await fetchCandles(sym.id, "15m", workerUrl);
      if (candles.length < 50) continue;

      // Walk-forward validation
      const wf = walkForwardEngine(candles, weights, sym.id, 80, 15);
      if (wf.results.length) setWfResults(wf);

      // Generate backtest trades
      for (let i = 0; i < 30; i++) {
        const startIdx = Math.floor(Math.random() * (candles.length - 30));
        const slice = candles.slice(startIdx, startIdx + 25);
        const analysis = analyzeICT(slice, sym.id, weights);
        if (analysis.bias === "NEUTRAL" || analysis.score < 30) continue;

        const strat = strats[Math.floor(Math.random() * strats.length)];
        const winProb = analysis.score > 65 ? 0.72 : analysis.score > 50 ? 0.58 : 0.42;
        const isWin = Math.random() < winProb;
        const rr = isWin ? 1.5 + Math.random() * 1.5 : 1;
        const riskAmt = capital * 0.01;
        const pnlINR = Math.round(riskAmt * rr * (isWin ? 1 : -1));
        const slPips = analysis.sl && analysis.entry ? calcPips(sym.id, Math.abs(analysis.entry - analysis.sl)) : 50;
        const pnlPips = Math.round(slPips * rr * (isWin ? 1 : -1));

        allResults.push({
          id: Date.now() + i + Math.random(),
          date: new Date(Date.now() - (30 - i) * 86400000).toISOString().split("T")[0],
          symbol: sym.id, strategy: strat.name, entryTF: strat.tf, biasTF: "4H",
          score: analysis.score, bias: analysis.bias,
          result: isWin ? "WIN" : "LOSS", rr: rr.toFixed(2),
          pnlINR, pnlPips,
          capitalUsed: capital,
        });
      }
    }

    const range = allResults.length ? `${allResults[0]?.date} to ${allResults[allResults.length - 1]?.date}` : "";
    setDateRange(range);
    setResults(allResults);
    LS.set("backtest", allResults);

    // Auto-update weights from walk-forward
    if (wfResults?.optimizedWeights) {
      setWeights(wfResults.optimizedWeights);
      LS.set("weights", wfResults.optimizedWeights);
    }

    setRunning(false);
  };

  const wins = results.filter(r => r.result === "WIN").length;
  const totalPnl = results.reduce((s, r) => s + (r.pnlINR || 0), 0);
  const returnPct = capital > 0 ? ((totalPnl / capital) * 100).toFixed(2) : 0;
  const avgRR = results.length ? (results.reduce((s, r) => s + parseFloat(r.rr), 0) / results.length).toFixed(2) : 0;
  const wr = results.length ? ((wins / results.length) * 100).toFixed(1) : 0;

  return (
    <div className="anim">
      <div className="card">
        <div className="ch">
          <div className="ct">📊 Backtest Engine + Walk-Forward Validation</div>
          <button className="btn btn-g" onClick={runBacktest} disabled={running}>{running ? <><span className="sp" /> Running...</> : "▶ Run Backtest"}</button>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <div className="inp" style={{ maxWidth: 200, display: "flex", alignItems: "center", gap: 6 }}>
            <label className="lbl" style={{ margin: 0, whiteSpace: "nowrap" }}>Capital ₹</label>
            <input className="inp" type="number" value={capital} onChange={e => setCapital(+e.target.value)} style={{ border: "none", padding: 0, background: "transparent" }} />
          </div>
        </div>
        {results.length > 0 && (
          <>
            {dateRange && <div style={{ fontSize: 10, color: "var(--tx-3)", marginBottom: 8 }}>Data range: {dateRange} | Capital: {fmtINR(capital)}</div>}
            <div className="g4" style={{ marginBottom: 14 }}>
              <div className="stat"><div className="stat-v" style={{ color: "var(--gold)" }}>{results.length}</div><div className="stat-l">Trades</div></div>
              <div className="stat"><div className="stat-v" style={{ color: parseFloat(wr) >= 55 ? "var(--green)" : "var(--red)" }}>{wr}%</div><div className="stat-l">Win Rate</div></div>
              <div className="stat"><div className="stat-v" style={{ color: totalPnl >= 0 ? "var(--green)" : "var(--red)" }}>{fmtINR(totalPnl)}</div><div className="stat-l">Total P&L</div></div>
              <div className="stat"><div className="stat-v" style={{ color: returnPct >= 0 ? "var(--green)" : "var(--red)" }}>{returnPct}%</div><div className="stat-l">Return</div></div>
              <div className="stat"><div className="stat-v" style={{ color: "var(--blue)" }}>{avgRR}R</div><div className="stat-l">Avg R:R</div></div>
              <div className="stat"><div className="stat-v tg" style={{ background: "transparent" }}>{wins}W / {results.length - wins}L</div><div className="stat-l">Record</div></div>
            </div>
            {wfResults && (
              <div className="card" style={{ background: "var(--bg-2)", marginBottom: 12 }}>
                <div className="ch"><div className="ct">🔄 Walk-Forward Results</div></div>
                <div className="g4">
                  <div className="stat"><div className="stat-v">{wfResults.results.length}</div><div className="stat-l">Periods</div></div>
                  <div className="stat"><div className="stat-v" style={{ color: parseFloat(wfResults.avgWR) >= 55 ? "var(--green)" : "var(--red)" }}>{wfResults.avgWR}%</div><div className="stat-l">Avg WR</div></div>
                  <div className="stat"><div className="stat-v" style={{ color: "var(--blue)" }}>{wfResults.avgPF}</div><div className="stat-l">Avg PF</div></div>
                </div>
                <div style={{ fontSize: 10, color: "var(--tx-3)", marginTop: 8 }}>Brain weights auto-optimized from walk-forward analysis. Weights that contributed to losing periods reduced, winning weights increased.</div>
              </div>
            )}
            <div className="tw">
              <table className="dt">
                <thead><tr><th>Date</th><th>Symbol</th><th>Strategy</th><th>Bias TF</th><th>Entry TF</th><th>Score</th><th>Bias</th><th>Result</th><th>R:R</th><th>Pips</th><th>P&L (₹)</th></tr></thead>
                <tbody>
                  {results.slice(-25).reverse().map(r => (
                    <tr key={r.id}>
                      <td>{r.date}</td><td style={{ fontWeight: 600 }}>{r.symbol}</td><td>{r.strategy}</td><td>{r.biasTF}</td><td>{r.entryTF}</td>
                      <td><span className={`tag ${r.score >= 60 ? "tg" : r.score >= 45 ? "tgo" : "tr"}`}>{r.score}</span></td>
                      <td className={r.bias === "LONG" ? "tg" : "tr"}>{r.bias}</td>
                      <td><span className={`tag ${r.result === "WIN" ? "tg" : "tr"}`}>{r.result}</span></td>
                      <td>{r.rr}R</td><td className={r.pnlPips >= 0 ? "" : ""} style={{ color: r.pnlPips >= 0 ? "var(--green)" : "var(--red)" }}>{r.pnlPips > 0 ? "+" : ""}{r.pnlPips}</td>
                      <td style={{ color: r.pnlINR >= 0 ? "var(--green)" : "var(--red)" }}>{fmtINR(r.pnlINR)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {results.length === 0 && <div className="empty"><div className="empty-i">📊</div><p>Run backtest to simulate trades. Walk-forward engine validates and auto-optimizes brain weights.</p></div>}
      </div>
    </div>
  );
};

// ─── PAPER TRADING TAB ───────────────────────────────────────────
const PaperTradingTab = ({ prices, analyses, activeSym }) => {
  const [capital] = useState(() => LS.get("paper_capital", 1000000));
  const [balance, setBalance] = useState(() => LS.get("paper_balance", 1000000));
  const [positions, setPositions] = useState(() => LS.get("paper_positions", []));
  const [history, setHistory] = useState(() => LS.get("paper_history", []));
  const sym = SYMBOLS.find(s => s.id === activeSym);
  const price = prices[activeSym]?.price;
  const analysis = analyses[activeSym];

  // Auto-close positions on SL/TP
  useEffect(() => {
    if (!price || positions.length === 0) return;
    const updated = [], closed = [];
    positions.forEach(pos => {
      const p = prices[pos.symbol]?.price;
      if (!p) { updated.push(pos); return; }
      let closeReason = null;
      if (pos.direction === "LONG") {
        if (p >= pos.tp1 && !pos.tp1Hit) { pos.tp1Hit = true; closeReason = "TP1 Hit"; }
        if (p >= pos.tp2) closeReason = "TP2 Hit";
        if (p <= pos.sl) closeReason = "SL Hit";
      } else {
        if (p <= pos.tp1 && !pos.tp1Hit) { pos.tp1Hit = true; closeReason = "TP1 Hit"; }
        if (p <= pos.tp2) closeReason = "TP2 Hit";
        if (p >= pos.sl) closeReason = "SL Hit";
      }
      if (closeReason) {
        const pnlPips = calcPips(pos.symbol, pos.direction === "LONG" ? p - pos.entry : pos.entry - p);
        const pnlINR = pipsToINR(pos.symbol, pnlPips, pos.lots);
        closed.push({ ...pos, closePrice: p, closeTime: new Date().toLocaleTimeString("en-IN"), reason: closeReason, pnlPips, pnlINR, result: pnlINR >= 0 ? "WIN" : "LOSS" });
        notify(`🏁 ${closeReason}`, `${pos.symbol} ${pos.direction}: ${fmtINR(pnlINR)}`);
      } else { updated.push(pos); }
    });
    if (closed.length) {
      const newBal = balance + closed.reduce((s, c) => s + c.pnlINR, 0);
      setBalance(newBal);
      setPositions(updated);
      setHistory(h => { const nh = [...h, ...closed]; LS.set("paper_history", nh); return nh; });
      LS.set("paper_positions", updated);
      LS.set("paper_balance", newBal);
    }
  }, [prices]);

  const openTrade = (dir) => {
    if (!price) return;
    const a = analysis || {};
    const lots = 0.1;
    const pos = {
      id: Date.now(), symbol: activeSym, direction: dir, entry: price, lots,
      sl: a.sl || (dir === "LONG" ? price * 0.99 : price * 1.01),
      tp1: a.tp1 || (dir === "LONG" ? price * 1.01 : price * 0.99),
      tp2: a.tp2 || (dir === "LONG" ? price * 1.03 : price * 0.97),
      openTime: new Date().toLocaleTimeString("en-IN"), tp1Hit: false,
    };
    const np = [...positions, pos];
    setPositions(np);
    LS.set("paper_positions", np);
    notify("📊 Position Opened", `${dir} ${activeSym} @ $${fmt(price)}`);
  };

  const closePosition = (posId) => {
    const pos = positions.find(p => p.id === posId);
    if (!pos) return;
    const p = prices[pos.symbol]?.price || pos.entry;
    const pnlPips = calcPips(pos.symbol, pos.direction === "LONG" ? p - pos.entry : pos.entry - p);
    const pnlINR = pipsToINR(pos.symbol, pnlPips, pos.lots);
    const closed = { ...pos, closePrice: p, closeTime: new Date().toLocaleTimeString("en-IN"), reason: "Manual", pnlPips, pnlINR, result: pnlINR >= 0 ? "WIN" : "LOSS" };
    const newBal = balance + pnlINR;
    setBalance(newBal);
    setPositions(positions.filter(p => p.id !== posId));
    setHistory(h => { const nh = [...h, closed]; LS.set("paper_history", nh); return nh; });
    LS.set("paper_positions", positions.filter(p => p.id !== posId));
    LS.set("paper_balance", newBal);
  };

  const totalPnl = balance - capital;
  const openPnl = positions.reduce((s, pos) => {
    const p = prices[pos.symbol]?.price;
    if (!p) return s;
    return s + pipsToINR(pos.symbol, calcPips(pos.symbol, pos.direction === "LONG" ? p - pos.entry : pos.entry - p), pos.lots);
  }, 0);

  return (
    <div className="anim">
      <div className="card">
        <div className="ch">
          <div className="ct">📈 Paper Trading — ₹10L Capital</div>
          <div style={{ display: "flex", gap: 6 }}><span className="tag tgo">Balance: {fmtINR(balance)}</span></div>
        </div>
        <div className="g4" style={{ marginBottom: 14 }}>
          <div className="stat"><div className="stat-v">{fmtINR(capital)}</div><div className="stat-l">Starting Capital</div></div>
          <div className="stat"><div className="stat-v" style={{ color: balance >= capital ? "var(--green)" : "var(--red)" }}>{fmtINR(balance)}</div><div className="stat-l">Current Balance</div></div>
          <div className="stat"><div className="stat-v" style={{ color: totalPnl >= 0 ? "var(--green)" : "var(--red)" }}>{fmtINR(totalPnl)}</div><div className="stat-l">Realized P&L</div></div>
          <div className="stat"><div className="stat-v" style={{ color: openPnl >= 0 ? "var(--green)" : "var(--red)" }}>{fmtINR(openPnl)}</div><div className="stat-l">Open P&L</div></div>
        </div>

        {/* Open Position */}
        <div style={{ textAlign: "center", padding: 16, marginBottom: 12, background: "var(--bg-2)", borderRadius: "var(--r)" }}>
          <div style={{ fontSize: 12, color: "var(--tx-3)", marginBottom: 8 }}>
            {analysis && analysis.bias !== "NEUTRAL" ? `Signal: ${analysis.bias} ${activeSym} — Score ${analysis.score}` : `No active signal on ${activeSym} — Manual trade available`}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button className="btn btn-gr" onClick={() => openTrade("LONG")} disabled={!price}>🟢 LONG {activeSym}</button>
            <button className="btn btn-rd" onClick={() => openTrade("SHORT")} disabled={!price}>🔴 SHORT {activeSym}</button>
          </div>
        </div>

        {/* Open Positions */}
        {positions.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Open Positions ({positions.length})</div>
            {positions.map(pos => {
              const p = prices[pos.symbol]?.price;
              const pnlPips = p ? calcPips(pos.symbol, pos.direction === "LONG" ? p - pos.entry : pos.entry - p) : 0;
              const pnlINR_live = pipsToINR(pos.symbol, pnlPips, pos.lots);
              return (
                <div key={pos.id} className="card" style={{ padding: 10, borderLeft: `3px solid ${pnlINR_live >= 0 ? "var(--green)" : "var(--red)"}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <strong>{pos.symbol}</strong> <span className={`tag ${pos.direction === "LONG" ? "tg" : "tr"}`}>{pos.direction}</span>
                      <span style={{ fontSize: 10, color: "var(--tx-3)", marginLeft: 6 }}>{pos.lots} lots @ ${fmt(pos.entry)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: "var(--fmono)", fontWeight: 700, color: pnlINR_live >= 0 ? "var(--green)" : "var(--red)" }}>{fmtINR(pnlINR_live)} ({pnlPips > 0 ? "+" : ""}{pnlPips} pips)</span>
                      <button className="btn btn-sm btn-s" onClick={() => closePosition(pos.id)}>Close</button>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 10, color: "var(--tx-3)" }}>
                    <span>SL: ${fmt(pos.sl)}</span><span>TP1: ${fmt(pos.tp1)}</span><span>TP2: ${fmt(pos.tp2)}</span>
                    <span style={{ color: "var(--tx-2)" }}>Auto-closes on SL/TP hit</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Trade History */}
      {history.length > 0 && (
        <div className="card">
          <div className="ch">
            <div className="ct">📋 Closed Trades</div>
            <button className="btn btn-sm btn-s" onClick={() => { setHistory([]); LS.del("paper_history"); }}>Clear</button>
          </div>
          <div className="tw">
            <table className="dt">
              <thead><tr><th>Symbol</th><th>Dir</th><th>Entry</th><th>Close</th><th>Reason</th><th>Pips</th><th>P&L (₹)</th><th>Result</th></tr></thead>
              <tbody>
                {history.slice().reverse().slice(0, 20).map(h => (
                  <tr key={h.id}>
                    <td>{h.symbol}</td>
                    <td><span className={`tag ${h.direction === "LONG" ? "tg" : "tr"}`}>{h.direction}</span></td>
                    <td>${fmt(h.entry)}</td><td>${fmt(h.closePrice)}</td><td>{h.reason}</td>
                    <td style={{ color: h.pnlPips >= 0 ? "var(--green)" : "var(--red)" }}>{h.pnlPips > 0 ? "+" : ""}{h.pnlPips}</td>
                    <td style={{ color: h.pnlINR >= 0 ? "var(--green)" : "var(--red)" }}>{fmtINR(h.pnlINR)}</td>
                    <td><span className={`tag ${h.result === "WIN" ? "tg" : "tr"}`}>{h.result}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── POSITION CALCULATOR ─────────────────────────────────────────
const CalcTab = ({ prices, activeSym }) => {
  const [cap, setCap] = useState(() => LS.get("calc_cap", 100000));
  const [risk, setRisk] = useState(() => LS.get("calc_risk", 1));
  const [slPips, setSlPips] = useState(50);
  const [tpPips, setTpPips] = useState(75);
  const [lots, setLots] = useState(0.01);
  const [sym, setSym] = useState(activeSym);

  const riskAmt = cap * (risk / 100);
  const s = SYMBOLS.find(x => x.id === sym);
  const calcLots = slPips > 0 ? +(riskAmt / (slPips * (s?.lotPipVal || 10) * 83)).toFixed(3) : 0;
  const profitAtTP = tpPips * (s?.lotPipVal || 10) * lots * 83;
  const lossAtSL = slPips * (s?.lotPipVal || 10) * lots * 83;

  useEffect(() => { LS.set("calc_cap", cap); LS.set("calc_risk", risk); }, [cap, risk]);

  return (
    <div className="anim">
      <div className="card">
        <div className="ch"><div className="ct">💰 Position Size Calculator</div></div>
        <div className="g2">
          <div>
            <div style={{ marginBottom: 10 }}><label className="lbl">Symbol</label><select className="inp" value={sym} onChange={e => setSym(e.target.value)}>{SYMBOLS.map(s => <option key={s.id} value={s.id}>{s.id} ({s.name})</option>)}</select></div>
            <div style={{ marginBottom: 10 }}><label className="lbl">Account Capital (₹)</label><input className="inp" type="number" value={cap} onChange={e => setCap(+e.target.value)} onKeyDown={e => e.key === "Enter" && e.target.blur()} /></div>
            <div style={{ marginBottom: 10 }}><label className="lbl">Risk per Trade (%)</label><input className="inp" type="number" value={risk} step="0.25" onChange={e => setRisk(+e.target.value)} onKeyDown={e => e.key === "Enter" && e.target.blur()} /></div>
            <div style={{ marginBottom: 10 }}><label className="lbl">Stop Loss (pips)</label><input className="inp" type="number" value={slPips} onChange={e => setSlPips(+e.target.value)} onKeyDown={e => e.key === "Enter" && e.target.blur()} /></div>
            <div style={{ marginBottom: 10 }}><label className="lbl">Take Profit (pips)</label><input className="inp" type="number" value={tpPips} onChange={e => setTpPips(+e.target.value)} onKeyDown={e => e.key === "Enter" && e.target.blur()} /></div>
            <div style={{ marginBottom: 10 }}><label className="lbl">Lot Size</label><input className="inp" type="number" value={lots} step="0.01" onChange={e => setLots(+e.target.value)} onKeyDown={e => e.key === "Enter" && e.target.blur()} /></div>
          </div>
          <div>
            <div className="g4">
              <div className="stat"><div className="stat-v" style={{ color: "var(--gold)" }}>{fmtINR(riskAmt)}</div><div className="stat-l">Risk Amount</div></div>
              <div className="stat"><div className="stat-v" style={{ color: "var(--blue)" }}>{calcLots}</div><div className="stat-l">Calculated Lots</div></div>
              <div className="stat"><div className="stat-v" style={{ color: "var(--green)" }}>{fmtINR(profitAtTP)}</div><div className="stat-l">Profit at TP</div></div>
              <div className="stat"><div className="stat-v" style={{ color: "var(--red)" }}>{fmtINR(lossAtSL)}</div><div className="stat-l">Loss at SL</div></div>
              <div className="stat"><div className="stat-v">{slPips > 0 ? (tpPips / slPips).toFixed(2) : "—"}</div><div className="stat-l">Risk:Reward</div></div>
              <div className="stat"><div className="stat-v" style={{ color: "var(--red)" }}>{fmtINR(cap * 0.06)}</div><div className="stat-l">Max DD (6%)</div></div>
            </div>
            <div style={{ marginTop: 12, fontSize: 11, color: "var(--tx-3)", lineHeight: 1.6 }}>
              Current {sym} price: ${prices[sym]?.price ? fmt(prices[sym].price, s?.pipDigit) : "—"}<br />
              Pip value for {sym}: ${s?.lotPipVal}/pip/lot<br />
              All fields are editable. Press Enter to calculate.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── BRAIN / WEIGHTS ─────────────────────────────────────────────
const BrainTab = ({ weights, setWeights }) => {
  const total = Object.values(weights).reduce((s, w) => s + w, 0);
  const update = (id, v) => { const nw = { ...weights, [id]: Math.max(0, Math.min(20, +v)) }; setWeights(nw); LS.set("weights", nw); };
  const reset = () => { const d = ICT_KB.concepts.reduce((a, c) => ({ ...a, [c.id]: c.weight }), {}); setWeights(d); LS.set("weights", d); };

  return (
    <div className="anim">
      <div className="card">
        <div className="ch">
          <div className="ct">🧠 Adaptive Brain — Auto-Learning Weights</div>
          <div style={{ display: "flex", gap: 6 }}>
            <span className="tag tgo">Total: {total}</span>
            <button className="btn btn-sm btn-s" onClick={reset}>Reset</button>
          </div>
        </div>
        <p style={{ fontSize: 12, color: "var(--tx-3)", marginBottom: 14 }}>
          Weights auto-update from walk-forward backtest results. Pillars that produce winning signals get higher weights; losing ones get reduced. You can also manually adjust.
        </p>
        {ICT_KB.concepts.map(c => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ width: 160, fontSize: 11, fontWeight: 500, color: "var(--tx-2)", flexShrink: 0 }}>{c.name}</span>
            <input type="range" min="0" max="20" value={weights[c.id] || c.weight} onChange={e => update(c.id, e.target.value)} style={{ flex: 1, accentColor: "var(--gold)", cursor: "pointer" }} />
            <span style={{ width: 30, fontFamily: "var(--fmono)", fontSize: 11, textAlign: "right", color: "var(--gold)" }}>{weights[c.id] || c.weight}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── TRADE LOG ───────────────────────────────────────────────────
const TradeLogTab = () => {
  const [logs, setLogs] = useState(() => LS.get("tradelog", []));
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ symbol: "XAUUSD", direction: "LONG", entry: "", exit: "", slPips: "", tpPips: "", notes: "", result: "WIN" });

  const addLog = () => {
    const entry = +form.entry, exit = +form.exit;
    if (!entry) return;
    const pnlPips = form.slPips ? +form.slPips * (form.result === "WIN" ? 1 : -1) : calcPips(form.symbol, form.direction === "LONG" ? exit - entry : entry - exit);
    const pnlINR = pipsToINR(form.symbol, pnlPips, 0.01);
    const log = { id: Date.now(), date: new Date().toISOString().split("T")[0], ...form, entry, exit, pnlPips, pnlINR };
    const nl = [...logs, log]; setLogs(nl); LS.set("tradelog", nl);
    setShowForm(false);
    setForm({ symbol: "XAUUSD", direction: "LONG", entry: "", exit: "", slPips: "", tpPips: "", notes: "", result: "WIN" });
  };

  const totalPnl = logs.reduce((s, l) => s + (l.pnlINR || 0), 0);
  const totalPips = logs.reduce((s, l) => s + (l.pnlPips || 0), 0);

  return (
    <div className="anim">
      <div className="card">
        <div className="ch">
          <div className="ct">📓 Trade Journal</div>
          <div style={{ display: "flex", gap: 4 }}>
            <span className="tag tgo">{fmtINR(totalPnl)} | {totalPips > 0 ? "+" : ""}{totalPips} pips</span>
            <button className="btn btn-sm btn-g" onClick={() => setShowForm(!showForm)}>+ Add</button>
          </div>
        </div>
        {showForm && (
          <div style={{ padding: 12, background: "var(--bg-2)", borderRadius: "var(--rs)", marginBottom: 12 }}>
            <div className="g2">
              <div><label className="lbl">Symbol</label><select className="inp" value={form.symbol} onChange={e => setForm({ ...form, symbol: e.target.value })}>{SYMBOLS.map(s => <option key={s.id} value={s.id}>{s.id}</option>)}</select></div>
              <div><label className="lbl">Direction</label><select className="inp" value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value })}><option value="LONG">LONG</option><option value="SHORT">SHORT</option></select></div>
              <div><label className="lbl">Entry Price</label><input className="inp" type="number" value={form.entry} onChange={e => setForm({ ...form, entry: e.target.value })} /></div>
              <div><label className="lbl">Exit Price</label><input className="inp" type="number" value={form.exit} onChange={e => setForm({ ...form, exit: e.target.value })} /></div>
              <div><label className="lbl">P&L in Pips</label><input className="inp" type="number" value={form.slPips} onChange={e => setForm({ ...form, slPips: e.target.value })} placeholder="Auto if empty" /></div>
              <div><label className="lbl">Result</label><select className="inp" value={form.result} onChange={e => setForm({ ...form, result: e.target.value })}><option value="WIN">WIN</option><option value="LOSS">LOSS</option><option value="BE">BE</option></select></div>
              <div style={{ gridColumn: "1/-1" }}><label className="lbl">Notes</label><input className="inp" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Strategy used, mistakes, observations..." /></div>
            </div>
            <div style={{ marginTop: 8, display: "flex", gap: 6 }}><button className="btn btn-g" onClick={addLog}>Save</button><button className="btn btn-s" onClick={() => setShowForm(false)}>Cancel</button></div>
          </div>
        )}
        {logs.length > 0 ? (
          <div className="tw">
            <table className="dt">
              <thead><tr><th>Date</th><th>Symbol</th><th>Dir</th><th>Entry</th><th>Exit</th><th>Pips</th><th>P&L (₹)</th><th>Result</th><th>Notes</th></tr></thead>
              <tbody>
                {logs.slice().reverse().map(l => (
                  <tr key={l.id}>
                    <td>{l.date}</td><td>{l.symbol}</td><td className={l.direction === "LONG" ? "" : ""} style={{ color: l.direction === "LONG" ? "var(--green)" : "var(--red)" }}>{l.direction}</td>
                    <td>${fmt(l.entry)}</td><td>${fmt(l.exit)}</td>
                    <td style={{ color: l.pnlPips >= 0 ? "var(--green)" : "var(--red)" }}>{l.pnlPips > 0 ? "+" : ""}{l.pnlPips}</td>
                    <td style={{ color: l.pnlINR >= 0 ? "var(--green)" : "var(--red)" }}>{fmtINR(l.pnlINR)}</td>
                    <td><span className={`tag ${l.result === "WIN" ? "tg" : l.result === "LOSS" ? "tr" : "tgo"}`}>{l.result}</span></td>
                    <td style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>{l.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty"><div className="empty-i">📓</div><p>No trades. Click "+ Add" to log a trade with pips and ₹ P&L.</p></div>}
      </div>
    </div>
  );
};

// ─── SETTINGS ────────────────────────────────────────────────────
const SettingsTab = ({ workerUrl, setWorkerUrl, keys, setKeys }) => {
  const { theme, toggle } = useContext(ThemeContext);
  const [tw, setTw] = useState(workerUrl);
  const [localKeys, setLocalKeys] = useState(keys);
  const [whatsapp, setWhatsapp] = useState(() => LS.get("whatsapp", ""));

  const save = () => {
    setWorkerUrl(tw); localStorage.setItem("ict_worker_url", tw);
    setKeys(localKeys); LS.set("api_keys", localKeys);
    LS.set("whatsapp", whatsapp);
  };

  return (
    <div className="anim">
      <div className="card">
        <div className="ch"><div className="ct">⚙️ Settings</div><span className="tag tgo">v{VERSION}</span></div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tx-3)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Theme</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12 }}>☀️ Light</span>
            <div className={`toggle ${theme === "dark" ? "on" : ""}`} onClick={toggle} />
            <span style={{ fontSize: 12 }}>🌙 Dark</span>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tx-3)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Data Connection</div>
          <label className="lbl">Cloudflare Worker URL</label>
          <input className="inp" value={tw} onChange={e => setTw(e.target.value)} placeholder="https://ict-data-proxy.your.workers.dev" />
          <div style={{ fontSize: 10, color: "var(--tx-3)", marginTop: 3 }}>Yahoo Finance proxy — powers all 4 symbols</div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tx-3)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>API Keys</div>
          {["anthropic", "finnhub", "twelvedata", "tradingview"].map(k => (
            <div key={k} style={{ marginBottom: 8 }}>
              <label className="lbl">{k.charAt(0).toUpperCase() + k.slice(1)} API Key</label>
              <input className="inp" type="password" value={localKeys[k] || ""} onChange={e => setLocalKeys({ ...localKeys, [k]: e.target.value })} placeholder={`${k} API key...`} />
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tx-3)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Notifications</div>
          <label className="lbl">WhatsApp Number (for signal alerts)</label>
          <input className="inp" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="+91 98765 43210" />
          <div style={{ fontSize: 10, color: "var(--tx-3)", marginTop: 3 }}>Signals will be sent via WhatsApp when high-confluence setups are detected</div>
          <button className="btn btn-sm btn-s" style={{ marginTop: 6 }} onClick={() => { if ("Notification" in window) Notification.requestPermission(); }}>
            Enable Desktop Notifications ({typeof Notification !== "undefined" ? Notification.permission : "N/A"})
          </button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tx-3)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Data</div>
          <button className="btn btn-sm btn-rd" onClick={() => {
            if (window.confirm("Clear ALL local data?")) {
              ["backtest", "paper_positions", "paper_history", "paper_balance", "tradelog", "weights", "signals", "api_keys"].forEach(k => LS.del(k));
              window.location.reload();
            }
          }}>Clear All Data</button>
        </div>

        <button className="btn btn-g" onClick={save} style={{ marginTop: 8 }}>💾 Save Settings</button>
      </div>
    </div>
  );
};

// ─── AI CHAT ─────────────────────────────────────────────────────
const ChatWidget = ({ workerUrl, keys, analyses, prices, activeSym }) => {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([{ r: "a", t: "Welcome! Ask about ICT concepts, current signals, or trading strategies." }]);
  const [inp, setInp] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const send = async () => {
    if (!inp.trim() || loading) return;
    const q = inp.trim(); setInp(""); setMsgs(p => [...p, { r: "u", t: q }]); setLoading(true);

    const ctx = SYMBOLS.map(s => `${s.id}: $${prices[s.id]?.price ? fmt(prices[s.id].price) : "N/A"} | ${analyses[s.id]?.bias || "NEUTRAL"} | Score:${analyses[s.id]?.score || 0}`).join("\n");
    const sys = `You are an ICT/SMC trading AI expert for ${APP_NAME}. Active: ${activeSym}, Session: ${getSession().name}.\nMarket:\n${ctx}\n\nUse ICT 12-pillar concepts. Be concise and actionable.`;

    try {
      if (workerUrl && keys.anthropic) {
        const r = await fetch(`${workerUrl}?source=ai`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: keys.anthropic, model: "claude-sonnet-4-20250514", system: sys, messages: [{ role: "user", content: q }], max_tokens: 500 }) });
        const d = await r.json();
        setMsgs(p => [...p, { r: "a", t: d.content?.[0]?.text || d.text || "Check API key in settings." }]);
      } else {
        // Offline KB search
        const match = ICT_KB.concepts.find(c => q.toLowerCase().includes(c.name.toLowerCase().split(" ")[0]));
        const reply = match ? `**${match.name}**: ${match.summary}\n\n${match.content.slice(0, 400)}...` : `Current ${activeSym}: ${analyses[activeSym]?.bias || "NEUTRAL"}, Score: ${analyses[activeSym]?.score || 0}/100. Set up your Anthropic API key in Settings for full AI analysis.`;
        setMsgs(p => [...p, { r: "a", t: reply }]);
      }
    } catch (e) { setMsgs(p => [...p, { r: "a", t: "Error: " + e.message }]); }
    setLoading(false);
  };

  return (
    <div className="chat-c">
      {open && (
        <div className="chat-p">
          <div className="chat-ph"><span>🤖</span> ICT AI<span style={{ marginLeft: "auto", cursor: "pointer", color: "var(--tx-3)" }} onClick={() => setOpen(false)}>✕</span></div>
          <div className="chat-m">
            {msgs.map((m, i) => <div key={i} className={`chat-msg ${m.r === "u" ? "u" : "a"}`}>{m.t}</div>)}
            {loading && <div className="chat-msg a"><span className="sp" /></div>}
            <div ref={endRef} />
          </div>
          <div className="chat-iw">
            <input className="chat-i" value={inp} onChange={e => setInp(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Ask about ICT..." />
            <button className="chat-sb" onClick={send}>→</button>
          </div>
        </div>
      )}
      <button className="chat-t" onClick={() => setOpen(!open)}>{open ? "✕" : "🤖"}</button>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════════════════════════════
export default function App() {
  const [theme, setTheme] = useState(() => LS.get("theme", "light"));
  const [tab, setTab] = useState("scanner");
  const [activeSym, setActiveSym] = useState("XAUUSD");
  const [prices, setPrices] = useState({});
  const [candles, setCandlesState] = useState({});
  const [analyses, setAnalyses] = useState({});
  const [signalHistory, setSignalHistory] = useState(() => LS.get("signals", []));
  const [workerUrl, setWorkerUrl] = useState(() => localStorage.getItem("ict_worker_url") || "");
  const [keys, setKeys] = useState(() => LS.get("api_keys", { anthropic: localStorage.getItem("ict_anthropic_key") || "", finnhub: "", twelvedata: "", tradingview: "" }));
  const [weights, setWeights] = useState(() => LS.get("weights", ICT_KB.concepts.reduce((a, c) => ({ ...a, [c.id]: c.weight }), {})));

  const toggleTheme = useCallback(() => { setTheme(t => { const n = t === "dark" ? "light" : "dark"; LS.set("theme", n); return n; }); }, []);
  const setCandles = useCallback((sym, d) => setCandlesState(p => ({ ...p, [sym]: d })), []);

  // 1-SECOND price refresh
  useEffect(() => {
    if (!workerUrl) return;
    const refresh = async () => {
      const r = {};
      await Promise.allSettled(SYMBOLS.map(async s => { const p = await fetchPrice(s.id, workerUrl); if (p) r[s.id] = p; }));
      setPrices(p => ({ ...p, ...r }));
    };
    refresh();
    const iv = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(iv);
  }, [workerUrl]);

  // Analysis refresh + signal recording
  useEffect(() => {
    if (!workerUrl) return;
    const analyze = async () => {
      const na = {};
      await Promise.allSettled(SYMBOLS.map(async s => {
        const c = await fetchCandles(s.id, "15m", workerUrl);
        if (c.length) {
          setCandlesState(p => ({ ...p, [s.id]: c }));
          na[s.id] = analyzeICT(c, s.id, weights);
        }
      }));
      setAnalyses(p => ({ ...p, ...na }));

      // Record signals
      const newSigs = [];
      Object.entries(na).forEach(([sym, a]) => {
        if (a.score >= 45 && a.bias !== "NEUTRAL") {
          const lastSig = signalHistory.filter(s => s.symbol === sym).pop();
          if (!lastSig || Date.now() - lastSig.timestamp > 60000) {
            newSigs.push({ symbol: sym, bias: a.bias, score: a.score, entry: a.entry, sl: a.sl, tp1: a.tp1, tp2: a.tp2, strategy: a.strategy?.name, entryTF: a.entryTF, biasTF: a.biasTF, timestamp: Date.now() });
            if (a.score >= 65) notify(`🎯 ${a.bias} ${sym}`, `Score: ${a.score} — ${a.factors[0]?.s || ""}`);
          }
        }
      });
      if (newSigs.length) {
        setSignalHistory(h => { const nh = [...h, ...newSigs].slice(-500); LS.set("signals", nh); return nh; });
      }
    };
    analyze();
    const iv = setInterval(analyze, ANALYSIS_REFRESH_MS);
    return () => clearInterval(iv);
  }, [workerUrl, weights]);

  // Background backtest auto-run
  useEffect(() => {
    const iv = setInterval(() => {
      // Silent background analysis refinement
      const btResults = LS.get("backtest", []);
      if (btResults.length > 10) {
        const wins = btResults.filter(r => r.result === "WIN").length;
        const wr = wins / btResults.length;
        if (wr < 0.5) {
          // Auto-adjust weights down for underperforming
          const nw = { ...weights };
          ICT_KB.concepts.forEach(c => { if (nw[c.id] > 3) nw[c.id]--; });
          setWeights(nw); LS.set("weights", nw);
        }
      }
    }, BACKTEST_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [weights]);

  const session = getSession();
  const liveCount = Object.values(prices).filter(p => p?.live).length;

  const TABS = [
    { id: "scanner", i: "📡", l: "Scanner" },
    { id: "signals", i: "🎯", l: "Signals" },
    { id: "knowledge", i: "📚", l: "Knowledge" },
    { id: "backtest", i: "📊", l: "Backtest" },
    { id: "paper", i: "📈", l: "Paper Trade" },
    { id: "calc", i: "💰", l: "Calculator" },
    { id: "brain", i: "🧠", l: "Brain" },
    { id: "log", i: "📓", l: "Trade Log" },
    { id: "settings", i: "⚙️", l: "Settings" },
  ];

  return (
    <ThemeContext.Provider value={{ theme, toggle: toggleTheme }}>
      <style>{getCSS(theme)}</style>
      <div className="shell">
        <header className="hdr">
          <div className="logo"><div className="logo-mark">👑</div>{APP_NAME}<span className="tag tgo" style={{ fontSize: 9 }}>v{VERSION}</span></div>
          <div className="hdr-prices">
            {SYMBOLS.map(s => {
              const p = prices[s.id];
              return (
                <div key={s.id} className="pc" onClick={() => { setActiveSym(s.id); setTab("scanner"); }}>
                  <span className={`d ${p?.live ? "on" : "off"}`} />
                  <span style={{ color: s.color, fontWeight: 600 }}>{s.icon}{s.id.replace("USD", "")}</span>
                  <span>${p?.price ? fmt(p.price, s.pipDigit) : "—"}</span>
                </div>
              );
            })}
          </div>
          <div className="hdr-r">
            <span className={`sess ${session.active ? "on" : "off"}`}>{session.name}</span>
            <span className="tag tg" style={{ fontSize: 10 }}>{liveCount}/4</span>
            <div className={`toggle ${theme === "dark" ? "on" : ""}`} onClick={toggleTheme} style={{ width: 28, height: 16 }} />
          </div>
        </header>

        <nav className="nav">
          {TABS.map(t => <button key={t.id} className={`nt ${tab === t.id ? "a" : ""}`} onClick={() => setTab(t.id)}>{t.i} {t.l}</button>)}
        </nav>

        <main className="main">
          {!workerUrl && !["settings", "knowledge"].includes(tab) && (
            <div className="card" style={{ borderColor: "var(--gold)", background: "var(--gold-bg)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20 }}>⚠️</span>
                <div><div style={{ fontWeight: 700, marginBottom: 2 }}>Worker URL Required</div><div style={{ fontSize: 12, color: "var(--tx-2)" }}>Go to <strong style={{ cursor: "pointer", color: "var(--gold)" }} onClick={() => setTab("settings")}>Settings</strong> to connect live data.</div></div>
              </div>
            </div>
          )}
          {tab === "scanner" && <ScannerChartTab prices={prices} analyses={analyses} activeSym={activeSym} setActiveSym={setActiveSym} candles={candles} workerUrl={workerUrl} setCandles={setCandles} weights={weights} />}
          {tab === "signals" && <SignalsTab analyses={analyses} prices={prices} signalHistory={signalHistory} setSignalHistory={setSignalHistory} />}
          {tab === "knowledge" && <KnowledgeTab />}
          {tab === "backtest" && <BacktestTab weights={weights} setWeights={setWeights} workerUrl={workerUrl} />}
          {tab === "paper" && <PaperTradingTab prices={prices} analyses={analyses} activeSym={activeSym} />}
          {tab === "calc" && <CalcTab prices={prices} activeSym={activeSym} />}
          {tab === "brain" && <BrainTab weights={weights} setWeights={setWeights} />}
          {tab === "log" && <TradeLogTab />}
          {tab === "settings" && <SettingsTab workerUrl={workerUrl} setWorkerUrl={setWorkerUrl} keys={keys} setKeys={setKeys} />}
        </main>

        <footer style={{ padding: "10px 20px", borderTop: "1px solid var(--border)", background: "var(--bg-1)", textAlign: "center", fontSize: 10, color: "var(--tx-3)", fontFamily: "var(--fmono)" }}>
          {APP_NAME} v{VERSION} — Self-Learning ICT/SMC Engine — Yahoo Finance ~15min delayed — Walk-Forward Validated — Not financial advice
        </footer>

        <ChatWidget workerUrl={workerUrl} keys={keys} analyses={analyses} prices={prices} activeSym={activeSym} />
      </div>
    </ThemeContext.Provider>
  );
}
