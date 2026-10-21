#!/usr/bin/env python3
"""Build src/data/launch_upcoming.json: every orbital launch scheduled worldwide in the next ~60 days.

Source: The Space Devs, Launch Library 2 (https://thespacedevs.com/llapi), endpoint /launches/upcoming/
(2.3.0, falling back to 2.2.0). One request per run (mode=detailed, for webcast links; anonymous limit is 15 an hour), about 3 seconds.
Safe to run on a schedule: if the API fails or rate-limits, the existing JSON is left untouched and the
script exits 0 with a warning, so a weekly rebuild never wipes the calendar. Pass --strict to exit 1 instead.
Usage: python3 scripts/build_launch_upcoming.py [--days 60] [--strict]
"""
import argparse, json, math, re, sys, time, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src/data/launch_upcoming.json"
GLOBE = ROOT / "src/data/launch_globe.json"
# LL2 provider name -> Launch Globe provider key (same groups and colors as the globe; see build_launch_globe.py).
# Keep in sync with PV_RULES in public/assets/js/launchcal.js, which applies the same rules to live refreshes.
PV_RULES = [("spx", r"^SpaceX"), ("rlab", r"^Rocket Lab"), ("ula", r"United Launch Alliance"), ("blue", r"Blue Origin"),
            ("ffly", r"Firefly"), ("ng", r"Northrop|Orbital (Sciences|ATK)"), ("nasa", r"^(NASA|National Aeronautics)"),
            ("ru", r"Russia|ROSCOSMOS|Roscosmos|Khrunichev|Progress Rocket|Kosmotras|Soviet"),
            ("casc", r"China Aerospace Science and Technology|China Rocket|CASC|China Academy of Launch|Shanghai Academy"),
            ("eu", r"Arianespace|European Space Agency|Avio|Isar|Rocket Factory|Orbex"), ("in", r"Indian Space|ISRO|NewSpace India"),
            ("jp", r"Mitsubishi|JAXA|Japan Aerospace"), ("ir", r"Iran|IRGC|Islamic Revolutionary"),
            ("kp", r"Korean Committee|National Aerospace Development|DPRK|North Korea")]
DONE = {"Success", "Failure", "Partial Failure"}
# When LL2 lists no webcast yet: the provider's own, verified livestream / channel pages (never a guessed video URL).
# Keep in sync with STREAM_PAGES in public/assets/js/launchcal.js.
STREAM_PAGES = [
    (r"^SpaceX", [("SpaceX launches page", "https://www.spacex.com/launches"), ("SpaceX on YouTube", "https://www.youtube.com/@SpaceX")]),
    (r"^Rocket Lab", [("Rocket Lab livestream page", "https://www.rocketlabusa.com/live-stream/")]),
    (r"United Launch Alliance", [("ULA missions page", "https://www.ulalaunch.com/missions"), ("ULA on YouTube", "https://www.youtube.com/@UnitedLaunchAlliance")]),
    (r"Blue Origin", [("Blue Origin on YouTube", "https://www.youtube.com/@BlueOrigin")]),
    (r"^(NASA|National Aeronautics)", [("NASA+", "https://plus.nasa.gov/"), ("NASA on YouTube", "https://www.youtube.com/@NASA")]),
    (r"^Arianespace", [("Arianespace on YouTube", "https://www.youtube.com/@arianespace")]),
    (r"Indian Space|ISRO", [("ISRO on YouTube", "https://www.youtube.com/@isroofficial5866")]),
    (r"Firefly", [("Firefly on YouTube", "https://www.youtube.com/@FireflySpace")]),
]

def webcasts(x):
    vids = []
    for v in sorted(x.get("vid_urls") or [], key=lambda v: (((v.get("type") or {}).get("id") or 9) != 1, v.get("priority") or 99)):
        u = v.get("url") or ""
        if not re.match(r"^https://", u): continue
        vids.append({"t": (v.get("title") or "")[:120], "u": u, "p": (v.get("publisher") or v.get("source") or "")[:60],
                     "k": ((v.get("type") or {}).get("name") or "")})
    return vids[:3]
