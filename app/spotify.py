"""Spotify Web API client: token refresh + currently-playing lookup."""
import time

import requests

NOW_PLAYING_URL = "https://api.spotify.com/v1/me/player/currently-playing"
TOKEN_URL = "https://accounts.spotify.com/api/token"


class SpotifyClient:
    def __init__(self, client_id: str, client_secret: str, refresh_token: str):
        self.client_id = client_id
        self.client_secret = client_secret
        self.refresh_token = refresh_token
        self._access_token = None
        self._expires_at = 0.0

    def _token(self) -> str:
        if time.time() < self._expires_at:
            return self._access_token

        resp = requests.post(
            TOKEN_URL,
            data={"grant_type": "refresh_token", "refresh_token": self.refresh_token},
            auth=(self.client_id, self.client_secret),
            timeout=10,
        )
        resp.raise_for_status()
        payload = resp.json()
        self._access_token = payload["access_token"]
        # Refresh a minute early so a request never rides an expiring token.
        self._expires_at = time.time() + payload.get("expires_in", 3600) - 60
        return self._access_token

    def currently_playing(self) -> dict | None:
        resp = requests.get(
            NOW_PLAYING_URL,
            headers={"Authorization": f"Bearer {self._token()}"},
            params={"additional_types": "track,episode"},
            timeout=10,
        )
        if resp.status_code == 204:
            return None
        resp.raise_for_status()
        return resp.json()


def describe(item: dict) -> tuple[str, str, list[dict], str]:
    """Returns (title, artist, images, cache_key) for a track or episode."""
    title = item.get("name", "")
    if item.get("type") == "episode":
        artist = (item.get("show") or {}).get("name", "")
        images = item.get("images") or []
        cache_key = item.get("id") or title
    else:
        artist = ", ".join(a["name"] for a in item.get("artists", []))
        album = item.get("album") or {}
        images = album.get("images") or []
        cache_key = album.get("id") or title
    return title, artist, images, cache_key
