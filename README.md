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
| **Games** | Switch between **8th · 9th · JV · Varsity**. Tap a game to open it on its own screen — countdown, kickoff, address, Maps link, bag policy, parking, tickets, and what your class owes for that game |
| **Calendar** | Football and Jesuit's school calendar together. Tap any day for the full picture, football highlighted. Sticky month dropdown |
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
python3 tools/serve.py          # or: python3 tools/serve.py 8781
```

It prints both a localhost link and a LAN link for testing on your phone.

Use this rather than `python -m http.server`. That sends no cache headers at
all, so browsers heuristically cache `index.html` — you edit the app, reload,
and still get the old one. `serve.py` sends `no-store` on everything.

**If a phone is stuck on an old copy anyway**, serve on a different port. A new
port is a new origin, so there is no old service worker and no cache to fight.

## Rebuilding the data

The app's data is **generated**, never hand-typed. `docs/data.js` is a build
artifact — editing it directly will be overwritten.

```bash
# 1. re-parse the coach's calendar PDF into day-by-day JSON
python3 tools/parse_calendar.py "source/2026 FOOTBALL CALENDAR.pdf" data/calendar.json

# 2. rebuild the school calendar (verifies its dates against step 1)
python3 tools/build_school_calendar.py

# 3. bundle everything into the app
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
| `data/school_calendar.json` | Built by `tools/build_school_calendar.py`. Jesuit's official *2026-27 Important Dates* PDF, transcribed, plus school events the coach lists that never made the official sheet — each tagged with which source it came from |
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

### How many photos live in the app

**Eight, and it stays that way.** `prepare_photos.py --limit` defaults to 8 and
keeps an even spread across whatever you hand it, so the highlights aren't all
from the same ten minutes.

This matters less for load speed than you'd think — photos are lazy-loaded and
contribute **nothing** to first paint, which is 204 KB. It matters for the
repo: 28 photos was 11 MB, and a whole season would be 100 MB+, which bloats
every clone and eventually runs at GitHub Pages' limits.

Everything else goes in the shared album. Raise `--limit` if you want, but
that's the trade you're making.

### Google Photos, not Drive

Drive gives parents a file list they tap and download one at a time — clumsy on
a phone. A Google Photos album swipes properly, handles video, and parents can
add straight from their camera roll. Keep the Drive folder for the letter and
the calendar; photos belong in an album.

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

## The coach's weekly schedule

The coach posts the coming week as a **picture** in the Class of 2027 GroupMe
every Sunday. `tools/sunday_update.py` pulls it in:

```bash
python3 tools/sunday_update.py            # fetch, read, apply, rebuild
python3 tools/sunday_update.py --dry-run  # show what it read, write nothing
python3 tools/sunday_update.py --image ~/Downloads/week.png   # skip GroupMe
```

It asks the GroupMe API for the newest image in the group, has Claude read the
schedule out of it, writes `data/this_week.json`, copies the picture into
`docs/schedules/`, and rebuilds. The result shows as a **This week, from Coach**
card on Today, and those days override the year-long calendar.

### Two things it needs

Both go in `.env`, which is gitignored:

```
GROUPME_ACCESS_TOKEN=...   # dev.groupme.com — "Access Token", top right
ANTHROPIC_API_KEY=...      # console.anthropic.com
```

Without them the script exits with instructions rather than a stack trace.

### Why the picture is kept

The parsed times are shown **next to the original photo**, and anything the
model could not read confidently is listed as a warning. A model reading a
photo of a whiteboard can misread a 5 as a 6, and a wrong pickup time strands
a kid in a parking lot. The source is always one tap away.

Run `--dry-run` the first couple of Sundays and check it against the picture
before trusting it unattended.

### Running it every Sunday

Once you trust it, add a cron entry (`crontab -e`) — 7pm Sunday:

```
0 19 * * 0 cd ~/Documents/JesuitFootball && /usr/bin/python3 tools/sunday_update.py >> /tmp/jesuit-sunday.log 2>&1
```

That updates the local files. Committing and pushing is still deliberate — see
Hosting. Only run it unattended after a few supervised weeks.

## Calendar subscriptions

`tools/build_ics.py` (run automatically by `build_web_data.py`) emits five
feeds into `docs/`: one per team, plus `jesuit-full-season.ics` with all 277
days.

