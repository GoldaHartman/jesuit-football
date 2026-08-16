/* Jesuit Football — parent app
   Data comes from data.js (generated from the coach's calendar PDF and the
   parent welcome letter). Nothing here talks to a server. */

'use strict';

// ---------------------------------------------------------------- utilities

const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Local calendar date as YYYY-MM-DD. Avoids the UTC shift toISOString() causes. */
function isoOf(date) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

/** Parse YYYY-MM-DD as a *local* date, so day-of-week never slips a day. */
function dateOf(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function todayISO() {
  return isoOf(new Date());
}

/** Whole days from a to b, both YYYY-MM-DD. */
function daysBetween(aISO, bISO) {
  return Math.round((dateOf(bISO) - dateOf(aISO)) / 86400000);
}

function shiftISO(iso, days) {
  const d = dateOf(iso);
  d.setDate(d.getDate() + days);
  return isoOf(d);
}

/** '19:00' -> '7:00 PM' */
function prettyTime(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

function longDate(iso) {
  const d = dateOf(iso);
  return `${WEEKDAY_LONG[d.getDay()]}, ${MONTH_LONG[d.getMonth()]} ${d.getDate()}`;
}

function shortDate(iso) {
  const d = dateOf(iso);
  return `${WEEKDAY_ABBR[d.getDay()]}, ${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`;
}

function esc(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const el = (id) => document.getElementById(id);

/* True in the one-file build (tools/build_standalone.py injects the flag).
   No server means no service worker and no calendar subscriptions. */
const STANDALONE = typeof IS_STANDALONE !== 'undefined' && IS_STANDALONE;

/** Photos are file paths when hosted, data: URIs in the one-file build. */
const photoSrc = (path) => (String(path).startsWith('data:') ? path : `photos/${path}`);

/* Which build this page is running, read off our own script tag — the build
   stamps it with a content hash. Shown in Info so a parent stuck on an old
   copy can tell you which one they actually have.
   Declared up here because renderInfo() uses it during the first render. */
const BUILD = (() => {
  const tag = document.querySelector('script[src*="app.js"]');
  const match = tag && tag.getAttribute('src').match(/v=([a-f0-9]+)/);
  return match ? match[1] : 'dev';
})();

// ---------------------------------------------------------------- lookups

const CAL_BY_DATE = Object.fromEntries(CALENDAR.days.map((d) => [d.date, d]));

/* The coach posts the real week on Sundays. Where he has spoken, he wins —
   the year-long calendar is the plan, this is what's actually happening. */
const WEEK = (typeof THIS_WEEK !== 'undefined' && THIS_WEEK) ? THIS_WEEK : null;
const WEEK_BY_DATE = WEEK
  ? Object.fromEntries(WEEK.days.map((d) => [d.date, d]))
  : {};

/** Items for a date: the coach's posted week if he covered it, else the plan. */
function itemsFor(iso) {
  const posted = WEEK_BY_DATE[iso];
  if (posted && posted.items.length) {
    return { items: posted.items, fromCoach: true };
  }
  const planned = CAL_BY_DATE[iso];
  return { items: planned ? planned.items : [], fromCoach: false };
}
const VENUE_BY_ID = Object.fromEntries(SEASON.venues.map((v) => [v.id, v]));
const GRADE_BY_NAME = Object.fromEntries(SEASON.grades.map((g) => [g.name, g]));
const GAME_DATES = new Set(SEASON.games.map((g) => g.date));

const venueOf = (game) => VENUE_BY_ID[game.venueId] || null;

/** The next game on or after `iso`, or null once the season is done. */
function nextGame(iso) {
  return SEASON.games.find((g) => g.date >= iso) || null;
}

function gameOn(iso) {
  return SEASON.games.find((g) => g.date === iso) || null;
}

// ---------------------------------------------------------------- state

const SAVED_GRADE = 'jesuitfb.grade';
const SAVED_TEAM = 'jesuitfb.team';

/** The four teams the program actually fields. Varsity lives in SEASON.games;
    the other three are pulled out of the coach's calendar at build time. */
const TEAMS = ['8th', '9th', 'JV', 'Varsity'];
const TEAM_LABEL = { '8th': '8th', '9th': '9th', JV: 'JV', Varsity: 'Varsity' };
const TEAM_FULL = { '8th': '8th Grade', '9th': '9th Grade', JV: 'JV', Varsity: 'Varsity' };

function currentGrade() {
  const saved = localStorage.getItem(SAVED_GRADE);
  return saved && GRADE_BY_NAME[saved] ? GRADE_BY_NAME[saved] : null;
}

/* The pickers say "12th" but the welcome letter says "Senior", and mixing the
   two reads like they're different things. Everything user-facing goes through
   these, so the app speaks one language. */
function gradeShort(name) {
  const g = GRADE_BY_NAME[name];
  return g ? `${g.shortLabel} grade` : name;
}

function gradeLong(name) {
  const g = GRADE_BY_NAME[name];
  return g ? `${g.shortLabel} grade (${g.name})` : name;
}

function setGrade(name) {
  localStorage.setItem(SAVED_GRADE, name);
  renderAll();
}

function currentTeam() {
  const saved = localStorage.getItem(SAVED_TEAM);
  return TEAMS.includes(saved) ? saved : 'Varsity';
}

/** Games-tab month filter. Reset when the team changes, since each team
    plays in a different set of months. */
let gamesMonth = 'all';

function setTeam(team) {
  localStorage.setItem(SAVED_TEAM, team);
  gamesMonth = 'all';
  renderAll();
}

/**
 * Varsity games and sub-varsity games come from different sources and have
 * different shapes. Flatten both into what the UI actually draws.
 */
function normalize(game) {
  if (game.venueId) {
    const venue = VENUE_BY_ID[game.venueId];
    return {
      date: game.date,
      opponent: game.opponent,
      isHome: game.isHome,
      isDistrict: game.isDistrict,
      label: game.week ? `Week ${game.week}` : 'Preseason',
      time: prettyTime(game.kickoff) || game.kickoffNote || 'Time TBA',
      venueName: venue ? venue.name : null,
      venueId: game.venueId,
      notes: game.notes,
      mealGrade: game.mealGrade,
      type: game.type,
      raw: game,
    };
  }
  return {
    date: game.date,
    opponent: game.opponent,
    isHome: game.isHome,
    isDistrict: game.isDistrict,
    label: TEAM_FULL[game.team],
    // times are shown exactly as the coach printed them — no AM/PM guessing
    time: game.kickoff || 'Time TBA',
    venueName: null,
    venueId: null,
    notes: null,
    mealGrade: null,
    type: 'team',
    raw: game,
  };
}

// ---------------------------------------------------------------- results

const RESULTS = SEASON.results || {};

const slugify = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Stable id for a game, matching what tools/score.py writes. */
function resultId(g) {
  if (g.raw && g.raw.id) return g.raw.id;                 // varsity
  return `${g.raw.team}-${g.date}-${slugify(g.opponent)}`; // sub-varsity
}

function resultFor(g) {
  const r = RESULTS[resultId(g)];
  if (!r || typeof r.us !== 'number' || typeof r.them !== 'number') return null;
  return {
    us: r.us,
    them: r.them,
    note: r.note || '',
    outcome: r.us > r.them ? 'W' : r.us < r.them ? 'L' : 'T',
  };
}

/** Win–loss record for a team so far, or null if nothing has been played. */
function recordFor(games) {
  let w = 0, l = 0, t = 0;
  games.forEach((g) => {
    const r = resultFor(g);
    if (!r) return;
    if (r.outcome === 'W') w += 1;
    else if (r.outcome === 'L') l += 1;
    else t += 1;
  });
  if (!(w + l + t)) return null;
  return t ? `${w}–${l}–${t}` : `${w}–${l}`;
}

function gamesForTeam(team) {
  const list = team === 'Varsity'
    ? SEASON.games
    : (SEASON.teamGames || []).filter((g) => g.team === team);
  return list.map(normalize);
}

// ---------------------------------------------------------------- game-week tasks

/**
 * This grade's game-time notes for a given game, straight out of the welcome letter.
 * `yours` marks the items that are this grade's specific job rather than the
 * baseline every grade shares.
 */
function tasksFor(grade, game) {
  if (!grade || !game) return [];

  const tasks = [];
  const dayBefore = shortDate(shiftISO(game.date, -1));
  const isVarsity = game.type === 'regular';

  if (game.mealGrade === grade.name) {
    tasks.push({
      icon: '🍽️', yours: true,
      title: 'Pre-game meal — this one is your grade',
      when: 'Your grade mom will confirm what is needed',
    });
  }

  if (grade.name === 'Freshman' && isVarsity) {
    tasks.push({
      icon: '🍩', yours: true,
      title: 'Donuts and milk to the locker room by 7:10 am',
      when: `${dayBefore} — the morning before the game`,
    });
    if (game.id === 'week-1') {
      tasks.push({
        icon: '🌹', yours: true,
        title: 'Presentation roses with a bow, plus the announcer script',
        when: 'Senior Night — from Villere\'s florist',
      });
    }
  }

  // The weekly senior jobs start with the first regular season game — the
  // preseason scrimmage and jamboree don't get banners or treat bags.
  if (grade.name === 'Senior' && isVarsity) {
    tasks.push({
      icon: '🎁', yours: true,
      title: 'Treat bags for every varsity player, trainer, and manager',
      when: `${dayBefore} — shop, stuff, add a note, drop at the locker room`,
    });
    tasks.push({
      icon: '🪧', yours: true,
      title: 'Game banners in the locker room',
      when: 'This week — chaired by Raelene Williams',
    });
    tasks.push({
      icon: '🧺', yours: true,
      title: 'Tailgate setup and paper products',
      when: 'Game day — chaired by Tessa Vorhaben and Jene Ponder',
    });
    if (!game.isHome && venueOf(game) && venueOf(game).driveNote) {
      tasks.push({
        icon: '🚌', yours: true,
        title: 'Parent and family bus for the travel game',
        when: venueOf(game).driveNote,
      });
    }
  }

  if (grade.name === 'Junior' && game.id === 'week-9') {
    tasks.push({
      icon: '🎉', yours: true,
      title: 'Senior Parent Appreciation Tailgate',
      when: 'Fri, Oct 30 at Tad Gormley — the Junior class hosts',
    });
  }

  if (isVarsity) {
    tasks.push({
      icon: '🥛', yours: false,
      title: 'Post-game chocolate milk — 2 volunteers',
      when: 'Ice chest, 24 iced chocolate milks, kept cold, at the field exit',
    });
  }

  if (grade.tailgateFood) {
    tasks.push({
      icon: '🍽️', yours: false,
      title: `Tailgate food: ${grade.tailgateFood.toLowerCase()}`,
      when: 'Your grade\'s category — bring something to share',
    });
  }

  return tasks;
}

// ---------------------------------------------------------------- components

function badgesFor(game) {
  const out = [];
  if (game.type === 'preseason') out.push('<span class="badge">Preseason</span>');
  else out.push(game.isHome
    ? '<span class="badge home">Home</span>'
    : '<span class="badge away">Away</span>');
  if (game.isDistrict) out.push('<span class="badge district">District</span>');

  const note = (game.notes || '');
  if (/SENIOR NIGHT/.test(note))  out.push('<span class="badge special">Senior Night</span>');
  if (/RIVALRY/.test(note))       out.push('<span class="badge special">Rivalry</span>');
  if (/HOMECOMING/.test(note))    out.push('<span class="badge special">Homecoming</span>');
  if (/LAST HOME GAME/.test(note))out.push('<span class="badge special">Last home game</span>');
  return out.join('');
}

function venueCard(venue, heading) {
  if (!venue) return '';
  return `
    <div class="card">
      <div class="eyebrow">${esc(heading || 'Venue')}</div>
      <div class="venue-h">${esc(venue.name)}</div>
      <div class="venue-sub">${esc(venue.address)}</div>
      <div class="rule">
        <div class="lbl">Bags</div>
        <div class="txt">${esc(venue.bagPolicy)}</div>
      </div>
      <div class="rule">
        <div class="lbl">Not allowed</div>
        <div class="txt">${esc(venue.prohibited)}</div>
      </div>
      <div class="rule">
        <div class="lbl">Parking</div>
        <div class="txt">${esc(venue.parking)}</div>
      </div>
      ${venue.driveNote ? `<div class="rule warn"><div class="lbl">Heads up</div><div class="txt">${esc(venue.driveNote)}</div></div>` : ''}
      ${venue.tickets ? `<div class="rule"><div class="lbl">Tickets</div><div class="txt"><a class="link" href="${esc(venue.tickets)}" target="_blank" rel="noopener">${esc(venue.ticketNote || 'Buy tickets')}</a></div></div>`
                      : (venue.ticketNote ? `<div class="rule"><div class="lbl">Tickets</div><div class="txt">${esc(venue.ticketNote)}</div></div>` : '')}
    </div>`;
}

// ---------------------------------------------------------------- views

/**
 * The coach's posted week. Shows the whole week with today marked, plus the
 * original photo — a model reading a picture can misread a 5 as a 6, so the
 * source stays one tap away rather than being quietly thrown out.
 */
function thisWeekCard(iso) {
  if (!WEEK || !WEEK.days || !WEEK.days.length) return '';

  const days = WEEK.days.slice().sort((a, b) => a.date.localeCompare(b.date));
  const last = days[days.length - 1].date;
  if (last < iso) return '';   // the posted week has already gone by

  let html = '<h2 class="section">This week, from Coach</h2><div class="card flush">';

  html += days.map((day) => {
    const isToday = day.date === iso;
    const past = day.date < iso;
    const d = dateOf(day.date);
    return `
      <div class="cal-day${isToday ? ' today' : ''}"${past ? ' style="opacity:.45"' : ''}>
        <div class="num">
          <div class="d">${d.getDate()}</div>
          <div class="w">${WEEKDAY_ABBR[d.getDay()]}</div>
        </div>
        <div class="items">${day.items.map((i) => `<div>${esc(i)}</div>`).join('')}</div>
      </div>`;
  }).join('');

  html += '</div>';

  if (WEEK.unreadable && WEEK.unreadable.length) {
    html += `<div class="card"><div class="task-flag">
      <strong>Check the photo for these</strong> — they were not clear enough to read:
      <div class="small" style="margin-top:5px">${WEEK.unreadable.map(esc).join('<br>')}</div>
    </div></div>`;
  }

  if (WEEK.image) {
    html += `<div class="photo-grid" style="grid-template-columns:1fr">
      <button data-schedule-image="1"><img src="${esc(WEEK.image)}" alt="The coach's posted schedule" loading="lazy" style="aspect-ratio:auto"></button>
    </div>`;
  }

  html += `<div class="footnote" style="margin-top:8px">Read automatically from the picture ${esc(WEEK.postedBy || 'Coach')} posted${WEEK.postedOn ? ' on ' + esc(shortDate(WEEK.postedOn)) : ''}.<br>Tap it to check the original. Times change — your son hears first.</div>`;

  return html;
}

function renderToday() {
  const iso = todayISO();
  const game = gameOn(iso);
  const grade = currentGrade();

  // the countdown follows your son's team; the parent jobs follow the varsity
  // game week, since that is how the grade duties are organised
  const team = currentTeam();
  const upcoming = gamesForTeam(team).find((g) => g.date >= iso) || null;
  const nextVarsity = nextGame(iso);

  let html = `<div class="today-date">${esc(longDate(iso))}</div>`;

  // --- what's on today
  const today = itemsFor(iso);
  html += '<div class="card">';
  if (today.fromCoach) {
    html += '<div class="eyebrow" style="color:var(--gold)">From Coach — this week</div>';
  }
  if (today.items.length) {
    html += today.items.map((item) => {
      const isGame = /WEEK \d|SCRIMMAGE|JAMBOREE|CHAMPIONSHIP/i.test(item);
      return `<div class="today-item${isGame ? ' is-game' : ''}"><span class="dot"></span><span>${esc(item)}</span></div>`;
    }).join('');
  } else {
    html += '<div class="rest-day">Nothing on the football calendar today.</div>';
  }
  html += '</div>';

  html += thisWeekCard(iso);

  // --- countdown for your team
  if (upcoming) {
    const days = daysBetween(iso, upcoming.date);
    const when = days === 0 ? 'TODAY' : days === 1 ? 'TOMORROW' : `${days}<small>days</small>`;
    const prefix = upcoming.type === 'preseason' ? '' : (upcoming.isHome ? 'vs ' : 'at ');
    const badges = upcoming.type === 'team'
      ? `<span class="badge">${upcoming.isHome ? 'Home' : 'Away'}</span>${upcoming.isDistrict ? '<span class="badge">District</span>' : ''}`
      : badgesFor(upcoming.raw);

    html += `
      <div class="card countdown">
        <div class="eyebrow">${esc(TEAM_FULL[team])}${upcoming.label !== TEAM_FULL[team] ? ' · ' + esc(upcoming.label) : ''}</div>
        <div class="n">${when}</div>
        <div class="opponent">${prefix}${esc(upcoming.opponent)}</div>
        <div class="meta">${esc(shortDate(upcoming.date))} · ${esc(upcoming.time)}${upcoming.venueName ? ' · ' + esc(upcoming.venueName) : ''}</div>
        <div class="badges">${badges}</div>
        ${upcoming.notes ? `<div class="tagline">${esc(upcoming.notes)}</div>` : ''}
      </div>`;
  } else {
    html += `<div class="card"><div class="rest-day">No more ${esc(TEAM_FULL[team])} games on the calendar. Go Jays!</div></div>`;
  }

  // --- team switcher. Labelled, because the grade picker below uses chips that
  //     look identical and two of the labels ("8th", "9th") are the same word.
  html += `<div class="picker-label">Which team is your son on?</div>
    <div class="picker four">
      ${TEAMS.map((t) => `<button data-team="${esc(t)}" class="${t === team ? 'on' : ''}">${esc(TEAM_LABEL[t])}</button>`).join('')}
    </div>
    <div class="footnote" style="margin:-4px 0 4px">That sets the countdown above and the Games tab.</div>`;

  // --- deadlines creeping up (ad deadlines, Senior Night) — easy to miss
  const soon = (SEASON.keyDates || [])
    .filter((k) => k.date >= iso && daysBetween(iso, k.date) <= 14);

  if (soon.length) {
    html += '<h2 class="section">Coming up</h2>';
    html += soon.map((k) => {
      const out = daysBetween(iso, k.date);
      const when = out === 0 ? 'Today' : out === 1 ? 'Tomorrow' : `In ${out} days`;
      return `
        <div class="card">
          <div class="task-flag">
            <strong>${esc(k.title)}</strong> · ${esc(when)}, ${esc(shortDate(k.date))}
          </div>
          <div class="small muted">${esc(k.detail)}</div>
          ${k.link ? `<a class="big-action secondary" style="margin-top:11px" href="${esc(k.link)}" target="_blank" rel="noopener">Open the link</a>` : ''}
        </div>`;
    }).join('');
  }

  // --- your grade this week
  if (grade && nextVarsity) {
    const out = daysBetween(iso, nextVarsity.date);
    const tasks = tasksFor(grade, nextVarsity);
    if (tasks.length) {
      html += `<h2 class="section">Game-time notes · ${esc(gradeShort(grade.name))}${out <= 7 ? '' : ' · next game week'}</h2>`;
      html += '<div class="card">';
      if (grade.name === nextVarsity.mealGrade) {
        html += `<div class="task-flag"><strong>Your class has the pre-game meal</strong> for ${esc(nextVarsity.opponent)} on ${esc(shortDate(nextVarsity.date))}.</div>`;
      }
      html += tasks.map((t) => `
        <div class="task${t.yours ? ' yours' : ''}">
          <div class="icon">${t.icon}</div>
          <div class="body">
            <div class="title">${esc(t.title)}</div>
            <div class="when">${esc(t.when)}</div>
          </div>
        </div>`).join('');
      html += '</div>';
    }
  } else if (!grade) {
    html += `
      <div class="card">
        <div class="eyebrow">Set this once</div>
        <div style="font-size:15px;margin-bottom:11px">Which grade is your son in? This is his school year, not his team — it sets the game-time notes for your class.</div>
        <div class="picker">
          ${SEASON.grades.map((g) => `<button data-grade="${esc(g.name)}">${esc(g.shortLabel)}</button>`).join('')}
        </div>
      </div>`;
  }

  // --- game-day venue detail
  if (game) {
    html += '<h2 class="section">Game day</h2>';
    html += venueCard(venueOf(game), 'Where you are going');
  }

  html += `<button class="big-action secondary" data-goto="calendar" data-top="1" style="margin-top:6px">Sync the schedule to your calendar</button>`;
  html += `<button class="big-action secondary" data-goto="info">Order buttons and lanyards</button>`;

  html += `<div class="footnote">Coaches communicate directly with the players.<br>Ask your son first — then your grade mom.</div>`;

  el('view-today').innerHTML = html;
}

/** The game currently open on its own screen, by key. Not persisted. */
let openGame = null;

const gameKey = (g) => `${g.date}-${g.opponent}`.replace(/[^a-z0-9-]/gi, '');

const mapsUrl = (query) => `https://maps.google.com/?q=${encodeURIComponent(query)}`;

/** One game, on its own screen — nothing else competing for attention. */
function renderGameView() {
  if (!openGame) return;

  const team = currentTeam();
  const g = gamesForTeam(team).find((x) => gameKey(x) === openGame);
  if (!g) { show('schedule'); return; }

  const iso = todayISO();
  const out = daysBetween(iso, g.date);
  const prefix = g.type === 'preseason' ? '' : (g.isHome ? 'vs ' : 'at ');
  const badges = g.type === 'team'
    ? `<span class="badge ${g.isHome ? 'home' : 'away'}">${g.isHome ? 'Home' : 'Away'}</span>${g.isDistrict ? '<span class="badge district">District</span>' : ''}`
    : badgesFor(g.raw) + (g.mealGrade ? `<span class="badge">${esc(GRADE_BY_NAME[g.mealGrade] ? GRADE_BY_NAME[g.mealGrade].shortLabel : g.mealGrade)} meal</span>` : '');

  let html = `<button class="linkish" data-goto="schedule" style="padding-left:0;margin-bottom:6px">‹ All ${esc(TEAM_FULL[team])} games</button>`;

  const result = resultFor(g);
  const finalLine = result
    ? `<div class="final">
         <span class="mark">${result.outcome === 'W' ? 'Won' : result.outcome === 'L' ? 'Lost' : 'Tied'}</span>
         <span class="digits">${result.us}–${result.them}</span>
       </div>${result.note ? `<div class="tagline">${esc(result.note)}</div>` : ''}`
    : (out >= 0
        ? `<div class="tagline">${out === 0 ? 'Today.' : out === 1 ? 'Tomorrow.' : `In ${out} days.`}</div>`
        : '<div class="tagline">Played — no score recorded yet.</div>');

  html += `
    <div class="card countdown">
      <div class="eyebrow">${esc(TEAM_FULL[team])}${g.label !== TEAM_FULL[team] ? ' · ' + esc(g.label) : ''}</div>
      <div class="opponent" style="margin-top:2px">${prefix}${esc(g.opponent)}</div>
      <div class="meta">${esc(longDate(g.date))} · ${esc(g.time)}</div>
      <div class="badges">${badges}</div>
      ${finalLine}
    </div>`;

  html += gameDetail(g);

  // watching from home — or checking the score when you couldn't make it
  const streaming = SEASON.streaming;
  if (streaming && g.type !== 'team') {
    html += `<h2 class="section">${result ? 'Watch it back' : 'Can\'t be there?'}</h2>`;
    html += streaming.links.map((link) => `
      <a class="big-action secondary" href="${esc(link.url)}" target="_blank" rel="noopener">${esc(link.label)}</a>
      <div class="footnote" style="margin:-4px 0 12px">${esc(link.detail)}</div>`).join('');
    if (!g.isHome) {
      html += `<div class="card"><div class="small muted">${esc(streaming.note)}</div></div>`;
    }
  }

  // what your class owes for this particular game
  const grade = currentGrade();
  if (grade && g.raw && g.type !== 'team') {
    const tasks = tasksFor(grade, g.raw);
    if (tasks.length) {
      html += `<h2 class="section">${esc(gradeShort(grade.name))} — for this game</h2><div class="card">`;
      html += tasks.map((t) => `
        <div class="task${t.yours ? ' yours' : ''}">
          <div class="icon">${t.icon}</div>
          <div class="body">
            <div class="title">${esc(t.title)}</div>
            <div class="when">${esc(t.when)}</div>
          </div>
        </div>`).join('');
      html += '</div>';
    }
  }

  el('view-game').innerHTML = html;
}

/** Everything you need on the way to a game: when, where, and what gets you turned away at the gate. */
function gameDetail(g) {
  const venue = g.venueId ? VENUE_BY_ID[g.venueId] : null;
  let html = '<div class="card">';

  html += `<div class="rule"><div class="lbl">Kickoff</div><div class="txt">${esc(g.time)}${g.type === 'team' ? ' — as printed on the coach\'s calendar; confirm with your son' : ''}</div></div>`;

  if (!venue) {
    html += `<div class="rule"><div class="lbl">Where</div><div class="txt">The coach's calendar doesn't list a venue for sub-varsity games. Check with your grade mom.</div></div>`;
    html += '</div>';
    return html;
  }

  html += `<div class="rule"><div class="lbl">Where</div><div class="txt">${esc(venue.name)}<br>${esc(venue.address)}</div></div>`;
  html += `<a class="big-action secondary" style="margin-top:11px" href="${esc(mapsUrl(venue.address || venue.name))}" target="_blank" rel="noopener">Open in Maps</a>`;

  if (g.mealGrade) {
    html += `<div class="rule"><div class="lbl">Pre-game meal</div><div class="txt">${esc(gradeLong(g.mealGrade))}</div></div>`;
  }
  if (g.notes) {
    html += `<div class="rule"><div class="lbl">Note</div><div class="txt">${esc(g.notes)}</div></div>`;
  }

  html += `<div class="rule"><div class="lbl">Bags</div><div class="txt">${esc(venue.bagPolicy)}</div></div>`;
  html += `<div class="rule"><div class="lbl">Not allowed</div><div class="txt">${esc(venue.prohibited)}</div></div>`;
  html += `<div class="rule"><div class="lbl">Parking</div><div class="txt">${esc(venue.parking)}</div></div>`;
  if (venue.driveNote) {
    html += `<div class="rule warn"><div class="lbl">Heads up</div><div class="txt">${esc(venue.driveNote)}</div></div>`;
  }
  if (venue.tickets) {
    html += `<a class="big-action secondary" style="margin-top:11px" href="${esc(venue.tickets)}" target="_blank" rel="noopener">Tickets</a>`;
    if (venue.ticketNote) html += `<div class="footnote" style="margin:-4px 0 0">${esc(venue.ticketNote)}</div>`;
  } else if (venue.ticketNote) {
    html += `<div class="rule"><div class="lbl">Tickets</div><div class="txt">${esc(venue.ticketNote)}</div></div>`;
  }

  html += '</div>';

  html += tailgateCard(g);
  html += travelCard(g);

  return html;
}

/** Where to be before kickoff, and what your class brings. */
function tailgateCard(g) {
  const base = SEASON.tailgate;
  if (!base || g.type === 'team') return '';   // no tailgate for sub-varsity

  const own = (g.raw && g.raw.tailgate) || {};
  const where = own.location || (g.isHome ? base.homeLocation : base.awayLocation);
  const grade = currentGrade();

  let html = '<h2 class="section">Tailgate</h2><div class="card">';
  html += `<div class="rule"><div class="lbl">Where</div><div class="txt">${esc(where)}</div></div>`;
  html += `<div class="rule"><div class="lbl">When</div><div class="txt">${esc(own.time || base.defaultStart)}</div></div>`;

  if (grade && grade.tailgateFood) {
    html += `<div class="rule"><div class="lbl">Your class brings</div><div class="txt"><strong>${esc(grade.tailgateFood)}</strong> — ${esc(gradeShort(grade.name))}</div></div>`;
  } else {
    html += `<div class="rule"><div class="lbl">What to bring</div><div class="txt">Set your grade on Today and this shows your class's dish.</div></div>`;
  }

  if (own.note) {
    html += `<div class="rule warn"><div class="lbl">This week</div><div class="txt">${esc(own.note)}</div></div>`;
  }

  html += `<div class="footnote" style="text-align:left;margin:12px 0 0">${esc(base.everyone)}<br><br>${esc(base.setup)} ${esc(base.breakdown)}</div>`;
  html += '</div>';
  return html;
}

/** A chartered bus, when there is one. */
function travelCard(g) {
  const travel = g.raw && g.raw.travel;
  if (!travel) return '';

  const open = travel.status === 'open' && travel.url;

  return `
    <h2 class="section">${esc(travel.type || 'Travel')}</h2>
    <div class="card">
      <div class="task-flag">
        <strong>${esc(travel.headline || 'Team bus')}</strong>
        ${open ? '' : ' <span class="why">· link coming soon</span>'}
      </div>
      <div class="small muted">${esc(travel.detail || '')}</div>
      ${open
        ? `<a class="big-action" style="margin-top:12px" href="${esc(travel.url)}" target="_blank" rel="noopener">Reserve a seat</a>`
        : `<div class="small muted" style="margin-top:10px">Watch the GroupMe — the booking link will appear here too.</div>`}
    </div>`;
}

function renderSchedule() {
  const iso = todayISO();
  const team = currentTeam();
  const games = gamesForTeam(team);
  const upcoming = games.find((g) => g.date >= iso);

  let html = `<h2 class="section">Which team?</h2>
    <div class="picker four">
      ${TEAMS.map((t) => `<button data-team="${esc(t)}" class="${t === team ? 'on' : ''}">${esc(TEAM_LABEL[t])}</button>`).join('')}
    </div>`;

  if (!games.length) {
    html += '<div class="empty">No games listed for this team yet.</div>';
    el('view-schedule').innerHTML = html;
    return;
  }

  // month options: only months this team still has games in, so nobody picks
  // a month and lands on an empty list
  const now = dateOf(iso);
  const cutoff = now.getFullYear() * 12 + now.getMonth();
  const monthsWithGames = [];
  games.forEach((g) => {
    const d = dateOf(g.date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (d.getFullYear() * 12 + d.getMonth() < cutoff) return;
    if (!monthsWithGames.some((m) => m.key === key)) {
      monthsWithGames.push({ key, label: `${MONTH_LONG[d.getMonth()]} ${d.getFullYear()}` });
    }
  });

  if (!monthsWithGames.some((m) => m.key === gamesMonth)) gamesMonth = 'all';

  if (monthsWithGames.length > 1) {
    html += `
      <div class="cal-bar" style="top:0;position:static;padding-top:0">
        <select id="games-month" aria-label="Filter games by month">
          <option value="all">All games</option>
          ${monthsWithGames.map((m) => `<option value="${esc(m.key)}"${m.key === gamesMonth ? ' selected' : ''}>${esc(m.label)}</option>`).join('')}
        </select>
      </div>`;
  }

  const shown = gamesMonth === 'all'
    ? games
    : games.filter((g) => {
        const d = dateOf(g.date);
        return `${d.getFullYear()}-${d.getMonth()}` === gamesMonth;
      });

  const record = recordFor(games);
  const heading = gamesMonth === 'all'
    ? `${TEAM_FULL[team]} — ${games.length} games${record ? ` · ${record}` : ''}`
    : `${TEAM_FULL[team]} — ${shown.length} game${shown.length === 1 ? '' : 's'} in ${monthsWithGames.find((m) => m.key === gamesMonth).label}`;

  html += `<h2 class="section">${esc(heading)}</h2><div class="card flush">`;
  html += shown.map((g) => {
    const past = g.date < iso;
    const isNext = upcoming && g.date === upcoming.date && g.opponent === upcoming.opponent;
    const prefix = g.type === 'preseason' ? '' : (g.isHome ? 'vs ' : 'at ');
    const badges = g.type === 'team'
      ? `<span class="badge ${g.isHome ? 'home' : 'away'}">${g.isHome ? 'Home' : 'Away'}</span>${g.isDistrict ? '<span class="badge district">District</span>' : ''}`
      : badgesFor(g.raw) + (g.mealGrade ? `<span class="badge">${esc(GRADE_BY_NAME[g.mealGrade] ? GRADE_BY_NAME[g.mealGrade].shortLabel : g.mealGrade)} meal</span>` : '');

    const result = resultFor(g);

    return `
      <button class="game${past && !result ? ' past' : ''}${isNext ? ' next' : ''}" data-game="${esc(gameKey(g))}">
        <div class="row1">
          <span class="wk">${esc(g.label)}</span>
          <span class="date">${esc(shortDate(g.date))}</span>
        </div>
        <div class="opp">${prefix}${esc(g.opponent)}<span class="chev">›</span></div>
        ${result
          ? `<div class="score ${result.outcome === 'W' ? 'won' : result.outcome === 'L' ? 'lost' : 'tied'}">
               <span class="mark">${result.outcome}</span> ${result.us}–${result.them}${result.note ? ` <span class="note">${esc(result.note)}</span>` : ''}
             </div>`
          : `<div class="where">${esc(g.time)}${g.venueName ? ' · ' + esc(g.venueName) : ''}</div>`}
        <div class="badges">${badges}</div>
      </button>`;
  }).join('');
  html += '</div>';

  html += team === 'Varsity'
    ? `<div class="footnote">Jesuit hosts four of the ten. Brother Martin and St. Augustine are played at Tad Gormley, but we are the visiting team.<br>Tap a game for that venue's bag policy and parking.</div>`
    : `<div class="footnote">Taken from the coach's calendar, with times exactly as he printed them.<br>Sub-varsity venues are not listed on the calendar — check with your grade mom, and confirm times with your son.</div>`;

  el('view-schedule').innerHTML = html;

  const monthSelect = el('games-month');
  if (monthSelect) {
    monthSelect.addEventListener('change', () => {
      gamesMonth = monthSelect.value;
      renderSchedule();
      window.scrollTo(0, 0);
    });
  }
}

/** Set by the "show earlier months" link; not persisted between sessions. */
let showPastMonths = false;

function allCalendarMonths() {
  const months = [];

  // union of both calendars — a school-only day like MLK has no football
  // entry, but you should still be able to tap it and see why there's no school
  const dates = new Set(CALENDAR.days.map((d) => d.date));
  Object.keys(SCHOOL_BY_DATE).forEach((d) => dates.add(d));

  const merged = [...dates].sort().map((iso) => ({
    date: iso,
    items: (CAL_BY_DATE[iso] || {}).items || [],
  }));

  merged.forEach((day) => {
    const d = dateOf(day.date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    let group = months[months.length - 1];
    if (!group || group.key !== key) {
      group = {
        key,
        year: d.getFullYear(),
        month: d.getMonth(),
        label: `${MONTH_LONG[d.getMonth()]} ${d.getFullYear()}`,
        days: [],
      };
      months.push(group);
    }
    group.days.push({ day, d });
  });
  return months;
}

/**
 * Months still worth showing. A month drops off once it's fully over — the
 * current month stays put until the last day of it has passed.
 */
// ---------------------------------------------------------------- calendar subscribe

const FEED_FOR_TEAM = {
  Varsity: 'jesuit-varsity.ics',
  JV: 'jesuit-jv.ics',
  '9th': 'jesuit-9th.ics',
  '8th': 'jesuit-8th.ics',
};

/**
 * Subscribing beats downloading: when a TBD kickoff finally gets set, a
 * subscribed calendar picks it up on its own. A downloaded file never changes.
 */
function subscribeCard() {
  if (STANDALONE) {
    return `<h2 class="section">Add to your calendar</h2>
      <div class="card"><div class="small muted">Calendar sync needs the live web link — it can't work
      from a file saved on your phone. Ask Golda for the link and it'll be on the Calendar tab there.</div></div>`;
  }
  const team = currentTeam();
  const feed = FEED_FOR_TEAM[team] || FEED_FOR_TEAM.Varsity;

  const link = (file) => {
    const abs = new URL(file, location.href).href;
    return {
      webcal: abs.replace(/^https?:/, 'webcal:'),
      google: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(abs.replace(/^https?:/, 'webcal:'))}`,
    };
  };

  const mine = link(feed);
  const everything = link('jesuit-full-season.ics');

  return `
    <h2 class="section">Add to your calendar</h2>
    <div class="card">
      <div class="eyebrow">${esc(TEAM_FULL[team])} games</div>
      <a class="big-action" href="${esc(mine.google)}" target="_blank" rel="noopener">Add to Google Calendar</a>
      <a class="big-action secondary" href="${esc(mine.webcal)}">Add to Apple Calendar</a>
      <div class="small muted" style="margin-top:4px">
        This subscribes — it is not a one-off copy. When a kickoff time changes,
        your calendar updates on its own.
      </div>
    </div>
    <div class="card">
      <div class="eyebrow">Everything — practices too</div>
      <a class="big-action secondary" href="${esc(everything.google)}" target="_blank" rel="noopener">Add to Google Calendar</a>
      <a class="big-action secondary" href="${esc(everything.webcal)}">Add to Apple Calendar</a>
      <div class="small muted" style="margin-top:4px">
        All 277 days, including every practice and "done for" time. Busy, but complete.
      </div>
    </div>
    <div class="footnote" style="margin-top:0">
      Switch teams on the Games tab and this follows.<br>
      Google can take a few hours to notice a change; Apple checks more often.
    </div>`;
}

// ---------------------------------------------------------------- day sheet

const SCHOOL_BY_DATE = (typeof SCHOOL !== 'undefined' && SCHOOL && SCHOOL.days) ? SCHOOL.days : {};

const AUDIENCE_LABEL = {
  faculty: 'Faculty only',
  holiday: 'No school',
};

function schoolFor(iso) {
  return SCHOOL_BY_DATE[iso] || [];
}

/** Everything known about one day: school on top, football highlighted. */
function openDay(iso) {
  const football = itemsFor(iso);
  const school = schoolFor(iso);
  const game = gameOn(iso);
  const teamToday = (SEASON.teamGames || []).filter((g) => g.date === iso);

  let html = `<h3>${esc(longDate(iso))}</h3>`;
  const year = dateOf(iso).getFullYear();
  html += `<div class="sub">${year}${football.fromCoach ? ' · times posted by Coach this week' : ''}</div>`;

  // --- football
  if (football.items.length || game || teamToday.length) {
    html += '<div class="block football"><div class="lbl">🏈 Football</div>';

    if (game) {
      const venue = venueOf(game);
      const kickoff = prettyTime(game.kickoff) || game.kickoffNote || 'Time TBA';
      const prefix = game.type === 'preseason' ? '' : (game.isHome ? 'vs ' : 'at ');
      html += `<div class="line"><strong>${game.week ? `Week ${game.week} — ` : ''}${prefix}${esc(game.opponent)}</strong></div>`;
      html += `<div class="line why">${esc(kickoff)}${venue ? ' · ' + esc(venue.name) : ''}</div>`;
    }

    teamToday.forEach((g) => {
      html += `<div class="line">${esc(TEAM_FULL[g.team])} ${g.isHome ? 'vs' : 'at'} ${esc(g.opponent)}${g.kickoff ? ' — ' + esc(g.kickoff) : ''}</div>`;
    });

    football.items.forEach((item) => {
      html += `<div class="line">${esc(item)}</div>`;
    });

    html += '</div>';
  }

  // --- school
  if (school.length) {
    html += '<div class="block"><div class="lbl">🎓 Jesuit</div>';
    school.forEach((entry) => {
      const tag = AUDIENCE_LABEL[entry.audience];
      // events the coach lists but Jesuit's official dates don't — say so
      const viaCoach = entry.source === 'coach'
        ? ' <span class="why">· from the coach\'s calendar</span>'
        : '';
      html += `<div class="line"><strong>${esc(entry.title)}</strong>${tag ? ` <span class="why">· ${esc(tag)}</span>` : ''}${viaCoach}</div>`;
      if (entry.detail) html += `<div class="line why">${esc(entry.detail)}</div>`;
    });
    html += '</div>';
  }

  if (!football.items.length && !school.length && !game && !teamToday.length) {
    html += '<div class="block"><div class="line why">Nothing on either calendar for this day.</div></div>';
  }

  html += `<div class="footnote" style="margin-bottom:0">School dates from Jesuit's official 2026-27 Important Dates.<br>Football from Coach Manale's calendar.</div>`;

  const sheet = el('daysheet');
  sheet.querySelector('.sheet-body').innerHTML = html;
  sheet.hidden = false;
  document.body.style.overflow = 'hidden';
  pushOverlay('day');
}

function closeSheet() {
  el('daysheet').hidden = true;
  document.body.style.overflow = '';
}

function calendarMonths() {
  const all = allCalendarMonths();
  if (showPastMonths) return { months: all, hidden: 0 };

  const now = dateOf(todayISO());
  const cutoff = now.getFullYear() * 12 + now.getMonth();
  const upcoming = all.filter((m) => m.year * 12 + m.month >= cutoff);

  // past the end of the season everything is "over"; keep the last month
  // rather than showing an empty calendar
  if (!upcoming.length) return { months: all.slice(-1), hidden: all.length - 1 };

  return { months: upcoming, hidden: all.length - upcoming.length };
}

/** The month group containing today, else the first one still ahead of us. */
function currentMonthKey(months, iso) {
  const hit = months.find((m) => m.days.some((x) => x.day.date === iso))
    || months.find((m) => m.days.some((x) => x.day.date >= iso))
    || months[months.length - 1];
  return hit ? hit.key : null;
}

function renderCalendar() {
  const iso = todayISO();
  const { months, hidden } = calendarMonths();

  const bar = `
    <div class="cal-bar">
      <select id="month-picker" aria-label="Jump to month">
        ${months.map((m) => `<option value="${esc(m.key)}">${esc(m.label)}</option>`).join('')}
      </select>
      <button id="jump-today" type="button">Today</button>
    </div>`;

  const body = months.map((group) => {
    const rows = group.days.map(({ day, d }) => {
      const classes = [
        'cal-day',
        day.date === iso ? 'today' : '',
        GAME_DATES.has(day.date) ? 'is-game' : '',
        (d.getDay() === 0 || d.getDay() === 6) ? 'weekend' : '',
      ].filter(Boolean).join(' ');

      const school = schoolFor(day.date);
      const lines = day.items.length
        ? day.items.map((i) => `<div>${esc(i)}</div>`).join('')
        : '';
      const schoolLine = school.length
        ? `<div class="muted small">🎓 ${esc(school.map((s) => s.title).join(' · '))}</div>`
        : '';

      return `
        <div class="${classes}" id="cal-${day.date}" data-day="${esc(day.date)}" role="button" tabindex="0">
          <div class="num">
            <div class="d">${d.getDate()}</div>
            <div class="w">${WEEKDAY_ABBR[d.getDay()]}</div>
          </div>
          <div class="items">${lines}${schoolLine}</div>
        </div>`;
    }).join('');

    return `<div class="cal-month" id="m-${esc(group.key)}" data-month="${esc(group.key)}">${esc(group.label)}</div><div class="card flush">${rows}</div>`;
  }).join('');

  const pastLink = hidden > 0
    ? `<div class="footnote"><button type="button" class="linkish" id="show-past">Show ${hidden} earlier month${hidden === 1 ? '' : 's'}</button></div>`
    : (showPastMonths
        ? `<div class="footnote"><button type="button" class="linkish" id="hide-past">Hide months that are over</button></div>`
        : '');

  // the link sits above the first month — that's where you look for what
  // came before, not at the bottom of a twelve-month scroll
  el('view-calendar').innerHTML =
    bar +
    subscribeCard() +
    `<div class="footnote">Every practice, workout, and event from the coach's 2026/27 calendar.<br>"Done for 6:30" means finished in time for a 6:30 pickup.</div>` +
    pastLink +
    body;

  wireCalendarControls(months, iso);

  const showBtn = el('show-past');
  if (showBtn) showBtn.addEventListener('click', () => { showPastMonths = true; renderCalendar(); });
  const hideBtn = el('hide-past');
  if (hideBtn) hideBtn.addEventListener('click', () => { showPastMonths = false; renderCalendar(); });
}

/**
 * Scroll the window, and actually land there.
 *
 * `behavior: 'smooth'` is a no-op in some environments — notably when the OS
 * has Reduce Motion turned on. Left alone, that makes the month picker look
 * broken. So: honour the motion preference, then verify we moved and snap if
 * we didn't.
 */
function scrollToY(top) {
  const target = Math.max(0, Math.round(top));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  window.scrollTo({ top: target, behavior: reduceMotion ? 'auto' : 'smooth' });

  if (reduceMotion) return;
  window.setTimeout(() => {
    if (Math.abs(window.scrollY - target) > 4) window.scrollTo(0, target);
  }, 400);
}

function wireCalendarControls(months, iso) {
  const picker = el('month-picker');
  const todayBtn = el('jump-today');
  if (!picker) return;

  const startKey = currentMonthKey(months, iso);
  if (startKey) picker.value = startKey;

  /** Distance from the top of the page that the sticky chrome covers. */
  const stickyOffset = () => {
    const header = document.querySelector('header.app');
    const bar = document.querySelector('.cal-bar');
    return (header ? header.offsetHeight : 0) + (bar ? bar.offsetHeight : 0);
  };

  const jumpTo = (key) => {
    const target = el(`m-${key}`);
    if (!target) return;
    scrollToY(target.getBoundingClientRect().top + window.scrollY - stickyOffset() + 1);
  };

  picker.addEventListener('change', () => jumpTo(picker.value));

  todayBtn.addEventListener('click', () => {
    const target = el(`cal-${iso}`);
    if (target) {
      // centre today in whatever space is left below the sticky chrome
      const offset = stickyOffset();
      const middle = target.getBoundingClientRect().top + window.scrollY
        - offset - (window.innerHeight - offset) / 2 + target.offsetHeight / 2;
      scrollToY(middle);
      if (startKey) picker.value = startKey;
    } else {
      jumpTo(picker.value);
    }
  });

  // keep the dropdown in step with whatever month you've scrolled to
  if ('IntersectionObserver' in window) {
    const headerH = document.querySelector('header.app').offsetHeight;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) picker.value = entry.target.dataset.month;
      });
    }, { rootMargin: `-${headerH + 60}px 0px -70% 0px`, threshold: 0 });

    document.querySelectorAll('#view-calendar .cal-month').forEach((h) => observer.observe(h));
  }
}

function renderGrade() {
  const grade = currentGrade();

  let html = '<h2 class="section">Which grade is your son in?</h2>';
  html += `<div class="picker">
    ${SEASON.grades.map((g) => `<button data-grade="${esc(g.name)}" class="${grade && g.name === grade.name ? 'on' : ''}">${esc(g.shortLabel)}</button>`).join('')}
  </div>`;

  if (!grade) {
    html += '<div class="empty">Pick a grade to see what your class takes on, the dues, and your tailgate assignment.</div>';
    el('view-grade').innerHTML = html;
    return;
  }

  html += `
    <div class="card">
      <div class="eyebrow">${esc(gradeLong(grade.name))} · ${esc(grade.classYear)}</div>
      <div class="row"><span class="k">Usually plays</span><span class="v">${esc(grade.teamBlurb)}</span></div>
      <div class="row"><span class="k">Your grade mom</span><span class="v">${esc(grade.gradeMom)}</span></div>
      <div class="row"><span class="k">Grade dues</span><span class="v">${grade.dues ? '$' + grade.dues : 'Baseline only'}</span></div>
      ${grade.duesHandle ? `<div class="row"><span class="k">Venmo</span><span class="v"><a class="link" href="https://venmo.com/u/${esc(grade.duesHandle.replace(/^@/, ''))}" target="_blank" rel="noopener">${esc(grade.duesHandle)}</a></span></div>` : ''}
      <div class="row"><span class="k">Tailgate food</span><span class="v">${esc(grade.tailgateFood)}</span></div>
    </div>`;

  html += `<h2 class="section">What your grade takes on</h2>
    <div class="card"><ul class="bullets">
      ${grade.responsibilities.map((r) => `<li>${esc(r)}</li>`).join('')}
    </ul></div>`;

  // every game this grade has the meal
  const meals = SEASON.games.filter((g) => g.mealGrade === grade.name);
  if (meals.length) {
    html += `<h2 class="section">Your pre-game meals this season</h2><div class="card">`;
    html += meals.map((g) => `
      <div class="row">
        <span class="k">${esc(shortDate(g.date))}</span>
        <span class="v">${g.isHome ? 'vs ' : 'at '}${esc(g.opponent)}</span>
      </div>`).join('');
    html += '</div>';
  }

  const mom = SEASON.gradeMoms.find((m) => m.grade === grade.name);
  if (mom) {
    if (grade.dues && grade.duesHandle) {
    html += `<h2 class="section">Pay your grade dues</h2>
      <div class="card">
        <a class="big-action" href="https://venmo.com/u/${esc(grade.duesHandle.replace(/^@/, ''))}" target="_blank" rel="noopener">Venmo $${grade.dues} to ${esc(grade.duesHandle)}</a>
        <div class="small muted">Put your son's name and grade in the note — $30 of every grade's dues funds the locker-room treat bags.</div>
      </div>`;
  } else if (grade.dues) {
    html += `<h2 class="section">Pay your grade dues</h2>
      <div class="card">
        <div class="row"><span class="k">Grade dues</span><span class="v">$${grade.dues}</span></div>
        <div class="small muted" style="margin-top:9px">Ask ${esc(grade.gradeMom)} where to send it — no Venmo handle on file yet.</div>
      </div>`;
  }

  html += `<h2 class="section">Your first call</h2>
      <div class="card">
        <div class="venue-h">${esc(mom.name)}</div>
        <div class="venue-sub">${esc(grade.name)} grade mom</div>
        <div class="rule"><div class="lbl">Email</div><div class="txt"><a class="link" href="mailto:${esc(mom.email)}">${esc(mom.email)}</a></div></div>
        <div class="rule"><div class="lbl">Phone</div><div class="txt"><a class="link" href="tel:${esc(mom.phone.replace(/-/g, ''))}">${esc(mom.phone)}</a></div></div>
      </div>`;
  }

  html += `<div class="footnote">$30 of every grade's dues goes to the Senior Football Mom for locker-room treat bags.</div>`;

  el('view-grade').innerHTML = html;
}

function renderPhotos() {
  const album = (PHOTOS && PHOTOS.album) || '';
  const shots = (PHOTOS && PHOTOS.photos) || [];

  let html = '<h2 class="section">Season photos</h2>';

  if (album) {
    html += `
      <a class="big-action" href="${esc(album)}" target="_blank" rel="noopener">📸 Add your photos</a>
      <a class="big-action secondary" href="${esc(album)}" target="_blank" rel="noopener">See every photo and video</a>
      <div class="card">
        <div class="eyebrow">How it works</div>
        <div class="small">Tap <strong>Add your photos</strong>, pick your shots, and they go straight into the shared album everyone in the program can see. Videos go there too — they are too big for this app.</div>
      </div>`;
  } else {
    html += `
      <div class="card">
        <div class="task-flag">
          <strong>The shared album isn't set up yet.</strong> Once it is, this is where
          parents will tap to add their photos.
        </div>
        <div class="eyebrow">To finish setting it up</div>
        <ul class="bullets small">
          <li>In Google Photos, make an album called <em>Jesuit Football 2026 — Parent Photos</em>.</li>
          <li>Share it, and turn on <strong>Collaborate</strong> so parents can add their own.</li>
          <li>Copy the share link into <code>photoAlbum.url</code> in <code>data/season.json</code>, then rebuild.</li>
        </ul>
      </div>`;
  }

  html += `
    <div class="card">
      <div class="eyebrow">A quick ask</div>
      <div class="small">These are other people's kids as well as your own. If a photo
      focuses on a boy who isn't yours, check with his parents before you post it —
      and tell your grade mom if you'd rather your son not appear at all.</div>
    </div>`;

  if (shots.length) {
    const caption = shots[0].caption;
    html += `<h2 class="section">A few from ${esc(caption || 'the season')}</h2>`;
    html += `<div class="photo-grid">
      ${shots.map((p, i) => `
        <button data-photo="${i}">
          <img src="${esc(photoSrc(p.thumb))}" alt="" loading="lazy">
        </button>`).join('')}
    </div>`;
    html += `<div class="footnote" style="margin-top:10px">Just a handful here so the app stays quick.
      ${album ? 'Everything from the season is in the album.' : 'The rest live in the shared album.'}</div>`;
  }

  html += `<div class="footnote">Camera, timestamp, and location data are stripped from every photo in this app.</div>`;

  el('view-photos').innerHTML = html;
}

function openLightbox(index) {
  const shots = (PHOTOS && PHOTOS.photos) || [];
  const shot = shots[index];
  if (!shot) return;
  const box = el('lightbox');
  box.querySelector('img').src = photoSrc(shot.file);
  box.hidden = false;
  document.body.style.overflow = 'hidden';
  pushOverlay('photo');
}

function closeLightbox() {
  const box = el('lightbox');
  box.hidden = true;
  box.querySelector('img').removeAttribute('src');
  document.body.style.overflow = '';
}

function renderOrdering() {
  const order = SEASON.ordering;
  if (!order) return '';

  let html = '<h2 class="section">Order buttons and lanyards</h2>';

  html += '<div class="card">';
  html += order.items.map((item) => `
    <div class="row">
      <span class="k">${esc(item.name)}<br><span class="small muted">${esc(item.detail)}</span></span>
      <span class="v">$${item.price}</span>
    </div>`).join('');
  html += '</div>';

  // buttons need a photo of the player before Beth can make one
  const needsAction = order.items.filter((i) => i.action);
  if (needsAction.length) {
    html += needsAction.map((i) => `
      <div class="card">
        <div class="eyebrow">${esc(i.name)} — one more step</div>
        <div class="small" style="margin-bottom:10px">${esc(i.action)}</div>
        ${i.actionUrl ? `<a class="big-action secondary" href="${esc(i.actionUrl)}">Email Beth your photo</a>` : ''}
      </div>`).join('');
  }

  html += `<a class="big-action" href="${esc(order.venmoUrl)}" target="_blank" rel="noopener">Pay by Venmo · ${esc(order.venmo)}</a>`;

  // the note is the whole ballgame — orders are matched to players from it
  html += `
    <div class="card">
      <div class="task-flag">
        <strong>Put this in the Venmo note:</strong><br>
        ${esc(order.noteRule)}
        <div class="small" style="margin-top:7px;opacity:.85">For example — <em>${esc(order.noteExample)}</em></div>
      </div>
      <div class="small muted">${esc(order.whyNote)}</div>
    </div>`;

  html += (order.groups || []).map((group) => `
    <h2 class="section">${esc(group.title)}</h2>
    ${group.links.map((link) => `
      <a class="big-action secondary" href="${esc(link.url)}" target="_blank" rel="noopener">${esc(link.label)}</a>
      <div class="footnote" style="margin:-4px 0 12px">${esc(link.detail)}</div>`).join('')}`).join('');

  return html;
}

// ---------------------------------------------------------------- news

/** Jesuit's record, derived from recorded scores so it can't drift. */
function jesuitRecord() {
  const varsity = gamesForTeam('Varsity').filter((g) => g.type === 'regular');
  let w = 0, l = 0, dw = 0, dl = 0;
  varsity.forEach((g) => {
    const r = resultFor(g);
    if (!r) return;
    const won = r.outcome === 'W';
    w += won ? 1 : 0; l += won ? 0 : 1;
    if (g.raw.isDistrict) { dw += won ? 1 : 0; dl += won ? 0 : 1; }
  });
  return { w, l, dw, dl };
}

/** A scouting card for whoever is next. */
function opponentCard(iso) {
  const next = nextGame(iso);
  if (!next) return '';

  const venue = venueOf(next);
  const table = (STANDINGS && STANDINGS.teams) || [];
  const them = table.find((t) => next.opponent.toLowerCase().includes(t.name.toLowerCase())
                              || t.name.toLowerCase().includes(next.opponent.toLowerCase()));
  const out = daysBetween(iso, next.date);
  const played = them && (them.w + them.l) > 0;

  return `
    <h2 class="section">Next up${out >= 0 ? ` · ${out === 0 ? 'today' : out === 1 ? 'tomorrow' : `in ${out} days`}` : ''}</h2>
    <div class="card">
      <div class="eyebrow">${next.week ? `Week ${next.week}` : 'Preseason'}${next.isDistrict ? ' · District' : ''}</div>
      <div class="venue-h">${next.type === 'preseason' ? '' : (next.isHome ? 'vs ' : 'at ')}${esc(next.opponent)}</div>
      <div class="venue-sub">${esc(shortDate(next.date))} · ${esc(prettyTime(next.kickoff) || next.kickoffNote || 'Time TBA')}${venue ? ' · ' + esc(venue.name) : ''}</div>
      ${played
        ? `<div class="rule"><div class="lbl">Their record</div><div class="txt">${them.w}-${them.l} overall · ${them.districtW}-${them.districtL} in district</div></div>`
        : `<div class="rule"><div class="lbl">Their record</div><div class="txt muted">Not recorded yet</div></div>`}
      ${next.notes ? `<div class="rule"><div class="lbl">Note</div><div class="txt">${esc(next.notes)}</div></div>` : ''}
    </div>`;
}

function standingsCard() {
  const table = (STANDINGS && STANDINGS.teams) || [];
  if (!table.length) return '';

  const us = jesuitRecord();
  const rows = table.map((t) => t.name === 'Jesuit'
    ? { name: t.name, w: us.w, l: us.l, dw: us.dw, dl: us.dl, us: true }
    : { name: t.name, w: t.w, l: t.l, dw: t.districtW, dl: t.districtL, us: false });

  const anyPlayed = rows.some((r) => r.w + r.l > 0);
  rows.sort((a, b) => (b.dw - a.dw) || (a.dl - b.dl) || (b.w - a.w) || a.name.localeCompare(b.name));

  let html = `<h2 class="section">District ${esc(STANDINGS.district || '9-5A')}</h2><div class="card">`;
  if (!anyPlayed) {
    html += '<div class="small muted" style="margin-bottom:11px">Nobody has played a district game yet — this fills in as the season goes.</div>';
  }
  html += rows.map((r) => `
    <div class="row">
      <span class="k" style="${r.us ? 'color:var(--jay);font-weight:700' : ''}">${esc(r.name)}</span>
      <span class="v">${r.dw}-${r.dl}<span class="muted" style="font-weight:500"> · ${r.w}-${r.l} overall</span></span>
    </div>`).join('');
  html += '</div>';
  return html;
}

function spotlightCard() {
  const entries = (SPOTLIGHT && SPOTLIGHT.entries) || [];
  if (!entries.length) return '';
  const top = entries[0];
  return `
    <h2 class="section">Blue Jay of the week</h2>
    <div class="card">
      <div class="task-flag" style="margin-bottom:11px"><strong>${esc(top.title)}</strong></div>
      <div class="small">${esc(top.body)}</div>
      <div class="footnote" style="text-align:left;margin:9px 0 0">${esc(shortDate(top.date))}</div>
    </div>`;
}

function renderNews() {
  const iso = todayISO();
  let html = '';

  html += spotlightCard();
  html += opponentCard(iso);
  html += standingsCard();

  const items = (NEWS && NEWS.items) || [];

  const story = (i) => `
    <a class="card" style="display:block;text-decoration:none;color:inherit"
       href="${esc(i.link)}" target="_blank" rel="noopener">
      <div class="eyebrow">${esc(shortDate(i.date))}${i.source ? ' · ' + esc(i.source) : ''}</div>
      <div class="venue-h" style="font-size:16px">${esc(i.title)}</div>
      ${i.summary ? `<div class="small muted" style="margin-top:5px">${esc(i.summary)}</div>` : ''}
    </a>`;

  const jesuit = items.filter((i) => i.aboutJesuit && !i.extra);
  const district = items.filter((i) => !i.aboutJesuit && !i.extra);
  const extra = items.filter((i) => i.extra);

  html += '<h2 class="section">Blue Jay football</h2>';
  html += jesuit.length
    ? jesuit.map(story).join('')
    : '<div class="empty">Nothing new yet. Check back after the next game.</div>';

  // the rest of 9-5A — you play these teams, so their news is your news
  if (district.length) {
    html += '<h2 class="section">Around the district</h2>';
    html += district.map(story).join('');
  }

  if (extra.length) {
    html += '<h2 class="section">Also worth seeing</h2>';
    html += extra.map(story).join('');
  }

  html += `<div class="footnote">From jesuitnola.org, nola.com and Crescent City Sports${NEWS && NEWS.fetched ? `, last checked ${esc(shortDate(NEWS.fetched))}` : ''}.<br>Tap a story to read it.</div>`;

  el('view-news').innerHTML = html;
}

// ---------------------------------------------------------------- more

function renderMore() {
  const grade = currentGrade();
  const links = [
    ['grade', '✅', 'My Grade', grade ? `${gradeShort(grade.name)} — dues, meals, your grade mom` : 'Dues, meals, and what your class takes on'],
    ['photos', '📸', 'Photos', 'Season photos and the shared album'],
    ['info', 'ℹ️', 'Info', 'Venues, bag rules, ordering, traditions, contacts'],
  ];

  let html = '<h2 class="section">More</h2><div class="card flush">';
  html += links.map(([view, icon, title, sub]) => `
    <button class="game" data-goto="${view}">
      <div class="opp" style="font-size:16.5px">${icon} ${esc(title)}<span class="chev">›</span></div>
      <div class="where">${esc(sub)}</div>
    </button>`).join('');
  html += '</div>';

  if (SEASON.streaming) {
    html += '<h2 class="section">Watch live</h2>';
    html += SEASON.streaming.links.map((link) => `
      <a class="big-action secondary" href="${esc(link.url)}" target="_blank" rel="noopener">${esc(link.label)}</a>
      <div class="footnote" style="margin:-4px 0 12px">${esc(link.detail)}</div>`).join('');
    html += `<div class="card"><div class="small muted">${esc(SEASON.streaming.note)}</div></div>`;
  }

  el('view-more').innerHTML = html;
}

function renderInfo() {
  let html = renderOrdering();

  if (SEASON.streaming) {
    html += '<h2 class="section">Watch the games</h2>';
    html += SEASON.streaming.links.map((link) => `
      <a class="big-action secondary" href="${esc(link.url)}" target="_blank" rel="noopener">${esc(link.label)}</a>
      <div class="footnote" style="margin:-4px 0 12px">${esc(link.detail)}</div>`).join('');
    html += `<div class="card"><div class="small muted">${esc(SEASON.streaming.note)}</div></div>`;
  }

  html += '<h2 class="section">Venues and bag rules</h2>';
  html += `<div class="card"><div class="rule warn"><div class="lbl">Bottom line</div><div class="txt">Every venue is clear-bag only. Bring a clear bag or a small clutch (max 4.5x6.5 in.) and expect bag checks and metal-detector wanding.</div></div></div>`;
  SEASON.venues.forEach((v) => { html += venueCard(v, v.name); });

  html += '<h2 class="section">Traditions</h2><div class="card">';
  html += SEASON.traditions.map((t) => `
    <div class="task">
      <div class="body">
        <div class="title">${esc(t.title)}</div>
        <div class="when">${esc(t.detail)}</div>
      </div>
    </div>`).join('');
  html += '</div>';

  html += '<h2 class="section">Grade moms</h2><div class="card">';
  html += SEASON.gradeMoms.map((m) => `
    <div class="row">
      <span class="k">${esc(gradeShort(m.grade))}</span>
      <span class="v"><a class="link" href="mailto:${esc(m.email)}">${esc(m.name)}</a></span>
    </div>`).join('');
  html += '</div>';

  html += '<h2 class="section">Who to contact</h2><div class="card">';
  html += SEASON.contacts.map((c) => `
    <div class="task">
      <div class="body">
        <div class="title">${esc(c.name)}</div>
        <div class="when">${esc(c.role)}${c.detail ? ' — ' + esc(c.detail) : ''}${c.phone ? '<br>' + esc(c.phone) : ''}</div>
      </div>
    </div>`).join('');
  html += '</div>';

  html += '<h2 class="section">Culture</h2>';
  html += `<div class="card"><div class="badges">${SEASON.culture.map((c) => `<span class="badge">${esc(c)}</span>`).join('')}</div></div>`;

  html += '<h2 class="section">Vacation dates</h2><div class="card">';
  html += SEASON.vacations.map((v) => `
    <div class="row">
      <span class="k">${esc(v.name)}</span>
      <span class="v">${esc(shortDate(v.start))} – ${esc(shortDate(v.end))}</span>
    </div>`).join('');
  html += '</div>';

  // Feedback carries the build hash, so a report always says which version it
  // came from — that ambiguity cost a whole debugging round once already.
  const feedbackSubject = encodeURIComponent(`Jesuit Football app — feedback (build ${BUILD})`);
  const feedbackBody = encodeURIComponent(
    `What I was looking at:\n\n\nWhat I expected:\n\n\nWhat happened instead:\n\n\n---\nBuild ${BUILD}\n`);

  html += `<h2 class="section">Something wrong?</h2>
    <div class="card">
      <a class="big-action secondary" href="mailto:bluejays2027@gmail.com?subject=${feedbackSubject}&body=${feedbackBody}">Tell Golda</a>
      <div class="small muted">Wrong time, missing game, anything confusing. The email fills in which
      version you're on, which saves a lot of guessing.</div>
    </div>`;

  html += `<div class="footnote">Built from the coach's 2026/27 calendar and the parent welcome letter.<br>Player names and family contact details are deliberately not in this app.<br><br>
    <span class="muted">Version ${esc(BUILD)}</span> · <button type="button" class="linkish" id="force-refresh">Force refresh</button></div>`;

  el('view-info').innerHTML = html;
}

// ---------------------------------------------------------------- wiring

function renderAll() {
  renderToday();
  renderSchedule();
  renderGameView();
  renderNews();
  renderMore();
  renderCalendar();
  renderGrade();
  renderPhotos();
  renderInfo();
}

/*
 * Back-button handling.
 *
 * Without this, every view swap left the history untouched — so on a
 * home-screen app, a swipe-back or Android's back button quit the whole thing
 * instead of stepping back a screen. On Android that's the primary way people
 * navigate, so the packaged app would have felt broken.
 */
let suppressHistory = false;

function pushView(view) {
  if (suppressHistory) return;
  const state = { view, game: view === 'game' ? openGame : null };
  if (history.state && history.state.view === view && !history.state.overlay) {
    history.replaceState(state, '');
  } else {
    history.pushState(state, '');
  }
}

/** Overlays get their own history entry so back closes them first. */
function pushOverlay(kind) {
  history.pushState({ ...(history.state || {}), overlay: kind }, '');
}

window.addEventListener('popstate', (event) => {
  // an open overlay is always what "back" should dismiss first
  if (!el('lightbox').hidden) { closeLightbox(); return; }
  if (!el('daysheet').hidden) { closeSheet(); return; }

  const state = event.state || { view: 'today' };
  if (state.game) { openGame = state.game; renderGameView(); }

  suppressHistory = true;
  show(state.view);
  suppressHistory = false;
});

function show(view, opts) {
  pushView(view);
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  el('view-' + view).classList.add('active');
  // a single game has no tab of its own — it belongs under Games
  const UNDER = { game: 'schedule', grade: 'more', photos: 'more', info: 'more' };
  const tabFor = UNDER[view] || view;
  document.querySelectorAll('nav.tabs button').forEach((b) => {
    b.classList.toggle('on', b.dataset.view === tabFor);
  });
  window.scrollTo(0, 0);

  if (view === 'calendar' && !(opts && opts.top)) {
    const target = el('cal-' + todayISO());
    if (target) target.scrollIntoView({ block: 'center' });
  }
}

document.querySelector('nav.tabs').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-view]');
  if (button) show(button.dataset.view);
});

