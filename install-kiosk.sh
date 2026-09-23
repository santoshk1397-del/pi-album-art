#!/usr/bin/env bash
# Sets up the React display as a Chromium kiosk on an HDMI screen.
# Run on the Pi itself, from the repo root, on Raspberry Pi OS (Desktop).
set -euo pipefail

REPO="$(cd "$(dirname "$0")" && pwd)"
USER_NAME="$(whoami)"
HOME_DIR="$HOME"

echo "==> Installing packages"
sudo apt update
sudo apt install -y chromium-browser nodejs npm curl

NODE_MAJOR="$(node -v 2>/dev/null | sed 's/v\([0-9]*\).*/\1/' || echo 0)"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "!! Node $NODE_MAJOR is too old; Vite needs 18+."
  echo "   Install a newer one, e.g.:"
  echo "   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs"
  exit 1
fi

echo "==> Building the display"
cd "$REPO/web"
# A 512MB Pi (Zero 2 W) can run out of memory here. If this step is killed,
# either add swap or build on another machine and copy web/dist across.
npm ci
npm run build
cd "$REPO"

echo "==> Disabling screen blanking"
sudo raspi-config nonint do_blanking 1 || true

echo "==> Installing services"
for unit in display-server bridge; do
  sed "s|/home/pi|$HOME_DIR|g; s|^User=pi$|User=$USER_NAME|" \
    "$REPO/systemd/$unit.service" | sudo tee "/etc/systemd/system/$unit.service" >/dev/null
done

sudo systemctl daemon-reload
sudo systemctl enable --now display-server.service
sudo systemctl enable --now bridge.service

echo "==> Installing kiosk autostart"
chmod +x "$REPO/kiosk/start-kiosk.sh"
mkdir -p "$HOME_DIR/.config/autostart"
sed "s|/home/pi|$HOME_DIR|g" "$REPO/kiosk/album-art-kiosk.desktop" \
  > "$HOME_DIR/.config/autostart/album-art-kiosk.desktop"

echo
echo "Done."
echo
echo "  Display server : http://127.0.0.1:5173/   (systemctl status display-server)"
echo "  Bridge         : port 8899                (systemctl status bridge)"
echo "  Bridge token   : $REPO/bridge/bridge-config.json"
echo
echo "Next, on the Pi itself:"
echo "  1. Add http://127.0.0.1:5173/ as a redirect URI in your Spotify dashboard."
echo "  2. Reboot, or run kiosk/start-kiosk.sh to launch the display now."
echo "  3. On first run the setup screen appears - paste your Spotify Client ID"
echo "     and authorize. This must be done in the Pi's own browser, because the"
echo "     token is stored in that browser's local storage."
