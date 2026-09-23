#!/usr/bin/env python3
"""Receives now-playing pushes from other devices (Android, desktop, ...).

Spotify reports playback from the cloud, but YouTube Music has no such API -
the only place that state exists is the device doing the playing. This accepts
a small JSON push from there and holds the most recent one for the display to
read.

Runs on stdlib only, so it needs nothing installed on the Pi.
"""
import argparse
import json
import logging
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("bridge")

CONFIG_PATH = Path(__file__).resolve().parent / "bridge-config.json"
DEFAULT_PORT = 8899

# A push older than this is treated as nothing playing, so a phone that goes
# out of range doesn't leave a stale track on the wall forever.
STALE_AFTER = 90

_lock = threading.Lock()
_state = None


def load_config() -> dict:
    if CONFIG_PATH.exists():
        return json.loads(CONFIG_PATH.read_text())
    cfg = {"token": secrets.token_urlsafe(18), "port": DEFAULT_PORT}
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2))
    log.info("created %s", CONFIG_PATH)
    return cfg


class Handler(BaseHTTPRequestHandler):
    token = ""

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Token")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def _json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path.rstrip("/") != "/api/state":
            return self._json(404, {"error": "not found"})

        with _lock:
            state = dict(_state) if _state else None

        if state:
            age = time.time() - state["receivedAt"]
            state["age"] = round(age, 1)
            if age > STALE_AFTER or not state.get("isPlaying"):
                state = None

        return self._json(200, {"state": state})

    def do_POST(self):
        if self.path.rstrip("/") != "/now-playing":
            return self._json(404, {"error": "not found"})

        if not secrets.compare_digest(self.headers.get("X-Token", ""), self.token):
            log.warning("rejected push from %s: bad token", self.client_address[0])
            return self._json(401, {"error": "bad token"})

        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length) or "{}")
        except (ValueError, json.JSONDecodeError):
            return self._json(400, {"error": "invalid JSON"})

        title = str(payload.get("title") or "").strip()
        if not title:
            return self._json(400, {"error": "title is required"})

        global _state
        with _lock:
            _state = {
                "source": str(payload.get("source") or "android"),
                "title": title,
                "artist": str(payload.get("artist") or "").strip(),
                "album": str(payload.get("album") or "").strip(),
                "art": payload.get("art") or None,
                "isPlaying": bool(payload.get("isPlaying", True)),
                "durationMs": int(payload.get("durationMs") or 0),
                "progressMs": int(payload.get("progressMs") or 0),
                "receivedAt": time.time(),
            }

        log.info("push: %s - %s", _state["artist"], _state["title"])
        return self._json(200, {"ok": True})

    def log_message(self, *_):
        pass  # keep the journal to our own lines


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0",
                        help="bind address; 0.0.0.0 so the phone can reach it")
    parser.add_argument("--port", type=int)
    args = parser.parse_args()

    cfg = load_config()
    Handler.token = cfg["token"]
    port = args.port or cfg.get("port", DEFAULT_PORT)

    server = ThreadingHTTPServer((args.host, port), Handler)
    log.info("bridge listening on %s:%s", args.host, port)
    log.info("push endpoint:  POST http://<this-device>:%s/now-playing", port)
    log.info("token:          %s", cfg["token"])
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("stopping")


if __name__ == "__main__":
    main()