// grade pickers live in two views and are re-rendered, so delegate from body
document.body.addEventListener('click', (event) => {
  const goto = event.target.closest('[data-goto]');
  if (goto) {
    // data-top overrides a view's own landing scroll (the calendar normally
    // jumps to today, which would hide the subscribe card above it)
    show(goto.dataset.goto, { top: goto.dataset.top === '1' });
    return;
  }

  const pickTeam = event.target.closest('button[data-team]');
  if (pickTeam) { setTeam(pickTeam.dataset.team); return; }

  const pick = event.target.closest('button[data-grade]');
  if (pick) { setGrade(pick.dataset.grade); return; }

  const scheduleImage = event.target.closest('button[data-schedule-image]');
  if (scheduleImage && WEEK && WEEK.image) {
    const box = el('lightbox');
    box.querySelector('img').src = WEEK.image;
    box.hidden = false;
    document.body.style.overflow = 'hidden';
    pushOverlay('photo');
    return;
  }

  const photo = event.target.closest('button[data-photo]');
  if (photo) { openLightbox(Number(photo.dataset.photo)); return; }

  if (event.target.closest('.lightbox')) { history.back(); return; }

  if (event.target.closest('.sheet-close')) { history.back(); return; }
  const sheet = event.target.closest('#daysheet');
  if (sheet && !event.target.closest('.sheet-panel')) { closeSheet(); return; }

  // escape hatch: wipe every cache and re-fetch, for when a phone is stuck
  if (event.target.closest('#force-refresh')) {
    event.target.textContent = 'Refreshing…';
    Promise.resolve()
      .then(() => 'serviceWorker' in navigator
        ? navigator.serviceWorker.getRegistrations().then((rs) => Promise.all(rs.map((r) => r.unregister())))
        : null)
      .then(() => (window.caches ? caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))) : null))
      .catch(() => {})
      .then(() => location.reload());
    return;
  }

  const dayRow = event.target.closest('[data-day]');
  if (dayRow) { openDay(dayRow.dataset.day); return; }

  const gameRow = event.target.closest('button.game[data-game]');
  if (gameRow) {
    openGame = gameRow.dataset.game;
    renderGameView();
    show('game');
    return;
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!el('lightbox').hidden || !el('daysheet').hidden) history.back();
});

