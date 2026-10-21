#!/usr/bin/env python3
"""Build src/data/launch_globe.json: every orbital launch attempt worldwide since Sputnik, for the Launch Globe.

Sources (fetched fresh each run, falling back to the cache in --cache when a fetch fails):
  * Jonathan McDowell's GCAT (planet4589.org/space/gcat): launch.tsv, lp.tsv (pad coordinates), sites.tsv (site coordinates).
    Kept: every launch with an orbital (O) or deep-space (D) LaunchCode, plus SpaceX Starship integrated flight tests
    (near-orbital "N" codes, flagged as tests). Dropped: pad explosions before launch ("E" codes, e.g. Amos-6), and
    everything suborbital or atmospheric (sounding rockets, missile tests, hop tests, HASTE flights GCAT codes suborbital).
    Outcome: S success, F failure; GCAT partial codes (e.g. OS85, OF40) become P = partial.
  * Wikipedia "List of Falcon 9 and Falcon Heavy launches" pages for Falcon booster landings, matched by UTC date/time.
  * Natural Earth 110m land polygons (public domain) for the dotted land on the globe.
Providers are grouped from the launch vehicle (see PROVIDERS below). Launch sites within ~30 km of each other are merged
into one marker (Baikonur's dozens of pads, Cape Canaveral + Kennedy, and so on).
Usage: python3 scripts/build_launch_globe.py [--cache /tmp/launchglobe]
"""
import argparse, json, math, re, sys, time, urllib.parse, urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GCAT = "https://planet4589.org/space/gcat/tsv/launch/launch.tsv"
GCAT_LP = "https://planet4589.org/space/gcat/tsv/tables/lp.tsv"
GCAT_SITES = "https://planet4589.org/space/gcat/tsv/tables/sites.tsv"
GCAT_ORGS = "https://planet4589.org/space/gcat/tsv/tables/orgs.tsv"  # launch agencies; used to find NASA (and its centers)
LAND = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson"
WP_PAGES = ["List of Falcon 9 and Falcon Heavy launches (2010–2019)", "List of Falcon 9 and Falcon Heavy launches (2020–2022)",
            "List of Falcon 9 and Falcon Heavy launches (2023)", "List of Falcon 9 and Falcon Heavy launches (2024)",
            "List of Falcon 9 and Falcon Heavy launches"]
