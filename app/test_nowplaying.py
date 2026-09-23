#!/usr/bin/env python3
"""Verifies the Spotify half works, with no display hardware attached.

Prints whatever your account is playing and saves the artwork next to this
script so you can open it. Run it on any machine that has config.json.
"""
import json
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from spotify import SpotifyClient, describe  # noqa: E402

CONFIG_PATH = Path(__file__).resolve().parent.parent / "config.json"
OUT_PATH = Path(__file__).resolve().parent / "nowplaying.jpg"


def main() -> None:
    if not CONFIG_PATH.exists():
        sys.exit(f"missing {CONFIG_PATH} - run spotify_auth.py first")

    cfg = json.loads(CONFIG_PATH.read_text())
    client = SpotifyClient(cfg["client_id"], cfg["client_secret"], cfg["refresh_token"])

    print("Authenticating ...")
    try:
        data = client.currently_playing()
    except requests.HTTPError as exc:
        sys.exit(f"API error: {exc}\nIf this is a 400/401, re-run spotify_auth.py.")

    print("Token OK.\n")

    item = (data or {}).get("item")
    if not item:
        print("Nothing playing right now.")
        print("Start a track in Spotify on any device, then run this again.")
        return

    title, artist, images, _ = describe(item)
    print(f"  Track   {title}")
    print(f"  Artist  {artist}")
    print(f"  Playing {'yes' if (data or {}).get('is_playing') else 'paused'}")

    if not images:
        print("\nNo artwork on this item.")
        return

    best = max(images, key=lambda i: i.get("width") or 0)
    print(f"  Art     {best.get('width')}x{best.get('height')}")
    print(f"          {best['url']}")

    resp = requests.get(best["url"], timeout=10)
    resp.raise_for_status()
    OUT_PATH.write_bytes(resp.content)
    print(f"\nSaved artwork to {OUT_PATH} ({len(resp.content) // 1024} KB)")
    print("Open it to confirm the image came through correctly.")


if __name__ == "__main__":
    main()