UA = {"User-Agent": "garyleeblevinsjr-site launch calendar builder (static resume site)"}
PREC = {"SEC": "min", "MIN": "min", "HR": "hour", "DAY": "day", "WEEK": "week", "M": "month", "Q": "quarter", "H1": "half", "H2": "half", "Y": "year", "FY": "year", "DEC": "year"}

def fetch(days):
    until = (datetime.now(timezone.utc) + timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    q = urllib.parse.urlencode({"limit": 100, "mode": "detailed", "net__lte": until, "ordering": "net"})
    last = None
    for ver in ("2.3.0", "2.2.0"):
        url = f"https://ll.thespacedevs.com/{ver}/launches/upcoming/?{q}"
        try:
            out = []
            while url and len(out) < 300:
                with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                    d = json.load(r)
                out += d["results"]; url = d.get("next")
            return ver, out
        except Exception as e:
            last = e
            if getattr(e, "code", None) == 429: break  # rate-limited: 2.2.0 shares the same limit
    raise RuntimeError(last)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--days", type=int, default=60); ap.add_argument("--strict", action="store_true")
    a = ap.parse_args(); t = time.time()
    try:
        ver, rows = fetch(a.days)
    except Exception as e:
        print(f"warning: Launch Library 2 fetch failed ({e}); keeping {OUT.name} as is", file=sys.stderr)
        sys.exit(1 if a.strict else 0)
    g = json.loads(GLOBE.read_text()) if GLOBE.exists() else {"sites": [], "meta": {"providers": []}}
    sites, keys = g["sites"], [p["key"] for p in g["meta"]["providers"]]
    def globe_site(lat, lon):  # nearest Launch Globe site marker within ~150 km (sea platforms move), so the globe can highlight it
        best = None
        for i, p in enumerate(sites):
            d = math.hypot(p["lat"] - lat, (p["lon"] - lon) * math.cos(math.radians(lat)))
            if d < 1.5 and (best is None or d < best[0]): best = (d, i)
        return best[1] if best else None
    def provider(name, country):
        for k, rx in PV_RULES:
            if re.search(rx, name): return keys.index(k) if k in keys else len(keys) - 1
        if country == "CHN": return keys.index("cncom") if "cncom" in keys else len(keys) - 1
        return len(keys) - 1  # Other
    out = []
    for x in rows:
        lsp = (x.get("launch_service_provider") or {}).get("name") or ""
        st = x.get("status") or {}
        if st.get("abbrev") in DONE or st.get("name") in DONE: continue  # already flew
        pad = x.get("pad") or {}; loc = pad.get("location") or {}
        lat, lon = float(pad.get("latitude") or 0), float(pad.get("longitude") or 0)
        mis = (x.get("mission") or {}).get("name") or x["name"].split("|")[-1].strip()
        prec = ((x.get("net_precision") or {}).get("abbrev") or "MIN").upper()
        out.append({
            "id": x["id"], "name": mis, "pv": provider(lsp, (pad.get("country") or {}).get("alpha_3_code")), "lsp": lsp, "vehicle": ((x.get("rocket") or {}).get("configuration") or {}).get("name") or "",
            "pad": pad.get("name") or "", "location": loc.get("name") or "", "lat": round(lat, 4), "lon": round(lon, 4), "gsite": globe_site(lat, lon),
            "net": x["net"], "prec": PREC.get(prec, "day"), "ws": x.get("window_start"), "we": x.get("window_end"),
            "status": st.get("abbrev") or "", "status_name": st.get("name") or "",
            "watch": webcasts(x), "streams": next(([{"t": t, "u": u} for t, u in pages] for rx, pages in STREAM_PAGES if re.search(rx, lsp)), []),
        })
    doc = {"as_of": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "days": a.days, "api": ver,
           "source": "The Space Devs, Launch Library 2", "launches": out}
    OUT.write_text(json.dumps(doc, separators=(",", ":"), ensure_ascii=False))
    print(f"wrote {OUT} ({len(out)} launches in the next {a.days} days, LL2 {ver}, {time.time() - t:.1f}s)")

if __name__ == "__main__":
    main()