UA = {"User-Agent": "garyleeblevinsjr-site launch globe builder (static resume site)"}
# provider groups: (key, display name, short name, light-theme color, dark-theme color, vehicle regex). First match wins.
PROVIDERS = [
    ("spx", "SpaceX", "SpaceX", "#1f63d6", "#5b9cff", r"^(Falcon|Starship)"),
    ("rlab", "Rocket Lab", "Rocket Lab", "#f07800", "#ff9a3c", r"^(Electron|HASTE|Neutron)"),
    ("ula", "United Launch Alliance", "ULA", "#008c5a", "#2fd08f", r"^(Atlas V|Delta 4|Vulcan)|^ULA-DELTA2$"),
    # NASA: Saturn, Space Shuttle, and SLS, plus every launch GCAT lists with NASA (or one of its centers) as a launch agency.
    # The vehicle regex is only a fallback; classify() checks the agency first.
    ("nasa", "NASA (Saturn, Space Shuttle, SLS, and launches GCAT lists with NASA as a launch agency)", "NASA", "#c014c0", "#f25cf2",
     r"^(Saturn|Uprated Saturn|Space Shuttle|SLS)"),
    ("us", "U.S. heritage (pre-ULA Atlas, Thor/Delta, Titan, Scout, and others not run by NASA)", "U.S. heritage", "#6f8fb8", "#9db8dc",
     r"^(Atlas|Thor|Thorad|Delta|Titan|Commercial Titan|Juno|Jupiter|Vanguard|Scout|Blue Scout|Saturn|Uprated Saturn|Space Shuttle|SLS|NOTS|SPARTA|Conestoga|LLV|LMLV|Athena|Super Strypi)"),
    ("ng", "Northrop Grumman (incl. Orbital Sciences)", "Northrop Grumman", "#7a9a00", "#b5d334", r"^(Pegasus|Taurus|ARPA Taurus|Minotaur|Antares)"),
    ("blue", "Blue Origin", "Blue Origin", "#0aa5b8", "#3fd6e8", r"^New Glenn"),
    ("ffly", "Firefly Aerospace", "Firefly", "#a3326a", "#ec6fa8", r"^Firefly"),
    ("ru", "USSR & Russia", "USSR & Russia", "#c2122f", "#ff5468",
     r"^(Sputnik|Vostok|Voskhod|Molniya|Soyuz|Polyot|Kosmos|K65M|Proton|UR-500|Tsiklon|Zenit|R-36O|N-1 11A52|Energiya|Rokot|Dnepr|Start|Strela|Shtil|Volna|Angara)"),
    ("casc", "China: CASC (Long March)", "CASC", "#d6a300", "#ffd23f", r"^(Chang Zheng|Feng Bao|Jielong)"),
    ("cncom", "China: commercial & CASIC", "China commercial", "#e0589c", "#ff8cc6",
     r"^(Kuaizhou|KT-|Lijian|Gushenxing|Zhuque|Shuang Quxian|Tianlong|OS-M|Yinli|Zhishenxing|Kinetica|Ceres|Hyperbola|Kaitian)"),
    ("eu", "Europe (Arianespace, ESA, earlier national rockets)", "Europe", "#3a3fb0", "#8c90ff", r"^(Ariane|Vega|Europa|Diamant|Black Arrow|Spectrum|ARIANESPACE-SOYUZ)"),
    ("in", "India (ISRO)", "India", "#8f5a2b", "#d79a60", r"^(SLV|ASLV|PSLV|GSLV|LVM3|SSLV)"),
    ("jp", "Japan (JAXA, MHI)", "Japan", "#7b4fc4", "#b896ff", r"^(Lambda|Mu-|M-V|N-1$|N-2|H-1|H-II|H3|Epsilon|SS-520)"),
    ("ir", "Iran", "Iran", "#3f6b3a", "#86c27d", r"^(Safir|Simorgh|Qased|Qaem|Zoljanah)"),
    ("kp", "North Korea", "North Korea", "#5b5144", "#bfae96", r"^(Paektusan|Unha|Kwangmyongsong|Cheonlima|NK )"),
    ("other", "Other (Israel, South Korea, Brazil, smaller U.S., Japanese, Indian and Australian startups)", "Other", "#8a8a8a", "#a3a3a3", r"."),
]
# rough launch corridors per site cluster (azimuth range, degrees from north), for drawing only
CORRIDORS = {"Baikonur": (40, 70), "Plesetsk": (-20, 25), "Vandenberg": (170, 200), "Jiuquan": (135, 190), "Taiyuan": (160, 200),
             "Sriharikota": (100, 190), "Kourou": (0, 95), "Tanegashima": (90, 120), "Mahia": (60, 200), "Svobodny": (0, 40),
             "Vostochny": (0, 60), "Wenchang": (90, 160), "Xichang": (95, 120), "Semnan": (130, 160), "Sohae": (170, 190),
             "Palmachim": (265, 285), "Kodiak": (170, 200), "Sea Launch": (80, 100), "Kwajalein": (80, 100), "Starbase": (90, 100),
             "Uchinoura": (90, 120), "Wallops": (100, 140), "off California": (170, 200)}
