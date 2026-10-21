#!/usr/bin/env python3
"""Build src/data/traffic.json: hourly traffic volume by day of week on major DC and Richmond corridors.

Source: FHWA Travel Monitoring Analysis System (TMAS), continuous count station hourly volumes
reported by VDOT (https://www.fhwa.dot.gov/policyinformation/tables/tmasdata/). Public domain (U.S. DOT).
For every station and direction below, each complete day (24 hours reported) in the year is averaged
by day of week and hour.

Usage:  python3 scripts/build_traffic_data.py [--year 2025] [--cache /tmp/tmas]   (standard library only)
"""
import argparse, csv, io, json, time, urllib.request, zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://www.fhwa.dot.gov/policyinformation/tables/tmasdata/{y}/{m}_{y}_ccs_data.zip"
STATIONS = "https://www.fhwa.dot.gov/policyinformation/tables/tmasdata/{y}/{y}_station_data.zip"
MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
DIRS = {"1": "Northbound", "3": "Eastbound", "5": "Southbound", "7": "Westbound"}

# (city, corridor, where, [(station_id, travel_dir), ...]) — all VDOT stations (state code 51)
CORRIDORS = [
    ("dc", "I-495", "Capital Beltway near Braddock Rd, Springfield", [("090138", "1"), ("190057", "5")]),
    ("dc", "I-95", "Prince William County, Dumfries to Woodbridge", [("090305", "1"), ("190013", "5")]),
    ("dc", "I-395", "Alexandria near Rt 236 (Duke St)", [("090272", "1"), ("190073", "5")]),
    ("dc", "I-66", "Arlington near Rt 120 (Glebe Rd)", [("090106", "3"), ("190029", "7")]),
    ("ric", "I-95", "Downtown Richmond near Exit 75", [("040493", "1"), ("140243", "5")]),
    ("ric", "I-64", "East Richmond near Creighton Rd", [("040482", "3"), ("140307", "7")]),
    ("ric", "I-195", "Beltline Expressway near US 33", [("040500", "1"), ("140055", "5")]),
]

def fetch(url, cache):
    p = cache / url.rsplit("/", 1)[-1]
    if not p.exists():
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (site build)"})
        with urllib.request.urlopen(req, timeout=300) as r:
            p.write_bytes(r.read())
    return p

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, default=2025)
    ap.add_argument("--cache", default="/tmp/tmas")
    a = ap.parse_args()
    cache = Path(a.cache); cache.mkdir(parents=True, exist_ok=True)
    want = {(s, d) for _, _, _, sd in CORRIDORS for s, d in sd}

    meta = {}
    with zipfile.ZipFile(fetch(STATIONS.format(y=a.year), cache)) as z:
        name = next(n for n in z.namelist() if n.endswith(f"VA_{a.year} (TMAS).STA"))
        for r in csv.DictReader(io.TextIOWrapper(z.open(name), "utf-8", errors="replace"), delimiter="|"):
            k = (r["Station_Id"], r["Travel_Dir"])
            if k in want:
                meta[k] = {"lat": float(r["Latitude"]), "lon": float(r["Longitude"]),
                           "lanes": int(r["Number_Lanes_In_Direction"] or 0), "location": r["Station_Location"].strip()}

    sums = defaultdict(lambda: [[0] * 24 for _ in range(7)])
    days = defaultdict(lambda: [0] * 7)
    months_used = []
    for m in MONTHS:
        try:
            path = fetch(BASE.format(y=a.year, m=m), cache)
        except Exception as e:
            print("skip", m, e); continue
        months_used.append(m)
        with zipfile.ZipFile(path) as z:
            name = next(n for n in z.namelist() if n.startswith("VA_") and n.endswith(".VOL"))
            for r in csv.DictReader(io.TextIOWrapper(z.open(name), "utf-8", errors="replace"), delimiter="|"):
                k = (r["Station_Id"], r["Travel_Dir"])
                if k not in want: continue
                hs = [r[f"Hour_{h:02d}"].strip() for h in range(24)]
                if any(h in ("", "-1") for h in hs): continue
                dow = int(r["Day_of_Week"]) - 1          # TMG: 1 = Sunday ... 7 = Saturday
                days[k][dow] += 1
                for h, v in enumerate(hs): sums[k][dow][h] += int(v)

    cities = {"dc": {"name": "Washington, DC area", "corridors": []}, "ric": {"name": "Richmond, VA area", "corridors": []}}
    for city, rt, where, sd in CORRIDORS:
        dirs = []
        for s, d in sd:
            k = (s, d)
            if not sum(days[k]):
                print("no data for", k); continue
            prof = [[round(sums[k][w][h] / days[k][w]) if days[k][w] else None for h in range(24)] for w in range(7)]
            dirs.append({"dir": DIRS[d], "station": s, "days": sum(days[k]), "lanes": meta.get(k, {}).get("lanes"),
                         "lat": meta.get(k, {}).get("lat"), "lon": meta.get(k, {}).get("lon"), "profile": prof})
        cities[city]["corridors"].append({"route": rt, "where": where, "dirs": dirs})
    out = {"year": a.year, "months": len(months_used), "updated": time.strftime("%b %Y"),
           "source": "FHWA TMAS continuous count stations (VDOT)", "days_order": ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
           "cities": cities}
    (ROOT / "src/data/traffic.json").write_text(json.dumps(out, separators=(",", ":")))
    print("months", len(months_used), {c: [(x["route"], [d["days"] for d in x["dirs"]]) for x in v["corridors"]] for c, v in cities.items()})

if __name__ == "__main__":
    main()
