#!/usr/bin/env python3
"""Build src/data/kiosks.json for the Keep-or-close dashboard.

Kiosk points sit near real Texas town centers for flavor. They are NOT real
kiosk locations or store addresses. Rentals, content mix, trends, and tech
visit rates are fictional example values.

Road distances, drive times, and leg geometry: OSRM (project-osrm.org, car
profile) on OpenStreetMap data (c) OpenStreetMap contributors, ODbL.
Usage: python3 scripts/build_kiosks.py   (standard library only; ~45 polite requests)
"""
import json, math, time, urllib.request
from pathlib import Path

OSRM = "https://router.project-osrm.org"
UA = {"User-Agent": "garyleeblevinsjr-site-build/1.0"}
OUT = Path(__file__).resolve().parent.parent / "src" / "data" / "kiosks.json"

# name, lat, lon, rentals/day (last 180), mix [new movies, new games, older catalog], trend (30-day vs 180-day), tech visits / 30 days
ZONES = [
  {"id": "dfw", "name": "DFW metro", "short": "DFW metro", "desc": "Dense: many kiosks, short hops between stops",
   "depot": ("Depot · Grand Prairie", 32.7460, -97.0010), "kiosks": [
    ("Plano", 33.0198, -96.6989, 24, [.50, .14, .36], -.06, .6),
    ("Richardson", 32.9483, -96.7299, 21, [.48, .12, .40], -.05, .5),
    ("Garland", 32.9126, -96.6389, 22, [.44, .15, .41], -.08, .7),
    ("Mesquite", 32.7668, -96.5992, 19, [.42, .13, .45], -.07, .6),
    ("Irving", 32.8140, -96.9489, 23, [.52, .12, .36], -.04, .5),
    ("Arlington", 32.7357, -97.1081, 26, [.50, .16, .34], -.05, .7),
    ("Fort Worth", 32.7555, -97.3308, 25, [.47, .14, .39], -.06, .8),
    ("Carrollton", 32.9756, -96.8900, 18, [.45, .11, .44], -.05, .5),
    ("Lewisville", 33.0462, -96.9942, 20, [.49, .13, .38], -.03, .6),
    ("Frisco", 33.1507, -96.8236, 27, [.56, .15, .29], -.02, .4),
    ("Denton", 33.2148, -97.1331, 17, [.46, .17, .37], -.04, .6),
    ("Grapevine", 32.9343, -97.0781, 15, [.50, .10, .40], -.06, .5),
    ("Mansfield", 32.5632, -97.1417, 9, [.40, .08, .52], -.12, 1.4),
    ("Duncanville", 32.6518, -96.9083, 16, [.40, .10, .50], -.05, .5),
  ]},
  {"id": "ctx", "name": "Central Texas", "short": "Central TX", "desc": "In between: small cities and some highway miles",
   "depot": ("Depot · Waco", 31.5493, -97.1467), "kiosks": [
    ("Hewitt", 31.4624, -97.1961, 15, [.45, .12, .43], -.06, .6),
    ("McGregor", 31.4440, -97.4092, 11, [.40, .10, .50], -.08, .7),
    ("Temple", 31.0982, -97.3428, 22, [.48, .15, .37], -.05, .7),
    ("Belton", 31.0560, -97.4642, 14, [.44, .12, .44], -.06, .6),
    ("Killeen", 31.1171, -97.7278, 28, [.50, .20, .30], -.04, .9),
    ("Gatesville", 31.4352, -97.7439, 12, [.42, .12, .46], -.09, .8),
    ("Lampasas", 31.0638, -98.1817, 13, [.46, .10, .44], -.10, 1.0),
    ("Hillsboro", 32.0110, -97.1300, 14, [.47, .11, .42], -.06, .7),
    ("Corsicana", 32.0954, -96.4689, 19, [.48, .14, .38], -.05, .8),
    ("Mexia", 31.6799, -96.4822, 12, [.43, .12, .45], -.08, .9),
    ("Marlin", 31.3063, -96.8980, 10, [.40, .10, .50], -.11, 1.0),
  ]},
  {"id": "wtx", "name": "West Texas", "short": "West TX", "desc": "Sprawling: few kiosks, long highway drives",
   "depot": ("Depot · Midland", 31.9973, -102.0779), "kiosks": [
    ("Midland North", 32.0480, -102.1000, 26, [.50, .16, .34], -.04, .7),
    ("Odessa", 31.8457, -102.3676, 30, [.52, .18, .30], -.03, .8),
    ("Odessa East", 31.8790, -102.3010, 18, [.46, .14, .40], -.05, .6),
    ("Stanton", 32.1293, -101.7885, 11, [.44, .10, .46], -.07, .8),
    ("Big Spring", 32.2504, -101.4787, 24, [.50, .15, .35], -.06, 1.0),
    ("Andrews", 32.3187, -102.5457, 20, [.50, .15, .35], -.05, 1.0),
    ("Lamesa", 32.7376, -101.9510, 16, [.48, .14, .38], -.08, 1.0),
    ("Snyder", 32.7179, -100.9176, 19, [.47, .15, .38], -.06, 1.1),
    ("Kermit", 31.8576, -103.0927, 14, [.45, .14, .41], -.07, 1.1),
    ("Monahans", 31.5943, -102.8927, 17, [.48, .15, .37], -.06, 1.0),
    ("Pecos", 31.4229, -103.4932, 22, [.55, .17, .28], -.05, 1.3),
    ("Fort Stockton", 30.8940, -102.8793, 25, [.55, .16, .29], -.04, 1.3),
    ("Alpine", 30.3585, -103.6610, 34, [.60, .16, .24], -.02, 1.5),
  ]},
]

