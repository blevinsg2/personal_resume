# Development notes

Personal resume site for Gary Lee Blevins Jr. Static HTML/CSS/vanilla JS with no framework, no trackers, and no external requests (fonts are self-hosted).

## Structure

```
garyleeblevinsjr/
├── build.py              # builds public/ from src/ (Python 3 stdlib only)
├── README.md
├── src/
│   ├── partials/         # head.html, header.html (nav + mobile menu), footer.html
│   ├── pages/            # page bodies: home, profile, skills, education, experience, work, contact, 404
│   └── data/work.json    # cards shown on the Work pages (Projects / Dashboards / Interactive Visuals)
└── public/               # <- DEPLOY THIS FOLDER (Cloudflare Pages direct upload)
    ├── index.html
    ├── about/{profile,skills,education}/index.html
    ├── experience/index.html
    ├── work/{projects,ai-projects,dashboards,visuals}/index.html
    ├── work/ai-projects/chalktalkfb/index.html   # first project page
    ├── assets/js/chalktalk.js     # click-to-load YouTube embed + 'today' marker
    ├── contact/index.html
    ├── 404.html
    ├── assets/css/site.css
    ├── assets/js/site.js          # theme toggle, dropdowns, mobile menu, reveal, count-up
    ├── assets/js/contact.js       # contact form validation + submit
    ├── assets/fonts/              # Inter, Geist Mono, Instrument Serif Italic (woff2 subsets, OFL)
    ├── assets/img/                # favicon.svg, icons, og.png (social preview)
    ├── favicon.ico, site.webmanifest, robots.txt, sitemap.xml
    ├── _redirects                 # /about -> /about/profile/, /work -> /work/projects/
    └── _headers                   # security headers + CSP (allows Web3Forms/Formspree only)
```

Header, footer, and nav are shared: edit them once in `src/partials/` (nav items live in the `NAV` list in `build.py`), then run:

```
python3 build.py
```

Preview locally: `cd public && python3 -m http.server 8000`, then open http://localhost:8000

## Add a project, dashboard, or visual card

1. Optional: put a 16:10 image in `public/assets/img/work/` (for example `kiosk.png`, about 1600x1000).
2. Add an entry to the matching list in `src/data/work.json` (`projects`, `ai_projects`, `dashboards`, or `visuals`):

```json
{
  "projects": [
    {
      "title": "Kiosk Profitability Model",
      "summary": "One or two sentences on the problem and the result.",
      "kind": "Case study",
      "year": 2024,
      "tags": ["Power BI", "SQL"],
      "image": "/assets/img/work/kiosk.png",
      "image_alt": "Dashboard showing profitability by location",
      "url": "/work/projects/kiosk/"
    }
  ]
}
```

All fields except `title` are optional. Without an `image`, a neutral chart illustration is shown. With a `url`, the whole card becomes a link (external `https://` links open in a new tab).

3. Run `python3 build.py`. Placeholder "Coming soon" cards automatically fill the row until there are 3 real ones.

To give a project its own page, copy any page in `src/pages/`, add a line to `PAGES` in `build.py` (for example `("kiosk.html", "work/projects/kiosk/index.html", "/work/projects/kiosk/", "Kiosk Profitability — Gary Blevins", "Description")`), and rebuild. Interactive visuals can go on these pages as inline SVG or a small vanilla JS file in `public/assets/js/`.

The ChalkTalkFB page (`src/pages/chalktalkfb.html`) is a good template for future project pages. The YouTube player only loads when someone taps play, from youtube-nocookie.com, which the CSP in `public/_headers` allows through `frame-src`. Video files are never hosted on this site.

## Contact form

The form is live through Web3Forms. The destination email stays on Web3Forms' side and never appears in this site's source. The public access key, subject, and from_name are hidden fields in `src/pages/contact.html`.

- With JavaScript: `public/assets/js/contact.js` validates inline and POSTs JSON to `https://api.web3forms.com/submit`, then shows inline success or error states.
- Without JavaScript: the form does a normal POST, and Web3Forms redirects to `/contact/thanks/` (noindex, not in the sitemap).
- Fields sent: `access_key`, `subject`, `from_name`, `name`, `email` (used as reply-to), `message`, and the `botcheck` honeypot checkbox. If the box is checked, the browser shows a fake success and sends nothing.
- `public/_headers` allows `https://api.web3forms.com` in `connect-src` and `form-action`. Optionally restrict the key to `garyleeblevinsjr.com` in the Web3Forms dashboard.

## Deploy (Cloudflare Pages direct upload)

Upload the **`public/`** folder (not the project root) to a Pages project, then add `garyleeblevinsjr.com` under Custom domains.

## Privacy

By design, no phone number or email address is published anywhere on the site, including the page text, meta tags, JSON-LD, and source comments. Keep it that way when editing.

## Launch Globe data (weekly refresh)

```
python3 scripts/build_launch_globe.py      # GCAT + Wikipedia + Natural Earth -> src/data/launch_globe.json (~3 s)
python3 scripts/build_launch_upcoming.py   # The Space Devs Launch Library 2 -> src/data/launch_upcoming.json (1 request, ~10 s)
python3 build.py                           # renders the page and copies both JSON files to public/assets/data/
```