Parents **subscribe** rather than download, so a corrected kickoff reaches
their phone without anyone re-importing anything. The Calendar tab offers a
Google link (`calendar.google.com/render?cid=`) and an Apple one (`webcal://`),
both pointed at whichever team is selected on the Games tab.

Two things the generator is careful about:

* **Varsity games are timed events**, converted from New Orleans local time to
  UTC — which correctly gives CDT for the September and October games and CST
  for Nov 5, after daylight saving ends.
* **Sub-varsity games are all-day events with the time in the title.** The
  coach prints "4:30" with no AM/PM, and a calendar entry that confidently
  says 4:30 AM is worse than one that makes you read the title.

Output is deterministic, so rebuilding with no data change produces
byte-identical files. Validated against the `icalendar` parser.

## Tailgates and travel

Defaults live in `tailgate` in `data/season.json` — home location, away
location, when it starts, and the setup/breakdown rules from the welcome
letter. Any game can override them with its own `tailgate: {location, time,
note}`.

A game can also carry `travel`, for a chartered bus:

```json
"travel": {
  "type": "Charter bus",
  "status": "soon",          // "soon" shows "link coming soon"; "open" shows the button
  "headline": "Parent bus to Lafayette",
  "detail": "...",
  "url": null                 // paste the booking link here, set status to "open"
}
```

Week 2 (St. Thomas More, Lafayette) has one waiting on its link.

## Posting a note

The GroupMe things that get scrolled past an hour later — Friday's ride
arrangements, who's needed for the Media Guide.

```bash
python3 tools/notice.py list
python3 tools/notice.py add "Friday scrimmage rides" "Freshmen not 1-2-3 ..." --on 2026-08-21 --from Coach
python3 tools/notice.py add "Media Guide help wanted" "..." --until 2026-08-23
python3 tools/notice.py remove 1
```

Notes appear under **Notes** on Today and retire themselves once the day
they're about has passed, so nobody has to remember to take them down.

Today only, deliberately — it's the screen people actually open, and a note
buried on a fifth tab may as well not exist.

## Final scores

```bash
python3 tools/score.py                   # list every game and its id
python3 tools/score.py week-1 28 14      # Jesuit 28, Madison Prep 14
python3 tools/score.py week-1 28 14 --note OT
python3 tools/score.py --clear week-1
```

Jesuit's points always come first, home or away — the app derives win/loss from
that. Scores land in `results` in `data/season.json` keyed by game id, so
nothing else about the schedule changes. Sub-varsity games work too
(`8th-2026-09-02-hannan`).

A recorded score replaces the kickoff time on the games list, shows as a large
final on the game's own screen, and the team's record appears in the list
heading (`Varsity — 12 games · 3–1`). Played games stop being greyed out once
they have a score.

## Watching from home

`streaming` in `data/season.json` — NFHS Network, Hudl, MaxPreps, ScoreStream.
Shown on each varsity game's screen and in Info.

Away games are usually streamed by the **home** school, not Jesuit, so the app
says so rather than implying Jesuit's NFHS page covers everything.

## Sending it as one file

```bash
python3 tools/build_standalone.py
```

Produces `Jesuit-Football.html` — the entire app in a single file you can text
or email. Opens on any phone, anywhere, no wifi and no hosting.

Photos use the 500px thumbnails, not the 1600px originals: the full set pushes
the file past 13 MB, which stops being textable. Thumbnails land it near 3 MB
and still look right on a phone.

Two things a single file can't do, and the app says so rather than showing a
dead button: calendar subscriptions (Google and Apple need a real URL to poll)
and offline caching (no service worker without a server).

**It is a snapshot.** A copy sitting in someone's inbox never updates. If a
kickoff changes you rebuild and resend — which is the argument for hosting it
properly once it goes out to every family.

## Auditing the data

```bash
python3 tools/audit.py
```

Cross-checks everything the app shows against the coach's calendar, the parent
welcome letter, Jesuit's official Important Dates, and the working spreadsheet
— plus internal consistency: dangling venue ids, meal grades matching no grade,
weekday drift, duplicate sub-varsity games, account-specific Google links.

Run it after any data edit. ERROR means something contradicts a source; CHECK
means two sources disagree and a human has to pick.

## Icons

```bash
python3 tools/make_icons.py
```

## Layout

```
data/       season.json (hand-maintained) + calendar.json (generated)
tools/      parse_calendar.py, build_web_data.py, build_ics.py,
            sunday_update.py, prepare_photos.py, make_icons.py,
            build_school_calendar.py, audit.py, serve.py
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