/*
 * Live data refresh.
 *
 * The App Store / Play Store builds ship the site bundled inside them, which
 * would freeze the schedule until the next review — unworkable when a kickoff
 * moves on a Wednesday. So on launch we quietly fetch data.json from the live
 * site and swap it in if it's newer than what shipped.
 *
 * Mutating the data objects in place keeps every existing lookup table valid;
 * rebuilding them would mean re-deriving state scattered through the module.
 */
const LIVE_DATA_URL = 'https://goldahartman.github.io/jesuit-football/data.json';

/** True only inside the App Store / Play Store wrapper. */
function isPackagedApp() {
  return Boolean(window.Capacitor)
    || location.protocol === 'capacitor:'
    || location.protocol === 'file:';
}

async function refreshFromLive() {
  // ONLY the packaged apps. The hosted site already serves current data, and
  // on a dev server this would fetch the *published* data and overwrite what
  // you just built — which silently hid new fields during local testing.
  if (!isPackagedApp()) return;

  try {
    const fresh = await fetch(LIVE_DATA_URL, { cache: 'no-store' }).then((r) => {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    });

    if (!fresh || !fresh.season || !Array.isArray(fresh.season.games)) return;

    Object.assign(SEASON, fresh.season);
    Object.assign(CALENDAR, fresh.calendar);
    if (fresh.photos) Object.assign(PHOTOS, fresh.photos);

    renderAll();
    console.info('Schedule refreshed from the live site.');
  } catch (err) {
    // offline, or the site is down — the bundled copy is still perfectly good
    console.info('Using the bundled schedule.', err && err.message);
  }
}

