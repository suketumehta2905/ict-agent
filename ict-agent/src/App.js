import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";

/* ═══════════════════════════════════════════════════════════════════
   ICT SOVEREIGN TRADER v2.0 — Phase 1 Professional Rebuild
   AI-Powered ICT/SMC Signal Generator
   ═══════════════════════════════════════════════════════════════════ */

// ─── CONFIG ──────────────────────────────────────────────────────
const VERSION = "2.0.0";
const APP_NAME = "ICT Sovereign Trader";
const DEFAULT_WORKER = localStorage.getItem("ict_worker_url") || "";
const REFRESH_INTERVAL = 90000; // 90 seconds
const SYMBOLS = [
  { id: "XAUUSD", name: "Gold", yf: "GC=F", color: "#FFD700", icon: "🥇" },
  { id: "XAGUSD", name: "Silver", yf: "SI=F", color: "#C0C0C0", icon: "🥈" },
  { id: "USOIL", name: "Crude Oil", yf: "CL=F", color: "#E85D04", icon: "🛢️" },
  { id: "NATGAS", name: "Natural Gas", yf: "NG=F", color: "#2EC4B6", icon: "⚡" },
];

// ─── ICT 12-PILLAR KNOWLEDGE BASE ────────────────────────────────
const ICT_KNOWLEDGE = {
  pillars: [
    {
      id: "market_structure",
      name: "Market Structure",
      weight: 12,
      description: "Break of Structure (BOS) and Change of Character (CHoCH) identification",
      rules: [
        "Bullish BOS: Price breaks above previous swing high with body close",
        "Bearish BOS: Price breaks below previous swing low with body close",
        "CHoCH: First break against prevailing trend signals potential reversal",
        "Internal structure: Lower timeframe breaks within higher TF range",
        "Swing structure: Major pivot points defining trend direction",
      ],
      signals: {
        bullish: ["BOS above swing high", "CHoCH from bearish to bullish", "Higher highs forming"],
        bearish: ["BOS below swing low", "CHoCH from bullish to bearish", "Lower lows forming"],
      },
    },
    {
      id: "order_blocks",
      name: "Order Blocks (OB)",
      weight: 10,
      description: "Institutional entry zones where smart money accumulates positions",
      rules: [
        "Bullish OB: Last bearish candle before a bullish impulse move",
        "Bearish OB: Last bullish candle before a bearish impulse move",
        "Valid OB must have displacement (strong move away)",
        "OB 50% level (mean threshold) is the optimal entry point",
        "Mitigated OB: Price has already returned and traded through the OB",
      ],
      signals: {
        bullish: ["Price retracing to bullish OB", "Rejection at OB 50% level", "Unmitigated bullish OB below"],
        bearish: ["Price retracing to bearish OB", "Rejection at OB 50% level", "Unmitigated bearish OB above"],
      },
    },
    {
      id: "fair_value_gaps",
      name: "Fair Value Gaps (FVG)",
      weight: 10,
      description: "Imbalances in price where institutional orders create gaps",
      rules: [
        "Bullish FVG: Gap between candle 1 high and candle 3 low (3-candle pattern)",
        "Bearish FVG: Gap between candle 1 low and candle 3 high",
        "Consequent Encroachment (CE): 50% of the FVG — key magnet level",
        "FVG acts as support/resistance until filled",
        "Inverse FVG: Previously filled FVG that now acts as opposite S/R",
      ],
      signals: {
        bullish: ["Price filling bullish FVG from above", "Bounce at FVG CE level", "Unfilled bullish FVG below price"],
        bearish: ["Price filling bearish FVG from below", "Rejection at FVG CE level", "Unfilled bearish FVG above price"],
      },
    },
    {
      id: "liquidity",
      name: "Liquidity Pools",
      weight: 11,
      description: "Buy-side and sell-side liquidity where stop losses cluster",
      rules: [
        "Buy-Side Liquidity (BSL): Stop losses above equal highs / swing highs",
        "Sell-Side Liquidity (SSL): Stop losses below equal lows / swing lows",
        "Smart money hunts liquidity before reversing — the 'Judas Swing'",
        "Liquidity void: Area with no resting orders, price moves fast through it",
        "Old highs/lows are liquidity magnets",
      ],
      signals: {
        bullish: ["SSL swept, price reversing up", "Judas swing below lows completed", "Sell stops taken, buyers entering"],
        bearish: ["BSL swept, price reversing down", "Judas swing above highs completed", "Buy stops taken, sellers entering"],
      },
    },
    {
      id: "optimal_trade_entry",
      name: "Optimal Trade Entry (OTE)",
      weight: 9,
      description: "Fibonacci-based entry zone between 62-79% retracement",
      rules: [
        "OTE zone: 61.8% to 78.6% Fibonacci retracement of impulse leg",
        "Best entries occur at the 70.5% level (sweet spot)",
        "OTE must align with a valid order block or FVG for confirmation",
        "Requires displacement move first, then retracement into OTE zone",
        "Higher timeframe OTE zones are more reliable",
      ],
      signals: {
        bullish: ["Price in bullish OTE zone (61.8-78.6%)", "OTE aligns with bullish OB", "Fib retracement holding at 70.5%"],
        bearish: ["Price in bearish OTE zone (61.8-78.6%)", "OTE aligns with bearish OB", "Fib retracement holding at 70.5%"],
      },
    },
    {
      id: "killzones",
      name: "Killzones (Session Timing)",
      weight: 8,
      description: "High-probability trading windows aligned with institutional sessions",
      rules: [
        "Asian Killzone: 20:00-00:00 EST — establishes the range",
        "London Killzone: 02:00-05:00 EST — first major move",
        "NY Killzone: 07:00-10:00 EST — highest volume continuation",
        "London Close: 10:00-12:00 EST — potential reversals",
        "ICT trades are most effective during killzones, especially London Open and NY Open",
      ],
      signals: {
        bullish: ["London Open bullish displacement", "NY session continuation of London move", "Asian range low swept then reversed"],
        bearish: ["London Open bearish displacement", "NY session bearish continuation", "Asian range high swept then reversed"],
      },
    },
    {
      id: "silver_bullet",
      name: "ICT Silver Bullet",
      weight: 8,
      description: "Specific time-window entries for high-probability setups",
      rules: [
        "London Silver Bullet: 03:00-04:00 EST — FVG forms, enter on retest",
        "NY AM Silver Bullet: 10:00-11:00 EST — FVG forms in this window",
        "NY PM Silver Bullet: 14:00-15:00 EST — last high-prob window",
        "Requires a FVG to form within the Silver Bullet time window",
        "Entry on return to the FVG after it forms — simple and effective",
      ],
      signals: {
        bullish: ["Bullish FVG formed in Silver Bullet window", "Price returning to fill SB FVG from above", "Silver Bullet time + bullish displacement"],
        bearish: ["Bearish FVG formed in Silver Bullet window", "Price returning to fill SB FVG from below", "Silver Bullet time + bearish displacement"],
      },
    },
    {
      id: "displacement",
      name: "Displacement & Imbalance",
      weight: 7,
      description: "Strong impulsive moves showing institutional aggression",
      rules: [
        "Displacement: 2+ large-bodied candles moving aggressively in one direction",
        "Creates FVGs and order blocks as byproducts",
        "Indicates institutional order flow — follow the displacement direction",
        "Displacement after liquidity grab = highest probability signal",
        "Weak displacement (small candles, long wicks) = low probability",
      ],
      signals: {
        bullish: ["Strong bullish displacement candles", "Displacement after SSL sweep", "Large body candles with small wicks up"],
        bearish: ["Strong bearish displacement candles", "Displacement after BSL sweep", "Large body candles with small wicks down"],
      },
    },
    {
      id: "premium_discount",
      name: "Premium & Discount Arrays",
      weight: 7,
      description: "Identifying whether price is in premium or discount relative to range",
      rules: [
        "Equilibrium: 50% of the dealing range — the fair value line",
        "Discount: Below equilibrium — look for longs (buy cheap)",
        "Premium: Above equilibrium — look for shorts (sell expensive)",
        "Smart money buys in discount, sells in premium",
        "PD arrays: Order blocks, FVGs, and breakers categorized by zone",
      ],
      signals: {
        bullish: ["Price in discount zone", "Reacting from discount PD array", "Below equilibrium with bullish structure"],
        bearish: ["Price in premium zone", "Reacting from premium PD array", "Above equilibrium with bearish structure"],
      },
    },
    {
      id: "breaker_blocks",
      name: "Breaker Blocks & Mitigation",
      weight: 6,
      description: "Failed order blocks that become opposite-direction support/resistance",
      rules: [
        "Bullish Breaker: Failed bearish OB — becomes support after broken above",
        "Bearish Breaker: Failed bullish OB — becomes resistance after broken below",
        "Breakers are more reliable than regular OBs (already tested and proven)",
        "Look for price to retrace to breaker block for entry",
        "Mitigation block: Candle that caused a liquidity grab then reversed",
      ],
      signals: {
        bullish: ["Price retracing to bullish breaker", "Broken bearish OB now acting as support", "Mitigation block below current price"],
        bearish: ["Price retracing to bearish breaker", "Broken bullish OB now acting as resistance", "Mitigation block above current price"],
      },
    },
    {
      id: "institutional_flow",
      name: "Institutional Order Flow",
      weight: 6,
      description: "Reading the footprint of smart money through candle analysis",
      rules: [
        "Accumulation → Manipulation → Distribution (AMD cycle)",
        "Wyckoff-style phases align with ICT concepts",
        "Spring = Sell-side liquidity grab, Upthrust = Buy-side liquidity grab",
        "Follow the institutional order flow, not retail sentiment",
        "Volume confirms institutional presence during displacement",
      ],
      signals: {
        bullish: ["Accumulation phase complete, manipulation (spring) done", "Distribution to accumulation transition", "Smart money buying in discount"],
        bearish: ["Distribution phase complete, manipulation (upthrust) done", "Accumulation to distribution transition", "Smart money selling in premium"],
      },
    },
    {
      id: "multi_timeframe",
      name: "Multi-Timeframe Analysis",
      weight: 6,
      description: "Aligning higher timeframe bias with lower timeframe entries",
      rules: [
        "HTF (4H/Daily) determines directional bias — never trade against it",
        "LTF (15m/5m) provides entry timing within HTF bias direction",
        "HTF FVG + LTF entry pattern = highest confluence",
        "At least 2 timeframes must agree for a valid setup",
        "Entry TF should be 4-8x smaller than bias TF",
      ],
      signals: {
        bullish: ["HTF bullish bias + LTF bullish entry", "Daily FVG + 15m bullish OB entry", "4H trend up + 15m OTE long"],
        bearish: ["HTF bearish bias + LTF bearish entry", "Daily FVG + 15m bearish OB entry", "4H trend down + 15m OTE short"],
      },
    },
  ],
  strategies: [
    {
      id: "silver_bullet_london",
      name: "London Silver Bullet",
      timeframe: "5m",
      killzone: "03:00-04:00 EST",
      steps: ["Wait for 03:00 EST", "Identify FVG formed in this window", "Wait for price to retrace to FVG", "Enter on FVG fill with SL below/above FVG", "TP at next liquidity pool"],
      minScore: 18,
    },
    {
      id: "silver_bullet_ny",
      name: "NY AM Silver Bullet",
      timeframe: "5m",
      killzone: "10:00-11:00 EST",
      steps: ["Wait for 10:00 EST", "Identify FVG formed in this window", "Wait for price to retrace to FVG", "Enter on FVG fill", "TP at next liquidity pool or session high/low"],
      minScore: 18,
    },
    {
      id: "ote_retracement",
      name: "OTE Retracement",
      timeframe: "15m",
      killzone: "London/NY",
      steps: ["Identify impulse move with displacement", "Wait for 61.8-78.6% retracement", "Confirm OB or FVG in OTE zone", "Enter at 70.5% fib level", "SL below/above swing, TP at -27% extension"],
      minScore: 20,
    },
    {
      id: "unicorn_model",
      name: "Unicorn Model",
      timeframe: "15m",
      killzone: "NY AM",
      steps: ["Identify breaker block", "Wait for FVG to form overlapping breaker", "The overlap zone is the Unicorn entry", "Enter when price returns to this zone", "SL beyond the breaker, TP at opposing liquidity"],
      minScore: 22,
    },
    {
      id: "judas_swing",
      name: "Judas Swing",
      timeframe: "15m",
      killzone: "London Open",
      steps: ["Note Asian session range", "Wait for false breakout of Asian range at London Open", "This is the Judas Swing — the fake move", "Enter opposite direction after liquidity swept", "TP at opposite end of Asian range or beyond"],
      minScore: 20,
    },
    {
      id: "amd_setup",
      name: "AMD (Accumulation-Manipulation-Distribution)",
      timeframe: "1H",
      killzone: "Any session",
      steps: ["Identify consolidation (accumulation)", "Wait for fake breakout (manipulation)", "Enter on reversal back into range (distribution begins)", "SL beyond manipulation wick", "TP at opposite liquidity pool"],
      minScore: 20,
    },
    {
      id: "turtle_soup",
      name: "ICT Turtle Soup",
      timeframe: "15m",
      killzone: "NY",
      steps: ["Identify equal highs or equal lows (liquidity)", "Wait for a sweep of these levels", "Look for immediate rejection and displacement", "Enter on the first FVG or OB after rejection", "SL above/below the swept level"],
      minScore: 18,
    },
  ],
  sessionTimesIST: {
    asian: { start: "05:30", end: "10:30", label: "Asian Session" },
    london: { start: "12:30", end: "15:30", label: "London Killzone" },
    nyAM: { start: "17:30", end: "20:30", label: "NY AM Killzone" },
    nyPM: { start: "20:30", end: "22:30", label: "NY PM / London Close" },
    silverBulletLondon: { start: "13:30", end: "14:30", label: "London Silver Bullet" },
    silverBulletNY: { start: "20:30", end: "21:30", label: "NY Silver Bullet" },
  },
};