def get(url):
    for i in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                d = json.loads(r.read())
            time.sleep(1.1)
            if d.get("code") == "Ok": return d
        except Exception as e:
            print("retry", i, e); time.sleep(3 + i * 3)
    raise SystemExit("OSRM failed: " + url)

def crow_mi(a, b):
    R = 3958.8; p1, p2 = math.radians(a[0]), math.radians(b[0]); dl = math.radians(b[1] - a[1]); dp = p2 - p1
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))

out = {"source": "OSRM (project-osrm.org) on OpenStreetMap data, (c) OpenStreetMap contributors, ODbL. Kiosk data is fictional.", "zones": []}
for z in ZONES:
    pts = [z["depot"][1:]] + [k[1:3] for k in z["kiosks"]]
    coords = ";".join(f"{lon},{lat}" for lat, lon in pts)
    t = get(f"{OSRM}/table/v1/driving/{coords}?annotations=distance,duration")
    D, T = t["distances"], t["durations"]
    zo = {"id": z["id"], "name": z["name"], "short": z["short"], "desc": z["desc"],
          "depot": {"name": z["depot"][0], "lat": z["depot"][1], "lon": z["depot"][2]}, "kiosks": []}
    for i, k in enumerate(z["kiosks"], start=1):
        # nearest other stop on a route (kiosk or depot), by road distance, using the symmetric average
        cand = [(j, (D[i][j] + D[j][i]) / 2, (T[i][j] + T[j][i]) / 2) for j in range(len(pts)) if j != i]
        j, dm, tm = min(cand, key=lambda c: c[1])
        kc = [(jj, d_, t_) for jj, d_, t_ in cand if jj != 0]
        j2, dm2, _ = min(kc, key=lambda c: c[1])
        a, b = pts[i], pts[j]
        r = get(f"{OSRM}/route/v1/driving/{a[1]},{a[0]};{b[1]},{b[0]}?overview=simplified&geometries=geojson")
        geom = [[round(y, 5), round(x, 5)] for x, y in r["routes"][0]["geometry"]["coordinates"]]
        name = lambda jj: z["depot"][0] if jj == 0 else z["kiosks"][jj - 1][0]
        zo["kiosks"].append({
            "id": z["id"] + "-" + k[0].lower().replace(" ", "-"), "name": k[0], "lat": k[1], "lon": k[2],
            "rpd": k[3], "mix": k[4], "trend": k[5], "tech": k[6],
            "depot_mi": round(D[0][i] / 1609.34, 1), "depot_min": round(T[0][i] / 60, 1),
            "nn": name(j), "nn_depot": j == 0, "nn_mi": round(dm / 1609.34, 1), "nn_min": round(tm / 60, 1),
            "nn_crow_mi": round(crow_mi(a, b), 1), "nn_geom": geom,
            "nk": name(j2), "nk_id": z["id"] + "-" + name(j2).lower().replace(" ", "-"), "nk_mi": round(dm2 / 1609.34, 1)})
        print(z["id"], k[0], "->", name(j), zo["kiosks"][-1]["nn_mi"], "mi", zo["kiosks"][-1]["nn_min"], "min")
    out["zones"].append(zo)
OUT.write_text(json.dumps(out, separators=(",", ":")))
print("wrote", OUT, OUT.stat().st_size, "bytes")