// ---------------------------------------------------------------- access gate

/*
 * A code from your grade mom, asked once per phone.
 *
 * This is a doorman, not a lock. The code lives in the page source, so anyone
 * determined can read it — and the underlying files stay fetchable by direct
 * URL regardless. It exists to keep the app inside the football family, which
 * is what it was asked to do. Real protection would have to sit in front of
 * the host, not inside the page.
 */
const SAVED_ACCESS = 'jesuitfb.access';
const ACCESS = SEASON.access || { enabled: false, codes: [] };

const tidyCode = (raw) => String(raw || '').trim().toUpperCase().replace(/\s+/g, '');

function matchCode(raw) {
  const entered = tidyCode(raw);
  if (!entered) return null;
  return (ACCESS.codes || []).find((c) => tidyCode(c.code) === entered) || null;
}

function hasAccess() {
  if (!ACCESS.enabled) return true;
  return Boolean(matchCode(localStorage.getItem(SAVED_ACCESS)));
}

function openGate() {
  const gate = el('gate');
  if (!gate) return;

  el('gate-title').textContent = ACCESS.title || 'Blue Jay Football';
  el('gate-prompt').textContent = ACCESS.prompt || 'Enter the code from your grade mom.';
  el('gate-hint').textContent = ACCESS.hint || '';
  if (ACCESS.placeholder) el('gate-code').placeholder = ACCESS.placeholder;
  gate.hidden = false;
  document.body.style.overflow = 'hidden';

  const form = el('gate-form');
  const input = el('gate-code');
  const error = el('gate-error');

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const hit = matchCode(input.value);
    if (!hit) {
      error.hidden = false;
      input.select();
      return;
    }
    localStorage.setItem(SAVED_ACCESS, tidyCode(hit.code));

    // the code says which grade mom handed it out, so save them a step
    if (hit.grade && !currentGrade()) localStorage.setItem(SAVED_GRADE, hit.grade);

    gate.hidden = true;
    document.body.style.overflow = '';
    renderAll();
  });

  input.addEventListener('input', () => { error.hidden = true; });
  setTimeout(() => input.focus(), 120);
}

