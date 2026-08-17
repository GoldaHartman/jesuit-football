#!/bin/bash
#
# The news harness. Deterministic scaffold, one optional AI call in the middle.
#
#   1. fetch      pull the four feeds            (deterministic)
#   2. digest     one-line "what matters"        (AI — skipped with no API key)
#   3. build      regenerate the app             (deterministic)
#   4. audit      check the data agrees          (deterministic, advisory)
#   5. publish    commit and push if changed     (deterministic)
#
# Every step is idempotent: run it twice and nothing happens the second time.
# It never fails the whole run because one feed is down — the app keeps the
# news it already has.
#
# Run by hand:   tools/news_harness.sh
# Run scheduled: tools/install_harness.sh   (installs a daily launchd job)

set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

LOG="$HOME/Library/Logs/jesuit-football-news.log"
mkdir -p "$(dirname "$LOG")"

say() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG"; }

say "──── harness start ────"

# --- 1. fetch ---------------------------------------------------------------
if python3 tools/fetch_news.py >>"$LOG" 2>&1; then
  say "fetch: ok"
else
  say "fetch: FAILED — keeping the news already on file"
fi

# --- 2. digest (optional AI step) -------------------------------------------
if [ -f .env ] && grep -q '^ANTHROPIC_API_KEY=' .env; then
  if python3 tools/news_digest.py >>"$LOG" 2>&1; then
    say "digest: ok"
  else
    say "digest: skipped (see log)"
  fi
else
  say "digest: no ANTHROPIC_API_KEY — skipped"
fi

# --- 3. build ---------------------------------------------------------------
if ! python3 tools/build_web_data.py >>"$LOG" 2>&1; then
  say "build: FAILED — stopping so a broken build never publishes"
  exit 1
fi
say "build: ok"

# --- 4. audit (advisory) ----------------------------------------------------
ERRORS=$(python3 tools/audit.py 2>/dev/null | grep -c '^  \[' || true)
say "audit: $ERRORS findings (advisory)"

# --- 5. publish -------------------------------------------------------------
if [ -z "$(git status --porcelain)" ]; then
  say "publish: nothing changed"
  say "──── harness done ────"
  exit 0
fi

git add -A
git -c user.name="Jesuit Football harness" \
    -c user.email="golda@bright.ai" \
    commit -q -m "News refresh $(date '+%Y-%m-%d %H:%M')" >>"$LOG" 2>&1

if git push origin main >>"$LOG" 2>&1; then
  say "publish: pushed — live in about a minute"
else
  say "publish: PUSH FAILED — committed locally, see log"
fi

say "──── harness done ────"
