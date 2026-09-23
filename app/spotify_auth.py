#!/usr/bin/env python3
"""One-time setup: gets a Spotify refresh token and writes config.json.

Run this on a machine with a browser (your laptop is fine), then copy the
resulting config.json next to the app/ folder on the Pi. The refresh token
does not expire, so the Pi never needs a browser.
"""
import http.server
import json
import secrets
import sys
import threading
import urllib.parse
import webbrowser
from pathlib import Path

import requests

REDIRECT_URI = "http://127.0.0.1:8888/callback"
SCOPE = "user-read-playback-state user-read-currently-playing"
CONFIG_PATH = Path(__file__).resolve().parent.parent / "config.json"

result = {}
done = threading.Event()


class CallbackHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        result.update({k: v[0] for k, v in params.items()})
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        body = "Authorized. You can close this tab." if "code" in result else "Authorization failed."
        self.wfile.write(f"<html><body><h3>{body}</h3></body></html>".encode())
        done.set()

    def log_message(self, *_):
        pass


def main() -> None:
    client_id = input("Spotify client ID: ").strip()
    client_secret = input("Spotify client secret: ").strip()
    if not client_id or not client_secret:
        sys.exit("both client ID and secret are required")

    state = secrets.token_urlsafe(16)
    auth_url = "https://accounts.spotify.com/authorize?" + urllib.parse.urlencode({
        "client_id": client_id,
        "response_type": "code",
        "redirect_uri": REDIRECT_URI,
        "scope": SCOPE,
        "state": state,
    })

    server = http.server.HTTPServer(("127.0.0.1", 8888), CallbackHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()

    print(f"\nOpening browser. If it doesn't open, visit:\n{auth_url}\n")
    webbrowser.open(auth_url)

    if not done.wait(timeout=300):
        sys.exit("timed out waiting for authorization")
    server.shutdown()

    if result.get("state") != state:
        sys.exit("state mismatch - aborting")
    if "code" not in result:
        sys.exit(f"authorization failed: {result.get('error', 'unknown error')}")

    resp = requests.post(
        "https://accounts.spotify.com/api/token",
        data={
            "grant_type": "authorization_code",
            "code": result["code"],
            "redirect_uri": REDIRECT_URI,
        },
        auth=(client_id, client_secret),
        timeout=10,
    )
    resp.raise_for_status()

    CONFIG_PATH.write_text(json.dumps({
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": resp.json()["refresh_token"],
    }, indent=2))

    print(f"Wrote {CONFIG_PATH}")
    print("Copy this file to the same location on your Pi. Keep it private - it grants access to your Spotify account.")


if __name__ == "__main__":
    main()
