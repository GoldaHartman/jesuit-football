#!/bin/bash
# Double-click this in Finder to put the app on the web.
# Safe to run more than once — it publishes updates too.

cd "$(dirname "$0")" || exit 1
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

REPO="jesuit-football"

echo ""
echo "  Jesuit Football — publishing"
echo "  ============================"
echo ""

# --- gh installed? -----------------------------------------------------------
if ! command -v gh >/dev/null 2>&1; then
  echo "  ✗ Can't find the 'gh' command (GitHub's tool)."
  echo "    Install it with:  brew install gh"
  echo ""
  read -n 1 -s -r -p "  Press any key to close."
  exit 1
fi

# --- signed in? --------------------------------------------------------------
if ! gh auth status >/dev/null 2>&1; then
  echo "  ✗ Not signed in to GitHub."
  echo "    Run this in Terminal first:  gh auth login"
  echo ""
  read -n 1 -s -r -p "  Press any key to close."
  exit 1
fi

USER=$(gh api user --jq .login 2>/dev/null)
echo "  Signed in as: $USER"
echo ""

# --- rebuild so what ships matches what's on disk ----------------------------
echo "  Rebuilding..."
python3 tools/build_web_data.py >/dev/null 2>&1 || {
  echo "  ✗ Build failed. Tell Claude."
  read -n 1 -s -r -p "  Press any key to close."
  exit 1
}

git add -A >/dev/null 2>&1
git commit -m "Publish $(date '+%b %-d, %-I:%M %p')" >/dev/null 2>&1

# --- first publish, or an update? --------------------------------------------
if git remote get-url origin >/dev/null 2>&1; then
  echo "  Publishing an update..."
  git push origin main >/dev/null 2>&1 || {
    echo "  ✗ Push failed. Tell Claude what this says:"
    git push origin main
    read -n 1 -s -r -p "  Press any key to close."
    exit 1
  }
else
  echo "  Creating the site (first time)..."
  if ! gh repo create "$REPO" --public --source=. --remote=origin --push 2>&1 | sed 's/^/    /'; then
    echo ""
    echo "  ✗ Couldn't create it. If it says the name already exists,"
    echo "    tell Claude and we'll pick another."
    read -n 1 -s -r -p "  Press any key to close."
    exit 1
  fi
  echo "  Turning on web hosting..."
  gh api -X POST "repos/$USER/$REPO/pages" \
    -f "source[branch]=main" -f "source[path]=/docs" >/dev/null 2>&1
fi

URL="https://$(echo "$USER" | tr '[:upper:]' '[:lower:]').github.io/$REPO/"

echo ""
echo "  ✓ Done."
echo ""
echo "  YOUR LINK:  $URL"
echo ""
echo "  First time, give it 1–2 minutes to come alive."
echo "  Updates show up in about 30 seconds."
echo ""
echo "  Opening it now..."
sleep 2
open "$URL"
echo ""
read -n 1 -s -r -p "  Press any key to close this window."
echo ""
