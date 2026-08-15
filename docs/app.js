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
      when: 'Game day — chaired by Tessa Vorhaben, with Jene Ponder',
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
      ? `<span class="badge onlight">${upcoming.isHome ? 'Home' : 'Away'}</span>${upcoming.isDistrict ? '<span class="badge onlight">District</span>' : ''}`
      : badgesFor(upcoming.raw).replace(/class="badge/g, 'class="badge onlight');

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

  // --- team switcher, so you can flip without leaving Today
  html += `<div class="picker four" style="margin-top:-2px">
    ${TEAMS.map((t) => `<button data-team="${esc(t)}" class="${t === team ? 'on' : ''}">${esc(TEAM_LABEL[t])}</button>`).join('')}
  </div>`;

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
      html += `<h2 class="section">Game-time notes · ${esc(grade.name)} class${out <= 7 ? '' : ' · next game week'}</h2>`;
      html += '<div class="card">';
      if (grade.name === nextVarsity.mealGrade) {
        html += `<div class="task-flag"><strong>Your grade has the pre-game meal</strong> for ${esc(nextVarsity.opponent)} on ${esc(shortDate(nextVarsity.date))}.</div>`;
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
        <div style="font-size:15px;margin-bottom:11px">Pick your son's grade for game-time notes for your class.</div>
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
    : badgesFor(g.raw) + (g.mealGrade ? `<span class="badge">${esc(g.mealGrade)} meal</span>` : '');

  let html = `<button class="linkish" data-goto="schedule" style="padding-left:0;margin-bottom:6px">‹ All ${esc(TEAM_FULL[team])} games</button>`;

  html += `
    <div class="card countdown">
      <div class="eyebrow">${esc(TEAM_FULL[team])}${g.label !== TEAM_FULL[team] ? ' · ' + esc(g.label) : ''}</div>
      <div class="opponent" style="margin-top:2px">${prefix}${esc(g.opponent)}</div>
      <div class="meta">${esc(longDate(g.date))} · ${esc(g.time)}</div>
      <div class="badges">${badges.replace(/class="badge/g, 'class="badge onlight')}</div>
      ${out >= 0 ? `<div class="tagline">${out === 0 ? 'Today.' : out === 1 ? 'Tomorrow.' : `In ${out} days.`}</div>` : '<div class="tagline">This one has been played.</div>'}
    </div>`;

  html += gameDetail(g);

  // what your class owes for this particular game
  const grade = currentGrade();
  if (grade && g.raw && g.type !== 'team') {
    const tasks = tasksFor(grade, g.raw);
    if (tasks.length) {
      html += `<h2 class="section">${esc(grade.name)} class — for this game</h2><div class="card">`;
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
    html += `<div class="rule"><div class="lbl">Pre-game meal</div><div class="txt">${esc(g.mealGrade)} class</div></div>`;
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
  return html;
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

  const heading = gamesMonth === 'all'
    ? `${TEAM_FULL[team]} — ${games.length} games`
    : `${TEAM_FULL[team]} — ${shown.length} game${shown.length === 1 ? '' : 's'} in ${monthsWithGames.find((m) => m.key === gamesMonth).label}`;

  html += `<h2 class="section">${esc(heading)}</h2><div class="card flush">`;
  html += shown.map((g) => {
    const past = g.date < iso;
    const isNext = upcoming && g.date === upcoming.date && g.opponent === upcoming.opponent;
    const prefix = g.type === 'preseason' ? '' : (g.isHome ? 'vs ' : 'at ');
    const badges = g.type === 'team'
      ? `<span class="badge ${g.isHome ? 'home' : 'away'}">${g.isHome ? 'Home' : 'Away'}</span>${g.isDistrict ? '<span class="badge district">District</span>' : ''}`
      : badgesFor(g.raw) + (g.mealGrade ? `<span class="badge">${esc(g.mealGrade)} meal</span>` : '');

    return `
      <button class="game${past ? ' past' : ''}${isNext ? ' next' : ''}" data-game="${esc(gameKey(g))}">
        <div class="row1">
          <span class="wk">${esc(g.label)}</span>
          <span class="date">${esc(shortDate(g.date))}</span>
        </div>
        <div class="opp">${prefix}${esc(g.opponent)}<span class="chev">›</span></div>
        <div class="where">${esc(g.time)}${g.venueName ? ' · ' + esc(g.venueName) : ''}</div>
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
      html += `<div class="line"><strong>${esc(entry.title)}</strong>${tag ? ` <span class="why">· ${esc(tag)}</span>` : ''}</div>`;
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
      <div class="eyebrow">${esc(grade.shortLabel)} grade · ${esc(grade.classYear)}</div>
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
    html += `<h2 class="section">${esc(caption || 'From the season')} · ${shots.length} photos</h2>`;
    html += `<div class="photo-grid">
      ${shots.map((p, i) => `
        <button data-photo="${i}">
          <img src="photos/${esc(p.thumb)}" alt="" loading="lazy">
        </button>`).join('')}
    </div>`;
  }

  html += `<div class="footnote">Camera, timestamp, and location data are stripped from every photo in this app.</div>`;

  el('view-photos').innerHTML = html;
}

function openLightbox(index) {
  const shots = (PHOTOS && PHOTOS.photos) || [];
  const shot = shots[index];
  if (!shot) return;
  const box = el('lightbox');
  box.querySelector('img').src = `photos/${shot.file}`;
  box.hidden = false;
  document.body.style.overflow = 'hidden';
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

function renderInfo() {
  let html = renderOrdering();

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
      <span class="k">${esc(m.grade)}</span>
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

  html += `<div class="footnote">Built from the coach's 2026/27 calendar and the parent welcome letter.<br>Player names and family contact details are deliberately not in this app.<br><br>
    <span class="muted">Version ${esc(BUILD)}</span> · <button type="button" class="linkish" id="force-refresh">Force refresh</button></div>`;

  el('view-info').innerHTML = html;
}

// ---------------------------------------------------------------- wiring

function renderAll() {
  renderToday();
  renderSchedule();
  renderGameView();
  renderCalendar();
  renderGrade();
  renderPhotos();
  renderInfo();
}

function show(view, opts) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  el('view-' + view).classList.add('active');
  // a single game has no tab of its own — it belongs under Games
  const tabFor = view === 'game' ? 'schedule' : view;
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
    return;
  }

  const photo = event.target.closest('button[data-photo]');
  if (photo) { openLightbox(Number(photo.dataset.photo)); return; }

  if (event.target.closest('.lightbox')) { closeLightbox(); return; }

  if (event.target.closest('.sheet-close')) { closeSheet(); return; }
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
  if (!el('lightbox').hidden) closeLightbox();
  else if (!el('daysheet').hidden) closeSheet();
});

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

renderAll();

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
if ('serviceWorker' in navigator) {
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