Run them in that order (the upcoming script maps launches onto the globe's pads). Both are safe to re-run: they
overwrite their JSON with fresh data, and on a network error or API rate limit (Launch Library 2 allows 15 anonymous
requests an hour) they keep the previous JSON and exit 0. Add `--strict` to `build_launch_upcoming.py` to fail instead.
The page also refreshes the upcoming list in the browser when the deployed copy is more than 3 hours old
(CSP `connect-src` allows https://ll.thespacedevs.com) and falls back to the deployed JSON if that fails.

The globe covers every orbital launch attempt worldwide since 1957 (GCAT), grouped into the providers listed in
`PROVIDERS` in `build_launch_globe.py` (colors for light and dark themes live there too, and the calendar uses the same
ones). NASA is assigned from GCAT's launch-agency field (any agency whose parent in GCAT's `orgs.tsv` is NASA), plus Saturn, Shuttle, and SLS; NASA missions on commercial rockets stay with the rocket's provider. The upcoming script pulls every provider in LL2's `detailed` mode to get webcast links (`vid_urls`); where none
is listed yet, it falls back to the provider's official stream page from `STREAM_PAGES`. The browser refresh uses the
lighter `normal` mode, keeps webcast links from the deployed JSON by launch id, and uses the same fallback table.
`PV_RULES` and `STREAM_PAGES` are duplicated in `public/assets/js/launchcal.js`; keep both copies in sync.

## Agentic trading data (Wolf of Wall Bot, weekly)

Page: `/work/ai-projects/agentic-trading/` (`src/pages/agentic-trading.html`, `public/assets/js/agentic.js`).

The trading bot writes `$TRADING_WEEKLY_JSON` (default `data/weekly.json`, gitignored) every Friday after the close. After it does:

```
python3 scripts/sync_trading.py      # weekly.json -> src/data/agentic_trading.json (normalized, scrubbed)
python3 build.py                     # copies it to public/assets/data/ and pre-renders the latest week
```

Options: `--src PATH`, `--out PATH`. If the source is missing, the sync keeps an existing live file, otherwise it writes the
"pending" state (empty weeks/trades), which the page shows as "First results land Friday, Oct 23."

**Privacy rule: only normalized numbers.** The sync is an allowlist. It copies only the fields below and drops everything else,
including any balance, cash, value, cost, price, quantity, P&L-in-dollars, account, income or tax field. Free text (reasons,
lessons) is scrubbed: dollar figures become `[amount]`, and emails, phone numbers, long digit runs and account references
become `[redacted]`. Any percentage containing `$` is rejected.

### Expected `weekly.json` (preferred shape)

```json
{
  "updated": "2026-10-23",
  "weeks": [
    {
      "week": 1, "start": "2026-10-21", "end": "2026-10-23",
      "series": {
        "belfort": { "index": 100.0, "weekly_pct": 0.0, "cum_pct": 0.0 },
        "buffett": { "index": 100.0, "weekly_pct": 0.0, "cum_pct": 0.0 },
        "spy":     { "index": 100.0, "weekly_pct": 0.0, "cum_pct": 0.0 },
        "savings": { "index": 100.0, "weekly_pct": 0.0, "cum_pct": 0.0 }
      },
      "lessons": [ { "mode": "belfort", "text": "One-line lesson." }, { "mode": null, "text": "Lesson for both." } ]
    }
  ],
  "trades": [
    { "date": "2026-10-21", "week": 1, "mode": "belfort", "ticker": "XYZ", "side": "buy",
      "type": "call", "result_pct": null, "status": "open", "reason": "One-line reasoning." }
  ]
}
```

- Every series is an index that starts at 100 before week 1. `cum_pct` = index − 100; `weekly_pct` = change vs the prior week's index.
  Any one of the three is enough: the sync derives the others.
- `type`: `stock` | `etf` | `call` | `put`. `side`: `buy` | `sell` | `expired`. `result_pct`: percent or `null` while open.
- Trade dates may be day-level (`YYYY-MM-DD`). Everything else on the site stays month/year.

### Tolerated aliases

- Modes: `belfort` (`jordan`, `jordan_belfort`, `wolf`, `aggressive`); `buffett` (`warren`, `warren_buffett`, `sane`, `conservative`);
  `spy` (`sp500`, `s&p500`, `benchmark`); `savings` (`hysa`, `savings_rate`, `high_yield_savings`, `cash_rate`).
- Weeks list: `weeks` | `history` | `series` | `weekly` (list, or dict keyed by week). Week number: `week` | `week_number` | `n`.
  Series may sit under `series`, `index`/`indexes`/`levels` (number per mode), or as per-mode objects on the week.
  Returns: `weekly_pct`/`week_pct`/`weekly_return_pct`/`weekly_return`; `cum_pct`/`cumulative_pct`/`cumulative_return_pct`/`cumulative_return`.
  Lessons: `lessons` | `lesson` | `notes` | `takeaways` (string, list, or dict by mode). Dates: `start`, `end` / `as_of`.
- Trades: `trades` | `trade_log` | `log` | `orders` (top level or inside weeks). Fields: `mode`/`sleeve`/`bot`/`strategy`;
  `ticker`/`symbol`/`underlying`; `type`/`instrument`/`asset_type`/`kind` (or `option_type`); `side`/`action` (`bto` → buy);
  `result_pct`/`return_pct`/`pct`/`result`/`gain_pct`/`pnl_pct`; `status`; `reason`/`reasoning`/`why`/`rationale`/`thesis`/`note`.
  A missing `week` is inferred from the week date ranges.

### Output (`src/data/agentic_trading.json`)

`{"schema":1, "first_results", "synced", "status":"pending"|"live", "updated", "weeks":[{"week","start","end","series":{mode:{"index","weekly_pct","cum_pct"}},"lessons":[{"mode","text"}]}], "trades":[{"date","week","mode","ticker","side","type","result_pct","status","reason"}]}`
