# pi-album-art

A small wall-mounted screen that shows the album art of whatever you're
playing on Spotify.

## How it works

The Pi polls the Spotify Web API every few seconds and asks "what is this
account playing right now?" The response contains the **actual artwork URL**
for the current track, so the Pi just downloads that image and pushes it to
the display. No matching by name, no guessing.

Playback happens wherever you normally play it — your phone, your laptop,
a speaker. The Pi is purely a display, which means it works no matter what
device you're listening on.

```
Spotify (any device)  ->  Web API /currently-playing  ->  Pi  ->  SPI display
```

Authentication is a one-time browser step on your laptop that produces a
refresh token. The token doesn't expire, so the Pi runs headless forever after.

## Hardware

- Raspberry Pi with Wi-Fi (Zero 2 W is plenty)
- Small SPI TFT display, e.g. a 1.3"–2.4" ST7789 or ILI9341 module (~$8–15,
  sold as "SPI LCD module")

### Wiring (typical ST7789 module)

| Display pin | Pi pin              |
|-------------|----------------------|
| VCC         | 3.3V                 |
| GND         | GND                  |
| SCL/SCLK    | GPIO 11 (SPI0 SCLK)  |
| SDA/MOSI    | GPIO 10 (SPI0 MOSI)  |
| RES/RST     | GPIO 25              |
| DC          | GPIO 24              |
| CS          | GPIO 8 (SPI0 CE0)    |
| BL          | 3.3V                 |

Pinouts vary between modules — check yours, and adjust `gpio_DC` / `gpio_RST`
/ `width` / `height` at the top of `app/display_art.py` to match.

## Setup

### 1. Create a Spotify app

1. Go to https://developer.spotify.com/dashboard and create an app (free,
   works with a free Spotify account).
2. Add exactly this redirect URI: `http://127.0.0.1:8888/callback`
3. Copy the client ID and client secret.

### 2. Authorize (on your laptop, not the Pi)

```bash
pip install requests
python3 app/spotify_auth.py
```

It opens a browser, you approve, and it writes `config.json` containing your
refresh token.

### 3. Check it works before touching hardware

```bash
python3 app/test_nowplaying.py
```

Start a track in Spotify first. This prints the track, artist and artwork URL
and saves the image to `app/nowplaying.jpg` — proving the whole API path works
with no display attached.

### 4. Install on the Pi

```bash
# copy the project + config.json to the Pi, then:
cd ~/pi-album-art
chmod 600 config.json        # owner-only; it holds your credentials
./install.sh
sudo cp systemd/album-art.service /etc/systemd/system/
sudo systemctl enable --now album-art.service
```

Play something on Spotify. Art should appear within a few seconds.

## Notes

- `config.json` holds credentials for your Spotify account. It's gitignored;
  also `chmod 600` it on the Pi so only your user can read it. To revoke access
  at any time: spotify.com → Account → Apps → Remove Access.
- Artwork is cached in `~/.cache/album-art/` by album ID, so repeat plays and
  reboots don't re-download.
- Polling every 3s is well inside Spotify's rate limits. Raise `POLL_SECONDS`
  in `app/display_art.py` if you want to be gentler.

### Optional: make the Pi a Spotify speaker too

If you also want the Pi to *play* the audio (so it shows up as a Spotify
Connect target), install [raspotify](https://dtcooper.github.io/raspotify/).
It's independent of this app — the display works either way.

## Troubleshooting

- **Blank screen**: confirm SPI is on (`ls /dev/spidev*`), then check
  `journalctl -u album-art -f`.
- **`missing config.json`**: step 2 didn't run, or the file didn't get copied
  to the project root on the Pi.
- **401 errors in the log**: the client secret is wrong, or the app was
  deleted in the Spotify dashboard. Re-run `spotify_auth.py`.
- **Art never updates**: confirm the Spotify account you authorized is the
  same one you're playing on.
