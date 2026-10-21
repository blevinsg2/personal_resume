#!/usr/bin/env python3
"""Build src/data/aipd.json for the AIPD dashboard demo.
Everything here is FICTIONAL example data: invented company names (coined words), invented
contacts, invented firmographics. Pins sit near real metro-area town centers for flavor only.
Usage: python3 scripts/build_aipd.py   (standard library only, deterministic)"""
import json, random
from pathlib import Path
OUT = Path(__file__).resolve().parent.parent / "src" / "data" / "aipd.json"
rng = random.Random(2021)

AES = [
  ("nyc", "Priya Raman", "New York", [(40.754,-73.984),(40.678,-73.944),(40.702,-73.789),(40.845,-73.865),(40.735,-74.172),(40.728,-74.077),(41.053,-73.539),(41.034,-73.763),(40.931,-73.899),(40.886,-74.043),(40.727,-73.634),(40.768,-73.525),(40.664,-74.211),(40.944,-74.075),(40.579,-74.151),(40.486,-74.452)]),
  ("chi", "Marcus Bell", "Chicago", [(41.881,-87.630),(42.045,-87.688),(42.033,-88.083),(41.750,-88.153),(41.833,-87.929),(41.525,-88.082),(42.032,-87.741),(42.035,-88.282),(41.760,-88.320),(41.593,-87.346),(41.808,-88.011),(41.630,-87.854),(42.364,-87.845),(41.995,-87.884),(41.794,-87.590),(41.920,-87.700)]),
  ("dal", "Elena Torres", "Dallas", [(32.779,-96.800),(33.020,-96.699),(32.814,-96.949),(32.755,-97.331),(32.736,-97.108),(33.151,-96.824),(32.948,-96.730),(32.913,-96.639),(33.215,-97.133),(33.198,-96.615),(32.767,-96.599),(32.746,-96.997),(32.976,-96.890),(32.941,-97.134),(32.650,-96.910),(32.850,-96.770)]),
  ("la", "Jordan Kim", "Los Angeles", [(34.050,-118.250),(34.019,-118.480),(34.148,-118.144),(33.790,-118.190),(34.181,-118.309),(33.684,-117.826),(33.836,-117.914),(33.836,-118.341),(34.143,-118.255),(34.063,-117.651),(33.919,-118.410),(33.745,-117.868),(34.186,-118.449),(34.055,-117.750),(33.953,-117.396),(34.021,-118.396)]),
  ("atl", "Tasha Greene", "Atlanta", [(33.749,-84.388),(33.838,-84.380),(33.953,-84.550),(34.075,-84.294),(33.775,-84.296),(33.924,-84.379),(34.003,-84.144),(34.023,-84.616),(33.397,-84.596),(33.956,-83.988),(33.653,-84.449),(33.884,-84.514),(34.023,-84.362),(33.544,-84.234),(33.700,-84.170),(33.810,-84.250)]),
]
COINED = ["Quillfield","Larkspan","Brindlewood","Corvane","Tessaly","Ombrook","Vantry","Halvorne","Pellmere","Sutterby","Kestrow","Marrowind","Fenlow","Ardenvale","Thistlecove","Roverly","Cindral","Ostley","Wrenmoor","Galvane","Brackwell","Selkirra","Dunmara","Hollisford","Pinecrest Vale","Avonreach","Bellquist","Carrowmere","Drumlin","Elsworthy","Farrowgate","Glenmorrow","Haverlyn","Ivorstone","Juniper Hollow","Kellandine","Lorrimere","Mossgrove","Nettlebay","Orrinwood","Prestvane","Quarrybrook","Rushmere","Silverpine","Tamberlin","Umberly","Valemont","Wexbridge","Yarrowfield","Zellmont","Ambervale","Birchwick","Cobaltine","Dovecrest","Emberlyn","Foxmere","Grayfenn","Hartwell Ridge","Ironvale","Jessamine","Kingsmoor","Lanternby","Meadowlark Bay","Northwick","Oakhallow","Pebbleton","Quenby","Ravenmoor","Sablewood","Tidewell","Upperbrook","Velloway","Willowmere","Xandry","Yewcroft","Zephyrton","Alderwyn","Brookhaven Vale","Cresswold","Dalmerry"]
IND = {
  "Healthcare": ["Health","Medical Group","Health System","Care Partners"],
  "Manufacturing": ["Fabrication","Industries","Precision Works","Manufacturing"],
  "Higher education": ["College","University","Institute of Technology"],
  "Public sector": ["County Services","Transit Authority","Water District","Municipal Utilities"],
  "Corporate real estate": ["Properties","Realty Holdings","Office Partners"],
  "Retail": ["Markets","Outfitters","Home & Garden","Stores"],
  "Energy & utilities": ["Energy","Power Cooperative","Gas & Electric"],
}
FIRST = ["Dana","Morgan","Avery","Chris","Jamie","Riley","Taylor","Casey","Robin","Jordan","Leslie","Drew","Alex","Sam","Kendall","Quinn","Reese","Cameron","Hayden","Parker","Rowan","Emerson","Blake","Shawn"]
LAST = ["Whitlock","Abernethy","Castellan","Okafor","Lindqvist","Marchetti","Delacroix","Nakamura","Ferreira","Haddad","Kowalczyk","Brennan","Osei","Vasquez","Thornbury","Mehta","Sandoval","Ellery","Gutierrez","Fairbanks","Ivanova","Pemberton","Ruiz","Achterberg"]
SIGNALS = [  # (text, product key) third-party style signals, all invented
  ("Hiring maintenance technicians", "cmms"), ("Work orders still tracked in spreadsheets", "cmms"), ("New plant opening", "cmms"),
  ("Hybrid work policy announced", "space"), ("Consolidating office floors", "space"),
  ("Lease portfolio growing across states", "lease"), ("New lease accounting review", "lease"),
  ("Large engineering drawing archive", "edm"), ("Facility renovation projects underway", "edm"),
  ("Multi-year capital program approved", "capital"), ("Aging buildings, deferred maintenance backlog", "capital"),
]
PRODUCTS = ["cmms", "space", "lease", "edm", "capital"]
used = set()
def company(ind):
    for _ in range(200):
        w = rng.choice(COINED)
        if w not in used: used.add(w); return w + " " + rng.choice(IND[ind])
