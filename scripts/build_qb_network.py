#!/usr/bin/env python3
"""Build src/data/qb_network.json from nflverse play-by-play (regular season).

Every completed pass is counted for its passer -> receiver pair (completions and
receiving yards). The page builds a QB's network from this file at view time:
the QB in the center, everyone he completed a pass to, and every OTHER passer
who completed a pass to those same receivers.

Usage (standard library only, run weekly to refresh):
    python3 scripts/build_qb_network.py              # 2026 season
    python3 scripts/build_qb_network.py --season 2026 --cache /tmp/nflverse
Then run `python3 build.py` to copy it into public/.

It also aggregates every targeted pass attempt (completions, incompletions and
interceptions) by pass_location (left/middle/right) and air_yards band into
"heat" for the "where the passes go" map. Spikes, incompletions with no intended
receiver (throwaways and balls batted at the line; nflverse has no separate
throwaway flag) and attempts missing location or air yards are left out and counted.

Data: nflverse (https://github.com/nflverse/nflverse-data), play_by_play_<season>,
roster_<season>, and the nfldata schedule (games.csv) for the through-week label.

For the week-by-week play axis it also writes "wedges" (the same completed-pass
pairs, split by week) and "watt" (each passer's official pass attempts per week:
dropbacks charged as a pass attempt, sacks and two-point tries excluded, spikes
included). A week with no entry in "watt" means no pass attempts that week.

"wwhy" explains those weeks for each quarterback, using only nflverse data:
  bye    the team had no game that week (schedule, games.csv)
  out/ir he is on that week's injury report as Out or Doubtful (injuries_<season>),
         or on injured reserve in the weekly roster (status RES, R01/R48)
  ina    weekly roster lists him as game-day inactive (status INA)
  act    he played snaps (snap_counts_<season>, matched via pfr_id) or was active,
         but threw no pass
  ps     practice squad (status DEV); res other reserve lists; cut released
  tbd    the team's game that week hasn't been played yet
  dnp    nothing in the data explains it: "Did not play", never a guess
Any source that isn't published yet is skipped, and the reasons fall back to the
next rule (ultimately "Did not play").
"""
import argparse, csv, gzip, io, json, sys, time, urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REL = "https://github.com/nflverse/nflverse-data/releases/download"
PBP = REL + "/pbp/play_by_play_{s}.csv.gz"
ROSTER = REL + "/rosters/roster_{s}.csv"
GAMES = "https://github.com/nflverse/nfldata/raw/master/data/games.csv"
INJURIES = REL + "/injuries/injuries_{s}.csv"
SNAPS = REL + "/snap_counts/snap_counts_{s}.csv"
WEEKLY = REL + "/weekly_rosters/roster_weekly_{s}.csv"
DEFAULT_QB = "00-0039910"  # Jayden Daniels, WAS

csv.field_size_limit(sys.maxsize)

def fetch(url, cache):
    path = cache / url.rsplit("/", 1)[-1]
    req = urllib.request.Request(url, headers={"User-Agent": "qb-network-builder"})
    with urllib.request.urlopen(req, timeout=120) as r:
        if r.status != 200:
            raise SystemExit(f"HTTP {r.status} for {url}")
        path.write_bytes(r.read())
    return path

def rows(path):
    raw = path.read_bytes()
    if path.suffix == ".gz":
        raw = gzip.decompress(raw)
    return csv.DictReader(io.StringIO(raw.decode("utf-8")))

def num(v):
    try: return float(v)
    except (TypeError, ValueError): return 0.0

LOCS = ["left", "middle", "right"]
# air-yard bands: (label, low inclusive, high inclusive)
BANDS = [("Behind LOS", -99, -1), ("0-4", 0, 4), ("5-9", 5, 9), ("10-14", 10, 14),
         ("15-19", 15, 19), ("20-29", 20, 29), ("30+", 30, 99)]

def band(ay):
    for i, (_, lo, hi) in enumerate(BANDS):
        if lo <= ay <= hi:
            return i
    return 0 if ay < 0 else len(BANDS) - 1

def is1(v): return v in ("1", "1.0")

def injury_name(r):
    t = (r.get("report_primary_injury") or r.get("practice_primary_injury") or "").strip()
    return "" if t in ("NA", "None") else t.lower()

