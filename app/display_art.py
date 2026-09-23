#!/usr/bin/env python3
"""Polls Spotify for the currently playing track and shows its album art.

Unlike Bluetooth AVRCP, the Spotify Web API returns the real artwork URL for
whatever is playing, so nothing here has to guess at a match by name.

Run with --preview to render to a desktop window instead of an SPI display,
which lets the whole thing be tested without hardware.
"""
import argparse
import io
import json
import logging
import signal
import sys
import textwrap
import time
from pathlib import Path

import requests
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from spotify import SpotifyClient, describe  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("album-art")

CONFIG_PATH = Path(__file__).resolve().parent.parent / "config.json"
CACHE_DIR = Path.home() / ".cache" / "album-art"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

POLL_SECONDS = 3

# --- Display panel --------------------------------------------------------
# Match these to your module (see README).
WIDTH = 240
HEIGHT = 240
ROTATE = 0
GPIO_DC = 24
GPIO_RST = 25

running = True


def make_device(preview: bool):
    if preview:
        from preview import PreviewDisplay

        return PreviewDisplay(WIDTH, HEIGHT)

    from luma.core.interface.serial import spi
    from luma.lcd.device import st7789

    serial = spi(port=0, device=0, gpio_DC=GPIO_DC, gpio_RST=GPIO_RST, bus_speed_hz=40000000)
    return st7789(serial, width=WIDTH, height=HEIGHT, rotate=ROTATE)


FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans{bold}.ttf",
    "C:/Windows/Fonts/{win}",
]


def load_font(size: int, bold: bool = False):
    """PIL's built-in font is a fixed ~11px bitmap, unreadable on a small panel."""
    for template in FONT_CANDIDATES:
        path = template.format(
            bold="-Bold" if bold else "",
            win="segoeuib.ttf" if bold else "segoeui.ttf",
        )
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def show_image(device, img: Image.Image) -> None:
    device.display(img.convert("RGB").resize((device.width, device.height)))


def show_message(device, message: str, color: str = "#666666") -> None:
    img = Image.new("RGB", (device.width, device.height), "black")
    draw = ImageDraw.Draw(img)
    font = load_font(max(12, device.width // 16))
    draw.text((device.width // 2, device.height // 2), message,
              fill=color, font=font, anchor="mm")
    show_image(device, img)


def show_text(device, title: str, artist: str) -> None:
    """Fallback frame for the rare item that has no artwork."""
    img = Image.new("RGB", (device.width, device.height), "black")
    draw = ImageDraw.Draw(img)

    title_font = load_font(max(15, device.width // 12), bold=True)
    artist_font = load_font(max(11, device.width // 18))

    # Wrap on the panel's width rather than letting long titles run off the edge.
    chars = max(12, int(device.width / (title_font.size * 0.58)))
    lines = textwrap.wrap(title or "", width=chars)[:3]

    line_h = title_font.size + 4
    block_h = len(lines) * line_h + artist_font.size + 10
    y = (device.height - block_h) // 2

    for line in lines:
        draw.text((device.width // 2, y), line, fill="white",
                  font=title_font, anchor="ma")
        y += line_h

    if artist:
        artist_text = textwrap.shorten(artist, width=chars + 6, placeholder="...")
        draw.text((device.width // 2, y + 6), artist_text, fill="#9aa0a8",
                  font=artist_font, anchor="ma")

    show_image(device, img)


def pick_image_url(images: list[dict], target: int) -> str | None:
    """Smallest artwork that still covers the display, else the largest."""
    if not images:
        return None
    usable = [i for i in images if i.get("width") and i["width"] >= target]
    if usable:
        return min(usable, key=lambda i: i["width"])["url"]
    return max(images, key=lambda i: i.get("width") or 0)["url"]


def fetch_art(url: str, cache_key: str) -> Image.Image | None:
    path = CACHE_DIR / f"{cache_key}.jpg"
    if path.exists():
        log.info("cache hit: %s", cache_key)
        return Image.open(path)
    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        img = Image.open(io.BytesIO(resp.content)).convert("RGB")
        img.save(path, "JPEG")
        return img
    except Exception as exc:  # noqa: BLE001 - fall back to text on any failure
        log.warning("artwork download failed: %s", exc)
        return None


def render(device, item: dict) -> None:
    title, artist, images, cache_key = describe(item)
    log.info("now playing: %s - %s", artist, title)
    if hasattr(device, "caption"):
        device.caption(f"{artist} - {title}")

    url = pick_image_url(images, device.width)
    img = fetch_art(url, cache_key) if url else None
    if img:
        show_image(device, img)
    else:
        log.warning("no artwork available, showing text")
        show_text(device, title, artist)


def wait(device, seconds: float) -> None:
    """Sleep, keeping the preview window responsive if there is one."""
    end = time.time() + seconds
    pump = getattr(device, "pump", None)
    while running and time.time() < end:
        if pump:
            pump()
            if getattr(device, "closed", False):
                return
        time.sleep(0.05)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--preview", action="store_true",
                        help="render to a desktop window instead of the SPI display")
    args = parser.parse_args()

    if not CONFIG_PATH.exists():
        raise SystemExit(f"missing {CONFIG_PATH} - run app/spotify_auth.py first")

    cfg = json.loads(CONFIG_PATH.read_text())
    client = SpotifyClient(cfg["client_id"], cfg["client_secret"], cfg["refresh_token"])
    device = make_device(args.preview)

    def stop(*_):
        global running
        running = False

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    show_message(device, "connecting ...")
    log.info("polling Spotify every %ss", POLL_SECONDS)

    current_id = None
    while running:
        if getattr(device, "closed", False):
            log.info("preview window closed")
            break

        try:
            data = client.currently_playing()
        except Exception as exc:  # noqa: BLE001 - keep last frame up, retry next tick
            log.warning("poll failed: %s", exc)
            wait(device, POLL_SECONDS)
            continue

        item = (data or {}).get("item")
        if item:
            if item.get("id") != current_id:
                current_id = item.get("id")
                render(device, item)
        elif current_id is not None:
            current_id = None
            show_message(device, "nothing playing")
            if hasattr(device, "caption"):
                device.caption("nothing playing")
            log.info("playback stopped")

        wait(device, POLL_SECONDS)


if __name__ == "__main__":
    main()
