#!/usr/bin/env python3
"""Build src/data/box_office.json from public sources (real data only; nothing estimated).

Film universe, per year Y in 1980..2025: every film listed in Wikipedia's
"List of Y box office number-one films in the United States" (weekend #1 films
plus that page's top-10 highest-grossing table; both cite Box Office Mojo).

Per film:
  * worldwide gross and production budget: the film's English Wikipedia infobox
    ("gross" and "budget"; USD only; a range like "$150-200 million" -> midpoint, flagged)
  * lead actor: first person linked in the infobox "starring" field (top-billed)
  * genres + critics' scores: Wikidata (P136 genre; P444 review score by Rotten Tomatoes / Metacritic)
  * year: first year page that lists the film
Inflation: BLS CPI-U, U.S. city average, all items (CUUR0000SA0), annual average of
monthly values, rebased to 2025 dollars.
Caches raw responses in .cache/box_office (or $BO_CACHE) so re-runs are light on the APIs.
"""
import json, os, re, sys, time, urllib.parse, urllib.request, hashlib, statistics

UA = {"User-Agent": "garyleeblevinsjr-site-build/1.0 (personal portfolio; one-off build)"}
CACHE = os.environ.get("BO_CACHE", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".cache", "box_office"))
Y0, Y1, BASE = 1980, 2025, 2025
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.makedirs(CACHE, exist_ok=True)

def fetch(url, data=None, headers=None):
    key = hashlib.sha1((url + (data or "")).encode()).hexdigest()
    p = os.path.join(CACHE, key + ".json")
    if os.path.exists(p):
        return json.load(open(p))
    h = dict(UA); h.update(headers or {})
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, data=data.encode() if data else None, headers=h)
            out = json.load(urllib.request.urlopen(req, timeout=90))
            json.dump(out, open(p, "w")); time.sleep(0.4)
            return out
        except Exception as e:
            print("retry", attempt, e, file=sys.stderr); time.sleep(3 * (attempt + 1))
    raise SystemExit("fetch failed: " + url)

