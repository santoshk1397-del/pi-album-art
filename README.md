# pi-album-art

A wall-mounted screen that shows the cover art of whatever you're currently
playing.

![status](https://img.shields.io/badge/platform-Raspberry%20Pi-c51a4a)

## How it works

**Spotify** exposes playback at the account level, so the Pi asks Spotify's
servers "what is this account playing?" and gets back the real artwork URL.
Playback can happen anywhere — phone, laptop, speaker — and the Pi is purely a
display.

**YouTube Music has no equivalent API.** Nothing reports now-playing from the
cloud, so the phone pushes it instead, to a small bridge running on the Pi.
Those pushes carry title and artist but no image, so artwork is resolved
through Spotify's search API.

```
Spotify Web API ─────────────────────┐
                                     ├──> display
Android ──push──> bridge :8899 ──────┘
```

## Two display options

| | React (HDMI) | Python (SPI) |
|---|---|---|
| Screen | Any HDMI monitor or small LCD | Cheap ST7789/ILI9341 module (~$10) |
| Look | Blurred-art background, per-album colour tinting, progress bar, crossfades | Cover art, text fallback |
| Runs on | Pi 3/4/5 comfortably | Anything, including Pi Zero 2 W |
| Cost | Higher | Lower |

Both read the same sources. Pick one — or run the Python one on a spare Pi.

## Setup: an old tablet (no hardware to buy)

The display is a pure client-side app — PKCE auth and the Spotify calls all
happen in the browser, with no backend. So it can be hosted as a static site
and opened on any device with a browser, including an old Android tablet.
This is the cheapest build: no Pi, nothing to keep running.

Spotify only accepts `http://` redirect URIs for loopback addresses, so the
app has to be served over HTTPS. GitHub Pages does that for free.

### 1. Enable Pages

Repo → **Settings** → **Pages** → Source: **GitHub Actions**.

Push to `main` and the included workflow builds and publishes to:

```
https://<your-username>.github.io/pi-album-art/
```

### 2. Add that URL as a redirect URI

In the Spotify dashboard, add the Pages URL exactly as above, trailing slash
included.

### 3. Open it on the tablet

Browse to the Pages URL, paste your Client ID, authorize. Then:

- **Chrome → ⋮ → Add to Home screen** for a fullscreen, chrome-less launcher
- Settings → Display → **Sleep → Never** (or Developer options → Stay awake
  while charging)

The build is transpiled down to ES2015, so it should run on older Android
Chrome. If the tablet is old enough that Chrome itself is stuck several years
back, this is the part most likely to break — check the browser console first.

## What to buy

### Recommended build — React on HDMI (~$95)

| Part | Cost | Notes |
|---|---|---|
| Raspberry Pi 4, 2GB | ~$45 | Runs Chromium comfortably and builds on-device. 4GB is wasted here. |
| 5″ or 7″ HDMI **IPS** panel | ~$30–50 | Insist on IPS. TN panels wash out off-axis, which is how a wall display is always viewed. |
| USB-C PSU, 3A | ~$8 | A real 3A supply — phone chargers cause undervoltage and random reboots. |
| 32GB microSD, A1 or A2 | ~$8 | Slower cards make Chromium painful. |

Skip the Pi 5: faster than needed, more power, and effectively requires active
cooling. A fan on a wall display is a downgrade.

### Minimal build — Python on SPI (~$37)

| Part | Cost |
|---|---|
| Pi Zero 2 W | ~$15 |
| 2″ ST7789 SPI module | ~$10 |
| PSU + microSD | ~$12 |

Smaller and lower-power, but a tiny screen, and no blurred background or
per-album colour tinting.

### Panel shape

Album art is square, so the aspect ratio changes the result:

- **16:9** — cover on the left, track details on the right. What the React
  layout is tuned for.
- **4:3 or square** — closer to a true art frame; the layout stacks and
  centres automatically.

Both are handled in CSS. Choose based on whether you want a *now-playing
panel* or an *art frame*.

> Some budget HDMI panels need a separate barrel-jack supply rather than
> drawing power from the Pi. Check before ordering.

---

## Setup: React on an HDMI screen

Needs Raspberry Pi OS **Desktop** (not Lite) — it requires Chromium.

### 1. Create a Spotify app

1. Go to https://developer.spotify.com/dashboard and create an app.
2. Add this redirect URI exactly: `http://127.0.0.1:5173/` (trailing slash
   included; `127.0.0.1`, never `localhost`).
3. Copy the **Client ID**. You do not need the secret — the web app uses PKCE.

### 2. Install on the Pi

```bash
git clone https://github.com/santoshk1397-del/pi-album-art.git ~/pi-album-art
cd ~/pi-album-art
./install-kiosk.sh
```

That builds the app, installs the display server and bridge as services,
disables screen blanking, and sets Chromium to launch fullscreen on boot.

### 3. Authorize, once, on the Pi

Reboot (or run `kiosk/start-kiosk.sh`). The setup screen appears — paste your
Client ID and authorize.

**This has to happen in the Pi's own browser.** The token lives in that
browser's local storage, so authorizing on your laptop does not carry over.
Plug in a keyboard for this one step.

After that it runs unattended and refreshes its own token indefinitely.

---

## Setup: Python on an SPI panel

Lighter, no browser, fine on a Pi Zero 2 W. See wiring and details below.

### Wiring (typical ST7789 module)

| Display pin | Pi pin |
|---|---|
| VCC | 3.3V |
| GND | GND |
| SCL/SCLK | GPIO 11 (SPI0 SCLK) |
| SDA/MOSI | GPIO 10 (SPI0 MOSI) |
| RES/RST | GPIO 25 |
| DC | GPIO 24 |
| CS | GPIO 8 (SPI0 CE0) |
| BL | 3.3V |

Pinouts vary — check yours and adjust `WIDTH`, `HEIGHT`, `GPIO_DC`, `GPIO_RST`
at the top of `app/display_art.py`.

### Steps

This path uses the Authorization Code flow, so it needs the client secret and
a one-time browser step on a machine that has one:

```bash
# on your laptop
pip install requests
python3 app/spotify_auth.py          # writes config.json
```

Add `http://127.0.0.1:8888/callback` as a redirect URI for this flow.

```bash
# on the Pi
git clone https://github.com/santoshk1397-del/pi-album-art.git ~/pi-album-art
cd ~/pi-album-art
# copy config.json here, then:
chmod 600 config.json
./install.sh
sudo cp systemd/album-art.service /etc/systemd/system/
sudo systemctl enable --now album-art.service
```

### Test it without hardware

```bash
python3 app/test_nowplaying.py       # prints the track, saves the artwork
python3 app/display_art.py --preview # renders to a desktop window
```

---

## YouTube Music

See [bridge/README.md](bridge/README.md) for the Android setup. Short version:
MacroDroid or Tasker watches the media session and POSTs title/artist to the
bridge; artwork is looked up via Spotify search.

Because that is a *search*, an obscure track can occasionally resolve to the
wrong edition. Spotify playback does not have this problem — its artwork is
exact.

## Notes

- `config.json` and `bridge/bridge-config.json` hold credentials. Both are
  gitignored; `chmod 600` them on the Pi.
- Revoke access anytime: spotify.com → Account → Apps → Remove Access.
- Artwork is cached, so repeat plays and reboots don't re-download.
- The bridge listens on your LAN only. Don't port-forward it.

## Troubleshooting

| Symptom | Check |
|---|---|
| `INVALID_CLIENT: Invalid redirect URI` | The URI must match exactly, including the trailing slash, and use `127.0.0.1` not `localhost` |
| Kiosk shows an error page | `systemctl status display-server` — the browser may have started before the server |
| Blank SPI screen | `ls /dev/spidev*` to confirm SPI is enabled, then `journalctl -u album-art -f` |
| Build killed on the Pi | Out of RAM. Add swap, or run `npm run build` elsewhere and copy `web/dist` across |
| Art never updates | Confirm the authorized Spotify account is the one actually playing |