CLUSTER_NAMES = {  # dominant GCAT site code -> marker name
    "NIIP-5": "Baikonur, Kazakhstan", "GIK-5": "Baikonur, Kazakhstan", "NIIP-53": "Plesetsk, Russia", "GIK-1": "Plesetsk, Russia",
    "CC": "Cape Canaveral & Kennedy, Florida", "KSC": "Cape Canaveral & Kennedy, Florida", "VS": "Vandenberg, California", "V": "Vandenberg, California",
    "VSFBS": "Vandenberg, California", "CSG": "Kourou, French Guiana", "JQ": "Jiuquan, China", "XSC": "Xichang, China", "TYSC": "Taiyuan, China",
    "WEN": "Wenchang, China", "SHAR": "Sriharikota, India", "SDSC": "Sriharikota, India", "TNSC": "Tanegashima, Japan", "KASC": "Uchinoura, Japan",
    "USC": "Uchinoura, Japan", "GTsP-4": "Kapustin Yar, Russia", "MAHIA": "Mahia, New Zealand", "MARS": "Wallops, Virginia", "WI": "Wallops, Virginia",
    "STB": "Starbase, Texas", "VOST": "Vostochny, Russia", "GIK-2": "Svobodny, Russia", "SEM": "Semnan, Iran", "SHAHR": "Shahroud, Iran",
    "SOHAE": "Sohae, North Korea", "TONGH": "Tonghae, North Korea", "PALB": "Palmachim, Israel", "NARO": "Naro, South Korea",
    "KLA": "Sea Launch, Pacific Ocean", "YAS": "Yasny, Russia", "HMG": "Hammaguir, Algeria", "SMLC": "San Marco, Kenya", "ALCA": "Alcântara, Brazil",
    "KMR": "Kwajalein, Marshall Islands", "PSCA": "Kodiak, Alaska", "KLC": "Kodiak, Alaska", "HCSLS": "Hainan Commercial, China",
    "HHAI": "Yellow Sea platforms, China", "YJ": "Yellow Sea platforms, China", "KII": "Kii, Japan", "AND": "Andøya, Norway",
    "BOWEN": "Bowen, Australia", "WOO": "Woomera, Australia", "ECS": "East China Sea", "SPFL": "Cape Canaveral & Kennedy, Florida",
    "SPFLA": "Kodiak, Alaska", "JEJU": "Jeju, South Korea", "NOTS": "China Lake, California", "PA": "Vandenberg, California",
    "BLA": "Barents Sea (submarine)", "WTR": "Air launches off California", "ETR": "Air launches off Florida",
    "GANC": "Air launch off the Canary Islands", "KAU": "Kauai, Hawaii", "CELS": "Air launch off Cornwall, UK", "GNIIPV": "Plesetsk, Russia", "GTsMP-4": "Plesetsk, Russia", "GNIIP": "Plesetsk, Russia",
}
MON = {m: i + 1 for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}

def get(url, cache, name=None, tries=3):
    p = cache / (name or url.rsplit("/", 1)[-1])
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                p.write_bytes(r.read()); return p
        except Exception as e:
            if i == tries - 1:
                if p.exists():
                    print(f"warning: using cached {p.name} ({e})", file=sys.stderr); return p
                print(f"warning: could not fetch {url} ({e}); keeping the existing launch_globe.json", file=sys.stderr)
                sys.exit(0)
            time.sleep(2 + i * 3)

def tsv(path):
    L = path.read_text(encoding="utf-8").splitlines()
    H = L[0].lstrip("#").split("\t")
    updated = next((l for l in L[1:3] if l.startswith("# Updated")), "")
    return [dict(zip(H, [x.strip() for x in l.split("\t")])) for l in L[1:] if l and not l.startswith("#")], updated

def gcat_dt(s):
    m = re.match(r"(\d{4}) (\w{3})\s+(\d+)(?:\s+(\d{2})(\d{2}))?", s)
    y, mo, d = int(m.group(1)), MON[m.group(2).lower()], int(m.group(3))
    hh, mm = int(m.group(4) or 12), int(m.group(5) or 0)
    return datetime(y, mo, d, hh, mm, tzinfo=timezone.utc)

# ---------------------------------------------------------------- Wikipedia booster landings
def wp_wikitext(title, cache, i):
    u = "https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode({"action": "parse", "page": title, "prop": "wikitext", "format": "json", "redirects": 1})
    p = get(u, cache, f"wp{i}.json")
    return json.loads(p.read_text())["parse"]["wikitext"]["*"]

