#!/usr/bin/env python3
"""Copy the trading bot's weekly summary into the site, keeping ONLY normalized numbers.

    python3 scripts/sync_trading.py            # $TRADING_WEEKLY_JSON (default: data/weekly.json) -> src/data/agentic_trading.json
    python3 scripts/sync_trading.py --src other.json
Then run `python3 build.py`.

Allowlist, not blocklist: only the fields below are ever written. Index levels (start = 100),
percent returns, tickers, sides, instrument types, day-level trade dates, one-line reasoning and
lessons. Anything else in the source (dollar amounts, cash, quantities, prices, account numbers,
income, tax) is dropped. Free text is also scrubbed of dollar figures, long digit runs, emails, and
phone numbers. The script is tolerant of the schema: common alternate key names are accepted, and
a missing index or return is derived from the other when possible (see README, "Agentic trading data").
If the source file doesn't exist yet, the page shows its "first results" empty state.
"""
import argparse, json, os, re, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(os.environ.get("TRADING_WEEKLY_JSON", str(ROOT / "data/weekly.json")))  # the bot's normalized weekly summary
OUT = ROOT / "src/data/agentic_trading.json"
FIRST_RESULTS = "2026-10-23"   # first Friday summary; shown in the empty state
SERIES = ("belfort", "buffett", "spy", "savings")
ALIAS = {   # series name aliases -> canonical
    "belfort": "belfort", "jordan": "belfort", "jordan_belfort": "belfort", "wolf": "belfort", "aggressive": "belfort",
    "buffett": "buffett", "warren": "buffett", "warren_buffett": "buffett", "sane": "buffett", "conservative": "buffett",
    "spy": "spy", "sp500": "spy", "s&p500": "spy", "s&p_500": "spy", "benchmark": "spy",
    "savings": "savings", "hysa": "savings", "savings_rate": "savings", "high_yield_savings": "savings", "cash_rate": "savings",
}
TYPES = {"stock": "stock", "equity": "stock", "share": "stock", "shares": "stock", "etf": "etf", "fund": "etf",
         "call": "call", "calls": "call", "call_option": "call", "put": "put", "puts": "put", "put_option": "put"}
SIDES = {"buy": "buy", "bought": "buy", "buy_to_open": "buy", "bto": "buy", "sell": "sell", "sold": "sell",
         "sell_to_close": "sell", "stc": "sell", "expired": "expired", "expire": "expired", "close": "sell"}
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}")

def norm_key(k): return re.sub(r"[\s\-]+", "_", str(k).strip().lower())
def pick(d, *names):
    if not isinstance(d, dict): return None
    nd = {norm_key(k): v for k, v in d.items()}
    for n in names:
        if n in nd and nd[n] not in (None, ""): return nd[n]
    return None
def num(v):
    if isinstance(v, bool) or v is None: return None
    if isinstance(v, (int, float)): return float(v)
    s = str(v).strip().replace("%", "").replace(",", "")
    if "$" in s: return None   # a dollar figure is never a normalized number
    try: return float(s)
    except ValueError: return None
def day(v):
    s = str(v or "").strip()
    return s[:10] if DATE.match(s) else None

SCRUB = [
    (re.compile(r"(?:US)?\$\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:[kKmMbB]|[mb]illion|thousand)\b)?"), "[amount]"),
    (re.compile(r"\b\d[\d,]*(?:\.\d+)?\s?(?:dollars|bucks|usd)\b", re.I), "[amount]"),
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+"), "[redacted]"),
    (re.compile(r"\(?\b\d{3}\)?[-. ]\d{3}[-. ]\d{4}\b"), "[redacted]"),
    (re.compile(r"\b\d{6,}\b"), "[redacted]"),            # account-number-like digit runs
    (re.compile(r"\b(?:acct|account)\s*#?\s*[\w-]*\d[\w-]*", re.I), "[redacted]"),
]
def clean_text(v, limit=240):
    s = " ".join(str(v or "").split())
    for rx, rep in SCRUB: s = rx.sub(rep, s)
    return s[:limit].rstrip()

def series_map(obj):
    """{belfort: x, buffett: y, ...} from a dict keyed by any alias (values may be numbers or {index/pct} dicts)."""
    out = {}
    if isinstance(obj, dict):
        for k, v in obj.items():
            c = ALIAS.get(norm_key(k))
            if c: out[c] = v
    return out