def reasons(s, cache, short, teams, roster, watt, weeks, plays_in, partial):
    """Why each QB in the file has no pass attempts in a week. Only what nflverse says; 'Did not play' otherwise."""
    src = ["schedule"] if plays_in is not None else []
    weekly = defaultdict(dict)   # gsis -> week -> roster row
    try:
        for r in rows(fetch(WEEKLY.format(s=s), cache)):
            if r.get("game_type", "REG") != "REG": continue
            w, g = int(num(r["week"])), r["gsis_id"]
            old = weekly[g].get(w)
            if not old or old["status"] == "CUT":   # a player listed twice (traded/released): keep the non-CUT row
                weekly[g][w] = r
        src.append("weekly rosters")
    except Exception as e:
        print("weekly rosters unavailable:", e, file=sys.stderr)
    inj = {}
    try:
        for r in rows(fetch(INJURIES.format(s=s), cache)):
            if r.get("game_type", "REG") == "REG":
                inj[(r["gsis_id"], int(num(r["week"])))] = r
        src.append("injury reports")
    except Exception as e:
        print("injury reports unavailable:", e, file=sys.stderr)
    snaps = {}
    try:
        for r in rows(fetch(SNAPS.format(s=s), cache)):
            if r.get("game_type", "REG") == "REG":
                snaps[(r["pfr_player_id"], int(num(r["week"])))] = r
        src.append("snap counts")
    except Exception as e:
        print("snap counts unavailable:", e, file=sys.stderr)

    out = {}
    for pid in short:
        ro = roster.get(pid, {})
        if (ro.get("position") or "") != "QB" or pid not in watt:
            continue
        pfr = ro.get("pfr_id") or next((x.get("pfr_id") for x in weekly[pid].values() if x.get("pfr_id")), "")
        res = {}
        for w in weeks:
            if watt[pid].get(w):
                continue
            wr = weekly[pid].get(w)
            team = (wr or {}).get("team") or (sorted(teams[pid])[0] if len(teams[pid]) == 1 else "")
            st = (wr or {}).get("status", "")
            ir = inj.get((pid, w), {})
            rs, hurt = (ir.get("report_status") or "").strip(), injury_name(ir)
            sn = snaps.get((pfr, w)) if pfr else None
            off = int(num(sn["offense_snaps"])) if sn else 0
            code = text = None
            if plays_in is not None and team and team not in plays_in.get(w, {}):
                code, text = "bye", "Bye week"
            elif plays_in is not None and team and plays_in[w].get(team) is False:
                code, text = "tbd", "Game not played yet"
            elif rs in ("Out", "Doubtful"):
                code, text = "out", rs + (f" ({hurt})" if hurt else "") + (", inactive" if st == "INA" else "")
            elif st == "RES" and (wr or {}).get("status_description_abbr") in ("R01", "R48"):
                code, text = "ir", "Injured reserve" + (f" ({hurt})" if hurt else "")
            elif off > 0:
                code, text = "act", f"Played {off} snap{'s' if off != 1 else ''}, no pass attempts"
            elif sn:
                code, text = "act", "Active, didn't attempt a pass"
            elif st == "INA":
                code, text = "ina", "Inactive" + (f" ({rs.lower()}, {hurt})" if rs and hurt else f" ({hurt})" if hurt else "")
            elif st == "ACT":
                code, text = "act", "Active, didn't attempt a pass"
            elif st == "DEV":
                code, text = "ps", "On the practice squad"
            elif st == "RES":
                code, text = "res", "On a reserve list"
            elif st == "CUT":
                code, text = "cut", "Released"
            else:
                code, text = "dnp", "Did not play"
            res[w] = [code, text]
        if res:
            out[pid] = res
    return out, src

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, default=2026)
    ap.add_argument("--cache", default="/tmp/nflverse")
    ap.add_argument("--out", default=str(ROOT / "src/data/qb_network.json"))
    a = ap.parse_args()
    cache = Path(a.cache); cache.mkdir(parents=True, exist_ok=True)
    s = a.season

    try:
        pbp = fetch(PBP.format(s=s), cache)
    except Exception as e:  # no data for that season: stop, never substitute
        raise SystemExit(f"No play-by-play for {s}: {e}")

    pairs = defaultdict(lambda: [0, 0.0, set()])   # (passer, receiver) -> [comp, yds, teams]
    wpairs = defaultdict(lambda: [0, 0.0])         # (passer, receiver, week) -> [comp, yds]
    watt = defaultdict(lambda: defaultdict(int))   # passer -> week -> pass attempts
    short, teams = {}, defaultdict(set)
    games_by_week = defaultdict(set)
    n = 0
    # heat: (passer, receiver, loc, band) -> [att, comp, yds, td, int, epa_sum, epa_n, air_sum]
    cells = defaultdict(lambda: [0, 0, 0.0, 0, 0, 0.0, 0, 0.0])
    excl = defaultdict(lambda: [0, 0, 0])   # passer -> [spikes, no intended receiver, missing location/air yards]
    for r in rows(pbp):
        if r.get("season_type") != "REG" or str(r.get("season")) != str(s):
            continue
        wk = int(num(r.get("week")))
        games_by_week[wk].add(r["game_id"])
        pid = r.get("passer_player_id")
        if (pid and pid != "NA" and not is1(r.get("two_point_attempt")) and r.get("play_type") in ("pass", "qb_spike")
                and is1(r.get("pass_attempt")) and not is1(r.get("sack"))):
            watt[pid][wk] += 1
        if pid and pid != "NA" and not is1(r.get("two_point_attempt")):
            if is1(r.get("qb_spike")) or r.get("play_type") == "qb_spike":
                excl[pid][0] += 1
            elif r.get("play_type") == "pass" and is1(r.get("pass_attempt")) and not is1(r.get("sack")):
                rid = r.get("receiver_player_id") or ""
                rid = "" if rid == "NA" else rid
                loc, ay = r.get("pass_location") or "", r.get("air_yards") or ""
                if not rid and not is1(r.get("interception")) and not is1(r.get("complete_pass")):
                    excl[pid][1] += 1
                elif loc not in LOCS or ay in ("", "NA"):
                    excl[pid][2] += 1
                else:
                    c = cells[(pid, rid, LOCS.index(loc), band(round(num(ay))))]
                    c[0] += 1; c[1] += is1(r.get("complete_pass")); c[2] += num(r.get("passing_yards"))
                    c[3] += is1(r.get("pass_touchdown")); c[4] += is1(r.get("interception"))
                    if r.get("epa") not in ("", "NA", None): c[5] += num(r.get("epa")); c[6] += 1
                    c[7] += num(ay)
                    short.setdefault(pid, r.get("passer_player_name") or pid); teams[pid].add(r["posteam"])
                    if rid:
                        short.setdefault(rid, r.get("receiver_player_name") or rid); teams[rid].add(r["posteam"])
        if (r.get("complete_pass") not in ("1", "1.0") or r.get("play_type") != "pass"
                or r.get("two_point_attempt") in ("1", "1.0")):
            continue
        p, q = r.get("passer_player_id"), r.get("receiver_player_id")
        if not p or not q or p == "NA" or q == "NA":
            continue
        e = pairs[(p, q)]
        e[0] += 1; e[1] += num(r.get("receiving_yards")); e[2].add(r["posteam"])
        we = wpairs[(p, q, wk)]; we[0] += 1; we[1] += num(r.get("receiving_yards"))
        short[p] = r.get("passer_player_name") or p
        short[q] = r.get("receiver_player_name") or q
        teams[p].add(r["posteam"]); teams[q].add(r["posteam"])
        n += 1
    if not pairs:
        raise SystemExit(f"No completed regular-season passes found for {s}; stopping.")

    roster = {}
    try:
        for r in rows(fetch(ROSTER.format(s=s), cache)):
            roster[r["gsis_id"]] = r
    except Exception as e:
        print("roster unavailable, using short names:", e, file=sys.stderr)

    sched = defaultdict(int)
    plays_in = defaultdict(dict)   # week -> team -> True once the game has a result, False before it's played
    have_sched = False
    try:
        for r in rows(fetch(GAMES, cache)):
            if r["season"] == str(s) and r["game_type"] == "REG":
                sched[int(r["week"])] += 1
                done = (r.get("result") or "NA") not in ("", "NA")
                for t in (r["home_team"], r["away_team"]):
                    plays_in[int(r["week"])][t] = done
        have_sched = bool(sched)
    except Exception as e:
        print("schedule unavailable:", e, file=sys.stderr)

    weeks = sorted(games_by_week)
    latest = weeks[-1]
    complete = [w for w in weeks if sched.get(w) and len(games_by_week[w]) >= sched[w]]
    last_complete = max(complete) if complete else None
    partial = None
    if last_complete is not None and latest > last_complete:
        partial = {"week": latest, "games": len(games_by_week[latest]), "of": sched.get(latest)}

    wwhy, why_src = reasons(s, cache, short, teams, roster, watt, weeks, plays_in if have_sched else None, partial)

    players = {}
    for pid in short:
        ro = roster.get(pid, {})
        players[pid] = {
            "name": ro.get("full_name") or short[pid],
            "short": short[pid],
            "pos": ro.get("position") or "",
            "teams": sorted(teams[pid]),
        }
    heat = defaultdict(list)
    for (p, q, li, bi), c in sorted(cells.items()):
        heat[p].append([q, li, bi, c[0], c[1], int(round(c[2])), c[3], c[4], round(c[5], 2), c[6], int(round(c[7]))])
    edges = sorted(([p, q, c, int(round(y)), sorted(t)] for (p, q), (c, y, t) in pairs.items()),
                   key=lambda e: (-e[2], e[0], e[1]))
    out = {
        "meta": {
            "season": s, "season_type": "REG",
            "latest_week": latest, "last_complete_week": last_complete, "partial_week": partial,
            "games": sum(len(v) for v in games_by_week.values()),
            "completions": n,
            "updated": time.strftime("%b %Y"),
            "source": "nflverse play-by-play (nflverse-data)",
            "default_qb": DEFAULT_QB,
            "weeks": weeks,
            "why_sources": why_src,
        },
        "players": players,
        "edges": edges,
        # week-by-week: [passer, receiver, week, completions, receiving yards]; they sum to "edges"
        "wedges": sorted(([p, q, w, c, int(round(y))] for (p, q, w), (c, y) in wpairs.items()), key=lambda e: (e[2], -e[3], e[0], e[1])),
        # pass attempts per week for every passer in the file: {passer: [[week, attempts], ...]}
        "watt": {p: sorted(v.items()) for p, v in sorted(watt.items()) if p in short},
        # why a quarterback has no pass attempts in a week: {qb: {week: [code, text]}}
        "wwhy": wwhy,
        "heat": {
            "locs": LOCS, "bands": [b[0] for b in BANDS],
            "fields": ["receiver", "loc", "band", "att", "comp", "yds", "td", "int", "epa_sum", "epa_n", "air_sum"],
            "excluded_fields": ["spikes", "no_intended_receiver", "missing_location_or_air_yards"],
            "cells": heat,
            "excluded": {p: v for p, v in excl.items() if p in heat},
            "excluded_total": [sum(v[i] for v in excl.values()) for i in range(3)],
            "attempts": sum(c[0] for c in cells.values()),
        },
    }
    Path(a.out).write_text(json.dumps(out, separators=(",", ":")))
    label = f"through Week {last_complete}" if last_complete else f"through Week {latest}"
    if partial: label += f" (+{partial['games']} of {partial['of']} Week {partial['week']} games)"
    nwhy = sum(len(v) for v in wwhy.values())
    print(f"no-attempt weeks explained for {len(wwhy)} QBs ({nwhy} weeks); sources: {', '.join(why_src) or 'none'}")
    print(f"weekly: {len(out['wedges'])} passer-receiver-week rows, attempts for {len(out['watt'])} passers, weeks {weeks[0]}-{weeks[-1]}")
    print(f"wrote {a.out}: {len(edges)} pairs, {n} completions, {len(players)} players, {label}")
    et = out["heat"]["excluded_total"]
    print(f"heat: {out['heat']['attempts']} attempts mapped; excluded {et[0]} spikes, {et[1]} with no intended receiver, {et[2]} missing location/air yards")

if __name__ == "__main__":
    main()