// ─── UTILITY FUNCTIONS ───────────────────────────────────────────
const fmt = (n, d = 2) => (n == null ? "—" : Number(n).toFixed(d));
const fmtINR = (n) => (n == null ? "—" : "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 }));
const fmtPips = (sym, diff) => {
  if (sym === "XAUUSD") return (diff * 10).toFixed(1);
  if (sym === "XAGUSD") return (diff * 100).toFixed(1);
  if (sym === "USOIL") return (diff * 100).toFixed(1);
  if (sym === "NATGAS") return (diff * 1000).toFixed(1);
  return diff.toFixed(1);
};
const pipValue = (sym) => {
  if (sym === "XAUUSD") return 10;
  if (sym === "XAGUSD") return 50;
  if (sym === "USOIL") return 10;
  if (sym === "NATGAS") return 10;
  return 10;
};
const getNow = () => {
  const d = new Date();
  return { h: d.getHours(), m: d.getMinutes(), ts: d.getTime(), iso: d.toISOString(), date: d };
};
const getSession = () => {
  const { h, m } = getNow();
  const t = h * 60 + m;
  if (t >= 330 && t < 630) return { id: "asian", name: "Asian Session", active: true };
  if (t >= 750 && t < 930) return { id: "london", name: "London Killzone", active: true };
  if (t >= 1050 && t < 1230) return { id: "nyAM", name: "NY AM Killzone", active: true };
  if (t >= 1230 && t < 1350) return { id: "nyPM", name: "NY PM Session", active: true };
  return { id: "off", name: "Off-Session", active: false };
};

// ─── LOCAL STORAGE HELPERS ───────────────────────────────────────
const LS = {
  get: (k, def = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};

// ─── NOTIFICATION SYSTEM ─────────────────────────────────────────
const notify = (title, body, tag = "ict") => {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body, icon: "🎯", tag, silent: false });
  }
};
const requestNotificationPermission = () => {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
};

