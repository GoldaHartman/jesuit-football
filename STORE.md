# Getting into the App Store and Play Store

The app is wrapped and ready. What's left needs software and accounts that
only you can install and pay for.

Everything below is one-time setup. After that, publishing an update is one
command.

---

## What's already done

- `ios/` and `android/` projects, generated from the same `docs/` build
- App icons and splash screens at every size both stores require
- Bundle id `org.jesuitnola.football`, name **Jesuit Football**
- The web assets are bundled *inside* the app, so it works with no signal
- **The packaged apps fetch `data.json` from the live site on launch.** This is
  the part that makes a wrapped app viable at all — otherwise a kickoff moving
  on a Wednesday would be frozen until the next review. Schedule fixes reach
  phones in seconds; only design changes need a new submission.

To pick up the latest web build into both native projects:

```bash
npx cap sync
```

---

## Android — do this one first

Cheaper, faster, no macOS upgrade, and roughly a third of your families are on
Android.

**1. Install Android Studio** — <https://developer.android.com/studio>
(~1 GB; includes Java and the SDK, so nothing else to install)

**2. Open the project**

```bash
npx cap open android
```

**3. Build a signed bundle** — Build → Generate Signed App Bundle → Android App
Bundle. It will walk you through creating a keystore.

> **Keep that keystore file and its password somewhere safe.** Lose it and you
> can never update this app again — you'd have to publish a new listing and ask
> every family to reinstall. Put it in 1Password, not just on the laptop.

**4. Play Console** — <https://play.google.com/console> — **$25, one time.**
Create the app, upload the `.aab`, fill in the listing, submit.

Review is usually 1–3 days for a new developer.

---

## iOS — three things have to happen in order

**1. macOS 26.2** — this Mac is on 26.1. System Settings → General → Software
Update. About 7.7 GB and a restart. Xcode will not install until this is done.

**2. Xcode** — Mac App Store, ~15 GB.

**3. Apple Developer Program** — <https://developer.apple.com/programs/> —
**$99/year**, approval usually 24–48 hours.

Then:

```bash
npx cap open ios
```

In Xcode: select the App target → Signing & Capabilities → pick your team.
Product → Archive → Distribute App.

**Send it to TestFlight first.** The four grade moms can install it from a link
while App Store review runs, and TestFlight review is much quicker.

### The one real risk

Apple's **guideline 4.2** rejects apps that are "just a repackaged website."
This app has a reasonable case — it works fully offline, stores your grade and
team, generates calendar subscriptions, and isn't reachable as a plain website
by its users. But rejection is possible.

If it happens, the usual fix is to add something a browser can't do. Push
notifications are the obvious one, and would be genuinely useful here — a
reminder the night before donuts, or two hours before kickoff.

---

## Honest cost and timeline

| | Cost | Time |
| --- | --- | --- |
| Google Play | $25 once | 1–3 days |
| Apple | $99/year | 3–7 days, plus ~23 GB of downloads |

**The live web app already does everything these will do**, minus the store
listing. If Sept 3 is the deadline that matters, send parents
<https://goldahartman.github.io/jesuit-football/> and treat the stores as a
nice-to-have that lands mid-season.
