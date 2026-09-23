#!/usr/bin/env bash
# Launches Chromium fullscreen against the local display server.
set -euo pipefail

URL="http://127.0.0.1:5173/"

# Wait for the display server to answer before opening the browser, otherwise
# Chromium lands on an error page and stays there.
for _ in $(seq 1 30); do
  if curl -sf -o /dev/null "$URL"; then break; fi
  sleep 1
done

# Stop X from blanking the screen (no-ops harmlessly under Wayland).
xset s off -dpms 2>/dev/null || true
xset s noblank 2>/dev/null || true

# Clear the "didn't shut down cleanly" bar, which otherwise survives a power cut.
PROFILE="$HOME/.config/chromium/Default/Preferences"
if [ -f "$PROFILE" ]; then
  sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/; s/"exited_cleanly":false/"exited_cleanly":true/' "$PROFILE" || true
fi

BROWSER=$(command -v chromium-browser || command -v chromium)

exec "$BROWSER" \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=Translate \
  --check-for-update-interval=31536000 \
  --autoplay-policy=no-user-gesture-required \
  --start-fullscreen \
  "$URL"