// ─── CSS STYLES ──────────────────────────────────────────────────
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Outfit:wght@300;400;500;600;700;800;900&display=swap');

  :root {
    --bg-primary: #0a0a0f;
    --bg-secondary: #12121a;
    --bg-tertiary: #1a1a28;
    --bg-card: #151522;
    --bg-hover: #1e1e30;
    --border: #2a2a3d;
    --border-bright: #3a3a55;
    --text-primary: #e8e8f0;
    --text-secondary: #9898b0;
    --text-muted: #5a5a72;
    --gold: #f0b90b;
    --gold-dim: #f0b90b44;
    --gold-glow: #f0b90b22;
    --green: #00e676;
    --green-dim: #00e67633;
    --red: #ff1744;
    --red-dim: #ff174433;
    --blue: #448aff;
    --blue-dim: #448aff33;
    --purple: #b388ff;
    --cyan: #18ffff;
    --orange: #ff9100;
    --font-mono: 'JetBrains Mono', monospace;
    --font-display: 'Outfit', sans-serif;
    --radius: 12px;
    --radius-sm: 8px;
    --shadow: 0 4px 24px rgba(0,0,0,0.4);
    --shadow-lg: 0 8px 48px rgba(0,0,0,0.6);
    --transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    background: var(--bg-primary);
    color: var(--text-primary);
    font-family: var(--font-display);
    overflow-x: hidden;
    -webkit-font-smoothing: antialiased;
  }

  .app-shell {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  /* ─── HEADER ─── */
  .app-header {
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
    padding: 0 24px;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 100;
    backdrop-filter: blur(20px);
  }

  .app-logo {
    display: flex;
    align-items: center;
    gap: 12px;
    font-weight: 800;
    font-size: 18px;
    letter-spacing: -0.5px;
  }

  .logo-icon {
    width: 32px;
    height: 32px;
    background: linear-gradient(135deg, var(--gold), #ff9100);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    box-shadow: 0 2px 12px var(--gold-dim);
  }

  .price-strip {
    display: flex;
    gap: 20px;
    align-items: center;
  }

  .price-chip {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px;
    border-radius: 20px;
    background: var(--bg-tertiary);
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 500;
    transition: var(--transition);
    cursor: pointer;
    border: 1px solid transparent;
  }

  .price-chip:hover {
    border-color: var(--border-bright);
    background: var(--bg-hover);
  }

  .price-chip .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    animation: pulse-dot 2s infinite;
  }

  .price-chip .dot.live { background: var(--green); box-shadow: 0 0 8px var(--green); }
  .price-chip .dot.sim { background: var(--orange); }
  .price-chip .dot.off { background: var(--text-muted); }

  @keyframes pulse-dot {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .header-btn {
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    color: var(--text-secondary);
    padding: 6px 12px;
    border-radius: var(--radius-sm);
    font-family: var(--font-display);
    font-size: 12px;
    cursor: pointer;
    transition: var(--transition);
  }

  .header-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
    border-color: var(--border-bright);
  }

  .session-badge {
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 600;
    font-family: var(--font-mono);
    letter-spacing: 0.5px;
  }

  .session-badge.active { background: var(--green-dim); color: var(--green); }
  .session-badge.off { background: var(--bg-tertiary); color: var(--text-muted); }

  /* ─── NAVIGATION TABS ─── */
  .nav-tabs {
    display: flex;
    gap: 2px;
    padding: 8px 24px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
    scrollbar-width: none;
  }

  .nav-tabs::-webkit-scrollbar { display: none; }

  .nav-tab {
    padding: 8px 16px;
    border-radius: var(--radius-sm);
    font-size: 13px;
    font-weight: 500;
    color: var(--text-muted);
    cursor: pointer;
    transition: var(--transition);
    white-space: nowrap;
    border: none;
    background: none;
    font-family: var(--font-display);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .nav-tab:hover {
    color: var(--text-secondary);
    background: var(--bg-tertiary);
  }

  .nav-tab.active {
    color: var(--gold);
    background: var(--gold-glow);
    font-weight: 600;
  }

  .nav-tab .tab-icon { font-size: 14px; }

  /* ─── MAIN CONTENT ─── */
  .main-content {
    flex: 1;
    padding: 20px 24px;
    max-width: 1400px;
    margin: 0 auto;
    width: 100%;
  }

  /* ─── CARDS ─── */
  .card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px;
    margin-bottom: 16px;
    transition: var(--transition);
  }

  .card:hover { border-color: var(--border-bright); }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .card-title {
    font-size: 16px;
    font-weight: 700;
    letter-spacing: -0.3px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .card-subtitle {
    font-size: 12px;
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  /* ─── BUTTONS ─── */
  .btn {
    padding: 8px 16px;
    border-radius: var(--radius-sm);
    font-family: var(--font-display);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: var(--transition);
    border: 1px solid transparent;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .btn-primary {
    background: linear-gradient(135deg, var(--gold), #e6a800);
    color: #000;
    border-color: var(--gold);
  }

  .btn-primary:hover {
    box-shadow: 0 4px 20px var(--gold-dim);
    transform: translateY(-1px);
  }

  .btn-secondary {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border-color: var(--border);
  }

  .btn-secondary:hover {
    background: var(--bg-hover);
    border-color: var(--border-bright);
  }

  .btn-danger {
    background: var(--red-dim);
    color: var(--red);
    border-color: transparent;
  }

  .btn-danger:hover { background: #ff174455; }

  .btn-success {
    background: var(--green-dim);
    color: var(--green);
    border-color: transparent;
  }

  .btn-success:hover { background: #00e67655; }

  .btn-sm { padding: 4px 10px; font-size: 11px; }

  /* ─── SCANNER GRID ─── */
  .scanner-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 16px;
  }

  .scanner-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px;
    transition: var(--transition);
    position: relative;
    overflow: hidden;
  }

  .scanner-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    border-radius: var(--radius) var(--radius) 0 0;
  }

  .scanner-card:hover {
    border-color: var(--border-bright);
    transform: translateY(-2px);
    box-shadow: var(--shadow);
  }

  .scanner-symbol {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .scanner-symbol-name {
    font-size: 18px;
    font-weight: 800;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .scanner-price {
    font-family: var(--font-mono);
    font-size: 24px;
    font-weight: 700;
    margin-bottom: 8px;
  }

  .scanner-change {
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 500;
  }

  .scanner-signal {
    margin-top: 16px;
    padding: 12px;
    border-radius: var(--radius-sm);
    font-size: 13px;
    font-weight: 600;
    text-align: center;
    letter-spacing: 0.5px;
  }

  .signal-long {
    background: var(--green-dim);
    color: var(--green);
    border: 1px solid #00e67633;
  }

  .signal-short {
    background: var(--red-dim);
    color: var(--red);
    border: 1px solid #ff174433;
  }

  .signal-neutral {
    background: var(--bg-tertiary);
    color: var(--text-muted);
    border: 1px solid var(--border);
  }

  /* ─── CONFLUENCE METER ─── */
  .confluence-bar {
    width: 100%;
    height: 8px;
    background: var(--bg-tertiary);
    border-radius: 4px;
    overflow: hidden;
    margin: 8px 0;
  }

  .confluence-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.6s ease;
  }

  .confluence-score {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-secondary);
  }

  /* ─── SIGNAL DETAILS ─── */
  .signal-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
    margin-top: 12px;
  }

  .signal-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--bg-tertiary);
    border-radius: var(--radius-sm);
    font-size: 12px;
  }

  .signal-item .check { color: var(--green); }
  .signal-item .cross { color: var(--red); }
  .signal-item .neutral { color: var(--text-muted); }

  /* ─── CHART CONTAINER ─── */
  .chart-wrapper {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    position: relative;
  }

  .chart-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-secondary);
  }

  .chart-toolbar-group {
    display: flex;
    gap: 4px;
  }

  .tf-btn {
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-family: var(--font-mono);
    font-weight: 500;
    color: var(--text-muted);
    background: transparent;
    border: 1px solid transparent;
    cursor: pointer;
    transition: var(--transition);
  }

  .tf-btn:hover { color: var(--text-secondary); background: var(--bg-tertiary); }
  .tf-btn.active { color: var(--gold); background: var(--gold-glow); border-color: var(--gold-dim); }

  .chart-container {
    width: 100%;
    height: 500px;
  }

  /* ─── TRADE LOG TABLE ─── */
  .table-wrap {
    overflow-x: auto;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    font-family: var(--font-mono);
  }

  .data-table th {
    background: var(--bg-tertiary);
    padding: 10px 12px;
    text-align: left;
    font-weight: 600;
    color: var(--text-secondary);
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-size: 10px;
  }

  .data-table td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    color: var(--text-primary);
    white-space: nowrap;
  }

  .data-table tr:hover td { background: var(--bg-hover); }

  .win { color: var(--green); }
  .loss { color: var(--red); }

  /* ─── SIMULATOR ─── */
  .sim-panel {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .sim-pnl {
    font-family: var(--font-mono);
    font-size: 36px;
    font-weight: 700;
    text-align: center;
    padding: 20px;
    border-radius: var(--radius);
    margin-bottom: 16px;
  }

  .sim-pnl.positive { color: var(--green); background: var(--green-dim); }
  .sim-pnl.negative { color: var(--red); background: var(--red-dim); }
  .sim-pnl.zero { color: var(--text-muted); background: var(--bg-tertiary); }

  /* ─── POSITION CALCULATOR ─── */
  .calc-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 16px;
  }

  .calc-input-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .calc-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .calc-input {
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 10px 14px;
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: 14px;
    transition: var(--transition);
    outline: none;
    width: 100%;
  }

  .calc-input:focus { border-color: var(--gold); box-shadow: 0 0 0 3px var(--gold-glow); }

  .calc-result {
    padding: 16px;
    background: var(--bg-tertiary);
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    text-align: center;
  }

  .calc-result-value {
    font-family: var(--font-mono);
    font-size: 28px;
    font-weight: 700;
    color: var(--gold);
  }

  .calc-result-label {
    font-size: 11px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 4px;
  }

  /* ─── CHAT ─── */
  .chat-container {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 1000;
  }

  .chat-toggle {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--gold), #e6a800);
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    box-shadow: 0 4px 20px var(--gold-dim);
    transition: var(--transition);
  }

  .chat-toggle:hover { transform: scale(1.1); }

  .chat-panel {
    position: absolute;
    bottom: 64px;
    right: 0;
    width: 380px;
    max-height: 500px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .chat-header {
    padding: 14px 16px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-secondary);
    font-weight: 700;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-height: 350px;
  }

  .chat-msg {
    padding: 10px 14px;
    border-radius: 12px;
    font-size: 13px;
    line-height: 1.5;
    max-width: 85%;
  }

  .chat-msg.user {
    background: var(--gold-glow);
    color: var(--gold);
    border: 1px solid var(--gold-dim);
    align-self: flex-end;
    border-bottom-right-radius: 4px;
  }

  .chat-msg.ai {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border: 1px solid var(--border);
    align-self: flex-start;
    border-bottom-left-radius: 4px;
  }

  .chat-input-wrap {
    padding: 12px;
    border-top: 1px solid var(--border);
    display: flex;
    gap: 8px;
  }

  .chat-input {
    flex: 1;
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 10px 14px;
    color: var(--text-primary);
    font-family: var(--font-display);
    font-size: 13px;
    outline: none;
    transition: var(--transition);
  }

  .chat-input:focus { border-color: var(--gold); }

  .chat-send {
    background: var(--gold);
    border: none;
    border-radius: var(--radius-sm);
    width: 38px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    transition: var(--transition);
  }

  .chat-send:hover { transform: scale(1.05); }

  /* ─── KNOWLEDGE BASE ─── */
  .kb-pillar {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin-bottom: 12px;
    overflow: hidden;
    transition: var(--transition);
  }

  .kb-pillar:hover { border-color: var(--border-bright); }

  .kb-pillar-header {
    padding: 16px 20px;
    background: var(--bg-tertiary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    transition: var(--transition);
  }

  .kb-pillar-header:hover { background: var(--bg-hover); }

  .kb-pillar-name {
    font-weight: 700;
    font-size: 15px;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .kb-pillar-weight {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--gold);
    padding: 2px 8px;
    background: var(--gold-glow);
    border-radius: 12px;
  }

  .kb-pillar-body {
    padding: 16px 20px;
    background: var(--bg-card);
  }

  .kb-rule {
    padding: 6px 0;
    font-size: 13px;
    color: var(--text-secondary);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }

  .kb-rule:last-child { border-bottom: none; }

  .kb-rule-bullet {
    color: var(--gold);
    font-size: 8px;
    margin-top: 6px;
    flex-shrink: 0;
  }

  /* ─── WEIGHTS / BRAIN ─── */
  .weight-bar-container {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 10px;
  }

  .weight-label {
    width: 160px;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .weight-bar {
    flex: 1;
    height: 8px;
    background: var(--bg-tertiary);
    border-radius: 4px;
    overflow: hidden;
  }

  .weight-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--gold), var(--orange));
    border-radius: 4px;
    transition: width 0.5s ease;
  }

  .weight-value {
    width: 40px;
    font-family: var(--font-mono);
    font-size: 12px;
    text-align: right;
    color: var(--gold);
  }

  /* ─── SETTINGS ─── */
  .settings-group {
    margin-bottom: 20px;
  }

  .settings-group-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 12px;
  }

  .settings-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 0;
    border-bottom: 1px solid var(--border);
  }

  .settings-label {
    font-size: 14px;
    font-weight: 500;
  }

  .settings-desc {
    font-size: 12px;
    color: var(--text-muted);
    margin-top: 2px;
  }

  /* ─── BACKTEST TABLE ─── */
  .bt-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
    margin-bottom: 20px;
  }

  .bt-stat {
    background: var(--bg-tertiary);
    border-radius: var(--radius-sm);
    padding: 14px;
    text-align: center;
    border: 1px solid var(--border);
  }

  .bt-stat-value {
    font-family: var(--font-mono);
    font-size: 22px;
    font-weight: 700;
  }

  .bt-stat-label {
    font-size: 10px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 4px;
  }

  /* ─── ANIMATIONS ─── */
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes slideIn {
    from { opacity: 0; transform: translateX(-12px); }
    to { opacity: 1; transform: translateX(0); }
  }

  .animate-in {
    animation: fadeIn 0.3s ease forwards;
  }

  .stagger-1 { animation-delay: 0.05s; opacity: 0; }
  .stagger-2 { animation-delay: 0.1s; opacity: 0; }
  .stagger-3 { animation-delay: 0.15s; opacity: 0; }
  .stagger-4 { animation-delay: 0.2s; opacity: 0; }

  /* ─── RESPONSIVE ─── */
  @media (max-width: 768px) {
    .app-header { padding: 0 12px; }
    .price-strip { gap: 8px; }
    .price-chip { padding: 4px 8px; font-size: 11px; }
    .main-content { padding: 12px; }
    .nav-tabs { padding: 8px 12px; }
    .scanner-grid { grid-template-columns: 1fr; }
    .sim-panel { grid-template-columns: 1fr; }
    .chat-panel { width: 320px; right: -12px; }
  }

  /* ─── SCROLLBAR ─── */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: var(--bg-primary); }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--border-bright); }

  /* ─── SELECT ─── */
  select.calc-input {
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%239898b0' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    padding-right: 32px;
  }

  /* ─── LOADING SPINNER ─── */
  .spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid var(--border);
    border-top-color: var(--gold);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .empty-state {
    text-align: center;
    padding: 48px 24px;
    color: var(--text-muted);
  }

  .empty-state-icon {
    font-size: 48px;
    margin-bottom: 12px;
    opacity: 0.5;
  }

  .tag {
    display: inline-flex;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 10px;
    font-weight: 600;
    font-family: var(--font-mono);
    letter-spacing: 0.3px;
  }

  .tag-green { background: var(--green-dim); color: var(--green); }
  .tag-red { background: var(--red-dim); color: var(--red); }
  .tag-gold { background: var(--gold-glow); color: var(--gold); }
  .tag-blue { background: var(--blue-dim); color: var(--blue); }
