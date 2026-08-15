# Jesuit Football — parent app

A day-by-day phone app for Jesuit High School New Orleans football parents,
2026 season. Open it in the morning and it answers the three questions parents
actually ask: **what's happening today, when is the next game, and what are this
week's notes for my class.**

Built for the Class of 2027 season by the grade moms.

---

## What's in it

| Tab | What it does |
| --- | --- |
| **Today** | Today's practice and times straight off the coach's calendar, a countdown to your team's next game, and your class's game-time notes for that week |
| **Games** | Switch between **8th · 9th · JV · Varsity** and see that team's full schedule |
| **Calendar** | Every practice, workout, and event, Aug 2026 through Jul 2027. Opens on today, with a sticky month dropdown to jump anywhere in the season |
| **My Grade** | Pick your son's grade once. Dues, Venmo handle, tailgate category, what your class takes on, your pre-game meal weeks, and your grade mom's contact |
| **Info** | Bag policy and parking for all 8 venues, traditions, grade moms, photographers, vacation dates |

Both the team and grade choices are remembered on the phone (`localStorage`).
No accounts, no login, no server, no tracking.

### Team vs. grade — why there are two pickers

They answer different questions and they don't line up:

- **Team** (8th / 9th / JV / Varsity) decides *which games your son plays in*. A
  10th grader might be on JV or Varsity, so grade alone can't tell you.
- **Grade** (8th–12th) decides *your class's game-time notes* — dues, pre-game meal
  weeks, chocolate milk, donuts. That's organised by class, not by team.

| Team | Games | Where it comes from |
| --- | --- | --- |
| Varsity | 12 | `data/season.json`, hand-maintained |
| 8th grade (JH) | 16 | extracted from the calendar |
| 9th grade | 9 | extracted from the calendar |
| JV | 8 | extracted from the calendar |

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
cd docs && python3 -m http.server 8770
```

Then open <http://localhost:8770>. That's it — no build step, no dependencies.

## Rebuilding the data

The app's data is **generated**, never hand-typed. `docs/data.js` is a build
artifact — editing it directly will be overwritten.

```bash
# 1. re-parse the coach's calendar PDF into day-by-day JSON
python3 tools/parse_calendar.py "source/2026 FOOTBALL CALENDAR.pdf" data/calendar.json

# 2. bundle both JSON files into the app
python3 tools/build_web_data.py
```

That's the whole deploy prep. Step 2 also hashes `style.css`, `app.js`, and
`data.js` and stamps that hash into the asset URLs in `index.html` and into
`BUILD` in `sw.js`. So cache-busting is automatic — there is no version number
to remember to bump.

This matters more than it sounds. Before it existed, a browser would happily
serve a cached `data.js` and show **last week's kickoff times**, which is the
single worst way this app can fail.

`data/season.json` is the hand-maintained file — games, venues, grade
responsibilities, dues, traditions. Edit that when the schedule shifts, then run
step 2.

**When a game time changes** (several are still TBD), edit `data/season.json`,
run `build_web_data.py`, redeploy.

### Where the data came from

| File | Source |
| --- | --- |
| `data/calendar.json` | Generated from the coach's *2026 FOOTBALL CALENDAR* PDF — 277 days |
| `data/season.json` | Hand-built from the *2026 Football Welcome Letter* and the official varsity schedule |
| `teamGames` in `docs/data.js` | Derived at build time — the 8th/9th/JV games the coach buried inside day cells like `"JH vs Shaw 6:30"` |

Sub-varsity times are printed **exactly as the coach wrote them**, with no AM/PM
guessing, because the calendar doesn't say. The calendar also lists no venues
for those games.

Two known oddities in the source, left as-is rather than silently "fixed":
Oct 15 lists two 8th grade games (vs St. Aug 5:00 and at St. Pauls 5:30), and
the first two weeks of August have some practice numbers doubled up in one day
cell. Both are in the past or worth confirming with the coach.

The parser was verified against 16 independent anchors from the welcome letter
(combine, parent dinner, Blue & White, all 10 game dates, holidays) — all match
with correct weekdays.

## Photos

Parents add photos to a **shared Google Photos album**, not to the app. The
Photos tab is a front door to that album plus a gallery of selected shots.

That is a deliberate choice. Real in-app upload needs a server, storage, and
moderation — and on a public link with no login, "any parent can upload" also
means "anyone at all can upload," with photos of minors appearing unreviewed.
A collaborative shared album gets the same result, inherits Google's access
controls, handles video, and needs no backend.

To finish wiring it up: create the album, turn on **Collaborate**, then paste
the share link into `photoAlbum.url` in `data/season.json` and rebuild.

### Adding photos to the in-app gallery

```bash
python3 tools/prepare_photos.py ~/Downloads/IMG_*.HEIC --caption "Blue & White Night · Aug 14"
python3 tools/build_web_data.py
```

Every photo is converted from HEIC to JPEG (Safari renders HEIC; most other
browsers don't), resized to a 1600px long edge with a 500px thumbnail, and has
**all EXIF stripped** — camera, timestamps, and any GPS coordinates.

The orientation flag is baked into the pixels *before* the strip. Skip that and
every portrait photo from an iPhone shows up on its side.

Videos are skipped — they belong in the shared album.

## Icons

```bash
python3 tools/make_icons.py
```

## Layout

```
data/       season.json (hand-maintained) + calendar.json (generated)
tools/      parse_calendar.py, build_web_data.py, make_icons.py
docs/       the app — index.html, app.js, style.css, data.js (generated), sw.js
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
`main` branch, `/docs` folder. The link becomes
`https://<user>.github.io/<repo>/`.

**Netlify Drop** (free, no account needed to try): drag the `docs/` folder onto
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
