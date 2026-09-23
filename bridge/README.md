# Bridge — now-playing from Android

Spotify reports playback from the cloud, so the display can read it directly.
**YouTube Music has no equivalent API** — no official endpoint reports what
you're currently playing, and the unofficial libraries only cover search and
playlists. The only place that state exists is the phone itself.

So the phone pushes it. This bridge receives that push and holds the most
recent one for the display to read.

```
Android (MacroDroid) ──POST /now-playing──> bridge :8899 ──> React display
```

## Running it

```bash
python3 bridge/server.py
```

No dependencies — stdlib only. On first run it writes `bridge-config.json`
with a generated token and prints it. Bind address defaults to `0.0.0.0` so
the phone can reach it over your LAN.

To run it alongside the display on the Pi, install `systemd/bridge.service`.

## Artwork

Pushes carry title and artist but no cover image. The display looks the
artwork up through **Spotify's search API**, which it's already authenticated
against — YouTube Music and Spotify share most of the same catalogue, so
mainstream tracks resolve correctly. Anything it can't match falls back to a
text frame.

This is a lookup, so it can occasionally land on the wrong edition of an
album. That's the tradeoff for not having to build an Android app.

## Android setup (MacroDroid)

[MacroDroid](https://play.google.com/store/apps/details?id=com.arlosoft.macrodroid)
is free for up to five macros. [Tasker](https://tasker.joaoapps.com/) works
identically if you already own it.

1. Install MacroDroid, grant it **Notification Access** when prompted
   (Settings → Apps → Special access → Notification access).
2. Create a macro:
   - **Trigger**: Media → *Music/Sound Playing* → select YouTube Music
   - **Action**: Applications → *HTTP Request*
     - Method: `POST`
     - URL: `http://<pi-ip>:8899/now-playing`
     - Content type: `application/json`
     - Header: `X-Token` = the token from `bridge-config.json`
     - Body:
       ```json
       {
         "source": "android",
         "title": "[med_title]",
         "artist": "[med_artist]",
         "album": "[med_album]",
         "isPlaying": true
       }
       ```
   - Those `[med_*]` values are MacroDroid's media magic-text variables;
     insert them from the variable picker rather than typing them.
3. Save and enable. Play something in YouTube Music and watch the bridge log.

### Checking it works

```bash
curl -s http://127.0.0.1:8899/api/state
```

The bridge also logs every accepted push, so `journalctl -u bridge -f` (or the
terminal it's running in) shows tracks arriving live.

## Notes

- A push older than 90 seconds is treated as stopped, so a phone that goes out
  of range doesn't leave a stale track on the wall indefinitely.
- The token is checked with a constant-time compare. Keep
  `bridge-config.json` private; it's gitignored.
- The bridge listens on your LAN, not the internet. Don't port-forward it.
- When Spotify is actively playing, the display prefers it — its metadata is
  richer and it carries real artwork. The bridge covers everything else.