def wp(params):
    params = dict(params, format="json", formatversion=2)
    return fetch("https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(params))

def strip(t):
    t = re.sub(r"<!--.*?-->", "", t, flags=re.S)
    t = re.sub(r"<ref[^>/]*/>", "", t)
    t = re.sub(r"<ref[^>]*>.*?</ref>", "", t, flags=re.S)
    return t

# ---------- 1. year pages ----------
def year_films(y):
    d = wp({"action": "parse", "page": f"List of {y} box office number-one films in the United States", "prop": "wikitext", "redirects": 1})
    t = strip(d["parse"]["wikitext"])
    films, dom = [], {}
    # tables: split by "{|"
    for tb in t.split("{|")[1:]:
        tb = tb.split("|}")[0]
        cap = tb[:400].lower()
        is_top = ("gross" in cap or "rental" in cap) and "rating" not in cap and "mpaa" not in cap
        is_weekly = "week" in tb[:600].lower() and not is_top
        if not (is_top or is_weekly):
            continue
        for row in tb.split("|-"):
            cells = re.split(r"\n\||\|\||\n!|!!", row)
            for ci, c in enumerate(cells):
                m = re.search(r"''\s*\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]\s*''", c)
                if not m:
                    continue
                # only the film cell: skip the notes column (long prose)
                if len(re.sub(r"\[\[[^\]]*\]\]|''|rowspan=\"?\d+\"?\s*\|?|style=\"[^\"]*\"\s*\|?|[†‡*]|\{\{[^}]*\}\}", "", c).strip()) > 6:
                    continue
                title = m.group(1).strip().replace("_", " ")
                title = title[0].upper() + title[1:]
                films.append(title)
                break
    return list(dict.fromkeys(films)), dom

# ---------- 2. infobox parsing ----------
MONEY = re.compile(r"(?:US\$|USD|\$)\s*([\d][\d,]*(?:\.\d+)?)(?:\s*(?:[-–—]|to)\s*\$?\s*([\d][\d,]*(?:\.\d+)?))?\s*(million|billion|mil\.|m\b)?", re.I)
def money(field):
    if not field:
        return None, False
    f = re.sub(r"&nbsp;|\{\{\s*(?:nbsp?|spaces?)\s*\}\}", " ", field, flags=re.I)
    f = re.sub(r"\{\{\s*(?:ndash|snd|mdash)\s*\}\}|&ndash;|−", "–", f, flags=re.I)
    f = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", f)
    # Some infoboxes list a gross (pre-incentive) and a net budget from UK tax filings; use the net figure.
    if re.search(r"\(\s*net", f, re.I):
        for seg in re.split(r"\n|<br\s*/?>", f):
            if re.search(r"\(\s*net", seg, re.I):
                f = seg; break
    f = re.sub(r"\{\{\s*(?:US\$|USD)\s*\|\s*([^}|]+)[^}]*\}\}", r"$\1", f, flags=re.I)
    f = re.sub(r"\{\{\s*(?:Estimation|est\.?|circa|c\.)\s*\|\s*([^}]*)\}\}", r"\1", f, flags=re.I)
    if re.search(r"[£€¥₹]|\b(?:CA|AU|A|C|NZ|HK|NT|R)\$", f) and not re.search(r"(?<![A-Z])\$|US\$", re.sub(r"\b(?:CA|AU|A|C|NZ|HK|NT|R)\$", "", f)):
        return None, False
    m = MONEY.search(re.sub(r"\b(?:CA|AU|A|C|NZ|HK|NT|R)\$[\d.,]+\s*(?:million|billion)?", "", f, flags=re.I))
    if not m:
        return None, False
    def num(s): return float(s.replace(",", ""))
    a = num(m.group(1)); b = num(m.group(2)) if m.group(2) else None
    unit = (m.group(3) or "").lower()
    mult = 1e9 if unit.startswith("b") else 1e6 if unit.startswith("m") else 1
    if mult == 1 and a < 1000:  # e.g. "$5" without unit is noise
        return None, False
    v = (a + b) / 2 if b else a
    return int(round(v * mult)), bool(b)

def infobox_field(t, name):
    m = re.search(r"\|\s*" + name + r"\s*=(.*?)(?=\n\s*\|\s*[a-z_ ]+\s*=|\n\}\})", t, flags=re.S | re.I)
    return m.group(1).strip() if m else ""

def lead(t):
    s = infobox_field(t, "starring")
    if not s:
        return None
    m = re.search(r"\[\[([^\]|#]+)(?:\|([^\]]*))?\]\]", s)
    if m:
        return m.group(1).strip()
    m = re.search(r"(?:\*|\|)\s*([A-Z][^\n|*<{}]+)", s) or re.match(r"\s*([A-Z][^\n|*<{},]+)", s)
    return m.group(1).strip() if m else None

def films_meta(titles):
    out = {}
    for i in range(0, len(titles), 40):
        batch = titles[i:i + 40]
        d = wp({"action": "query", "prop": "revisions|pageprops", "rvprop": "content", "rvslots": "main", "ppprop": "wikibase_item", "titles": "|".join(batch), "redirects": 1})
        q = d["query"]
        alias = {}
        for k in ("normalized", "redirects"):
            for r in q.get(k, []):
                alias[r["from"]] = r["to"]
        bypage = {}
        for p in q["pages"]:
            if p.get("missing") or "revisions" not in p:
                continue
            t = strip(p["revisions"][0]["slots"]["main"]["content"])
            gross, gr = money(infobox_field(t, "gross") or infobox_field(t, "box ?office"))
            budget, br = money(infobox_field(t, "budget"))
            bypage[p["title"]] = {"page": p["title"], "qid": p.get("pageprops", {}).get("wikibase_item"),
                                  "gross": gross, "gross_range": gr, "budget": budget, "budget_range": br, "lead": lead(t)}
        for tt in batch:
            x = tt
            for _ in range(3):
                x = alias.get(x, x)
            if x in bypage:
                out[tt] = bypage[x]
    return out

def leads_sentences(pages):
    """First sentence of each article (Wikipedia's own one-line description, e.g. 'a 1990 American Christmas comedy film')."""
    out = {}
    for i in range(0, len(pages), 20):
        d = wp({"action": "query", "prop": "extracts", "exintro": 1, "explaintext": 1, "exchars": 400, "exlimit": 20, "titles": "|".join(pages[i:i + 20])})
        for p in d["query"]["pages"]:
            out[p["title"]] = p.get("extract", "")
    return out

GENRE_WORDS = [  # keyword -> bucket, used on Wikipedia's first-sentence description
    (r"superhero", "Superhero"), (r"science[- ]fiction|sci-fi|fantasy|space opera|cyberpunk|dystopian|kaiju|monster|post-apocalyptic|time[- ]travel|fairy tale", "Sci-fi & fantasy"),
    (r"horror|slasher", "Horror"), (r"action|adventure|war|martial arts|disaster|spy|heist|swashbuckler|western", "Action & adventure"),
    (r"thriller|crime|mystery|detective|gangster|noir|legal|heist", "Thriller & crime"), (r"comedy|comedic|parody|satir|farce", "Comedy"),
    (r"drama|romance|romantic|biographical|biopic|musical|music|sports|historical|family|coming-of-age|teen|dance|documentary|concert", "Drama"),
]
def genre_from_sentence(s):
    m = re.search(r"\b(?:is|was) an? (.{0,140}?)\b(?:film|movie|picture)s?\b", s or "")
    if not m:
        return None
    ph = m.group(1).lower()
    if re.search(r"\banimat|stop-motion|computer-generated", ph) and "live-action" not in ph:
        return "Animation"
    if "superhero" in ph:
        return "Superhero"
    for rx, b in GENRE_WORDS:  # first bucket, in priority order, named anywhere in the description
        if re.search(rx, ph):
            return b
    return None

# ---------- 3. Wikidata ----------
def sparql(q):
    return fetch("https://query.wikidata.org/sparql", data=urllib.parse.urlencode({"query": q}),
                 headers={"Accept": "application/sparql-results+json", "Content-Type": "application/x-www-form-urlencoded"})["results"]["bindings"]

def wikidata(qids):
    gen, scores, labels, rel = {}, {}, {}, {}
    for i in range(0, len(qids), 150):
        vals = " ".join("wd:" + q for q in qids[i:i + 150])
        for b in sparql(f"SELECT ?f ?g ?gl WHERE {{ VALUES ?f {{ {vals} }} ?f wdt:P136 ?g. ?g rdfs:label ?gl FILTER(LANG(?gl)='en') }}"):
            f = b["f"]["value"].rsplit("/", 1)[1]
            gen.setdefault(f, []).append(b["gl"]["value"].lower())
        for b in sparql(f"SELECT ?f ?gl WHERE {{ VALUES ?f {{ {vals} }} ?f wdt:P31 ?g. ?g rdfs:label ?gl FILTER(LANG(?gl)='en') }}"):
            f = b["f"]["value"].rsplit("/", 1)[1]
            if "animat" in b["gl"]["value"].lower():
                gen.setdefault(f, []).append(b["gl"]["value"].lower())
        for b in sparql(f"SELECT ?f ?d ?pl WHERE {{ VALUES ?f {{ {vals} }} ?f p:P577 ?st. ?st ps:P577 ?d. OPTIONAL {{ ?st pq:P291 ?pl }} }}"):
            f = b["f"]["value"].rsplit("/", 1)[1]; y = int(b["d"]["value"][:4])
            us = b.get("pl", {}).get("value", "").endswith("/Q30")
            r = rel.setdefault(f, {"us": None, "min": None})
            if us: r["us"] = y if r["us"] is None else min(r["us"], y)
            r["min"] = y if r["min"] is None else min(r["min"], y)
        for b in sparql(f"""SELECT ?f ?by ?s ?t WHERE {{ VALUES ?f {{ {vals} }} ?f p:P444 ?st. ?st ps:P444 ?s; pq:P447 ?by.
             FILTER(?by IN (wd:Q105584, wd:Q150248)) OPTIONAL {{ ?st pq:P585 ?t }} OPTIONAL {{ ?st pq:P459 ?meth }}
             FILTER(!BOUND(?meth) || ?meth IN (wd:Q108403393, wd:Q108403540)) }}"""):
            f = b["f"]["value"].rsplit("/", 1)[1]; by = "rt" if b["by"]["value"].endswith("Q105584") else "mc"
            s = b["s"]["value"]; t = b.get("t", {}).get("value", "")
            m = re.match(r"\s*(\d+(?:\.\d+)?)\s*(%|/\s*100)\s*$", s)
            if not m:
                continue
            prev = scores.setdefault(f, {}).get(by)
            if not prev or t > prev[1]:
                scores[f][by] = (float(m.group(1)), t)
    return gen, scores, rel

# Sequel / follow-up: Wikidata P155 "follows" a film, or the Wikipedia intro calls it a sequel, prequel,
# spin-off, or numbered installment.
SEQ = re.compile(r"\b(?:sequel|prequel) to\b|\bspin-?off (?:of|from|to)\b|\b(?:second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|\d+(?:st|nd|rd|th)) (?:installment|instalment|film|entry|main film|feature film|theatrical film)\b", re.I)

def series_info(qids):
    """Sequel / franchise flags from Wikidata: P155 'follows' (a prior film it follows) and P179 'part of the series'."""
    fol, ser = set(), set()
    for i in range(0, len(qids), 150):
        vals = " ".join("wd:" + q for q in qids[i:i + 150])
        for b in sparql(f"SELECT DISTINCT ?f WHERE {{ VALUES ?f {{ {vals} }} ?f wdt:P155 ?p. ?p wdt:P31/wdt:P279* wd:Q11424. }}"):
            fol.add(b["f"]["value"].rsplit("/", 1)[1])
        for b in sparql(f"SELECT DISTINCT ?f WHERE {{ VALUES ?f {{ {vals} }} ?f wdt:P179 ?s. }}"):
            ser.add(b["f"]["value"].rsplit("/", 1)[1])
    return fol, ser

# Primary genre: first bucket (in this priority order) matched by any Wikidata genre tag.
BUCKETS = [
    ("Animation", r"^(?!live-action).*animat"),
    ("Superhero", r"superhero"),
    ("Sci-fi & fantasy", r"science fiction|fantasy|space opera|cyberpunk|dystopian|kaiju|monster|post-apocalyptic|time.travel"),
    ("Horror", r"horror|slasher|supernatural"),
    ("Action & adventure", r"action|adventure|war film|martial arts|disaster|spy|heist|swashbuckler|western"),
    ("Thriller & crime", r"thriller|crime|mystery|detective|gangster|neo-noir|noir|legal"),
    ("Comedy", r"comedy|parody|satir"),
    ("Drama", r"drama|romance|romantic|biographical|musical|music film|sports|historical|family|coming-of-age|teen|dance"),
]
def primary(tags):
    for name, rx in BUCKETS:
        if any(re.search(rx, g) for g in tags):
            return name
    return "Other"

# ---------- 4. CPI ----------
def cpi():
    vals = {}
    for a in range(Y0, BASE + 1, 10):
        b = min(a + 9, BASE)
        d = fetch("https://api.bls.gov/publicAPI/v1/timeseries/data/",
                  data=json.dumps({"seriesid": ["CUUR0000SA0"], "startyear": str(a), "endyear": str(b)}),
                  headers={"Content-Type": "application/json"})
        for r in d["Results"]["series"][0]["data"]:
            if r["period"].startswith("M") and r["period"] != "M13" and re.match(r"^[\d.]+$", r["value"]):
                vals.setdefault(int(r["year"]), []).append(float(r["value"]))
    ann = {y: sum(v) / len(v) for y, v in vals.items() if len(v) >= 11}
    missing = [y for y in range(Y0, BASE + 1) if y not in ann]
    if missing:
        print("CPI months missing for", missing, file=sys.stderr)
    return {y: round(ann[y], 3) for y in sorted(ann)}

def main():
    years, all_titles, domestic = {}, [], {}
    for y in range(Y0, Y1 + 1):
        f, dom = year_films(y)
        years[y] = f; domestic[y] = dom; all_titles += f
        print(y, len(f), "films,", len(dom), "domestic top-10", file=sys.stderr)
    first_year = {}
    for y in range(Y0, Y1 + 1):
        for t in years[y]:
            first_year.setdefault(t, y)
    uniq = list(first_year)
    meta = films_meta(uniq)
    by_page = {}
    for t in uniq:
        m = meta.get(t)
        if not m:
            print("no page:", t, file=sys.stderr); continue
        if m["page"] in by_page:
            by_page[m["page"]]["year"] = min(by_page[m["page"]]["year"], first_year[t]); continue
        rec = dict(m, title=t, year=first_year[t])
        by_page[m["page"]] = rec
    qids = [r["qid"] for r in by_page.values() if r["qid"]]
    gen, scores, rel = wikidata(qids)
    fol, ser = series_info(qids)
    sent = leads_sentences([r["page"] for r in by_page.values()])
    films, dropped = [], []
    for r in by_page.values():
        # Year = first year the film appears on these lists. Films released 4+ years earlier are re-releases
        # (dropped), as are late-1979 releases still charting in early 1980.
        rr = rel.get(r["qid"], {}); wy = rr.get("us") or rr.get("min")
        if wy is not None and (wy < r["year"] - 3 or (r["year"] == Y0 and wy < Y0)):
            dropped.append(r["page"]); continue
        tags = gen.get(r["qid"], [])
        sc = scores.get(r["qid"], {})
        name = re.sub(r"\s*\((?:\d{4} )?(?:American )?(?:animated )?film\)$", "", r["page"])
        ld = re.sub(r"\s*\([^)]*\)$", "", r["lead"]).strip() if r["lead"] else None
        films.append({"t": name, "y": r["year"], "g": genre_from_sentence(sent.get(r["page"])) or primary(tags), "gs": 1 if genre_from_sentence(sent.get(r["page"])) else 0,
                      "d": (re.search(r"\b(?:is|was) an? (.{0,140}?\b(?:film|movie|picture))", sent.get(r["page"], "")) or [None, None])[1],
                      "lead": ld, "ww": r["gross"], "bud": r["budget"],
                      "rng": 1 if (r["budget_range"] or r["gross_range"]) else 0,
                      "rt": sc.get("rt", (None,))[0], "sq": 1 if (r["qid"] in fol or SEQ.search(sent.get(r["page"], ""))) else 0, "fr": 1 if (r["qid"] in fol or r["qid"] in ser) else 0})
    films.sort(key=lambda f: (f["y"], -(f["ww"] or 0)))
    c = cpi()
    out = {"generated": time.strftime("%Y-%m"), "years": [Y0, Y1], "cpi_base": BASE, "cpi": c,
           "genres": [b[0] for b in BUCKETS] + ["Other"], "sources": {"films": "Wikipedia: List of YYYY box office number-one films in the United States (1980-2025)", "gross_budget_lead": "Wikipedia film infoboxes", "genre": "Wikipedia first-sentence description; Wikidata P136 fallback", "critics": "Wikidata P444 (Rotten Tomatoes)", "cpi": "BLS CPI-U CUUR0000SA0"}, "films": films}
    p = os.path.join(ROOT, "src", "data", "box_office.json")
    json.dump(out, open(p, "w"), separators=(",", ":"), ensure_ascii=False)
    n = len(films)
    print("dropped as re-release / pre-range:", dropped, file=sys.stderr)
    print(f"wrote {p}: {n} films; ww {sum(1 for f in films if f['ww'])}; budget {sum(1 for f in films if f['bud'])}; "
          f"lead {sum(1 for f in films if f['lead'])}; rt {sum(1 for f in films if f['rt'] is not None)}; "
          f"genre from Wikipedia description {sum(f['gs'] for f in films)}", file=sys.stderr)

if __name__ == "__main__":
    main()