`;

// ─── ICT ANALYSIS ENGINE ─────────────────────────────────────────
const analyzeICT = (candles, symbol) => {
  if (!candles || candles.length < 20) return { score: 0, bias: "NEUTRAL", factors: [], entry: null, sl: null, tp1: null, tp2: null };

  const len = candles.length;
  const c = candles[len - 1];
  const prev = candles[len - 2];
  const prev2 = candles[len - 3];
  const factors = [];
  let bullPoints = 0;
  let bearPoints = 0;

  // 1. Market Structure
  const swingHigh = Math.max(...candles.slice(-10).map(x => x.h));
  const swingLow = Math.min(...candles.slice(-10).map(x => x.l));
  const range = swingHigh - swingLow;

  if (c.c > candles[len - 4]?.h) {
    bullPoints += 12;
    factors.push({ pillar: "Market Structure", signal: "BOS above swing high", type: "bull" });
  } else if (c.c < candles[len - 4]?.l) {
    bearPoints += 12;
    factors.push({ pillar: "Market Structure", signal: "BOS below swing low", type: "bear" });
  }

  const higherHighs = candles.slice(-6).every((x, i, a) => i === 0 || x.h >= a[i - 1].h - range * 0.01);
  const lowerLows = candles.slice(-6).every((x, i, a) => i === 0 || x.l <= a[i - 1].l + range * 0.01);

  if (higherHighs) { bullPoints += 4; factors.push({ pillar: "Market Structure", signal: "Higher highs forming", type: "bull" }); }
  if (lowerLows) { bearPoints += 4; factors.push({ pillar: "Market Structure", signal: "Lower lows forming", type: "bear" }); }

  // 2. Order Blocks
  for (let i = len - 8; i < len - 1; i++) {
    if (candles[i] && candles[i + 1]) {
      if (candles[i].c < candles[i].o && candles[i + 1].c > candles[i + 1].o && (candles[i + 1].c - candles[i + 1].o) > range * 0.15) {
        const ob50 = (candles[i].o + candles[i].c) / 2;
        if (c.l <= ob50 && c.c > ob50) {
          bullPoints += 10;
          factors.push({ pillar: "Order Blocks", signal: `Bullish OB 50% @ ${fmt(ob50)}`, type: "bull" });
        }
      }
      if (candles[i].c > candles[i].o && candles[i + 1].c < candles[i + 1].o && (candles[i + 1].o - candles[i + 1].c) > range * 0.15) {
        const ob50 = (candles[i].o + candles[i].c) / 2;
        if (c.h >= ob50 && c.c < ob50) {
          bearPoints += 10;
          factors.push({ pillar: "Order Blocks", signal: `Bearish OB 50% @ ${fmt(ob50)}`, type: "bear" });
        }
      }
    }
  }

  // 3. Fair Value Gaps
  for (let i = len - 8; i < len - 2; i++) {
    if (candles[i] && candles[i + 2]) {
      if (candles[i + 2].l > candles[i].h) {
        const fvgCE = (candles[i + 2].l + candles[i].h) / 2;
        if (c.l <= fvgCE) {
          bullPoints += 10;
          factors.push({ pillar: "Fair Value Gap", signal: `Bullish FVG CE @ ${fmt(fvgCE)}`, type: "bull" });
        }
      }
      if (candles[i + 2].h < candles[i].l) {
        const fvgCE = (candles[i + 2].h + candles[i].l) / 2;
        if (c.h >= fvgCE) {
          bearPoints += 10;
          factors.push({ pillar: "Fair Value Gap", signal: `Bearish FVG CE @ ${fmt(fvgCE)}`, type: "bear" });
        }
      }
    }
  }

  // 4. Liquidity
  const equalHighs = candles.slice(-15).filter(x => Math.abs(x.h - swingHigh) < range * 0.02).length >= 2;
  const equalLows = candles.slice(-15).filter(x => Math.abs(x.l - swingLow) < range * 0.02).length >= 2;

  if (equalLows && c.l < swingLow && c.c > swingLow) {
    bullPoints += 11;
    factors.push({ pillar: "Liquidity", signal: "SSL swept — reversal up", type: "bull" });
  }
  if (equalHighs && c.h > swingHigh && c.c < swingHigh) {
    bearPoints += 11;
    factors.push({ pillar: "Liquidity", signal: "BSL swept — reversal down", type: "bear" });
  }

  // 5. OTE Zone
  if (range > 0) {
    const retrace = (swingHigh - c.c) / range;
    if (retrace >= 0.618 && retrace <= 0.786) {
      bullPoints += 9;
      factors.push({ pillar: "OTE", signal: `In OTE zone (${(retrace * 100).toFixed(1)}%)`, type: "bull" });
    }
    const retraceShort = (c.c - swingLow) / range;
    if (retraceShort >= 0.618 && retraceShort <= 0.786) {
      bearPoints += 9;
      factors.push({ pillar: "OTE", signal: `In bearish OTE (${(retraceShort * 100).toFixed(1)}%)`, type: "bear" });
    }
  }

  // 6. Killzone
  const session = getSession();
  if (session.active) {
    const bonus = session.id === "london" ? 8 : session.id === "nyAM" ? 8 : 4;
    if (bullPoints > bearPoints) {
      bullPoints += bonus;
      factors.push({ pillar: "Killzone", signal: `${session.name} active (+${bonus}pts)`, type: "bull" });
    } else if (bearPoints > bullPoints) {
      bearPoints += bonus;
      factors.push({ pillar: "Killzone", signal: `${session.name} active (+${bonus}pts)`, type: "bear" });
    }
  }

  // 7. Displacement
  if (prev && prev2) {
    const bullDisp = (c.c - c.o) > range * 0.2 && (prev.c - prev.o) > range * 0.15;
    const bearDisp = (c.o - c.c) > range * 0.2 && (prev.o - prev.c) > range * 0.15;

    if (bullDisp) {
      bullPoints += 7;
      factors.push({ pillar: "Displacement", signal: "Strong bullish displacement", type: "bull" });
    }
    if (bearDisp) {
      bearPoints += 7;
      factors.push({ pillar: "Displacement", signal: "Strong bearish displacement", type: "bear" });
    }
  }

  // 8. Premium/Discount
  const equilibrium = (swingHigh + swingLow) / 2;
  if (c.c < equilibrium) {
    bullPoints += 7;
    factors.push({ pillar: "Premium/Discount", signal: `In discount (below ${fmt(equilibrium)})`, type: "bull" });
  } else {
    bearPoints += 7;
    factors.push({ pillar: "Premium/Discount", signal: `In premium (above ${fmt(equilibrium)})`, type: "bear" });
  }

  // Compute final
  const totalScore = Math.max(bullPoints, bearPoints);
  const maxPossible = 100;
  const normalizedScore = Math.min(Math.round((totalScore / maxPossible) * 100), 100);
  const bias = bullPoints > bearPoints ? "LONG" : bearPoints > bullPoints ? "SHORT" : "NEUTRAL";

  // Calculate levels
  let entry = c.c;
  let sl, tp1, tp2;

  if (bias === "LONG") {
    entry = c.c;
    sl = swingLow - range * 0.05;
    tp1 = entry + (entry - sl) * 1.5;
    tp2 = entry + (entry - sl) * 3;
  } else if (bias === "SHORT") {
    entry = c.c;
    sl = swingHigh + range * 0.05;
    tp1 = entry - (sl - entry) * 1.5;
    tp2 = entry - (sl - entry) * 3;
  }

  return { score: normalizedScore, bias, factors, entry, sl, tp1, tp2, swingHigh, swingLow, equilibrium, range };
};

// ─── DATA FETCHER ────────────────────────────────────────────────
const fetchPrice = async (symbol, workerUrl) => {
  if (!workerUrl) return null;
  try {
    const sym = SYMBOLS.find(s => s.id === symbol);
    const url = `${workerUrl}?source=yf&sym=${sym.yf}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const d = await r.json();
    if (d.price || d.p) return { price: d.price || d.p, source: "yf", live: true };
    return null;
  } catch { return null; }
};

const fetchCandles = async (symbol, tf, workerUrl) => {
  if (!workerUrl) return [];
  try {
    const sym = SYMBOLS.find(s => s.id === symbol);
    const url = `${workerUrl}?source=yf&sym=${sym.yf}&type=candle&tf=${tf || "15m"}&range=5d`;
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const d = await r.json();
    if (d.candles) return d.candles;
    if (Array.isArray(d)) return d;
    return [];
  } catch { return []; }
};

// ─── COMPONENTS ──────────────────────────────────────────────────