def week_rows(src):
    weeks = pick(src, "weeks", "history", "series", "weekly")
    if isinstance(weeks, dict): weeks = [dict(v, week=k) if isinstance(v, dict) else v for k, v in weeks.items()]
    if not isinstance(weeks, list): weeks = []
    rows = []
    for i, w in enumerate(weeks):
        if not isinstance(w, dict): continue
        n = num(pick(w, "week", "week_number", "n", "number")); n = int(n) if n else i + 1
        idx = series_map(pick(w, "index", "indexes", "indices", "levels") or {})
        wk = series_map(pick(w, "weekly_pct", "week_pct", "weekly_return_pct", "weekly_return", "weekly", "return_week") or {})
        cum = series_map(pick(w, "cum_pct", "cumulative_pct", "cumulative_return_pct", "cumulative_return", "cumulative", "return_total") or {})
        for name, v in series_map(w).items():   # per-series objects: {"belfort": {"index": .., "weekly_pct": ..}}
            if isinstance(v, dict):
                idx.setdefault(name, pick(v, "index", "level", "value_index"))
                wk.setdefault(name, pick(v, "weekly_pct", "week_pct", "weekly_return_pct", "weekly"))
                cum.setdefault(name, pick(v, "cum_pct", "cumulative_pct", "cumulative_return_pct", "cumulative"))
            elif num(v) is not None and name not in idx:
                idx[name] = v
        lessons = pick(w, "lessons", "lesson", "notes", "takeaways")
        if isinstance(lessons, str): lessons = [lessons]
        if isinstance(lessons, dict):   # {"belfort": [...], "buffett": [...]} or {"belfort": "..."}
            flat = []
            for k, v in lessons.items():
                c = ALIAS.get(norm_key(k))
                for t in (v if isinstance(v, list) else [v]):
                    flat.append({"mode": c if c in ("belfort", "buffett") else None, "text": t})
            lessons = flat
        ls = []
        for t in lessons or []:
            m = None
            if isinstance(t, dict): m = ALIAS.get(norm_key(t.get("mode", "")), None); t = pick(t, "text", "lesson", "note")
            t = clean_text(t)
            if t: ls.append({"mode": m if m in ("belfort", "buffett") else None, "text": t})
        rows.append({"week": n, "start": day(pick(w, "start", "week_start", "from")), "end": day(pick(w, "end", "week_end", "as_of", "date", "to")),
                     "idx": idx, "wk": wk, "cum": cum, "lessons": ls})
    rows.sort(key=lambda r: r["week"])
    out, prev = [], {}
    for r in rows:
        S = {}
        for s in SERIES:
            i, c, w = num(r["idx"].get(s)), num(r["cum"].get(s)), num(r["wk"].get(s))
            if i is None and c is not None: i = 100 * (1 + c / 100)
            if i is None and w is not None and s in prev: i = prev[s] * (1 + w / 100)
            if i is None: continue
            if c is None: c = i - 100
            if w is None: w = (i / prev[s] - 1) * 100 if s in prev else c
            S[s] = {"index": round(i, 3), "weekly_pct": round(w, 3), "cum_pct": round(c, 3)}
            prev[s] = i
        out.append({"week": r["week"], "start": r["start"], "end": r["end"], "series": S, "lessons": r["lessons"]})
    return out

def trade_rows(src, weeks):
    trades = pick(src, "trades", "trade_log", "log", "orders")
    if not isinstance(trades, list):   # trades nested inside each week
        trades = [t for w in (pick(src, "weeks", "history") or []) if isinstance(w, dict) for t in (pick(w, "trades") or [])]
    out = []
    for t in trades or []:
        if not isinstance(t, dict): continue
        mode = ALIAS.get(norm_key(pick(t, "mode", "sleeve", "bot", "strategy") or ""))
        tick = re.sub(r"[^A-Z0-9.\-]", "", str(pick(t, "ticker", "symbol", "underlying") or "").upper())[:8]
        d = day(pick(t, "date", "trade_date", "time", "timestamp", "filled_at"))
        if mode not in ("belfort", "buffett") or not tick or not d: continue
        typ = TYPES.get(norm_key(pick(t, "type", "instrument", "asset_type", "kind", "security_type") or ""), "")
        if not typ:
            ot = norm_key(pick(t, "option_type", "right") or "")
            typ = TYPES.get(ot, "stock")
        side = SIDES.get(norm_key(pick(t, "side", "action", "direction") or ""), "")
        res = num(pick(t, "result_pct", "return_pct", "pct", "pct_result", "result", "gain_pct", "pnl_pct"))
        wk = num(pick(t, "week"))
        if wk is None:
            wk = next((w["week"] for w in weeks if w["start"] and w["end"] and w["start"] <= d <= w["end"]), None)
            if wk is None: wk = next((w["week"] for w in weeks if w["end"] and d <= w["end"]), None)
        out.append({"date": d, "week": int(wk) if wk else None, "mode": mode, "ticker": tick, "side": side or None, "type": typ,
                    "result_pct": round(res, 2) if res is not None else None,
                    "status": (clean_text(pick(t, "status", "state"), 20).lower() or None),
                    "reason": clean_text(pick(t, "reason", "reasoning", "why", "rationale", "thesis", "note"))})
    out.sort(key=lambda t: (t["date"], t["mode"], t["ticker"]))
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=str(SRC))
    ap.add_argument("--out", default=str(OUT))
    a = ap.parse_args()
    src, out = Path(a.src), Path(a.out)
    base = {"schema": 1, "first_results": FIRST_RESULTS, "synced": time.strftime("%Y-%m-%d"),
            "status": "pending", "updated": None, "weeks": [], "trades": []}
    if not src.exists():
        if out.exists() and json.loads(out.read_text()).get("status") == "live":
            print(f"{src} not found; keeping the existing synced data in {out}"); return
        out.write_text(json.dumps(base, indent=1) + "\n")
        print(f"{src} not found yet; wrote the empty 'first results' state to {out}"); return
    try:
        raw = json.loads(src.read_text())
    except Exception as e:
        raise SystemExit(f"couldn't read {src}: {e}")
    weeks = week_rows(raw)
    trades = trade_rows(raw, weeks)
    upd = day(pick(raw, "updated", "as_of", "generated", "date")) or (weeks[-1]["end"] if weeks else None)
    base.update({"status": "live" if weeks else "pending", "updated": upd, "weeks": weeks, "trades": trades})
    out.write_text(json.dumps(base, indent=1) + "\n")
    print(f"synced {src} -> {out}: {len(weeks)} weeks, {len(trades)} trades, status {base['status']}")

if __name__ == "__main__":
    main()