/* The month bar sticks below the app header, whose height depends on the
   device's safe-area inset. Measure it rather than hard-coding. */
function syncHeaderHeight() {
  const header = document.querySelector('header.app');
  if (header) {
    document.documentElement.style.setProperty('--header-h', `${header.offsetHeight}px`);
  }
}

syncHeaderHeight();
window.addEventListener('resize', syncHeaderHeight);
window.addEventListener('orientationchange', syncHeaderHeight);

history.replaceState({ view: 'today' }, '');
renderAll();
refreshFromLive();
if (!hasAccess()) openGate();

// Re-render if the app is left open past midnight, so "Today" stays honest.
let renderedOn = todayISO();
setInterval(() => {
  if (todayISO() !== renderedOn) { renderedOn = todayISO(); renderAll(); }
}, 60000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && todayISO() !== renderedOn) { renderedOn = todayISO(); renderAll(); }
});

/*
 * Keep installed home-screen copies from getting stuck on an old version.
 *
 * index.html carries the hashed asset URLs, but nothing busts index.html
 * itself — so a phone can cache it and keep loading last week's app forever.
 * The service worker fetches network-first, so when it picks up a new build it
 * takes over; that fires controllerchange, and we reload once to pick it up.
 */
if ('serviceWorker' in navigator && !STANDALONE) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // on a first-ever visit there was no old worker, so nothing is stale
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then((reg) => {
        reg.update();
        // check again when the app is reopened from the home screen
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) reg.update();
        });
      })
      .catch(() => {});
  });
}