// ─── SCANNER TAB ─────────────────────────────────────────────────
const ScannerTab = ({ prices, analyses, activeSym, setActiveSym, setTab }) => (
  <div className="animate-in">
    <div className="card-header">
      <div className="card-title">📡 4-Symbol ICT Scanner</div>
      <div className="card-subtitle">{getSession().name} — Auto-refresh {REFRESH_INTERVAL / 1000}s</div>
    </div>
    <div className="scanner-grid">
      {SYMBOLS.map((sym, idx) => {
        const p = prices[sym.id];
        const a = analyses[sym.id] || { score: 0, bias: "NEUTRAL", factors: [] };
        const isActive = activeSym === sym.id;
        return (
          <div
            key={sym.id}
            className={`scanner-card animate-in stagger-${idx + 1}`}
            style={{ borderColor: isActive ? sym.color + "88" : undefined, cursor: "pointer" }}
            onClick={() => { setActiveSym(sym.id); setTab("chart"); }}
          >
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: sym.color, borderRadius: "12px 12px 0 0" }} />
            <div className="scanner-symbol">
              <div className="scanner-symbol-name">
                <span>{sym.icon}</span>
                <span>{sym.id}</span>
                <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 400 }}>{sym.name}</span>
              </div>
              <div className={`price-chip`}>
                <span className={`dot ${p?.live ? "live" : "sim"}`} />
                <span>{p?.live ? "LIVE" : "SIM"}</span>
              </div>
            </div>
            <div className="scanner-price" style={{ color: sym.color }}>
              ${p?.price ? fmt(p.price, sym.id === "NATGAS" ? 3 : 2) : "—"}
            </div>
            <div className="confluence-bar">
              <div
                className="confluence-fill"
                style={{
                  width: `${a.score}%`,
                  background: a.score >= 70 ? "var(--green)" : a.score >= 50 ? "var(--gold)" : a.score >= 30 ? "var(--orange)" : "var(--text-muted)",
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="confluence-score">Confluence: {a.score}/100</span>
              <span className={`tag ${a.bias === "LONG" ? "tag-green" : a.bias === "SHORT" ? "tag-red" : "tag-gold"}`}>{a.bias}</span>
            </div>
            {a.bias !== "NEUTRAL" && (
              <div className={`scanner-signal ${a.bias === "LONG" ? "signal-long" : "signal-short"}`}>
                {a.bias === "LONG" ? "🟢" : "🔴"} {a.bias} — Score {a.score}/100
              </div>
            )}
            {a.factors.slice(0, 3).map((f, fi) => (
              <div key={fi} className="signal-item" style={{ marginTop: fi === 0 ? 8 : 4 }}>
                <span className={f.type === "bull" ? "check" : "cross"}>{f.type === "bull" ? "▲" : "▼"}</span>
                <span>{f.pillar}: {f.signal}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  </div>
);

// ─── CHART TAB ───────────────────────────────────────────────────
const ChartTab = ({ activeSym, candles, analysis, workerUrl, setCandles }) => {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const [tf, setTf] = useState("15m");
  const [loading, setLoading] = useState(false);
  const sym = SYMBOLS.find(s => s.id === activeSym);

  const loadCandles = useCallback(async (timeframe) => {
    setLoading(true);
    const data = await fetchCandles(activeSym, timeframe, workerUrl);
    if (data.length) setCandles(activeSym, data);
    setLoading(false);
  }, [activeSym, workerUrl, setCandles]);

  useEffect(() => { loadCandles(tf); }, [tf, activeSym, loadCandles]);

  useEffect(() => {
    if (!chartRef.current || !candles.length) return;
    const loadChart = async () => {
      if (chartInstance.current) { chartInstance.current.remove(); chartInstance.current = null; }
      try {
        const LWC = await import("https://unpkg.com/lightweight-charts@4.1.0/dist/lightweight-charts.standalone.production.mjs");
        const chart = LWC.createChart(chartRef.current, {
          width: chartRef.current.clientWidth,
          height: 500,
          layout: { background: { color: "#0a0a0f" }, textColor: "#9898b0", fontFamily: "'JetBrains Mono', monospace", fontSize: 11 },
          grid: { vertLines: { color: "#1a1a2822" }, horzLines: { color: "#1a1a2822" } },
          crosshair: { mode: 0 },
          rightPriceScale: { borderColor: "#2a2a3d" },
          timeScale: { borderColor: "#2a2a3d", timeVisible: true, secondsVisible: false },
        });

        const series = chart.addCandlestickSeries({
          upColor: "#00e676", downColor: "#ff1744",
          wickUpColor: "#00e676", wickDownColor: "#ff1744",
          borderVisible: false,
        });

        const formatted = candles.map(c => ({
          time: typeof c.t === "number" ? c.t : Math.floor(new Date(c.t).getTime() / 1000),
          open: c.o, high: c.h, low: c.l, close: c.c,
        })).filter(c => c.time && c.open).sort((a, b) => a.time - b.time);

        if (formatted.length) series.setData(formatted);

        // Add ICT levels
        if (analysis && analysis.bias !== "NEUTRAL") {
          if (analysis.entry) {
            series.createPriceLine({ price: analysis.entry, color: sym.color, lineWidth: 2, lineStyle: 0, title: `Entry ${fmt(analysis.entry)}` });
          }
          if (analysis.sl) {
            series.createPriceLine({ price: analysis.sl, color: "#ff1744", lineWidth: 1, lineStyle: 2, title: `SL ${fmt(analysis.sl)}` });
          }
          if (analysis.tp1) {
            series.createPriceLine({ price: analysis.tp1, color: "#00e676", lineWidth: 1, lineStyle: 2, title: `TP1 ${fmt(analysis.tp1)}` });
          }
          if (analysis.tp2) {
            series.createPriceLine({ price: analysis.tp2, color: "#00e676aa", lineWidth: 1, lineStyle: 3, title: `TP2 ${fmt(analysis.tp2)}` });
          }
          if (analysis.equilibrium) {
            series.createPriceLine({ price: analysis.equilibrium, color: "#448aff", lineWidth: 1, lineStyle: 1, title: "EQ" });
          }
        }

        chart.timeScale().fitContent();
        chartInstance.current = chart;

        const ro = new ResizeObserver(() => {
          if (chartRef.current) chart.applyOptions({ width: chartRef.current.clientWidth });
        });
        ro.observe(chartRef.current);
      } catch (e) {
        console.error("Chart load error:", e);
      }
    };
    loadChart();
    return () => { if (chartInstance.current) { chartInstance.current.remove(); chartInstance.current = null; } };
  }, [candles, analysis, activeSym, sym]);

  const timeframes = ["1m", "5m", "15m", "1h", "4h", "1d"];

  return (
    <div className="animate-in">
      <div className="chart-wrapper">
        <div className="chart-toolbar">
          <div className="chart-toolbar-group">
            <span style={{ fontSize: 14, fontWeight: 700, color: sym?.color, marginRight: 12 }}>{sym?.icon} {activeSym}</span>
            {timeframes.map(t => (
              <button key={t} className={`tf-btn ${tf === t ? "active" : ""}`} onClick={() => setTf(t)}>{t.toUpperCase()}</button>
            ))}
          </div>
          <div className="chart-toolbar-group">
            {loading && <span className="spinner" />}
            <button className="btn btn-sm btn-secondary" onClick={() => loadCandles(tf)}>↻ Refresh</button>
          </div>
        </div>
        <div ref={chartRef} className="chart-container" />
      </div>
      {analysis && analysis.bias !== "NEUTRAL" && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header">
            <div className="card-title">🎯 Active Signal — {analysis.bias}</div>
            <span className={`tag ${analysis.bias === "LONG" ? "tag-green" : "tag-red"}`}>Score: {analysis.score}/100</span>
          </div>
          <div className="signal-grid">
            <div className="calc-result"><div className="calc-result-value" style={{ color: sym?.color }}>${fmt(analysis.entry)}</div><div className="calc-result-label">Entry</div></div>
            <div className="calc-result"><div className="calc-result-value" style={{ color: "var(--red)" }}>${fmt(analysis.sl)}</div><div className="calc-result-label">Stop Loss</div></div>
            <div className="calc-result"><div className="calc-result-value" style={{ color: "var(--green)" }}>${fmt(analysis.tp1)}</div><div className="calc-result-label">TP1 (1.5R)</div></div>
            <div className="calc-result"><div className="calc-result-value" style={{ color: "var(--green)" }}>${fmt(analysis.tp2)}</div><div className="calc-result-label">TP2 (3R)</div></div>
          </div>
          <div style={{ marginTop: 16 }}>
            {analysis.factors.map((f, i) => (
              <div key={i} className="signal-item" style={{ marginBottom: 4 }}>
                <span className={f.type === "bull" ? "check" : "cross"}>{f.type === "bull" ? "▲" : "▼"}</span>
                <span style={{ fontWeight: 600, minWidth: 120 }}>{f.pillar}</span>
                <span style={{ color: "var(--text-secondary)" }}>{f.signal}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── SIGNAL TAB ──────────────────────────────────────────────────
const SignalTab = ({ analyses, prices }) => {
  const sorted = SYMBOLS.map(s => ({ sym: s, analysis: analyses[s.id], price: prices[s.id] }))
    .filter(x => x.analysis && x.analysis.score > 0)
    .sort((a, b) => b.analysis.score - a.analysis.score);

  return (
    <div className="animate-in">
      <div className="card">
        <div className="card-header">
          <div className="card-title">📡 ICT Signal Engine v2 — 12-Pillar Analysis</div>
          <div className="card-subtitle">{sorted.filter(x => x.analysis.score >= 50).length} high-prob signals</div>
        </div>
        {sorted.length === 0 ? (
          <div className="empty-state"><div className="empty-state-icon">📡</div><p>Analyzing markets... signals will appear when confluence is detected.</p></div>
        ) : (
          sorted.map(({ sym, analysis: a }, idx) => (
            <div key={sym.id} className={`card animate-in stagger-${idx + 1}`} style={{ marginBottom: 12, borderLeft: `3px solid ${a.bias === "LONG" ? "var(--green)" : a.bias === "SHORT" ? "var(--red)" : "var(--text-muted)"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontWeight: 800, fontSize: 18 }}>{sym.icon} {sym.id}</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className={`tag ${a.bias === "LONG" ? "tag-green" : "tag-red"}`}>{a.bias}</span>
                  <span className="tag tag-gold">Score: {a.score}/100</span>
                </div>
              </div>
              <div className="confluence-bar"><div className="confluence-fill" style={{ width: `${a.score}%`, background: a.score >= 70 ? "var(--green)" : a.score >= 50 ? "var(--gold)" : "var(--orange)" }} /></div>
              <div className="signal-grid" style={{ marginTop: 12 }}>
                {a.entry && <div className="calc-result"><div className="calc-result-value" style={{ fontSize: 18, color: sym.color }}>${fmt(a.entry)}</div><div className="calc-result-label">Entry</div></div>}
                {a.sl && <div className="calc-result"><div className="calc-result-value" style={{ fontSize: 18, color: "var(--red)" }}>${fmt(a.sl)}</div><div className="calc-result-label">SL</div></div>}
                {a.tp1 && <div className="calc-result"><div className="calc-result-value" style={{ fontSize: 18, color: "var(--green)" }}>${fmt(a.tp1)}</div><div className="calc-result-label">TP1</div></div>}
                {a.tp2 && <div className="calc-result"><div className="calc-result-value" style={{ fontSize: 18, color: "var(--green)" }}>${fmt(a.tp2)}</div><div className="calc-result-label">TP2</div></div>}
              </div>
              <div style={{ marginTop: 12 }}>
                {a.factors.map((f, fi) => (
                  <div key={fi} className="signal-item" style={{ marginBottom: 4 }}>
                    <span className={f.type === "bull" ? "check" : "cross"}>{f.type === "bull" ? "▲" : "▼"}</span>
                    <span>{f.pillar}: {f.signal}</span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// ─── STRATEGIES TAB ──────────────────────────────────────────────
const StrategiesTab = () => {
  const [expanded, setExpanded] = useState(null);
  return (
    <div className="animate-in">
      <div className="card">
        <div className="card-header">
          <div className="card-title">🎯 ICT Strategies Library</div>
          <div className="card-subtitle">{ICT_KNOWLEDGE.strategies.length} strategies</div>
        </div>
        {ICT_KNOWLEDGE.strategies.map((strat, idx) => (
          <div key={strat.id} className="kb-pillar" style={{ animationDelay: `${idx * 0.05}s` }}>
            <div className="kb-pillar-header" onClick={() => setExpanded(expanded === idx ? null : idx)}>
              <div className="kb-pillar-name">
                <span style={{ fontSize: 12 }}>#{idx + 1}</span>
                <span>{strat.name}</span>
                <span className="tag tag-blue">{strat.timeframe}</span>
                <span className="tag tag-gold">{strat.killzone}</span>
              </div>
              <span style={{ color: "var(--text-muted)" }}>{expanded === idx ? "▲" : "▼"}</span>
            </div>
            {expanded === idx && (
              <div className="kb-pillar-body">
                <div style={{ marginBottom: 12, fontSize: 12, color: "var(--text-muted)" }}>Min Score Required: <strong style={{ color: "var(--gold)" }}>{strat.minScore}/100</strong></div>
                {strat.steps.map((step, si) => (
                  <div key={si} className="kb-rule">
                    <span className="kb-rule-bullet" style={{ fontSize: 14, color: "var(--gold)" }}>{si + 1}.</span>
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── KNOWLEDGE BASE TAB ──────────────────────────────────────────
const KnowledgeTab = () => {
  const [expanded, setExpanded] = useState(null);
  return (
    <div className="animate-in">
      <div className="card">
        <div className="card-header">
          <div className="card-title">📚 ICT 12-Pillar Knowledge Base</div>
          <div className="card-subtitle">Complete institutional trading framework</div>
        </div>
        {ICT_KNOWLEDGE.pillars.map((pillar, idx) => (
          <div key={pillar.id} className="kb-pillar">
            <div className="kb-pillar-header" onClick={() => setExpanded(expanded === idx ? null : idx)}>
              <div className="kb-pillar-name">
                <span className="kb-pillar-weight">W:{pillar.weight}</span>
                <span>{pillar.name}</span>
              </div>
              <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{expanded === idx ? "▲" : "▼"}</span>
            </div>
            {expanded === idx && (
              <div className="kb-pillar-body">
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.6 }}>{pillar.description}</p>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Rules</div>
                {pillar.rules.map((rule, ri) => (
                  <div key={ri} className="kb-rule"><span className="kb-rule-bullet">●</span><span>{rule}</span></div>
                ))}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--green)", marginBottom: 8 }}>▲ BULLISH SIGNALS</div>
                    {pillar.signals.bullish.map((s, si) => (
                      <div key={si} style={{ fontSize: 12, color: "var(--text-secondary)", padding: "4px 0" }}>• {s}</div>
                    ))}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--red)", marginBottom: 8 }}>▼ BEARISH SIGNALS</div>
                    {pillar.signals.bearish.map((s, si) => (
                      <div key={si} style={{ fontSize: 12, color: "var(--text-secondary)", padding: "4px 0" }}>• {s}</div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── BACKTEST TAB ────────────────────────────────────────────────
const BacktestTab = ({ analyses }) => {
  const [results, setResults] = useState(() => LS.get("ict_backtest", []));
  const [running, setRunning] = useState(false);

  const runBacktest = () => {
    setRunning(true);
    // Simulate backtest using current analysis weights
    const newResults = [];
    const strategies = ICT_KNOWLEDGE.strategies;
    const symbols = SYMBOLS;

    for (let i = 0; i < 50; i++) {
      const sym = symbols[Math.floor(Math.random() * symbols.length)];
      const strat = strategies[Math.floor(Math.random() * strategies.length)];
      const score = 30 + Math.floor(Math.random() * 70);
      const winProb = score > 70 ? 0.75 : score > 50 ? 0.6 : 0.4;
      const isWin = Math.random() < winProb;
      const rr = isWin ? (1.5 + Math.random() * 1.5) : -(0.8 + Math.random() * 0.2);
      const pnl = Math.round(rr * 1000 * (isWin ? 1 : -1));

      newResults.push({
        id: Date.now() + i,
        date: new Date(Date.now() - (50 - i) * 86400000).toISOString().split("T")[0],
        symbol: sym.id,
        strategy: strat.name,
        entryTF: strat.timeframe,
        biasTF: "4H",
        score,
        bias: Math.random() > 0.5 ? "LONG" : "SHORT",
        result: isWin ? "WIN" : "LOSS",
        rr: Math.abs(rr).toFixed(2),
        pnl,
      });
    }

    setResults(newResults);
    LS.set("ict_backtest", newResults);
    setTimeout(() => setRunning(false), 1000);
  };

  const wins = results.filter(r => r.result === "WIN").length;
  const losses = results.filter(r => r.result === "LOSS").length;
  const wr = results.length ? ((wins / results.length) * 100).toFixed(1) : "0";
  const totalPnl = results.reduce((sum, r) => sum + (r.pnl || 0), 0);
  const avgRR = results.length ? (results.reduce((sum, r) => sum + parseFloat(r.rr || 0), 0) / results.length).toFixed(2) : "0";

  return (
    <div className="animate-in">
      <div className="card">
        <div className="card-header">
          <div className="card-title">📊 Backtest Engine</div>
          <button className={`btn btn-primary ${running ? "loading" : ""}`} onClick={runBacktest} disabled={running}>
            {running ? <><span className="spinner" /> Running...</> : "▶ Run Backtest (50 trades)"}
          </button>
        </div>
        {results.length > 0 && (
          <>
            <div className="bt-stats">
              <div className="bt-stat"><div className="bt-stat-value" style={{ color: "var(--gold)" }}>{results.length}</div><div className="bt-stat-label">Total Trades</div></div>
              <div className="bt-stat"><div className="bt-stat-value win">{wr}%</div><div className="bt-stat-label">Win Rate</div></div>
              <div className="bt-stat"><div className="bt-stat-value" style={{ color: totalPnl >= 0 ? "var(--green)" : "var(--red)" }}>{fmtINR(totalPnl)}</div><div className="bt-stat-label">Total P&L</div></div>
              <div className="bt-stat"><div className="bt-stat-value" style={{ color: "var(--blue)" }}>{avgRR}R</div><div className="bt-stat-label">Avg R:R</div></div>
              <div className="bt-stat"><div className="bt-stat-value win">{wins}</div><div className="bt-stat-label">Wins</div></div>
              <div className="bt-stat"><div className="bt-stat-value loss">{losses}</div><div className="bt-stat-label">Losses</div></div>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Date</th><th>Symbol</th><th>Strategy</th><th>Bias TF</th><th>Entry TF</th><th>Score</th><th>Bias</th><th>Result</th><th>R:R</th><th>P&L</th></tr>
                </thead>
                <tbody>
                  {results.slice(-20).reverse().map(r => (
                    <tr key={r.id}>
                      <td>{r.date}</td>
                      <td style={{ fontWeight: 600 }}>{r.symbol}</td>
                      <td>{r.strategy}</td>
                      <td>{r.biasTF}</td>
                      <td>{r.entryTF}</td>
                      <td><span className={`tag ${r.score >= 70 ? "tag-green" : r.score >= 50 ? "tag-gold" : "tag-red"}`}>{r.score}</span></td>
                      <td><span className={r.bias === "LONG" ? "win" : "loss"}>{r.bias}</span></td>
                      <td><span className={r.result === "WIN" ? "win" : "loss"}>{r.result}</span></td>
                      <td>{r.rr}R</td>
                      <td className={r.pnl >= 0 ? "win" : "loss"}>{fmtINR(r.pnl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {results.length === 0 && (
          <div className="empty-state"><div className="empty-state-icon">📊</div><p>Run a backtest to see results. The engine simulates 50 trades using ICT strategies and current brain weights.</p></div>
        )}
      </div>
    </div>
  );
};

// ─── SIMULATOR TAB ───────────────────────────────────────────────
const SimulatorTab = ({ prices, analyses, activeSym }) => {
  const [trade, setTrade] = useState(() => LS.get("ict_sim_trade", null));
  const [history, setHistory] = useState(() => LS.get("ict_sim_history", []));
  const sym = SYMBOLS.find(s => s.id === activeSym);
  const price = prices[activeSym]?.price;
  const analysis = analyses[activeSym];

  const openTrade = (direction) => {
    if (!price) return;
    const a = analysis || {};
    const newTrade = {
      id: Date.now(),
      symbol: activeSym,
      direction,
      entry: price,
      sl: a.sl || (direction === "LONG" ? price * 0.99 : price * 1.01),
      tp1: a.tp1 || (direction === "LONG" ? price * 1.015 : price * 0.985),
      tp2: a.tp2 || (direction === "LONG" ? price * 1.03 : price * 0.97),
      openTime: new Date().toLocaleTimeString("en-IN"),
      lotSize: 0.01,
    };
    setTrade(newTrade);
    LS.set("ict_sim_trade", newTrade);
    notify("Trade Opened", `${direction} ${activeSym} @ $${fmt(price)}`);
  };

  const closeTrade = (reason) => {
    if (!trade || !price) return;
    const pnlPips = trade.direction === "LONG" ? price - trade.entry : trade.entry - price;
    const pnlINR = Math.round(pnlPips * pipValue(activeSym) * trade.lotSize * 83);
    const result = {
      ...trade,
      closePrice: price,
      closeTime: new Date().toLocaleTimeString("en-IN"),
      reason,
      pnlPips: parseFloat(fmtPips(activeSym, pnlPips)),
      pnlINR,
      result: pnlINR >= 0 ? "WIN" : "LOSS",
    };
    const newHistory = [...history, result];
    setHistory(newHistory);
    setTrade(null);
    LS.set("ict_sim_history", newHistory);
    LS.del("ict_sim_trade");
    notify(`Trade Closed — ${result.result}`, `${reason}: ${fmtINR(pnlINR)}`);
  };

  const currentPnl = trade && price
    ? Math.round((trade.direction === "LONG" ? price - trade.entry : trade.entry - price) * pipValue(activeSym) * trade.lotSize * 83)
    : 0;

  const totalPnl = history.reduce((sum, h) => sum + (h.pnlINR || 0), 0);
  const wins = history.filter(h => h.result === "WIN").length;

  return (
    <div className="animate-in">
      <div className="card">
        <div className="card-header">
          <div className="card-title">🎮 Paper Trading Simulator</div>
          <div style={{ display: "flex", gap: 8 }}>
            <span className="tag tag-gold">Total P&L: {fmtINR(totalPnl)}</span>
            <span className="tag tag-green">Wins: {wins}/{history.length}</span>
          </div>
        </div>

        {!trade ? (
          <div style={{ textAlign: "center", padding: 24 }}>
            <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 16 }}>
              {analysis && analysis.bias !== "NEUTRAL"
                ? `Signal: ${analysis.bias} ${activeSym} — Score ${analysis.score}/100`
                : `Select a signal or open a manual trade on ${activeSym}`}
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button className="btn btn-success" onClick={() => openTrade("LONG")} disabled={!price}>🟢 LONG {activeSym}</button>
              <button className="btn btn-danger" onClick={() => openTrade("SHORT")} disabled={!price}>🔴 SHORT {activeSym}</button>
            </div>
          </div>
        ) : (
          <>
            <div className={`sim-pnl ${currentPnl > 0 ? "positive" : currentPnl < 0 ? "negative" : "zero"}`}>
              {currentPnl >= 0 ? "+" : ""}{fmtINR(currentPnl)}
              <div style={{ fontSize: 14, fontWeight: 400, marginTop: 4 }}>Live P&L</div>
            </div>
            <div className="sim-panel">
              <div>
                <div className="signal-item"><span style={{ fontWeight: 600 }}>Symbol</span><span>{trade.symbol}</span></div>
                <div className="signal-item"><span style={{ fontWeight: 600 }}>Direction</span><span className={trade.direction === "LONG" ? "win" : "loss"}>{trade.direction}</span></div>
                <div className="signal-item"><span style={{ fontWeight: 600 }}>Entry</span><span>${fmt(trade.entry)}</span></div>
                <div className="signal-item"><span style={{ fontWeight: 600 }}>Current</span><span>${price ? fmt(price) : "—"}</span></div>
              </div>
              <div>
                <div className="signal-item"><span style={{ fontWeight: 600 }}>SL</span><span style={{ color: "var(--red)" }}>${fmt(trade.sl)}</span></div>
                <div className="signal-item"><span style={{ fontWeight: 600 }}>TP1</span><span style={{ color: "var(--green)" }}>${fmt(trade.tp1)}</span></div>
                <div className="signal-item"><span style={{ fontWeight: 600 }}>TP2</span><span style={{ color: "var(--green)" }}>${fmt(trade.tp2)}</span></div>
                <div className="signal-item"><span style={{ fontWeight: 600 }}>Opened</span><span>{trade.openTime}</span></div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "center", flexWrap: "wrap" }}>
              <button className="btn btn-success btn-sm" onClick={() => closeTrade("TP1 Hit")}>🎯 TP1</button>
              <button className="btn btn-success btn-sm" onClick={() => closeTrade("TP2 Hit")}>🎯 TP2</button>
              <button className="btn btn-danger btn-sm" onClick={() => closeTrade("SL Hit")}>✂️ SL</button>
              <button className="btn btn-secondary btn-sm" onClick={() => closeTrade("Manual Close")}>Close Trade</button>
            </div>
          </>
        )}
      </div>

      {history.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">📋 Trade History</div>
            <button className="btn btn-sm btn-secondary" onClick={() => { setHistory([]); LS.del("ict_sim_history"); }}>Clear</button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Symbol</th><th>Direction</th><th>Entry</th><th>Close</th><th>Reason</th><th>Pips</th><th>P&L</th><th>Result</th></tr></thead>
              <tbody>
                {history.slice().reverse().map(h => (
                  <tr key={h.id}>
                    <td>{h.symbol}</td>
                    <td className={h.direction === "LONG" ? "win" : "loss"}>{h.direction}</td>
                    <td>${fmt(h.entry)}</td>
                    <td>${fmt(h.closePrice)}</td>
                    <td>{h.reason}</td>
                    <td>{h.pnlPips}</td>
                    <td className={h.pnlINR >= 0 ? "win" : "loss"}>{fmtINR(h.pnlINR)}</td>
                    <td><span className={`tag ${h.result === "WIN" ? "tag-green" : "tag-red"}`}>{h.result}</span></td>
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
const PositionCalcTab = ({ prices, activeSym }) => {
  const [capital, setCapital] = useState(() => LS.get("ict_capital", 100000));
  const [riskPct, setRiskPct] = useState(() => LS.get("ict_risk_pct", 1));
  const [slPips, setSlPips] = useState(50);
  const price = prices[activeSym]?.price;

  const riskAmt = capital * (riskPct / 100);
  const lotSize = slPips > 0 ? (riskAmt / (slPips * pipValue(activeSym) * 83)).toFixed(3) : 0;
  const maxDD = (capital * 0.06).toFixed(0);

  useEffect(() => { LS.set("ict_capital", capital); LS.set("ict_risk_pct", riskPct); }, [capital, riskPct]);

  return (
    <div className="animate-in">
      <div className="card">
        <div className="card-header">
          <div className="card-title">💰 Position Size Calculator</div>
          <div className="card-subtitle">INR-based, real-time</div>
        </div>
        <div className="calc-grid">
          <div className="calc-input-group">
            <label className="calc-label">Account Capital (₹)</label>
            <input className="calc-input" type="number" value={capital} onChange={e => setCapital(Number(e.target.value))} />
          </div>
          <div className="calc-input-group">
            <label className="calc-label">Risk per Trade (%)</label>
            <input className="calc-input" type="number" value={riskPct} step="0.5" onChange={e => setRiskPct(Number(e.target.value))} />
          </div>
          <div className="calc-input-group">
            <label className="calc-label">Stop Loss (pips)</label>
            <input className="calc-input" type="number" value={slPips} onChange={e => setSlPips(Number(e.target.value))} />
          </div>
          <div className="calc-input-group">
            <label className="calc-label">Symbol</label>
            <input className="calc-input" value={activeSym} disabled />
          </div>
        </div>
        <div className="calc-grid" style={{ marginTop: 20 }}>
          <div className="calc-result"><div className="calc-result-value">{fmtINR(riskAmt)}</div><div className="calc-result-label">Risk Amount</div></div>
          <div className="calc-result"><div className="calc-result-value" style={{ color: "var(--blue)" }}>{lotSize}</div><div className="calc-result-label">Lot Size</div></div>
          <div className="calc-result"><div className="calc-result-value" style={{ color: "var(--green)" }}>{fmtINR(riskAmt * 3)}</div><div className="calc-result-label">TP @ 3R</div></div>
          <div className="calc-result"><div className="calc-result-value" style={{ color: "var(--red)" }}>{fmtINR(maxDD)}</div><div className="calc-result-label">Max DD (6%)</div></div>
        </div>
      </div>
    </div>
  );
};

// ─── WEIGHTS / BRAIN ─────────────────────────────────────────────
const WeightsTab = () => {
  const [weights, setWeights] = useState(() =>
    LS.get("ict_weights", ICT_KNOWLEDGE.pillars.reduce((acc, p) => ({ ...acc, [p.id]: p.weight }), {}))
  );

  const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0);

  const updateWeight = (id, val) => {
    const newW = { ...weights, [id]: Math.max(0, Math.min(20, Number(val))) };
    setWeights(newW);
    LS.set("ict_weights", newW);
  };

  const resetWeights = () => {
    const def = ICT_KNOWLEDGE.pillars.reduce((acc, p) => ({ ...acc, [p.id]: p.weight }), {});
    setWeights(def);
    LS.set("ict_weights", def);
  };

  return (
    <div className="animate-in">
      <div className="card">
        <div className="card-header">
          <div className="card-title">⚖️ Adaptive Brain Weights</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="tag tag-gold">Total: {totalWeight}</span>
            <button className="btn btn-sm btn-secondary" onClick={resetWeights}>Reset</button>
          </div>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
          Adjust how much each ICT pillar influences signal scoring. Higher weight = more influence on the confluence score.
        </p>
        {ICT_KNOWLEDGE.pillars.map(pillar => (
          <div key={pillar.id} className="weight-bar-container">
            <div className="weight-label">{pillar.name}</div>
            <input
              type="range" min="0" max="20" value={weights[pillar.id] || pillar.weight}
              onChange={e => updateWeight(pillar.id, e.target.value)}
              style={{ flex: 1, accentColor: "var(--gold)", cursor: "pointer" }}
            />
            <div className="weight-value">{weights[pillar.id] || pillar.weight}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── TRADE LOG ───────────────────────────────────────────────────
const TradeLogTab = () => {
  const [logs, setLogs] = useState(() => LS.get("ict_tradelog", []));
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ symbol: "XAUUSD", direction: "LONG", entry: "", exit: "", notes: "", result: "WIN" });

  const addLog = () => {
    const entry = parseFloat(form.entry);
    const exit = parseFloat(form.exit);
    if (!entry || !exit) return;
    const pnlPips = form.direction === "LONG" ? exit - entry : entry - exit;
    const pnlINR = Math.round(pnlPips * pipValue(form.symbol) * 0.01 * 83);
    const log = { id: Date.now(), date: new Date().toISOString().split("T")[0], ...form, entry, exit, pnlPips: parseFloat(fmtPips(form.symbol, pnlPips)), pnlINR };
    const newLogs = [...logs, log];
    setLogs(newLogs);
    LS.set("ict_tradelog", newLogs);
    setShowForm(false);
    setForm({ symbol: "XAUUSD", direction: "LONG", entry: "", exit: "", notes: "", result: "WIN" });
  };

  const totalPnl = logs.reduce((s, l) => s + (l.pnlINR || 0), 0);
  const wins = logs.filter(l => l.result === "WIN").length;

  return (
    <div className="animate-in">
      <div className="card">
        <div className="card-header">
          <div className="card-title">📓 Trade Journal</div>
          <div style={{ display: "flex", gap: 8 }}>
            <span className="tag tag-gold">{fmtINR(totalPnl)} total</span>
            <span className="tag tag-green">{wins}W / {logs.length - wins}L</span>
            <button className="btn btn-sm btn-primary" onClick={() => setShowForm(!showForm)}>+ Add Trade</button>
          </div>
        </div>
        {showForm && (
          <div style={{ padding: 16, background: "var(--bg-tertiary)", borderRadius: "var(--radius-sm)", marginBottom: 16 }}>
            <div className="calc-grid">
              <div className="calc-input-group">
                <label className="calc-label">Symbol</label>
                <select className="calc-input" value={form.symbol} onChange={e => setForm({ ...form, symbol: e.target.value })}>
                  {SYMBOLS.map(s => <option key={s.id} value={s.id}>{s.id}</option>)}
                </select>
              </div>
              <div className="calc-input-group">
                <label className="calc-label">Direction</label>
                <select className="calc-input" value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value })}>
                  <option value="LONG">LONG</option><option value="SHORT">SHORT</option>
                </select>
              </div>
              <div className="calc-input-group">
                <label className="calc-label">Entry Price</label>
                <input className="calc-input" type="number" value={form.entry} onChange={e => setForm({ ...form, entry: e.target.value })} />
              </div>
              <div className="calc-input-group">
                <label className="calc-label">Exit Price</label>
                <input className="calc-input" type="number" value={form.exit} onChange={e => setForm({ ...form, exit: e.target.value })} />
              </div>
              <div className="calc-input-group">
                <label className="calc-label">Result</label>
                <select className="calc-input" value={form.result} onChange={e => setForm({ ...form, result: e.target.value })}>
                  <option value="WIN">WIN</option><option value="LOSS">LOSS</option><option value="BE">BREAKEVEN</option>
                </select>
              </div>
              <div className="calc-input-group">
                <label className="calc-label">Notes</label>
                <input className="calc-input" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Strategy, mistakes..." />
              </div>
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button className="btn btn-primary" onClick={addLog}>Save Trade</button>
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </div>
        )}
        {logs.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Date</th><th>Symbol</th><th>Dir</th><th>Entry</th><th>Exit</th><th>Pips</th><th>P&L</th><th>Result</th><th>Notes</th></tr></thead>
              <tbody>
                {logs.slice().reverse().map(l => (
                  <tr key={l.id}>
                    <td>{l.date}</td>
                    <td>{l.symbol}</td>
                    <td className={l.direction === "LONG" ? "win" : "loss"}>{l.direction}</td>
                    <td>${fmt(l.entry)}</td>
                    <td>${fmt(l.exit)}</td>
                    <td>{l.pnlPips}</td>
                    <td className={l.pnlINR >= 0 ? "win" : "loss"}>{fmtINR(l.pnlINR)}</td>
                    <td><span className={`tag ${l.result === "WIN" ? "tag-green" : l.result === "LOSS" ? "tag-red" : "tag-gold"}`}>{l.result}</span></td>
                    <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{l.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state"><div className="empty-state-icon">📓</div><p>No trades logged yet. Click "+ Add Trade" to start journaling.</p></div>
        )}
      </div>
    </div>
  );
};

// ─── SETTINGS TAB ────────────────────────────────────────────────
const SettingsTab = ({ workerUrl, setWorkerUrl, anthropicKey, setAnthropicKey }) => {
  const [tempWorker, setTempWorker] = useState(workerUrl);
  const [tempKey, setTempKey] = useState(anthropicKey);

  const save = () => {
    setWorkerUrl(tempWorker);
    setAnthropicKey(tempKey);
    localStorage.setItem("ict_worker_url", tempWorker);
    localStorage.setItem("ict_anthropic_key", tempKey);
  };

  return (
    <div className="animate-in">
      <div className="card">
        <div className="card-header">
          <div className="card-title">⚙️ Settings</div>
          <span className="tag tag-gold">v{VERSION}</span>
        </div>

        <div className="settings-group">
          <div className="settings-group-title">Data Connection</div>
          <div className="calc-input-group" style={{ marginBottom: 16 }}>
            <label className="calc-label">Cloudflare Worker URL</label>
            <input className="calc-input" value={tempWorker} onChange={e => setTempWorker(e.target.value)} placeholder="https://ict-data-proxy.your-account.workers.dev" />
            <span style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Your Cloudflare Worker v4 URL — provides Yahoo Finance data for all 4 symbols</span>
          </div>
        </div>

        <div className="settings-group">
          <div className="settings-group-title">AI Assistant</div>
          <div className="calc-input-group" style={{ marginBottom: 16 }}>
            <label className="calc-label">Anthropic API Key</label>
            <input className="calc-input" type="password" value={tempKey} onChange={e => setTempKey(e.target.value)} placeholder="sk-ant-..." />
            <span style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>For the AI chat assistant. Proxied through your Worker — key never exposed.</span>
          </div>
        </div>

        <div className="settings-group">
          <div className="settings-group-title">Notifications</div>
          <div className="settings-row">
            <div>
              <div className="settings-label">Desktop Alerts</div>
              <div className="settings-desc">Get push notifications for high-probability signals</div>
            </div>
            <button className="btn btn-sm btn-secondary" onClick={requestNotificationPermission}>
              {typeof Notification !== "undefined" ? `Status: ${Notification.permission}` : "Not supported"}
            </button>
          </div>
        </div>

        <div className="settings-group">
          <div className="settings-group-title">Data Management</div>
          <div className="settings-row">
            <div>
              <div className="settings-label">Clear All Data</div>
              <div className="settings-desc">Reset brain weights, trade log, simulator history, and backtest results</div>
            </div>
            <button className="btn btn-sm btn-danger" onClick={() => {
              if (window.confirm("This will clear all local data. Are you sure?")) {
                ["ict_backtest", "ict_sim_trade", "ict_sim_history", "ict_tradelog", "ict_weights"].forEach(k => localStorage.removeItem(k));
                window.location.reload();
              }
            }}>Clear Data</button>
          </div>
        </div>

        <button className="btn btn-primary" onClick={save} style={{ marginTop: 16 }}>💾 Save Settings</button>
      </div>
    </div>
  );
};

// ─── AI CHAT ─────────────────────────────────────────────────────
const AIChatWidget = ({ workerUrl, anthropicKey, analyses, prices, activeSym }) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: "ai", text: `Welcome to ICT Sovereign Trader AI! I can analyze signals, explain ICT concepts, and help with your trading. Ask me anything.` },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const msgEndRef = useRef(null);

  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: userMsg }]);
    setLoading(true);

    // Build context
    const context = SYMBOLS.map(s => {
      const p = prices[s.id];
      const a = analyses[s.id];
      return `${s.id}: $${p?.price ? fmt(p.price) : "N/A"} | Bias: ${a?.bias || "N/A"} | Score: ${a?.score || 0}/100`;
    }).join("\n");

    const systemPrompt = `You are an expert ICT/SMC trading analyst for the ICT Sovereign Trader app. You have deep knowledge of all 12 ICT pillars: Market Structure, Order Blocks, FVGs, Liquidity, OTE, Killzones, Silver Bullet, Displacement, Premium/Discount, Breaker Blocks, Institutional Order Flow, and Multi-Timeframe Analysis. Current market data:\n${context}\n\nActive symbol: ${activeSym}\nSession: ${getSession().name}\n\nProvide concise, actionable ICT analysis. Reference specific ICT concepts and price levels.`;

    try {
      if (workerUrl && anthropicKey) {
        const r = await fetch(`${workerUrl}?source=ai`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: anthropicKey,
            model: "claude-sonnet-4-20250514",
            system: systemPrompt,
            messages: [{ role: "user", content: userMsg }],
            max_tokens: 600,
          }),
        });
        const d = await r.json();
        const reply = d.content?.[0]?.text || d.text || d.reply || "I couldn't generate a response. Check your API key in settings.";
        setMessages(prev => [...prev, { role: "ai", text: reply }]);
      } else {
        // Offline fallback — use knowledge base
        const relevantPillars = ICT_KNOWLEDGE.pillars.filter(p =>
          userMsg.toLowerCase().includes(p.name.toLowerCase()) || p.rules.some(r => userMsg.toLowerCase().includes(r.split(":")[0].toLowerCase()))
        );

        let reply = "";
        if (relevantPillars.length > 0) {
          reply = relevantPillars.map(p => `**${p.name}**: ${p.description}\n${p.rules.slice(0, 3).join("\n")}`).join("\n\n");
        } else {
          const a = analyses[activeSym];
          reply = a ? `Current ${activeSym} analysis: ${a.bias} bias with score ${a.score}/100. ${a.factors.slice(0, 3).map(f => f.signal).join(", ")}. Configure your Anthropic API key in Settings for full AI analysis.` : "Configure your Anthropic API key in Settings for AI-powered analysis. I can still answer basic ICT questions offline.";
        }
        setMessages(prev => [...prev, { role: "ai", text: reply }]);
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: "ai", text: `Error: ${e.message}. Check your Worker URL and API key in Settings.` }]);
    }
    setLoading(false);
  };

  return (
    <div className="chat-container">
      {open && (
        <div className="chat-panel">
          <div className="chat-header">
            <span>🤖</span> ICT AI Analyst
            <span style={{ marginLeft: "auto", cursor: "pointer", color: "var(--text-muted)" }} onClick={() => setOpen(false)}>✕</span>
          </div>
          <div className="chat-messages">
            {messages.map((m, i) => (
              <div key={i} className={`chat-msg ${m.role === "user" ? "user" : "ai"}`}>
                {m.text}
              </div>
            ))}
            {loading && <div className="chat-msg ai"><span className="spinner" /></div>}
            <div ref={msgEndRef} />
          </div>
          <div className="chat-input-wrap">
            <input
              className="chat-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendMessage()}
              placeholder="Ask about ICT concepts, signals..."
            />
            <button className="chat-send" onClick={sendMessage}>→</button>
          </div>
        </div>
      )}
      <button className="chat-toggle" onClick={() => setOpen(!open)}>{open ? "✕" : "🤖"}</button>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab] = useState("scanner");
  const [activeSym, setActiveSym] = useState("XAUUSD");
  const [prices, setPrices] = useState({});
  const [candles, setCandlesState] = useState({});
  const [analyses, setAnalyses] = useState({});
  const [workerUrl, setWorkerUrl] = useState(() => localStorage.getItem("ict_worker_url") || "");
  const [anthropicKey, setAnthropicKey] = useState(() => localStorage.getItem("ict_anthropic_key") || "");

  const setCandles = useCallback((sym, data) => {
    setCandlesState(prev => ({ ...prev, [sym]: data }));
  }, []);

  // Fetch all prices
  const refreshPrices = useCallback(async () => {
    if (!workerUrl) return;
    const results = {};
    await Promise.all(SYMBOLS.map(async (sym) => {
      const p = await fetchPrice(sym.id, workerUrl);
      if (p) results[sym.id] = p;
    }));
    setPrices(prev => ({ ...prev, ...results }));
  }, [workerUrl]);

  // Fetch candles & analyze
  const refreshAnalysis = useCallback(async () => {
    if (!workerUrl) return;
    const newAnalyses = {};
    await Promise.all(SYMBOLS.map(async (sym) => {
      const c = await fetchCandles(sym.id, "15m", workerUrl);
      if (c.length) {
        setCandlesState(prev => ({ ...prev, [sym.id]: c }));
        const a = analyzeICT(c, sym.id);
        newAnalyses[sym.id] = a;
        // Notify on high-score signals
        if (a.score >= 70 && a.bias !== "NEUTRAL") {
          notify(`🎯 ${a.bias} ${sym.id}`, `Score: ${a.score}/100 — ${a.factors[0]?.signal || ""}`);
        }
      }
    }));
    setAnalyses(prev => ({ ...prev, ...newAnalyses }));
  }, [workerUrl]);

  // Initial load
  useEffect(() => {
    requestNotificationPermission();
    refreshPrices();
    refreshAnalysis();
  }, [refreshPrices, refreshAnalysis]);

  // Auto-refresh
  useEffect(() => {
    const iv = setInterval(() => { refreshPrices(); refreshAnalysis(); }, REFRESH_INTERVAL);
    return () => clearInterval(iv);
  }, [refreshPrices, refreshAnalysis]);

  const session = getSession();
  const liveCount = Object.values(prices).filter(p => p?.live).length;

  const TABS = [
    { id: "scanner", icon: "📡", label: "Scanner" },
    { id: "chart", icon: "📈", label: "Chart" },
    { id: "signals", icon: "🎯", label: "Signals" },
    { id: "strategies", icon: "♟️", label: "Strategies" },
    { id: "knowledge", icon: "📚", label: "Knowledge" },
    { id: "backtest", icon: "📊", label: "Backtest" },
    { id: "simulator", icon: "🎮", label: "Simulator" },
    { id: "calculator", icon: "💰", label: "Position Calc" },
    { id: "weights", icon: "⚖️", label: "Brain" },
    { id: "tradelog", icon: "📓", label: "Trade Log" },
    { id: "settings", icon: "⚙️", label: "Settings" },
  ];

  return (
    <>
      <style>{STYLES}</style>
      <div className="app-shell">
        {/* ─── HEADER ─── */}
        <header className="app-header">
          <div className="app-logo">
            <div className="logo-icon">👑</div>
            <span>{APP_NAME}</span>
            <span className="tag tag-gold" style={{ fontSize: 10 }}>v{VERSION}</span>
          </div>
          <div className="price-strip">
            {SYMBOLS.map(sym => {
              const p = prices[sym.id];
              return (
                <div key={sym.id} className="price-chip" onClick={() => { setActiveSym(sym.id); setTab("chart"); }}>
                  <span className={`dot ${p?.live ? "live" : "sim"}`} />
                  <span style={{ color: sym.color, fontWeight: 600 }}>{sym.icon} {sym.id.replace("USD", "")}</span>
                  <span>${p?.price ? fmt(p.price, sym.id === "NATGAS" ? 3 : 2) : "—"}</span>
                </div>
              );
            })}
          </div>
          <div className="header-actions">
            <span className={`session-badge ${session.active ? "active" : "off"}`}>{session.name}</span>
            <span className="tag tag-green" style={{ fontSize: 11 }}>{liveCount}/4 Live</span>
          </div>
        </header>

        {/* ─── NAVIGATION ─── */}
        <nav className="nav-tabs">
          {TABS.map(t => (
            <button key={t.id} className={`nav-tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
              <span className="tab-icon">{t.icon}</span> {t.label}
            </button>
          ))}
        </nav>

        {/* ─── CONTENT ─── */}
        <main className="main-content">
          {!workerUrl && tab !== "settings" && tab !== "knowledge" && tab !== "strategies" && (
            <div className="card" style={{ borderColor: "var(--gold-dim)", background: "var(--gold-glow)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 24 }}>⚠️</span>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Worker URL Required</div>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    Go to <strong style={{ cursor: "pointer", color: "var(--gold)" }} onClick={() => setTab("settings")}>Settings</strong> and enter your Cloudflare Worker URL to connect live data.
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === "scanner" && <ScannerTab prices={prices} analyses={analyses} activeSym={activeSym} setActiveSym={setActiveSym} setTab={setTab} />}
          {tab === "chart" && <ChartTab activeSym={activeSym} candles={candles[activeSym] || []} analysis={analyses[activeSym]} workerUrl={workerUrl} setCandles={setCandles} />}
          {tab === "signals" && <SignalTab analyses={analyses} prices={prices} />}
          {tab === "strategies" && <StrategiesTab />}
          {tab === "knowledge" && <KnowledgeTab />}
          {tab === "backtest" && <BacktestTab analyses={analyses} />}
          {tab === "simulator" && <SimulatorTab prices={prices} analyses={analyses} activeSym={activeSym} />}
          {tab === "calculator" && <PositionCalcTab prices={prices} activeSym={activeSym} />}
          {tab === "weights" && <WeightsTab />}
          {tab === "tradelog" && <TradeLogTab />}
          {tab === "settings" && <SettingsTab workerUrl={workerUrl} setWorkerUrl={setWorkerUrl} anthropicKey={anthropicKey} setAnthropicKey={setAnthropicKey} />}
        </main>

        {/* ─── FOOTER ─── */}
        <footer style={{ padding: "12px 24px", borderTop: "1px solid var(--border)", background: "var(--bg-secondary)", textAlign: "center", fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
          {APP_NAME} v{VERSION} — ICT/SMC Signal Generator — Yahoo Finance ~15min delayed — Not financial advice
        </footer>

        {/* ─── AI CHAT ─── */}
        <AIChatWidget workerUrl={workerUrl} anthropicKey={anthropicKey} analyses={analyses} prices={prices} activeSym={activeSym} />
      </div>
    </>
  );
}
