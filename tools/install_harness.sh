#!/bin/bash
#
# Install (or remove) the daily news harness as a macOS launchd job.
#
#   tools/install_harness.sh            install, runs 7:00am daily
#   tools/install_harness.sh --at 18    install, runs 6:00pm daily
#   tools/install_harness.sh --remove   uninstall
#   tools/install_harness.sh --status   is it installed? when did it last run?
#
# launchd, not cron: if the Mac is asleep at the scheduled time, launchd runs
# the job when it wakes. cron would just skip the day.

set -uo pipefail

PROJECT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.jesuitfootball.news"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/jesuit-football-news.log"
HOUR=7

while [ $# -gt 0 ]; do
  case "$1" in
    --at) HOUR="$2"; shift 2 ;;
    --remove)
      launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null
      rm -f "$PLIST"
      echo "Removed. The harness will not run on its own any more."
      exit 0 ;;
    --status)
      if launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; then
        echo "Installed and loaded."
      else
        echo "Not installed."
      fi
      [ -f "$LOG" ] && { echo; echo "Last few runs:"; grep 'harness start\|publish:' "$LOG" | tail -6; }
      exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

chmod +x "$PROJECT/tools/news_harness.sh"
mkdir -p "$(dirname "$PLIST")" "$(dirname "$LOG")"

cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$PROJECT/tools/news_harness.sh</string>
  </array>
  <key>WorkingDirectory</key><string>$PROJECT</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>$HOUR</integer>
    <key>Minute</key><integer>0</integer>
  </dict>
  <!-- if the Mac was asleep at the scheduled time, run on wake -->
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLISTEOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null
if launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null; then
  echo "Installed. The harness runs every day at $HOUR:00."
else
  echo "Could not load the job. The plist is written to:"
  echo "  $PLIST"
  exit 1
fi

echo
echo "  Run it now:      tools/news_harness.sh"
echo "  Check on it:     tools/install_harness.sh --status"
echo "  Turn it off:     tools/install_harness.sh --remove"
echo "  Log:             $LOG"
echo
echo "It only runs while this Mac is on. For refreshes that happen even with"
echo "the laptop shut, see the GitHub Action in .github-pending/ — that needs"
echo "one command from you to enable (README, Harness section)."