def strip(t):
    t = re.sub(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>", "", t, flags=re.S)
    t = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", t)
    return t

def parse_date(cell):
    c = strip(cell)
    m = re.search(r"(\d{1,2})\s+([A-Z][a-z]+)\s+(\d{4})", c) or None
    if m: d, mo, y = int(m.group(1)), MON.get(m.group(2)[:3].lower()), int(m.group(3))
    else:
        m = re.search(r"([A-Z][a-z]+)\s+(\d{1,2}),?\s+(\d{4})", c)
        if not m: return None
        mo, d, y = MON.get(m.group(1)[:3].lower()), int(m.group(2)), int(m.group(3))
    if not mo: return None
    t = re.search(r"(?:<br\s*/?>|\s)(\d{1,2}):(\d{2})", c)
    return datetime(y, mo, d, int(t.group(1)) if t else 12, int(t.group(2)) if t else 0, tzinfo=timezone.utc), bool(t)

def landing_codes(cell):
    out = []
    cell = re.sub(r"\{\{\s*(?:nobr|nowrap)\s*\|\s*(Success|Failure|No attempt)\s*\}\}", r"{{\1}}", cell, flags=re.I)
    cell = re.sub(r"^\s*(No attempt|Precluded)\b", r"{{\1}}", cell, flags=re.I)
    cell = re.sub(r"\{\{\s*unofficial2?\s*\|", "{{", cell, flags=re.I)
    for m in re.finditer(r"\{\{\s*(Success|Failure|No attempt|Partial failure|Partial success|Precluded|Uncontrolled|Controlled|n/a)[^}]*\}\}([^{]*)", cell, re.I):
        k, rest = m.group(1).lower(), strip(m.group(2)).lower()
        where = ("drone ship" if re.search(r"asog|ocisly|jrti|drone", rest) else "ground pad" if re.search(r"lz|ground|pad", rest)
                 else "ocean" if "ocean" in rest else "parachute" if "parachute" in rest else "")
        code = {"success": "S", "failure": "F", "no attempt": "N", "partial failure": "P", "partial success": "S", "precluded": "X",
                "uncontrolled": "F", "controlled": "S", "n/a": "N"}[k]
        if k == "controlled" or (where == "ocean" and code == "S"): code = "O"
        out.append(code + (":" + where if where else ""))
    return out

def wp_landings(cache):
    rows = []
    for i, t in enumerate(WP_PAGES):
        w = wp_wikitext(t, cache, i)
        for chunk in re.split(r"\n\|-", w):
            idm = re.match(r'\s*id="?((?:F9|FH)-\d+)"?', chunk)
            if not idm: continue
            cells = [re.sub(r'^\|\s*(?:[a-z]+\s*=[^|\[{]*?\|(?!\|))?\s*', "", l) for l in (x.lstrip() for x in chunk.split("\n")) if l.startswith("|") and not l.startswith("|}")]
            if len(cells) < 9: continue
            pd = parse_date(cells[0])
            if not pd: continue
            rows.append({"dt": pd[0], "timed": pd[1], "id": idm.group(1), "landing": landing_codes(cells[-1]), "outcome": strip(cells[-2])[:40]})
    return rows

# ---------------------------------------------------------------- land dots
def land_dots(cache, step=2.0):
    g = json.loads(get(LAND, cache).read_text())
    polys = []
    for f in g["features"]:
        geom = f["geometry"]
        for poly in ([geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]):
            ring = poly[0]
            xs = [p[0] for p in ring]; ys = [p[1] for p in ring]
            polys.append((ring, min(xs), max(xs), min(ys), max(ys)))
    def inside(lon, lat):
        for ring, x0, x1, y0, y1 in polys:
            if not (x0 <= lon <= x1 and y0 <= lat <= y1): continue
            c = False; j = len(ring) - 1
            for i in range(len(ring)):
                xi, yi = ring[i]; xj, yj = ring[j]
                if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi: c = not c
                j = i
            if c: return True
        return False
    dots = []
    lat = -88 + step / 2
    while lat < 88:
        n = max(1, int(round(360 * math.cos(math.radians(lat)) / step)))   # equal-area-ish spacing
        for k in range(n):
            lon = -180 + (k + 0.5) * 360 / n
            if inside(lon, lat): dots += [round(lon, 1), round(lat, 1)]
        lat += step
    return dots


def classify(lv, site, when, nasa=False):
    if nasa and not lv.startswith(("Falcon", "Starship", "Electron", "Atlas V", "Delta 4", "Vulcan", "Antares", "Minotaur", "Pegasus")):
        return next(i for i, p in enumerate(PROVIDERS) if p[0] == "nasa")
    if lv.startswith("Delta 7") and when >= datetime(2006, 12, 1, tzinfo=timezone.utc): lv = "ULA-DELTA2"   # Delta II after the ULA merger
    if lv.startswith("Soyuz-ST") and site == "CSG": lv = "ARIANESPACE-SOYUZ"                                  # Soyuz from Kourou
    for i, pv in enumerate(PROVIDERS):
        if re.search(pv[5], lv): return i
    return len(PROVIDERS) - 1

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--cache", default="/tmp/launchglobe")
    ap.add_argument("--out", default=str(ROOT / "src/data/launch_globe.json")); a = ap.parse_args()
    cache = Path(a.cache); cache.mkdir(parents=True, exist_ok=True); t_start = time.time()
    L, updated = tsv(get(GCAT, cache)); LP, _ = tsv(get(GCAT_LP, cache)); ST, _ = tsv(get(GCAT_SITES, cache))
    ORG = {r["Code"]: r.get("Parent", "") for r in tsv(get(GCAT_ORGS, cache))[0]}
    def is_nasa(agency):  # any agency code whose parent chain reaches NASA, e.g. MSFC, GSFC, LERC, JSC/MSFC
        for code in agency.split("/"):
            seen = set()
            while code and code not in seen:
                if code == "NASA": return True
                seen.add(code); code = ORG.get(code, "")
        return False
    num = lambda v: v not in ("-", "", None) and re.match(r"^-?[\d.]+$", v)
    padxy, sitexy, sitename = {}, {}, {}
    for r in LP:
        if num(r["Longitude"]) and num(r["Latitude"]): padxy.setdefault((r["Site"], r["Code"]), (float(r["Longitude"]), float(r["Latitude"])))
    for r in ST:
        if num(r["Longitude"]) and num(r["Latitude"]): sitexy.setdefault(r["Site"], (float(r["Longitude"]), float(r["Latitude"])))
        sitename.setdefault(r["Site"], r["Name"])
    keep, dropped, nocoord = [], Counter(), Counter()
    for r in L:
        lv, code = r["LV_Type"], r["LaunchCode"]
        ship = lv.startswith("Starship V") and not lv.endswith("Ship")
        if code[1:2] == "E": dropped["pad explosion before launch"] += 1; continue
        if code[1:2] == "A": dropped["engine shutdown on the pad"] += 1; continue  # e.g. Space Shuttle RSLS aborts, Gemini 6
        if code[:1] not in ("O", "D") and not (ship and code[:1] == "N"):
            if lv.startswith(("Falcon", "Starship", "Electron", "HASTE")) or lv == "Grasshopper": dropped[f"{lv} ({code[:1]})"] += 1
            continue
        when = gcat_dt(r["Launch_Date"])
        s_, p_ = (r["Ascent_Site"], r["Ascent_Pad"]) if r["Ascent_Site"] not in ("-", "") else (r["Launch_Site"], r["Launch_Pad"])
        s_ = s_.rstrip("?"); p_ = p_.rstrip("? ").strip()
        xy = padxy.get((s_, p_)) or sitexy.get(s_) or padxy.get((r["Launch_Site"].rstrip("?"), r["Launch_Pad"].rstrip("? "))) or sitexy.get(r["Launch_Site"].rstrip("?"))
        if not xy: nocoord[s_] += 1; continue
        keep.append((when, lv, r, code, s_, xy, ship))
    keep.sort(key=lambda x: x[0])
    # merge sites within ~30 km into one marker, named after the busiest GCAT site code in it
    clusters = []
    for k in keep:
        lon, lat = k[5]
        for c in clusters:
            if math.hypot(c["lat"] - lat, (c["lon"] - lon) * math.cos(math.radians(lat))) < 0.28: c["n"].append(k); break
        else: clusters.append({"lat": lat, "lon": lon, "n": [k]})
    sites, site_of = [], {}
    for c in clusters:
        codes = Counter(k[4] for k in c["n"]); top = codes.most_common(1)[0][0]
        name = next((CLUSTER_NAMES[s] for s, _ in codes.most_common() if s in CLUSTER_NAMES), None) or sitename.get(top, top)
        lat = sum(k[5][1] for k in c["n"]) / len(c["n"]); lon = sum(k[5][0] for k in c["n"]) / len(c["n"])
        # clusters that end up with the same display name (e.g. two Baikonur pad groups) share one marker
        if name in site_of:
            j = site_of[name]
        else:
            j = site_of[name] = len(sites); sites.append({"name": name, "lat": round(lat, 4), "lon": round(lon, 4), "_n": 0})
        for k in c["n"]: k[2]["_site"] = j
        sites[j]["_n"] += len(c["n"])
    for s in sites:
        az = next((v for kname, v in CORRIDORS.items() if kname in s["name"]), None)
        if az: s["az"] = list(az)
        s.pop("_n")
    # booster landings (Falcon only)
    W = wp_landings(cache); used = set(); matched = 0
    T0 = datetime(1957, 1, 1, tzinfo=timezone.utc)
    vehicles, vidx, out = [], {}, []
    for dt_, lv, r, code, s_, xy, ship in keep:
        land = None
        if lv.startswith(("Falcon 9", "Falcon Heavy")):
            best = None
            for k, w in enumerate(W):
                if k in used: continue
                dh = abs((w["dt"] - dt_).total_seconds()) / 3600
                if dh <= (2 if w["timed"] else 30) and (best is None or dh < best[0]): best = (dh, k)
            if best is None:
                for k, w in enumerate(W):
                    if k not in used and w["dt"].date() == dt_.date(): best = (0, k); break
            if best: used.add(best[1]); land = W[best[1]]["landing"] or None; matched += 1
        sfx = code[2:]
        oc = "P" if sfx else "S" if code[1] == "S" else "F"
        vname = "Starship" if ship else lv
        if vname not in vidx: vidx[vname] = len(vehicles); vehicles.append(vname)
        flight = r["Flight"] if r["Flight"] not in ("-", "") else r["Mission"]
        if flight in ("-", ""): flight = ""
        row = [round((dt_ - T0).total_seconds() / 86400, 2), classify(lv, r["Launch_Site"], dt_, is_nasa(r.get("Agency", ""))), r["_site"], flight, oc, vidx[vname]]
        if land or ship: row.append(land)
        if ship: row.append(1)  # Starship flight test flag
        out.append(row)
    world = Counter(); 
    for x in out: world[str(int(1957 + x[0] // 365.25))] += 0
    asof = re.search(r"(\d{4}) (\w{3})", updated)
    doc = {  # month/year only in the output except future schedules; t0 = Jan 1 of that year, UTC
        "meta": {"as_of": f"{asof.group(2)} {asof.group(1)}" if asof else "", "t0": T0.year, "generated": time.strftime("%b %Y"),
                 "fields": ["days_since_t0", "provider", "site", "flight", "outcome", "vehicle", "booster_landing?", "starship_test?"],
                 "providers": [{"key": p[0], "name": p[1], "short": p[2], "light": p[3], "dark": p[4]} for p in PROVIDERS],
                 "vehicles": vehicles, "dropped": dict(dropped), "no_coordinates": dict(nocoord),
                 "falcon_landing_matched": matched, "wiki_rows": len(W),
                 "sources": ["Jonathan McDowell, General Catalog of Artificial Space Objects (GCAT), planet4589.org/space/gcat",
                             "Wikipedia, List of Falcon 9 and Falcon Heavy launches (booster landings)",
                             "Natural Earth 110m land (public domain)"]},
        "sites": sites, "launches": out, "land": land_dots(cache),
    }
    Path(a.out).write_text(json.dumps(doc, separators=(",", ":"), ensure_ascii=False))
    c = Counter(PROVIDERS[x[1]][2] for x in out)
    print(f"wrote {a.out}: {len(out)} launches, {len(sites)} sites, GCAT updated {updated.replace('# Updated', '').strip()} ({time.time() - t_start:.1f}s)")
    print("  by provider:", dict(c.most_common()))
    print("  dropped:", dict(dropped), " no coordinates:", dict(nocoord))
    print(f"  Falcon landings matched {matched} of {sum(1 for x in out if vehicles[x[5]].startswith(('Falcon 9', 'Falcon Heavy')))}; wiki rows {len(W)}")

if __name__ == "__main__":
    main()