def emp(): return rng.choice([180, 320, 640, 900, 1400, 2300, 3800, 5200, 8600, 14000, 22000])
def fac(e): return max(2, int(e / rng.uniform(55, 260)))
def person(): return rng.choice(FIRST) + " " + rng.choice(LAST)

out = {"note": "Fictional example data. Company and contact names are invented.", "aes": []}
for aid, ae, city, anchors in AES:
    pts = anchors[:]; rng.shuffle(pts)
    def loc():
        a = pts.pop(); return round(a[0] + rng.uniform(-.012, .012), 4), round(a[1] + rng.uniform(-.012, .012), 4)
    cust, pros = [], []
    for i in range(6):
        ind = rng.choice(list(IND)); e = emp(); lat, lon = loc()
        owned = rng.sample(PRODUCTS, rng.choice([1, 1, 2]))
        cust.append({"id": f"{aid}-c{i}", "name": company(ind), "industry": ind, "employees": e, "facilities": fac(e), "lat": lat, "lon": lon,
                     "owned": owned, "since": rng.choice([2014, 2016, 2017, 2018, 2019, 2020]), "contact": person()})
    for i in range(10):
        ind = rng.choice(list(IND)); e = emp(); lat, lon = loc()
        sig = rng.sample(SIGNALS, rng.choice([1, 1, 2]))
        pros.append({"id": f"{aid}-p{i}", "name": company(ind), "industry": ind, "employees": e, "facilities": fac(e), "lat": lat, "lon": lon,
                     "signals": [s[0] for s in sig], "sigp": [s[1] for s in sig], "contact": person()})
    out["aes"].append({"id": aid, "ae": ae, "city": city, "customers": cust, "prospects": pros})
OUT.write_text(json.dumps(out, separators=(",", ":")))
print("wrote", OUT, OUT.stat().st_size)
