# Jesuit Football — parent app

A day-by-day phone app for Jesuit High School New Orleans football parents,
2026 season. Open it in the morning and it answers the three questions parents
actually ask: **what's happening today, when is the next game, and what does my
grade owe this week.**

Built for the Class of 2027 season by the grade moms.

---

## What's in it

| Tab | What it does |
| --- | --- |
| **Today** | Today's practice and times straight off the coach's calendar, a countdown to the next game, and your grade's jobs for that game week |
| **Games** | All 12 games (2 preseason + 10 regular season) with kickoff, venue, home/away, district, and which grade has the pre-game meal |
| **Calendar** | Every practice, workout, and event, Aug 2026 through Jul 2027, auto-scrolled to today |
| **My Grade** | Pick your son's grade once. Dues, Venmo handle, tailgate category, what your class takes on, your pre-game meal weeks, and your grade mom's contact |
| **Info** | Bag policy and parking for all 8 venues, traditions, grade moms, photographers, vacation dates |

The grade choice is remembered on the phone (`localStorage`). No accounts, no
login, no server, no tracking.

### Deliberately not in the app

Player names, jersey numbers, and family contact details are **not** included.
The link is public, and a public URL is a different thing from a printed program
handed out at a game. Grade mom contacts are in there because they are the
published point of contact for the program and they consented to that in the
welcome letter.

If you want the roster in, that is a real decision to make on purpose — talk to
the other grade moms first, and consider putting it behind a password instead.

---

## Running it locally

```bash
cd web && python3 -m http.server 8770
```

Then open <http://localhost:8770>. That's it — no build step, no dependencies.

## Rebuilding the data

The app's data is **generated**, never hand-typed. `web/data.js` is a build
artifact — editing it directly will be overwritten.

```bash
# 1. re-parse the coach's calendar PDF into day-by-day JSON
python3 tools/parse_calendar.py "source/2026 FOOTBALL CALENDAR.pdf" data/calendar.json

# 2. bundle both JSON files into the app
python3 tools/build_web_data.py

# 3. bump CACHE in web/sw.js (e.g. jesuit-fb-v1 -> v2) so phones
#    pick up the new schedule instead of serving the cached one
```

`data/season.json` is the hand-maintained file — games, venues, grade
responsibilities, dues, traditions. Edit that when the schedule shifts, then run
step 2.

**When a game time changes** (several are still TBD), edit `data/season.json`,
run `build_web_data.py`, bump the service worker cache, redeploy.

### Where the data came from

| File | Source |
| --- | --- |
| `data/calendar.json` | Generated from the coach's *2026 FOOTBALL CALENDAR* PDF — 277 days |
| `data/season.json` | Hand-built from the *2026 Football Welcome Letter* and the official varsity schedule |

The parser was verified against 16 independent anchors from the welcome letter
(combine, parent dinner, Blue & White, all 10 game dates, holidays) — all match
with correct weekdays.

## Icons

```bash
python3 tools/make_icons.py
```

## Layout

```
data/       season.json (hand-maintained) + calendar.json (generated)
tools/      parse_calendar.py, build_web_data.py, make_icons.py
web/        the app — index.html, app.js, style.css, data.js (generated), sw.js
source/     original PDFs (gitignored — school documents, not ours to republish)
```

---

## Getting it on parents' phones

The app is a **PWA** — a website that installs to the home screen with an icon
and works offline, which matters because half these stadiums are a concrete bowl
with no signal.

Once it's hosted, parents do:

- **iPhone:** open the link in Safari → Share → *Add to Home Screen*
- **Android:** open in Chrome → menu → *Install app*

Works on both. No App Store, no download.

## Hosting

Any static host works. The app is 8 files and about 120 KB.

**GitHub Pages** (free): push this repo, then Settings → Pages → deploy from
`main` branch, `/web` folder. The link becomes
`https://<user>.github.io/<repo>/`.

**Netlify Drop** (free, no account needed to try): drag the `web/` folder onto
<https://app.netlify.com/drop>.

Whichever you pick, the link is public — anyone with it can open it. That is the
intent here (all football parents), and it is why there are no player names in
the app.

---

## Native iOS

A native version is planned. This app doubles as the working spec for it — the
same `data/*.json` files feed a SwiftUI app unchanged.

Native needs, in order: macOS 26.2+ (this Mac is on 26.1 — a 7.7 GB update),
Xcode (~15 GB), an Apple Developer account ($99/yr), and App Store review.
Note that native iOS reaches only the iPhone families; this web app reaches
Android parents too.
