# garyleeblevinsjr.com

The source for my resume site, [garyleeblevinsjr.com](https://garyleeblevinsjr.com).

Full disclosure: I didn't hand-write most of this code. It was built with AI coding agents. I handled the direction,
the data, the writing, and a lot of "no, move that 4px left." The site is partly a resume and partly a running
experiment in how far you can get by pairing with AI.

## Stack

- Plain HTML, CSS, and vanilla JS. No framework, no trackers, self-hosted fonts.
- One Python build script (`build.py`, standard library only) that stitches `src/` into static pages in `public/`.
- Hosted on Cloudflare Pages. `public/` is the whole deploy, and `public/_headers` holds the security headers and CSP.
- The contact form posts to Web3Forms.

## Data

Everything on the visuals and dashboards is either real public data or clearly labeled made-up example data.

- **Launch Globe:** Jonathan McDowell's GCAT, Wikipedia, Natural Earth, and The Space Devs' Launch Library 2.
- **QB Network:** nflverse (play-by-play, schedules, rosters, injuries, snap counts).
- **Box office:** Wikipedia's yearly box office lists (which cite Box Office Mojo) plus Wikidata.
- **Traffic and routing:** FHWA TMAS count stations and the public OSRM routing server.
- **Keep-or-close and AIPD dashboards:** fictional example data, built by deterministic scripts.
- **Wolf of Wall Bot:** a weekly summary from my AI trading-bot experiment, normalized to an index of 100. No dollar amounts.

The scripts in `scripts/` re-fetch and rebuild those JSON files. The built JSON is checked in, so you don't need to run them.

## Build it

```
python3 build.py
cd public && python3 -m http.server 8000
```

Then open http://localhost:8000. More detail on the data scripts lives in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Pages

- Home, Profile, Skills, Education, Experience, Contact
- Projects: Risk data transformation, Staffing to demand, Sales performance, Incentives, Routing
- AI projects: ChalkTalkFB, Polo Finder, The Wolf of Wall Bot
- Dashboards: Keep or close, AIPD
- Interactive visuals: Launch Globe, QB Network, Box office

## License

The code is MIT (see [LICENSE](LICENSE)). The content is not: my writing, my headshot, and the resume details are
all rights reserved. Feel free to borrow the code, but please don't reuse me.
