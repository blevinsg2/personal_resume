#!/usr/bin/env python3
"""Precompute road routes for the traffic-routing demo with the public OSRM demo server.

Writes src/data/routes.json: for each city, a start point and public-landmark stops, with
straight-line (Haversine) distance, OSRM road distance and free-flow drive time, a simplified
route line, an OSRM table (all pairs), and every stop-to-stop leg (distance, free-flow time, main
roads, simplified line) for the service-tech route planner. The site never calls OSRM live.

Usage: python3 scripts/build_routes.py      (standard library only; ~20 polite requests)
Data: OSRM (project-osrm.org, car profile) on OpenStreetMap data (c) OpenStreetMap contributors, ODbL.
Coordinates: OpenStreetMap Nominatim lookups of public landmarks.
"""
import json, math, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OSRM = "https://router.project-osrm.org"
UA = {"User-Agent": "garyleeblevinsjr-site-build/1.0"}

CITIES = {
    "dc": {
        "name": "Washington, DC area",
        "start": {"id": "start", "name": "Franconia–Springfield Metro", "lat": 38.7663379, "lon": -77.1683994},
        "stops": [
            {"id": "ftwash", "name": "Fort Washington Park", "lat": 38.7120683, "lon": -77.0302775},
            {"id": "mtvernon", "name": "Mount Vernon", "lat": 38.7101790, "lon": -77.0888199},
            {"id": "harbor", "name": "National Harbor", "lat": 38.783342, "lon": -77.0148285},
            {"id": "oldtown", "name": "Old Town Alexandria", "lat": 38.8065306, "lon": -77.0610459},
            {"id": "pentagon", "name": "The Pentagon", "lat": 38.8733004, "lon": -77.0552897},
            {"id": "tysons", "name": "Tysons", "lat": 38.9206007, "lon": -77.2223184},
        ],
    },
    "ric": {
        "name": "Richmond, VA area",
        "start": {"id": "start", "name": "Main Street Station", "lat": 37.5350573, "lon": -77.4287107},
        "stops": [
            {"id": "airport", "name": "Richmond International Airport", "lat": 37.5069667, "lon": -77.3214839},
            {"id": "ginter", "name": "Lewis Ginter Botanical Garden", "lat": 37.6205237, "lon": -77.4707077},
            {"id": "pocahontas", "name": "Pocahontas State Park", "lat": 37.3639929, "lon": -77.580774},
            {"id": "shortpump", "name": "Short Pump", "lat": 37.6561375, "lon": -77.619876},
        ],
    },
}

def get(url):
    time.sleep(1.1)
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        d = json.load(r)
    if d.get("code") != "Ok":
        raise SystemExit(f"OSRM error {d.get('code')} for {url}")
    return d

def haversine_km(a, b):
    R = 6371.0088
    p1, p2 = math.radians(a["lat"]), math.radians(b["lat"])
    dp, dl = p2 - p1, math.radians(b["lon"] - a["lon"])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))

def roads_of(leg, n=8):
    roads = {}
    for st in leg["steps"]:
        nm = st.get("ref") or st.get("name")
        if nm: roads[nm] = roads.get(nm, 0) + st["distance"]
    return [[k, round(v / 1000, 2)] for k, v in sorted(roads.items(), key=lambda kv: -kv[1])[:n]]

def main():
    out = {"source": "OSRM demo server (car profile) on OpenStreetMap data", "updated": time.strftime("%b %Y"), "cities": {}}
    for key, c in CITIES.items():
        pts = [c["start"]] + c["stops"]
        coords = ";".join(f'{p["lon"]},{p["lat"]}' for p in pts)
        tab = get(f"{OSRM}/table/v1/driving/{coords}?annotations=duration,distance")
        stops = []
        for i, s in enumerate(c["stops"], start=1):
            r = get(f'{OSRM}/route/v1/driving/{c["start"]["lon"]},{c["start"]["lat"]};{s["lon"]},{s["lat"]}?overview=simplified&geometries=geojson&steps=true')
            rt = r["routes"][0]
            # main named roads on the route, longest first
            roads = {}
            for st in rt["legs"][0]["steps"]:
                nm = st.get("ref") or st.get("name")
                if nm: roads[nm] = roads.get(nm, 0) + st["distance"]
            stops.append({**s,
                "crow_km": round(haversine_km(c["start"], s), 2),
                "road_km": round(rt["distance"] / 1000, 2),
                "drive_min": round(rt["duration"] / 60, 1),
                "roads": [[k, round(v / 1000, 2)] for k, v in sorted(roads.items(), key=lambda kv: -kv[1])[:6]],
                "line": [[round(x, 5), round(y, 5)] for x, y in rt["geometry"]["coordinates"]]})
        legs = {}
        for i, a in enumerate(pts):
            for j, b in enumerate(pts):
                if i == j or j == 0: continue   # the tech plan starts at the start point and never returns to it
                r = get(f'{OSRM}/route/v1/driving/{a["lon"]},{a["lat"]};{b["lon"]},{b["lat"]}?overview=simplified&geometries=geojson&steps=true')
                rt = r["routes"][0]
                legs[f"{i}-{j}"] = {"km": round(rt["distance"] / 1000, 2), "min": round(rt["duration"] / 60, 1), "roads": roads_of(rt["legs"][0]),
                    "line": [[round(x, 5), round(y, 5)] for x, y in rt["geometry"]["coordinates"]]}
        out["cities"][key] = {"name": c["name"], "start": c["start"], "stops": stops, "legs": legs,
            "ids": [p["id"] for p in pts],
            "table_min": [[round(v / 60, 1) for v in row] for row in tab["durations"]],
            "table_km": [[round(v / 1000, 2) for v in row] for row in tab["distances"]]}
        print(key, [(s["name"], s["crow_km"], s["road_km"], s["drive_min"]) for s in stops])
    (ROOT / "src/data/routes.json").write_text(json.dumps(out, separators=(",", ":")))

if __name__ == "__main__":
    main()
