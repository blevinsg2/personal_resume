#!/usr/bin/env python3
"""Build the static site: src/partials + src/pages + src/data/work.json -> public/.

Usage:  python3 build.py
No dependencies beyond the Python 3 standard library.
"""
import html, json, re, time
from pathlib import Path

ROOT = Path(__file__).parent
SRC, OUT = ROOT / "src", ROOT / "public"
SITE_URL = "https://garyleeblevinsjr.com"
VERSION = time.strftime("%Y%m%d%H%M")

# ---------------------------------------------------------------- icons
I = lambda d, extra="": f'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"{extra}>{d}</svg>'
ICONS = {
    "github": '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" class="gh-mark"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>',
    "sun": I('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', ' class="sun"'),
    "moon": I('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>', ' class="moon"'),
    "menu": I('<path d="M4 8h16M4 16h16"/>', ' class="bars-ic"') + I('<path d="M6 6l12 12M18 6 6 18"/>', ' class="x"'),
    "chev": '<svg class="chev" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5"/></svg>',
    "arrow": I('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    "user": I('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
    "layers": I('<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>'),
    "award": I('<circle cx="12" cy="9" r="6"/><path d="m8.5 14-1.5 7 5-3 5 3-1.5-7"/>'),
    "folder": I('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>'),
    "dash": I('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>'),
    "cpu": I('<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/><path d="M10 10h4v4h-4z"/>'),
    "youtube": '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12 31 31 0 0 0 1 16.8a3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8ZM9.75 15.02V8.98L15.5 12l-5.75 3.02Z"/></svg>',
    "xlogo": '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.77L17.75 3Zm-1.08 16.17h1.7L7.4 4.73H5.58l11.09 14.44Z"/></svg>',
    "globe": I('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
    "ext": I('<path d="M7 17 17 7M9 7h8v8"/>'),
    "play": '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5-11-6.5Z"/></svg>',
    "bulb": I('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z"/>'),
    "pen": I('<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>'),
    "mic": I('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
    "board": I('<rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="M8 21l2-4M16 21l-2-4"/><path d="m7 8 2 2m0-2-2 2"/><circle cx="16" cy="12" r="1.6"/><path d="M10 11c2-2 3-2 4.5-.5"/>'),
    "shield": I('<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>'),
    "cal": I('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
    "spark": I('<path d="M3 17 9 11l4 4 8-8"/><path d="M15 7h6v6"/>'),
    "pin": I('<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/>'),
    "briefcase": I('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
    "clock": I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    "star": I('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9Z"/>'),
    "users": I('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>'),
    "compass": I('<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5Z"/>'),
    "alert": I('<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>'),
    "check": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5 10 17.5 19 7.5"/></svg>',
    "send": I('<path d="M5 12h14M13 6l6 6-6 6"/>', ' class="arr"'),
}

# ---------------------------------------------------------------- nav
NAV = [
    {"label": "Home", "href": "/", "key": "home"},
    {"label": "About", "key": "about", "items": [
        {"label": "Profile", "href": "/about/profile/", "desc": "Who I am and how I work", "icon": "user"},
        {"label": "Skills", "href": "/about/skills/", "desc": "Tools, platforms and disciplines", "icon": "layers"},
        {"label": "Education & Honors", "href": "/about/education/", "desc": "Winthrop University and awards", "icon": "award"},
    ]},
    {"label": "Experience", "href": "/experience/", "key": "experience"},
    {"label": "Work", "key": "work", "items": [
        {"label": "Projects", "href": "/work/projects/", "desc": "Case studies with live demos", "icon": "folder", "badge": "New"},
        {"label": "AI Projects", "href": "/work/ai-projects/", "desc": "Built with AI, end to end", "icon": "cpu", "badge": "New"},
        {"label": "Dashboards", "href": "/work/dashboards/", "desc": "BI builds and design notes", "icon": "dash", "badge": "New"},
        {"label": "Interactive Visuals", "href": "/work/visuals/", "desc": "A playground for fun data pieces", "icon": "spark", "badge": "New"},
    ]},
    {"label": "Contact", "href": "/contact/", "key": "contact"},
]

AC = ' aria-current="page"'

def is_cur(path, href):
    return path == href or (href != "/" and path.startswith(href))

def esc(s): return html.escape(s, quote=True)

def desktop_menu(path):
    out = []
    for n in NAV:
        if "items" in n:
            cur = any(is_cur(path, i["href"]) for i in n["items"])
            links = "".join(
                f'<li><a href="{i["href"]}"{AC if is_cur(path, i["href"]) else ""}>'
                f'<span class="dd-icon">{ICONS[i["icon"]]}</span>'
                f'<span><span class="dd-title">{esc(i["label"])}</span><span class="dd-desc">{esc(i["desc"])}</span></span>'
                f'{"<span class=badge>" + i["badge"] + "</span>" if i.get("badge") else "<span></span>"}</a></li>'
                for i in n["items"])
            out.append(
                f'<li class="has-dd"><button class="menu-trigger{" is-current" if cur else ""}" type="button" aria-expanded="false" aria-haspopup="true">'
                f'{esc(n["label"])} {ICONS["chev"]}</button><ul class="dropdown">{links}</ul></li>')
        else:
            cur = ' aria-current="page"' if path == n["href"] else ""
            out.append(f'<li><a class="menu-link" href="{n["href"]}"{cur}>{esc(n["label"])}</a></li>')
    return "\n        ".join(out)

def mobile_menu(path):
    out = []
    for idx, n in enumerate(NAV):
        if "items" in n:
            cur = any(is_cur(path, i["href"]) for i in n["items"])
            links = "".join(
                f'<a href="{i["href"]}"{AC if is_cur(path, i["href"]) else ""}><span class="t">{esc(i["label"])}</span>'
                f'{"<span class=badge>" + i["badge"] + "</span>" if i.get("badge") else ""}</a>' for i in n["items"])
            out.append(
                f'<li><button class="m-trigger" type="button" aria-expanded="{"true" if cur else "false"}" aria-controls="m-sub-{idx}">{esc(n["label"])} {ICONS["chev"]}</button>'
                f'<div class="m-sub" id="m-sub-{idx}"><div>{links}</div></div></li>')
        else:
            cur = ' aria-current="page"' if path == n["href"] else ""
            out.append(f'<li><a class="m-link" href="{n["href"]}"{cur}>{esc(n["label"])}</a></li>')
    return "\n      ".join(out)

# ---------------------------------------------------------------- work cards
PLACEHOLDER_SVGS = [
    '<svg viewBox="0 0 320 200" preserveAspectRatio="none" aria-hidden="true"><g class="ph-bar"><rect x="40" y="120" width="22" height="50" rx="3"/><rect x="74" y="96" width="22" height="74" rx="3"/><rect x="108" y="108" width="22" height="62" rx="3"/><rect x="142" y="78" width="22" height="92" rx="3"/><rect x="176" y="88" width="22" height="82" rx="3"/><rect x="210" y="60" width="22" height="110" rx="3"/><rect x="244" y="70" width="22" height="100" rx="3"/></g><path class="ph-acc" d="M40 104 C 90 96, 120 86, 160 70 S 230 48, 280 40" fill="none" stroke-width="2" stroke-linecap="round"/></svg>',
    '<svg viewBox="0 0 320 200" preserveAspectRatio="none" aria-hidden="true"><g class="ph-bar"><rect x="28" y="28" width="120" height="58" rx="6"/><rect x="160" y="28" width="132" height="58" rx="6"/><rect x="28" y="98" width="264" height="74" rx="6"/></g><path class="ph-acc" d="M44 150 L84 136 L120 142 L160 120 L200 126 L240 108 L276 112" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    '<svg viewBox="0 0 320 200" preserveAspectRatio="none" aria-hidden="true"><g class="ph-line" fill="none" stroke-width="1"><circle cx="110" cy="100" r="58"/><circle cx="110" cy="100" r="36"/></g><path class="ph-acc" d="M110 42 A58 58 0 0 1 166 114" fill="none" stroke-width="3" stroke-linecap="round"/><g class="ph-bar"><rect x="200" y="62" width="88" height="10" rx="5"/><rect x="200" y="86" width="64" height="10" rx="5"/><rect x="200" y="110" width="76" height="10" rx="5"/><rect x="200" y="134" width="48" height="10" rx="5"/></g></svg>',
]

def img_size(src):
    from PIL import Image
    with Image.open(OUT / src.lstrip("/")) as im: return im.size

def card_html(item, i):
    tags = "".join(f'<span class="tag">{esc(t)}</span>' for t in item.get("tags", []))
    media = (f'<img src="{esc(item["image"])}" alt="{esc(item.get("image_alt", item["title"]))}" width="{img_size(item["image"])[0]}" height="{img_size(item["image"])[1]}" loading="lazy" decoding="async">'
             if item.get("image") else PLACEHOLDER_SVGS[i % 3])
    inner = (f'<div class="card-media">{media}</div><div class="card-body">'
             f'<div class="card-meta"><span>{esc(item.get("kind", ""))}</span><span>{"<span class=badge>" + esc(item["badge"]) + "</span> " if item.get("badge") else ""}{esc(str(item.get("year", "")))}</span></div>'
             f'<h3>{esc(item["title"])}</h3><p>{esc(item.get("summary", ""))}</p>'
             f'{"<div class=tags>" + tags + "</div>" if tags else ""}</div>')
    if item.get("url"):
        ext = item["url"].startswith("http")
        attrs = ' target="_blank" rel="noopener"' if ext else ""
        return f'<a class="card reveal" style="--d:{i*0.06:.2f}s" href="{esc(item["url"])}"{attrs}>{inner}</a>'
    return f'<article class="card reveal" style="--d:{i*0.06:.2f}s">{inner}</article>'

def ghost_cards(kind, n=3):
    labels = {"ai_projects": "AI project", "projects": "Case study", "dashboards": "Dashboard", "visuals": "Interactive"}
    out = []
    for i in range(n):
        out.append(
            f'<article class="card ghost reveal" style="--d:{i*0.06:.2f}s" aria-label="Placeholder">'
            f'<div class="card-media">{PLACEHOLDER_SVGS[i % 3]}</div><div class="card-body">'
            f'<div class="card-meta"><span>{labels[kind]} · 0{i+1}</span><span>In progress</span></div>'
            f'<h3>Coming soon</h3><div class="skel" style="width:92%"></div><div class="skel" style="width:64%"></div></div></article>')
    return "".join(out)

def work_grid(kind):
    data = json.loads((SRC / "data" / "work.json").read_text())
    items = data.get(kind, [])
    cards = "".join(card_html(it, i) for i, it in enumerate(items))
    if not items:   # placeholders only on sections with nothing to show yet
        cards += ghost_cards(kind, 3)
    return cards

# ---------------------------------------------------------------- pages
PAGES = [
    # (source file, output path, url path, title, description)
    ("home.html", "index.html", "/", "Gary Blevins — Analytics & Business Intelligence Leader",
     "Gary Lee Blevins Jr. is an analytics and business intelligence leader who turns complex business challenges into scalable data, automation, and reporting solutions."),
    ("profile.html", "about/profile/index.html", "/about/profile/", "Profile — Gary Blevins",
     "Results-driven analytics and BI leader with experience across risk, finance, operations, and customer-facing organizations."),
    ("skills.html", "about/skills/index.html", "/about/skills/", "Skills — Gary Blevins",
     "Power BI, Tableau, SQL, Python, Alteryx, Teradata, data governance, ETL, Copilot and data agents, and more."),
    ("education.html", "about/education/index.html", "/about/education/", "Education & Honors — Gary Blevins",
     "Bachelor of Economics from Winthrop University. Eleven consecutive years as a Leading Performer."),
    ("experience.html", "experience/index.html", "/experience/", "Experience — Gary Blevins",
     "Fifteen years of analytics and BI leadership at a national auto insurer, a DVD kiosk rental company, a facilities software company, and a home-improvement retailer."),
    ("work.html", "work/projects/index.html", "/work/projects/", "Projects — Gary Blevins",
     "Case studies from Gary Blevins' analytics work: enterprise risk data at a national auto insurer, plus interactive demos on staffing to demand, sales performance, incentives, and delivery and field-service routing."),
    ("work.html", "work/ai-projects/index.html", "/work/ai-projects/", "AI Projects — Gary Blevins",
     "Projects Gary Blevins has built with AI, end to end, starting with ChalkTalkFB."),
    ("chalktalkfb.html", "work/ai-projects/chalktalkfb/index.html", "/work/ai-projects/chalktalkfb/", "ChalkTalkFB — an AI-built football Shorts channel · Gary Blevins",
     "ChalkTalkFB is a daily YouTube Shorts channel that teaches one football concept in under 60 seconds, built with AI end to end by Gary Blevins."),
    ("agentic-trading.html", "work/ai-projects/agentic-trading/index.html", "/work/ai-projects/agentic-trading/", "The Wolf of Wall Bot: an AI trading bot experiment · Gary Blevins",
     "Just for fun: Gary Blevins hands a small brokerage account to an AI bot with two personalities, Jordan Belfort mode and Warren Buffett mode, and tracks them week by week against SPY and a savings rate. Not financial advice."),
    ("polo-finder.html", "work/ai-projects/polo-finder/index.html", "/work/ai-projects/polo-finder/", "Polo Finder — an AI-built golf polo reselling pipeline · Gary Blevins",
     "Polo Finder: hunting thrift stores for golf polos from courses across the U.S., with an AI-built pipeline for routes, pricing, photo cleanup, and listings. A work in progress by Gary Blevins."),
    ("work.html", "work/dashboards/index.html", "/work/dashboards/", "Dashboards — Gary Blevins",
     "Dashboard and BI design work by Gary Blevins, rebuilt with example data: a kiosk keep-or-close profitability dashboard and the AIPD sales prospecting dashboard."),
    ("keep-or-close.html", "work/dashboards/keep-or-close/index.html", "/work/dashboards/keep-or-close/", "Keep or close: a kiosk profitability dashboard · Gary Blevins",
     "A rebuild of Gary Blevins' kiosk profitability dashboard from his DVD kiosk rental work with fictional example data: rentals, content mix, restocking and service cost by road miles, and Keep, Watch, or Close verdicts by market zone."),
    ("work.html", "work/visuals/index.html", "/work/visuals/", "Interactive Visuals — Gary Blevins",
     "A playground of interactive data pieces by Gary Blevins: every orbital rocket launch since 1957 on a 3D globe, 45 years of box office by genre, lead actor, and budget, a 2026 NFL QB network graph, plus his work case studies."),
    ("launch-globe.html", "work/visuals/launch-globe/index.html", "/work/visuals/launch-globe/", "Launch Globe: every orbital launch since 1957 · Gary Blevins",
     "A just-for-fun animated 3D globe of every orbital launch attempt since Sputnik, from SpaceX and Rocket Lab to Baikonur and Long March, plus upcoming launches with links to watch live. Data from GCAT, Wikipedia, and The Space Devs."),
    ("qb-network.html", "work/visuals/qb-network/index.html", "/work/visuals/qb-network/", "QB Network: who catches Jayden Daniels' passes? · Gary Blevins",
     "An interactive, force-directed network of every 2026 NFL completion: Jayden Daniels in the center, his receivers, and every other passer who completed a pass to them. Data from nflverse."),
    ("box-office.html", "work/visuals/box-office/index.html", "/work/visuals/box-office/", "Box office by genre, lead actor, and budget, 1980–2025 · Gary Blevins",
     "An interactive look at 45 years of chart-topping movies: worldwide box office by genre and lead actor, what it costs to make them, nominal or inflation-adjusted. Real data from Wikipedia, Wikidata, and BLS CPI-U."),
    ("traffic-routing.html", "work/projects/routing/index.html", "/work/projects/routing/", "Routing case study: closer isn't always quicker · Gary Blevins",
     "A case study from Gary Blevins' delivery and field-service routing work at a home-improvement retailer and a DVD kiosk rental company: real DC and Richmond traffic counts, OSRM road routes, and a service-tech route planner."),
    ("risk-data.html", "work/projects/risk-data-transformation/index.html", "/work/projects/risk-data-transformation/", "From manual pulls to one risk story: ERM data at a national auto insurer · Gary Blevins",
     "How Gary Blevins took Enterprise Risk Management reporting at a national auto insurer from a two-day weekly manual process to automated hourly refreshes, then built data quality dashboards, a semantic model with Copilot data agents, and the Risk & Control Hub."),
    ("staffing.html", "work/projects/staffing-to-demand/index.html", "/work/projects/staffing-to-demand/", "Staffing to demand: a retail labor case study · Gary Blevins",
     "Part 1 of Gary Blevins' home-improvement retail case study, on staffing to customer demand and intraday payroll: an interactive example store day where you staff to customer traffic and watch coverage, sales, and payroll respond."),
    ("sales-performance.html", "work/projects/sales-performance/index.html", "/work/projects/sales-performance/", "Sales performance: goals, scorecards, and coaching · Gary Blevins",
     "Part 2 of Gary Blevins' home-improvement retail case study: an interactive example store where forecasts cascade into specialist goals, 12-month scorecards, and a coaching opportunity list."),
    ("incentives.html", "work/projects/incentives/index.html", "/work/projects/incentives/", "Incentives: a share of the win · Gary Blevins",
     "Part 3 of Gary Blevins' home-improvement retail case study: how sales performance expanded into profit-share bonuses, with an interactive example bonus pool, unlock targets, and cliff vs tiered payout design."),
    ("aipd.html", "work/dashboards/aipd/index.html", "/work/dashboards/aipd/", "AIPD dashboard: who to call next · Gary Blevins",
     "A rebuild of the AIPD dashboard Gary Blevins built at a facilities software company, with fictional example data: CRM customers matched to a market list and enriched with third-party data, tailored to each account executive's territory."),
    ("contact.html", "contact/index.html", "/contact/", "Contact — Gary Blevins",
     "Get in touch with Gary Blevins, analytics and BI leader based in King George, Virginia."),
    ("contact-thanks.html", "contact/thanks/index.html", "/contact/thanks/", "Message sent — Gary Blevins",
     "Thanks for reaching out to Gary Blevins."),
    ("404.html", "404.html", "/404.html", "Page not found — Gary Blevins", "This page doesn't exist."),
]

WORK_META = {
    "/work/projects/": ("projects", "Projects", "Case studies you can <span class=\"serif accent\">try</span>.",
                        "Problems from my work: what the problem was, how I approached it, and why it matters. Most are rebuilt around an interactive demo."),
    "/work/ai-projects/": ("ai_projects", "AI Projects", "Built with <span class=\"serif accent\">AI</span>.",
                           "Things I've built with AI doing the heavy lifting, and I'm proud of it. From the idea to the daily automation that keeps them running."),
    "/work/dashboards/": ("dashboards", "Dashboards", "Dashboards, <span class=\"serif accent\">designed</span>.",
                          "How I build BI that people actually open: layout, KPI design, and data foundations, rebuilt with example data so you can click around."),
    "/work/visuals/": ("visuals", "Interactive Visuals", "Data you can <span class=\"serif accent\">explore</span>.",
                       "A smaller playground for fun data pieces. Drag them, zoom them, poke at the data. The work case studies are listed here too."),
}

JSON_LD = {
    "@context": "https://schema.org", "@type": "Person",
    "name": "Gary Lee Blevins Jr.", "alternateName": "Gary Blevins",
    "url": SITE_URL + "/", "image": SITE_URL + "/assets/img/gary/gary-640.jpg", "jobTitle": "Principal Finance Data Analyst",
    "description": "Analytics and business intelligence leader who turns complex business challenges into scalable data, automation, and reporting solutions.",
    "alumniOf": {"@type": "CollegeOrUniversity", "name": "Winthrop University"},
    "address": {"@type": "PostalAddress", "addressLocality": "King George", "addressRegion": "VA", "addressCountry": "US"},
    "knowsAbout": ["Business Intelligence", "Data Analytics", "Power BI", "Tableau", "SQL", "Python", "Data Governance", "Project Management"],
}


# ---------------------------------------------------------------- Retail case-study series (Part 1 / 2 / 3)
SERIES = [("/work/projects/staffing-to-demand/", "Staffing to demand", "The right people on the floor at the right hours."),
          ("/work/projects/sales-performance/", "Sales performance", "What was being sold, and by whom."),
          ("/work/projects/incentives/", "Incentives", "A share of the profits when the store and department win.")]

def series_ctx(path):
    idx = [p for p, _, _ in SERIES].index(path)
    top = "".join(f'<a href="{p}"{AC if i == idx else ""}><span>Part {i+1}</span>{esc(t)}</a>' for i, (p, t, _) in enumerate(SERIES))
    top = f'<nav class="series-strip reveal" style="--d:.02s" aria-label="Retail case study series">{top}</nav>'
    cards = []
    if idx > 0:
        p, t, d = SERIES[idx - 1]
        cards.append(f'<a class="prev" href="{p}"><span>← Previous · Part {idx}</span><b>{esc(t)}</b><small>{esc(d)}</small></a>')
    else:
        cards.append(f'<div class="series-here"><span>You\'re reading · Part 1 of 3</span><b>{esc(SERIES[0][1])}</b><small>{esc(SERIES[0][2])}</small></div>')
    if idx < len(SERIES) - 1:
        p, t, d = SERIES[idx + 1]
        cards.append(f'<a class="next" href="{p}"><span>Next · Part {idx+2} →</span><b>{esc(t)}</b><small>{esc(d)}</small></a>')
    else:
        cards.append(f'<a class="next" href="/work/projects/"><span>Series complete · All projects →</span><b>More case studies</b><small>Routing, delivery, and field service, plus AI builds.</small></a>')
    bottom = ('<section class="section" aria-label="Case study series"><div class="wrap"><div class="series reveal">'
              + "".join(cards) + "</div></div></section>")
    return {"series_top": top, "series_bottom": bottom}

# ---------------------------------------------------------------- Traffic & routing
TRAFFIC_MODELED = True    # illustrative time-of-day drive times in the routing demo (approved Oct 2026; labelled Illustrative)

def traffic_ctx():
    t = json.loads((SRC / "data" / "traffic.json").read_text())
    r = json.loads((SRC / "data" / "routes.json").read_text())
    ctx = {"tr_year": t["year"], "tr_updated": esc(t["updated"]), "tr_modeled": "1" if TRAFFIC_MODELED else "0",
           "tr_modeled_controls": "", "tr_modeled_note": ""}
    if TRAFFIC_MODELED:
        ctx["tr_modeled_controls"] = ('<div class="tr-modeled"><span class="tr-badge">Illustrative</span><label for="tr-depart">Weekday departure</label>'
            '<input type="range" id="tr-depart" min="0" max="23" value="17"><output id="tr-depart-out" for="tr-depart">5 PM</output></div>')
        ctx["tr_modeled_note"] = (" <b>Illustrative:</b> drive times by departure hour are estimated from real {y} TMAS weekday counts"
            " via a standard volume-delay formula with assumed parameters, not measured speeds.").format(y=t["year"])
    return ctx

# ---------------------------------------------------------------- QB network (data: scripts/build_qb_network.py)
def qb_through(m):
    pw = m.get("partial_week")
    if pw:
        return f'through Week {pw["week"]} (in progress, {pw["games"]} of {pw["of"]} games in)'
    return f'through Week {m.get("last_complete_week") or m["latest_week"]}'

NFL_NICK = {"ARI": "Cardinals", "ATL": "Falcons", "BAL": "Ravens", "BUF": "Bills", "CAR": "Panthers", "CHI": "Bears",
    "CIN": "Bengals", "CLE": "Browns", "DAL": "Cowboys", "DEN": "Broncos", "DET": "Lions", "GB": "Packers", "HOU": "Texans",
    "IND": "Colts", "JAX": "Jaguars", "KC": "Chiefs", "LA": "Rams", "LAR": "Rams", "LAC": "Chargers", "LV": "Raiders",
    "MIA": "Dolphins", "MIN": "Vikings", "NE": "Patriots", "NO": "Saints", "NYG": "Giants", "NYJ": "Jets", "PHI": "Eagles",
    "PIT": "Steelers", "SEA": "Seahawks", "SF": "49ers", "TB": "Buccaneers", "TEN": "Titans", "WAS": "Commanders"}
NUM_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"]
def nword(n): return NUM_WORDS[n] if 0 <= n <= 10 else str(n)
def cap(t): return t[:1].upper() + t[1:]
def article(pos): return ("an " if pos and pos[0] in "AEFHILMNORSX" else "a ") + (pos or "player")
def name_list(ns):
    return ns[0] if len(ns) == 1 else (" and ".join(ns) if len(ns) == 2 else ", ".join(ns[:-1]) + ", and " + ns[-1])

def qb_shape(d, qb):
    """Plain-text 'What you learn from the shape' lines for one center QB. Mirrored in assets/js/qbnet.js (shapeTexts)."""
    P, E = d["players"], d["edges"]
    first = P[qb]["name"].split()[0]
    firstp = first + ("'" if first.endswith("s") else "'s")
    rec = {e[1]: e for e in E if e[0] == qb}
    oth = [e for e in E if e[1] in rec and e[0] != qb]
    passers_of = {r: {qb} for r in rec}
    tot = {r: rec[r][2] for r in rec}
    reach, pcomp = {}, {}
    for e in oth:
        passers_of[e[1]].add(e[0]); tot[e[1]] += e[2]
        reach.setdefault(e[0], set()).add(e[1]); pcomp[e[0]] = pcomp.get(e[0], 0) + e[2]
    allp = {qb} | set(reach)
    teams = set(t for x in allp for t in P[x]["teams"])
    nick = (NFL_NICK.get(next(iter(teams)), next(iter(teams))) + " ") if len(teams) == 1 else ""
    tail_h = " At work, it's the person or system everything runs through."
    m = max(len(v) for v in passers_of.values())
    if m < 2:
        hubs = f"Big, well-connected nodes. So far every one of {firstp} receivers has caught passes from him alone, so {first} is the only hub.{tail_h}"
    else:
        hs = sorted((r for r in rec if len(passers_of[r]) == m), key=lambda r: (-tot[r], P[r]["name"]))
        cnt = ("all " + nword(m)) if m == len(allp) else (nword(m) + " different")
        frm = f"caught passes from {cnt} {nick}passers"
        if len(hs) <= 3:
            who = name_list([P[r]["name"] for r in hs]) + (" each " if len(hs) > 1 else " ") + frm
        else:
            who = f'{cap(nword(len(hs)))} receivers, led by {P[hs[0]]["name"]} and {P[hs[1]]["name"]}, {frm}'
        hubs = f"Big, well-connected nodes. {who}.{tail_h}"
    if not reach:
        bridges = f"Nodes that reach the same people as the center. No one else has thrown to {firstp} receivers yet, so this network has no bridges, like a team with no backup."
    else:
        center_teams = set(P[qb]["teams"])
        def tag(x):
            bits = [] if P[x]["pos"] == "QB" else [P[x]["pos"] or "non-QB"]
            if not set(P[x]["teams"]) & center_teams: bits.append("/".join(P[x]["teams"]))
            return P[x]["name"] + (f" ({', '.join(bits)})" if bits else "")
        bs = sorted(reach, key=lambda x: (-len(reach[x]), -pcomp[x], P[x]["name"]))
        t = f"{tag(bs[0])} reached {nword(len(reach[bs[0]]))} of {firstp} {nword(len(rec))} receivers"
        if len(bs) > 1: t += f", and {tag(bs[1])} reached {nword(len(reach[bs[1]]))}"
        bridges = f"Nodes that reach the same people as the center. {t}, like a team where work routes through a backup when the key person is out. Better to see that before you need it."
    tail_o = " At work, that's the one-off vendor or the report nobody else uses, worth a cleanup or a closer look."
    ones = sorted((r for r in rec if rec[r][2] == 1), key=lambda r: (len(passers_of[r]), P[r]["name"]))
    if ones:
        r = ones[0]
        line = "hanging by a single thin line" if len(passers_of[r]) == 1 else "on a thin line to the center"
        more = f" {cap(nword(len(ones)))} of his receivers have just one." if len(ones) > 1 else ""
        outliers = f'Small nodes {line}, like {P[r]["name"]}, {article(P[r]["pos"])} with one catch from {first}.{more}{tail_o}'
    else:
        outliers = f"Small nodes hanging by a single thin line. None of {firstp} receivers has just one catch from him yet; everyone on this graph has at least two.{tail_o}"
    return {"hubs": hubs, "bridges": bridges, "outliers": outliers}


# ---------------------------------------------------------------- Box office (data: scripts/build_box_office.py)
def bo_ctx():
    import statistics as S
    d = json.loads((SRC / "data" / "box_office.json").read_text())
    F = d["films"]; cpi = {int(k): v for k, v in d["cpi"].items()}; base = d["cpi_base"]
    A = lambda v, y: v * cpi[base] / cpi[y]
    def share(a, b, gs):
        fs = [f for f in F if a <= f["y"] <= b and f["ww"]]
        t = sum(A(f["ww"], f["y"]) for f in fs)
        return sum(A(f["ww"], f["y"]) for f in fs if f["g"] in gs) / t * 100
    def coh(a, b):
        fs = [f for f in F if a <= f["y"] <= b]
        bud = [A(f["bud"], f["y"]) for f in fs if f["bud"]]
        rts = [f["rt"] for f in fs if f["rt"] is not None]
        big = [f["rt"] for f in fs if f["rt"] is not None and f["bud"] and A(f["bud"], f["y"]) >= 1e8]
        return {"n": len(fs) / (b - a + 1), "med": S.median(bud), "s100": sum(1 for x in bud if x >= 1e8) / len(bud) * 100,
                "rt": S.median(rts), "rtbig": S.median(big), "roi": S.median([f["ww"] / f["bud"] for f in fs if f["ww"] and f["bud"]])}
    def M(v): return f"${v/1e9:.1f}B" if v >= 1e9 else f"${v/1e6:.0f}M"
    sh80, sh20 = share(1980, 1989, ("Superhero", "Animation")), share(2021, 2025, ("Superhero", "Animation"))
    co80, co20 = share(1980, 1989, ("Comedy",)), share(2021, 2025, ("Comedy",))
    a, b = coh(1991, 1995), coh(2021, 2025); pk = coh(2015, 2019)
    years = sorted({f["y"] for f in F})
    def seq_top10(a, b):
        out = []
        for y in range(a, b + 1):
            out += sorted([f for f in F if f["y"] == y and f["ww"]], key=lambda f: -f["ww"])[:10]
        return sum(f.get("sq", 0) for f in out) / len(out) * 100
    return {
        "bo_i5": f"{seq_top10(1991, 1995):.0f}%", "bo_i5b": f"{seq_top10(2021, 2025):.0f}%", "bo_n_sq": f"{sum(f.get('sq', 0) for f in F):,}",
        "bo_n": f"{len(F):,}", "bo_y0": str(years[0]), "bo_y1": str(years[-1]), "bo_base": str(base),
        "bo_n_bud": f"{sum(1 for f in F if f['bud']):,}", "bo_n_rt": f"{sum(1 for f in F if f['rt'] is not None):,}",
        "bo_n_ww": f"{sum(1 for f in F if f['ww']):,}", "bo_n_rng": f"{sum(1 for f in F if f['rng']):,}",
        "bo_n_gs": f"{sum(f['gs'] for f in F):,}", "bo_n_gf": f"{sum(1 for f in F if not f['gs'])}",
        "bo_per_min": str(min(sum(1 for f in F if f['y'] == y) for y in years)), "bo_per_max": str(max(sum(1 for f in F if f['y'] == y) for y in years)),
        "bo_i1": f"{sh80:.0f}%", "bo_i1b": f"{sh20:.0f}%", "bo_i2": f"{co80:.0f}%", "bo_i2b": f"{co20:.1f}%",
        "bo_i3": M(a["med"]), "bo_i3b": M(b["med"]), "bo_i3p": f"{(b['med']/a['med']-1)*100:.0f}%", "bo_i3pk": M(pk["med"]),
        "bo_i3s": f"{a['s100']:.0f}%", "bo_i3sb": f"{b['s100']:.0f}%",
        "bo_i4": f"{a['rt']:.0f}", "bo_i4b": f"{b['rt']:.0f}", "bo_i4big": f"{a['rtbig']:.0f}", "bo_i4bigb": f"{b['rtbig']:.0f}",
        "bo_i4r": f"{a['roi']:.1f}×", "bo_i4rb": f"{b['roi']:.1f}×",
        "bo_gen": d["generated"],
    }

# ---------------------------------------------------------------- Launch globe (data: scripts/build_launch_globe.py)
def lg_pv_style(PV):
    """Provider colors as CSS classes (.pv-N), light and dark, shared by the globe legend and the calendar."""
    light = "".join(f".pv-{i}{{--pv:{p['light']}}}" for i, p in enumerate(PV))
    dark = "".join(f":root[data-theme=\"dark\"] .pv-{i}{{--pv:{p['dark']}}}" for i, p in enumerate(PV))
    return f"<style>{light}{dark}.lg-dot[class*=\"pv-\"]{{background:var(--pv)}}</style>"

def lg_ctx():
    import datetime as DT, html as H
    d = json.loads((SRC / "data" / "launch_globe.json").read_text()); m = d["meta"]
    PV, L, S, V = m["providers"], d["launches"], d["sites"], m["vehicles"]
    K = {p["key"]: i for i, p in enumerate(PV)}
    t0 = DT.datetime(int(m["t0"]), 1, 1)
    when = lambda x: t0 + DT.timedelta(days=x[0])
    my = lambda x: when(x).strftime("%b %Y")
    yr = lambda x: when(x).year
    last_full = yr(L[-1]) - 1
    Y = {}
    for x in L: Y.setdefault(yr(x), [0] * len(PV))[x[1]] += 1
    tot = lambda y: sum(Y.get(y, []))
    peak_y = max((y for y in Y if y < 2000), key=tot)
    broke = min(y for y in Y if y > peak_y and tot(y) > tot(peak_y))
    sx = [x for x in L if x[1] == K["spx"]]
    span = lambda a, b: (when(b) - when(a)).days
    ru_y = max(Y, key=lambda y: Y[y][K["ru"]])
    fy = Y[last_full]
    land = [x[6][0] for x in L if len(x) > 6 and x[6]]
    dot = lambda k: f'<i class="lg-dot pv-{k}" aria-hidden="true"></i>'
    srows = []
    for i, s in sorted(enumerate(S), key=lambda t: -sum(1 for x in L if x[2] == t[0])):
        mine = [x for x in L if x[2] == i]
        if not mine: continue
        from collections import Counter as C
        top = ", ".join(PV[k]["short"] for k, _ in C(x[1] for x in mine).most_common(3))
        srows.append(f'<tr><th scope="row">{dot(C(x[1] for x in mine).most_common(1)[0][0])}{H.escape(s["name"])}</th><td>{H.escape(top)}</td>'
                     f'<td class="n">{len(mine):,}</td><td class="n">{my(mine[0])}</td><td class="n">{my(mine[-1])}</td></tr>')
    prows = []
    for k in sorted(range(len(PV)), key=lambda k: (k == len(PV) - 1, -sum(1 for x in L if x[1] == k))):
        mine = [x for x in L if x[1] == k]
        if not mine: continue
        prows.append(f'<tr><th scope="row">{dot(k)}<span title="{H.escape(PV[k]["name"])}">{H.escape(PV[k]["short"])}</span></th><td class="n">{len(mine):,}</td>'
                     f'<td class="n">{sum(1 for x in mine if x[4] == "F"):,}</td><td class="n">{fy[k]:,}</td><td class="n">{my(mine[0])}</td></tr>')
    rl_f, ru_f = fy[K["rlab"]], fy[K["ru"]]
    return {
        "lg_pv_style": lg_pv_style(PV),
        "lg_n": f"{len(L):,}", "lg_first": my(L[0]), "lg_last": my(L[-1]), "lg_asof": m["as_of"],
        "lg_y0": str(yr(L[0])), "lg_y1": str(yr(L[-1])), "lg_full": str(last_full),
        "lg_nsites": str(sum(1 for i in range(len(S)) if any(x[2] == i for x in L))),
        "lg_site_rows": "\n".join(srows), "lg_prov_rows": "\n".join(prows),
        "lg_wf": str(tot(last_full)), "lg_peak": str(tot(peak_y)), "lg_peak_y": str(peak_y), "lg_broke": str(broke),
        "lg_cf": str(fy[K["spx"]]), "lg_sxsh": f"{fy[K['spx']] / tot(last_full) * 100:.0f}%", "lg_rest": str(tot(last_full) - fy[K["spx"]]),
        "lg_c17": str(Y[2017][K["spx"]]), "lg_100a": f"{span(sx[0], sx[99]) / 365.25:.1f}", "lg_100b": str(span(sx[-100], sx[-1])),
        "lg_ru_pk": str(Y[ru_y][K["ru"]]), "lg_ru_pky": str(ru_y), "lg_ru_f": str(ru_f),
        "lg_ru_sh": f"{sum(1 for x in L if x[1] == K['ru']) / len(L) * 100:.0f}%",
        "lg_cn_f": str(fy[K["casc"]] + fy[K["cncom"]]), "lg_casc_f": str(fy[K["casc"]]), "lg_cncom_f": str(fy[K["cncom"]]),
        "lg_rl_f": str(rl_f), "lg_rl_vs_ru": ("more than all of Russia" if rl_f > ru_f else "as many as all of Russia" if rl_f == ru_f else "close behind Russia") + f" ({ru_f})",
        "lg_recent": f"{sum(1 for x in L if yr(x) >= 2020):,}",
        "lg_nasa": f"{sum(1 for x in L if x[1] == K['nasa']):,}",
        "lg_ss": str(sum(1 for x in L if len(x) > 7 and x[7] == 1)),
        "lg_drop_pad": str(m["dropped"].get("pad explosion before launch", 0)),
        "lg_drop_abort": str(m["dropped"].get("engine shutdown on the pad", 0)),
        "lg_land_n": f"{sum(1 for x in L if V[x[5]].startswith(('Falcon 9', 'Falcon Heavy'))):,}",
    }

# Upcoming launches (data: scripts/build_launch_upcoming.py). Rendered here too, so the list works without JavaScript;
# launchcal.js re-renders it with the same markup. Future schedules are the one place the site shows day-level dates.
LGU_STATUS = {"Go": ("go", "Go", "Go for launch: date and time confirmed"), "TBC": ("tbc", "TBC", "To be confirmed: the date is announced but not locked in"),
              "TBD": ("tbd", "TBD", "To be determined: no firm date yet"), "Hold": ("hold", "Hold", "On hold"), "In Flight": ("go", "In flight", "In flight")}

def lgu_item(x, tz, PV):
    import datetime as DT, html as H
    e = H.escape
    net = DT.datetime.fromisoformat(x["net"].replace("Z", "+00:00")).astimezone(tz)
    fmt_t = lambda d: d.strftime("%I:%M %p").lstrip("0")
    if x["prec"] in ("min", "hour", "day", "week"):
        when = ("Week of " if x["prec"] == "week" else "") + net.strftime("%a, %b ") + str(net.day)
    else:
        when = net.strftime("%b %Y")
    if x["prec"] == "min": t = fmt_t(net) + " ET"
    elif x["prec"] == "hour": t = "Around " + net.strftime("%I %p").lstrip("0") + " ET"
    elif x["prec"] == "day": t = "Time TBD"
    else: t = "Date TBD"
    win = ""
    if x["prec"] == "min" and x.get("ws") and x.get("we"):
        a = DT.datetime.fromisoformat(x["ws"].replace("Z", "+00:00")).astimezone(tz); b = DT.datetime.fromisoformat(x["we"].replace("Z", "+00:00")).astimezone(tz)
        win = "Instantaneous window" if a == b else f"Window {fmt_t(a)} to {fmt_t(b)} ET"
    cls, lab, tt = LGU_STATUS.get(x["status"], ("tbd", x["status"] or "TBD", x.get("status_name") or ""))
    pad = "Pad TBD" if x["pad"].lower().startswith("unknown") else x["pad"]
    co = PV[x["pv"]]["short"] if x["pv"] < len(PV) else "Other"
    co = x["lsp"] if co == "Other" and x.get("lsp") else co
    return (f'<li class="lgc-item"><i class="lg-dot pv-{x["pv"]}" aria-hidden="true"></i>'
            f'<div class="lgc-when"><b>{e(when)}</b><span>{e(t)}</span></div>'
            f'<div class="lgc-what"><b>{e(x["name"])}</b><span>{e(x["vehicle"])} · {e(co)} · {e(pad)}, {e(x["location"])}</span>'
            + (f'<span class="lgc-win">{e(win)}</span>' if win else "") + lgu_watch(x) +
            f'</div><span class="lgc-st {cls}" title="{e(tt)}">{e(lab)}</span></li>')

def lgu_watch(x):
    """'Watch live' links from LL2's webcast list; else the provider's own stream page. Never a guessed video URL."""
    import html as H
    e = H.escape
    if x.get("watch"):
        links = "".join(f'<a href="{e(w["u"])}" target="_blank" rel="noopener" title="{e(w["t"])}">{e(w["p"] or "Webcast")}'
                        + (" (official)" if w.get("k", "").startswith("Official") else "") + "</a>" for w in x["watch"])
        return f'<span class="lgc-watch"><span class="lbl">Watch live:</span>{links}</span>'
    if x.get("streams"):
        links = "".join(f'<a href="{e(w["u"])}" target="_blank" rel="noopener">{e(w["t"])}</a>' for w in x["streams"])
        return f'<span class="lgc-watch"><span class="lbl">Provider stream page:</span>{links}</span>'
    return ""

def lgu_ctx():
    import datetime as DT
    from zoneinfo import ZoneInfo
    tz = ZoneInfo("America/New_York")
    f = SRC / "data" / "launch_upcoming.json"
    d = json.loads(f.read_text()) if f.exists() else {"as_of": None, "days": 60, "launches": []}
    asof = DT.datetime.fromisoformat(d["as_of"].replace("Z", "+00:00")).astimezone(tz) if d["as_of"] else None
    PV = json.loads((SRC / "data" / "launch_globe.json").read_text())["meta"]["providers"]
    items = "\n".join(lgu_item(x, tz, PV) for x in d["launches"]) or '<li class="lgc-empty">No launches are on the schedule for the next few weeks.</li>'
    return {"lgu_list": items, "lgu_days": str(d["days"]), "lgu_n": str(len(d["launches"])),
            "lgu_asof": (asof.strftime("%b ") + str(asof.day) + asof.strftime(", %Y, ") + asof.strftime("%I:%M %p").lstrip("0") + " ET") if asof else "not yet fetched",
            "lgu_asof_iso": d["as_of"] or ""}

# ---------------------------------------------------------------- Wolf of Wall Bot (data: scripts/sync_trading.py)
AT_NAMES = {"belfort": "Belfort mode", "buffett": "Buffett mode", "spy": "SPY", "savings": "Savings rate"}
def at_pct(v): return "—" if v is None else ("+" if v > 0 else "−" if v < 0 else "") + f"{abs(v):.2f}%"
def at_ctx():
    """Server-rendered first paint for the trading page; assets/js/agentic.js takes over in the browser."""
    p = SRC / "data" / "agentic_trading.json"
    d = json.loads(p.read_text()) if p.exists() else {"status": "pending", "weeks": [], "trades": []}
    weeks, trades = d.get("weeks") or [], d.get("trades") or []
    first = d.get("first_results") or "2026-10-23"
    if not weeks:
        rows = "".join(f'<tr class="s-{k}"><th scope="row"><i></i>{v}</th><td class="n">100.00</td><td class="n">—</td><td class="n">—</td></tr>' for k, v in AT_NAMES.items())
        return {"at_status": "pending", "at_first": first, "at_asof": "Waiting for week one", "at_empty_hidden": "",
                "at_sc_lbl": "Week 1 · pending", "at_score_rows": rows,
                "at_verdict": "Everything starts at 100. The first scores post after Friday's close.",
                "at_lessons": '<li class="at-none">No lessons yet. The bot has to make some mistakes first.</li>',
                "at_log_n": "0 trades",
                "at_trade_rows": '<tr class="at-none"><td colspan="7">No trades logged yet. The first week\'s trades show up here after Friday, Oct 23.</td></tr>'}
    w = weeks[-1]; S = w.get("series", {})
    rows = "".join(f'<tr class="s-{k}"><th scope="row"><i></i>{v}</th><td class="n">{S[k]["index"]:.2f}</td><td class="n">{at_pct(S[k]["weekly_pct"])}</td><td class="n">{at_pct(S[k]["cum_pct"])}</td></tr>'
                   for k, v in AT_NAMES.items() if k in S)
    les = "".join(f'<li>{esc(x["text"])}</li>' for x in w.get("lessons", [])) or '<li class="at-none">No lessons this week.</li>'
    tr = "".join(f'<tr><td>{esc(t["date"])}</td><td>{esc(AT_NAMES[t["mode"]])}</td><td>{esc(t["ticker"])}</td><td>{esc(t.get("side") or "—")}</td><td>{esc(t["type"])}</td><td class="n">{at_pct(t.get("result_pct"))}</td><td>{esc(t.get("reason") or "")}</td></tr>' for t in trades)
    return {"at_status": "live", "at_first": first, "at_asof": f"Through week {w['week']}", "at_empty_hidden": " hidden",
            "at_sc_lbl": f"Week {w['week']}", "at_score_rows": rows, "at_verdict": "", "at_lessons": les,
            "at_log_n": f"{len(trades)} trade" + ("" if len(trades) == 1 else "s"),
            "at_trade_rows": tr or '<tr class="at-none"><td colspan="7">No trades logged yet.</td></tr>'}

def qb_ctx():
    d = json.loads((SRC / "data" / "qb_network.json").read_text())
    m, P, E = d["meta"], d["players"], d["edges"]
    qb = m["default_qb"]
    rec = sorted([e for e in E if e[0] == qb], key=lambda e: (-e[2], -e[3]))
    rids = {e[1] for e in rec}
    oth = [e for e in E if e[1] in rids and e[0] != qb]
    by_p = {}
    for e in oth:
        by_p.setdefault(e[0], []).append(e)
    pos = lambda i: esc(P[i]["pos"] or "—")
    rows = "".join(f'<tr><td>{esc(P[e[1]]["name"])}</td><td>{pos(e[1])}</td><td class="n">{e[2]}</td><td class="n">{e[3]:,}</td></tr>' for e in rec)
    orows = "".join(
        f'<tr><td>{esc(P[p]["name"])} <span class="qn-tm">{esc("/".join(P[p]["teams"]))}</span></td><td>{pos(p)}</td><td class="n">{sum(x[2] for x in es)}</td>'
        f'<td>{esc(", ".join(P[x[1]]["short"] + " " + str(x[2]) for x in sorted(es, key=lambda x: -x[2])))}</td></tr>'
        for p, es in sorted(by_p.items(), key=lambda kv: -sum(x[2] for x in kv[1])))
    name = P[qb]["name"]
    sh = qb_shape(d, qb)
    return {"qn_hubs": esc(sh["hubs"]), "qn_bridges": esc(sh["bridges"]), "qn_outliers": esc(sh["outliers"]),"qn_season": m["season"], "qn_name": esc(name), "qn_first": esc(name.split()[0]), "qn_namep": esc(name + ("'" if name.endswith("s") else "'s")), "qn_firstp": esc(name.split()[0] + ("'" if name.split()[0].endswith("s") else "'s")), "qn_team": esc("/".join(P[qb]["teams"])),
            "qn_default": qb, "qn_through": esc(qb_through(m)), "qn_week": (m.get("weeks") or [m["latest_week"]])[-1], "qn_updated": esc(m["updated"]),
            "qn_rec": len(rec), "qn_comp": sum(e[2] for e in rec), "qn_yds": f'{sum(e[3] for e in rec):,}', "qn_oth": len(by_p),
            "qn_rows": rows, "qn_oth_rows": orows or '<tr><td colspan="4">None yet this season.</td></tr>'}

def render(tpl, ctx):
    tpl = re.sub(r"\{\{icon:(\w+)\}\}", lambda m: ICONS[m.group(1)], tpl)
    return re.sub(r"\{\{(\w+)\}\}", lambda m: str(ctx.get(m.group(1), "")), tpl)

def build():
    head = (SRC / "partials/head.html").read_text()
    header = (SRC / "partials/header.html").read_text()
    footer = (SRC / "partials/footer.html").read_text()
    for src, out, path, title, desc in PAGES:
        body = (SRC / "pages" / src).read_text()
        ctx = {"title": esc(title), "description": esc(desc), "site_url": SITE_URL, "path": path,
               "version": VERSION, "og_type": "profile" if path == "/" else "website",
               "desktop_menu": desktop_menu(path), "mobile_menu": mobile_menu(path), "extra_head": "", "extra_scripts": "", "og_image": "/assets/img/og.png"}
        if path in ("/", "/about/profile/"):
            ctx["og_image"] = "/assets/img/og-home.jpg"
        if path == "/":
            ctx["extra_head"] = '<script type="application/ld+json">' + json.dumps(JSON_LD) + "</script>"
        if path == "/work/ai-projects/chalktalkfb/":
            ctx["og_image"] = "/assets/img/work/chalktalkfb/og.jpg"
            ctx["og_type"] = "article"
            ctx["extra_scripts"] = f'<script src="/assets/js/chalktalk.js?v={VERSION}" defer></script>'
        if path == "/work/ai-projects/agentic-trading/":
            ctx.update(at_ctx())
            ctx["og_image"] = "/assets/img/work/agentic-trading/og.jpg"
            ctx["og_type"] = "article"
            ctx["extra_scripts"] = f'<script src="/assets/js/agentic.js?v={VERSION}" defer></script>'
        if path == "/work/ai-projects/polo-finder/":
            ctx["og_image"] = "/assets/img/work/polo-finder/og.jpg"
            ctx["og_type"] = "article"
            ctx["extra_scripts"] = f'<script src="/assets/js/polo.js?v={VERSION}" defer></script>'
        if path == "/work/visuals/qb-network/":
            ctx.update(qb_ctx())
            ctx["og_image"] = "/assets/img/work/qb-network/og.jpg"
            ctx["og_type"] = "article"
            ctx["extra_scripts"] = f'<script src="/assets/js/qbheat.js?v={VERSION}" defer></script><script src="/assets/js/qbnet.js?v={VERSION}" defer></script>'
        if path == "/work/visuals/launch-globe/":
            ctx.update(lg_ctx()); ctx.update(lgu_ctx())
            ctx["og_image"] = "/assets/img/work/launch-globe/og.jpg"
            ctx["og_type"] = "article"
            ctx["extra_scripts"] = f'<script src="/assets/js/launchglobe.js?v={VERSION}" defer></script><script src="/assets/js/launchcal.js?v={VERSION}" defer></script>'
        if path == "/work/visuals/box-office/":
            ctx.update(bo_ctx())
            ctx["og_image"] = "/assets/img/work/box-office/og.jpg"
            ctx["og_type"] = "article"
            ctx["extra_scripts"] = f'<script src="/assets/js/boxoffice.js?v={VERSION}" defer></script>'
        if path == "/work/projects/risk-data-transformation/":
            ctx["og_image"] = "/assets/img/work/risk-data/og.jpg"
            ctx["og_type"] = "article"
        if path == "/work/projects/staffing-to-demand/":
            ctx["og_image"] = "/assets/img/work/staffing/og.jpg"
            ctx["og_type"] = "article"
            ctx["extra_scripts"] = f'<script src="/assets/js/staffing.js?v={VERSION}" defer></script>'
        if path == "/work/projects/sales-performance/":
            ctx["og_image"] = "/assets/img/work/sales-performance/og.jpg"
            ctx["og_type"] = "article"
            ctx["extra_scripts"] = f'<script src="/assets/js/salesperf.js?v={VERSION}" defer></script>'
        if path in [p for p, _, _ in SERIES]:
            ctx.update(series_ctx(path))
        if path == "/work/projects/incentives/":
            ctx["og_image"] = "/assets/img/work/incentives/og.jpg"
            ctx["og_type"] = "article"
            ctx["extra_scripts"] = f'<script src="/assets/js/incentives.js?v={VERSION}" defer></script>'
        if path == "/work/projects/routing/":
            ctx.update(traffic_ctx())
            ctx["og_image"] = "/assets/img/work/traffic-routing/og.jpg"
            ctx["og_type"] = "article"
            ctx["extra_head"] = f'<link rel="stylesheet" href="/assets/vendor/leaflet/leaflet.css?v={VERSION}">'
            ctx["extra_scripts"] = (f'<script src="/assets/vendor/leaflet/leaflet.js?v={VERSION}" defer></script>\n'
                                    f'<script src="/assets/js/traffic.js?v={VERSION}" defer></script>')
        if path == "/work/dashboards/keep-or-close/":
            ctx["og_image"] = "/assets/img/work/keep-or-close/og.jpg"
            ctx["og_type"] = "article"
            ctx["extra_head"] = f'<link rel="stylesheet" href="/assets/vendor/leaflet/leaflet.css?v={VERSION}">'
            ctx["extra_scripts"] = (f'<script src="/assets/vendor/leaflet/leaflet.js?v={VERSION}" defer></script>\n'
                                    f'<script src="/assets/js/keepclose.js?v={VERSION}" defer></script>')
        if path == "/work/dashboards/aipd/":
            ctx["og_image"] = "/assets/img/work/aipd/og.jpg"
            ctx["og_type"] = "article"
            ctx["extra_head"] = f'<link rel="stylesheet" href="/assets/vendor/leaflet/leaflet.css?v={VERSION}">'
            ctx["extra_scripts"] = (f'<script src="/assets/vendor/leaflet/leaflet.js?v={VERSION}" defer></script>\n'
                                    f'<script src="/assets/js/aipd.js?v={VERSION}" defer></script>')
        if path in ("/404.html", "/contact/thanks/"):
            ctx["extra_head"] = '<meta name="robots" content="noindex">'
        if path == "/contact/":
            ctx["extra_scripts"] = f'<script src="/assets/js/contact.js?v={VERSION}" defer></script>'
        if path in WORK_META:
            kind, crumb, heading, lede = WORK_META[path]
            sub = "".join(f'<a href="{p}"{AC if p == path else ""}>{m[1]}</a>' for p, m in WORK_META.items())
            n_items = len(json.loads((SRC / "data" / "work.json").read_text()).get(kind, []))
            notes = {
                "projects": ("folder", "Built around live demos", "Most are built around a demo you can play with, using public or clearly labeled example data. The ideas come from my work; none of the numbers in the demos are company data."),
                "dashboards": ("dash", "Rebuilt with example data", "Each dashboard recreates one I built at work, using fictional data so you can click around. No company data appears here."),
                "visuals": ("spark", "Playground and case studies", "Small, fun data pieces live here. Cards marked Case study are from <a class=\"text-link\" href=\"/work/projects/\">Projects</a>, listed here too so nothing gets buried."),
            }
            if not n_items:
                notes[kind] = ("clock", "New work is on the way", "This space is being built out. In the meantime, the <a class=\"text-link\" href=\"/experience/\">experience timeline</a> covers the highlights.")
            nt = notes.get(kind)
            ctx["work_note"] = (f'<div class="empty-note reveal"><span class="ic">{ICONS[nt[0]]}</span><div><h3>{nt[1]}</h3><p>{nt[2]}</p></div></div>' if nt else "")
            ctx.update({"work_crumb": crumb, "work_heading": heading, "work_lede": lede, "work_subnav": sub,
                        "work_cards": work_grid(kind)})
        page = render(head, ctx) + render(header, ctx) + render(body, ctx) + render(footer, ctx)
        dest = OUT / out
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(page)
        print("built", out)

    (OUT / "assets/data").mkdir(parents=True, exist_ok=True)
    for f in ("qb_network.json", "traffic.json", "routes.json", "kiosks.json", "aipd.json", "box_office.json", "launch_globe.json", "launch_upcoming.json", "agentic_trading.json"):
        (OUT / "assets/data" / f).write_text((SRC / "data" / f).read_text())

    urls = [p for _, _, p, _, _ in PAGES if p not in ("/404.html", "/contact/thanks/")]
    sm = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    sm += "".join(f"  <url><loc>{SITE_URL}{u}</loc></url>\n" for u in urls) + "</urlset>\n"
    (OUT / "sitemap.xml").write_text(sm)
    (OUT / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}/sitemap.xml\n")

if __name__ == "__main__":
    build()
