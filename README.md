# album-art

A now-playing display for Spotify. Runs in any browser, so an old tablet
becomes a wall-mounted album art frame with no hardware to buy.

## How it works

Spotify reports playback at the **account** level, so the display just asks
Spotify's servers "what is this account playing?" every few seconds and draws
the artwork that comes back.

```
1. You press play on your phone
2. Your phone tells Spotify "this account is playing X"
3. The display asks Spotify "what is this account playing?"
4. Spotify replies with the track and its artwork URL
5. The display draws it
```

The phone and the display never talk to each other, and don't need to be on
the same network. The link between them is your Spotify account.

Everything runs client-side — React, auth, and the API calls all execute in
the browser. There is no server and no backend. Hosting only serves static
files.

## Setup

### 1. Create a Spotify app

1. Go to https://developer.spotify.com/dashboard and create an app.
2. Copy the **Client ID**. You do not need the secret — this uses PKCE.
3. Add a redirect URI. It must match wherever you host the app, exactly,
   trailing slash included:
   - GitHub Pages: `https://<username>.github.io/album-art/`
   - Local development: `http://127.0.0.1:5173/`

   Spotify only allows `http://` for loopback addresses. Anything else must be
   HTTPS, and `localhost` is rejected outright — use `127.0.0.1`.

### 2. Publish it

Repo → **Settings** → **Pages** → Source: **GitHub Actions**.

Pushing to `main` builds and deploys automatically via
[`.github/workflows/pages.yml`](.github/workflows/pages.yml).

### 3. Open it on the tablet

1. Browse to your Pages URL
2. Paste the Client ID, tap **Authorize**
3. **⋮** → **Add to Home screen** — launches fullscreen, no address bar
4. Settings → Display → **Sleep → Never**, and keep it on a charger

The token refreshes itself indefinitely, so this is a one-time setup.

Note that the token lives in that browser's local storage, so authorizing on
one device does not carry to another. Each display authorizes once.

## Development

```bash
cd web
npm install
npm run dev        # http://127.0.0.1:5173/
npm run build
```

`VITE_BASE` sets the base path at build time — unset serves from the root, and
the Pages workflow sets it to the repo name. The Spotify redirect URI is
derived from it at runtime, so both stay correct without duplicated config.

## What it shows

- Album art, large, with the same image blurred behind it
- The UI tints itself to the dominant colour of each cover
- Track, artist, album, and a progress bar that ticks smoothly between polls
- Covers crossfade rather than snapping

Polling is every 3 seconds, which is well inside Spotify's rate limits and
means art appears a beat after you skip a track.

## Notes

- Nothing sensitive is stored. PKCE means there is no client secret, and the
  token never leaves the browser it was created in.
- The hosted page is public, but it holds no credentials — anyone opening it
  gets a blank setup screen asking for their own Client ID.
- Revoke access anytime: spotify.com → Account → Apps → Remove Access.
- The build targets ES2015 for older Android browsers.

## Troubleshooting

| Symptom | Check |
|---|---|
| `INVALID_CLIENT: Invalid redirect URI` | It must match exactly — trailing slash included, `127.0.0.1` not `localhost`, and HTTPS unless loopback |
| Blank screen on an old tablet | Open the browser console. If it is a syntax error, the browser is too old and needs a lower build target |
| Sluggish on weak hardware | The full-screen blur is the expensive part; drop `filter: blur()` in `styles.css` |
| Art never updates | Confirm the authorized account is the one actually playing |
