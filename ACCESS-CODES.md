# Access codes — for the grade moms only

Give your grade's code to your families. Anyone opening the app is asked
for it once per phone, and never again on that phone.

| Grade | Code | Who hands it out |
| --- | --- | --- |
| Senior | `JAYS-SENIOR-26` | Golda Hartman |
| Junior | `JAYS-JUNIOR-26` | Nicole Abadie |
| Sophomore | `JAYS-SOPH-26` | Mandi Mohr |
| Freshman | `JAYS-FRESH-26` | Gabby Thompson |
| Pre-Freshman | `JAYS-8TH-26` | Laura Wooderson |
| Anyone | `GEAUX-JAYS-26` | General — coaches, family, anyone else |

The code also sets the family's grade in the app, so they skip that step.

## If a code gets passed around

Change just that one — edit `access.codes` in `data/season.json`, then
double-click **Publish the app.command**. The other grades are unaffected.

## What this is and isn't

It keeps the app inside the football family. It is **not** a security lock:
the code is readable in the page source, and the underlying files stay
reachable by direct URL. That's the right trade for what it's for — but
don't treat it as protection for anything genuinely sensitive.
