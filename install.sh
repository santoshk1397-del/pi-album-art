#!/usr/bin/env bash
# Installs dependencies and enables SPI.
# Run this on the Raspberry Pi itself (Raspberry Pi OS Bookworm or later).
set -euo pipefail

sudo apt update
sudo apt install -y python3-pip python3-venv libjpeg-dev libopenjp2-7 libfreetype6-dev

# Enable SPI (needed for the display)
sudo raspi-config nonint do_spi 0

python3 -m venv "$HOME/album-art-venv"
# shellcheck disable=SC1091
source "$HOME/album-art-venv/bin/activate"
pip install --upgrade pip
pip install -r "$(dirname "$0")/app/requirements.txt"

echo
echo "Done. Next:"
echo "  1. Copy config.json (from spotify_auth.py) into $(dirname "$0")/"
echo "  2. Check the wiring constants at the top of app/display_art.py"
echo "  3. Install systemd/album-art.service"
