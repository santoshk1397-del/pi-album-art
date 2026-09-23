import { useEffect, useState } from 'react';
import { beginLogin, completeLoginFromUrl, getClientId, isAuthorized, REDIRECT_URI, signOut } from './auth';
import { useNowPlaying } from './useNowPlaying';
import { dominantColor, toAccent } from './palette';

// Served straight from web/public/. BASE_URL keeps it correct whether the app
// is hosted at the root or under a subpath.
const IDLE_IMAGE = `${import.meta.env.BASE_URL}not_playing.jpg`;

function formatTime(ms) {
  if (!ms || ms < 0) return '0:00';
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function Login({ error }) {
  const [clientId, setClientId] = useState(getClientId());
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // Spotify rejects "localhost" outright for loopback redirects; it wants the
  // literal IP. Any https host (GitHub Pages) is fine, so only flag this one.
  const onLocalhost = window.location.hostname === 'localhost';

  return (
    <div className="setup">
      <div className="setup-card">
        <p className="eyebrow">album art</p>
        <h1>Connect Spotify</h1>

        {onLocalhost && (
          <p className="warn">
            Spotify rejects <code>localhost</code>. Open{' '}
            <a href={`http://127.0.0.1:${window.location.port || 5173}/`}>
              http://127.0.0.1:{window.location.port || 5173}/
            </a>{' '}
            instead.
          </p>
        )}

        <p className="muted">
          Paste the Client ID from your Spotify app. No secret needed &mdash; this uses PKCE,
          so nothing sensitive is stored in the browser.
        </p>

        <label htmlFor="clientId">Client ID</label>
        <input
          id="clientId"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="e.g. 4f8a2c1b9e7d40..."
          spellCheck="false"
          autoComplete="off"
        />

        <button
          className="primary"
          disabled={!clientId.trim() || busy}
          onClick={() => {
            setBusy(true);
            beginLogin(clientId);
          }}
        >
          {busy ? 'Redirecting…' : 'Authorize'}
        </button>

        {error && <p className="error">{error}</p>}

        <p className="hint">
          This is the exact redirect URI being sent. It must appear
          character-for-character in your Spotify dashboard under
          Settings &rarr; Redirect URIs.
          <code>{REDIRECT_URI}</code>
          <button
            className="ghost"
            onClick={() => {
              navigator.clipboard?.writeText(REDIRECT_URI);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </p>
      </div>
    </div>
  );
}

// Inline rather than a file in public/, so it needs no network request and no
// base-path handling, and can pick up the theme's accent.
function IdleCover() {
  const grooves = [88, 80, 72, 64, 56, 48];
  return (
    <svg
      className="cover cover-idle"
      viewBox="0 0 240 240"
      role="img"
      aria-label="Nothing playing"
    >
      <defs>
        <radialGradient id="sheen" cx="34%" cy="28%" r="78%">
          <stop offset="0%" stopColor="#2b3038" />
          <stop offset="100%" stopColor="#111419" />
        </radialGradient>
      </defs>
      <rect width="240" height="240" fill="#0c0e11" />
      <circle cx="120" cy="120" r="98" fill="url(#sheen)" />
      {grooves.map((r) => (
        <circle
          key={r}
          cx="120"
          cy="120"
          r={r}
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.055"
          strokeWidth="1"
        />
      ))}
      <circle cx="120" cy="120" r="32" fill="var(--accent)" opacity="0.9" />
      <circle cx="120" cy="120" r="4.5" fill="#0c0e11" />
    </svg>
  );
}

function Background({ src }) {
  // Keep the outgoing layer mounted underneath so the swap crossfades
  // instead of flashing the empty ground.
  const [layers, setLayers] = useState([]);

  useEffect(() => {
    if (!src) return;
    setLayers((prev) => (prev[prev.length - 1]?.src === src ? prev : [...prev.slice(-1), { src, id: `${src}-${Date.now()}` }]));
  }, [src]);

  return (
    <div className="bg-stack" aria-hidden="true">
      {layers.map((layer) => (
        <div key={layer.id} className="bg-layer" style={{ backgroundImage: `url("${layer.src}")` }} />
      ))}
      <div className="bg-scrim" />
    </div>
  );
}

function NowPlaying() {
  const { track, progressMs, error, ready } = useNowPlaying(3000);
  const [accent, setAccent] = useState(null);
  // Falls back to the drawn placeholder if not_playing.png isn't there, so a
  // missing file never shows a broken-image icon on a wall display.
  const [idleImageOk, setIdleImageOk] = useState(true);

  useEffect(() => {
    setAccent(null);
  }, [track?.art]);

  if (!ready) {
    return <div className="state"><span className="spinner" />Connecting</div>;
  }

  if (error) {
    return (
      <div className="state">
        <p className="state-title">{error}</p>
        <button onClick={() => { signOut(); window.location.reload(); }}>Sign in again</button>
      </div>
    );
  }

  // Same layout as a playing track, so the idle screen reads as deliberate
  // rather than as a failure state.
  if (!track) {
    return (
      <div className="stage" style={accent ? { '--accent': accent } : undefined}>
        {idleImageOk && <Background src={IDLE_IMAGE} />}

        <main className="now">
          <div className="cover-wrap">
            {idleImageOk ? (
              <img
                className="cover cover-photo"
                src={IDLE_IMAGE}
                alt=""
                crossOrigin="anonymous"
                onError={() => setIdleImageOk(false)}
                onLoad={(e) => setAccent(toAccent(dominantColor(e.currentTarget)))}
              />
            ) : (
              <IdleCover />
            )}
          </div>
          <div className="meta">
            <h1 className="title">Nothing playing</h1>
            <p className="artist idle-hint">Start a track on any device</p>
          </div>
        </main>
      </div>
    );
  }

  const pct = track.durationMs ? Math.min(100, (progressMs / track.durationMs) * 100) : 0;
  const style = accent ? { '--accent': accent } : undefined;

  return (
    <div className="stage" style={style}>
      <Background src={track.art} />

      <main className="now">
        <div className="cover-wrap">
          {track.art ? (
            <img
              key={track.art}
              className="cover"
              src={track.art}
              alt=""
              crossOrigin="anonymous"
              onLoad={(e) => setAccent(toAccent(dominantColor(e.currentTarget)))}
            />
          ) : (
            <div className="cover cover-empty" />
          )}
        </div>

        <div className="meta">
          <h1 key={track.id} className="title">{track.title}</h1>
          <p className="artist">{track.artist}</p>
          {track.album && track.album !== track.title && (
            <p className="album">{track.album}</p>
          )}

          <div className="progress">
            <div className="bar"><div className="fill" style={{ width: `${pct}%` }} /></div>
            <div className="times">
              <span className="elapsed">{formatTime(progressMs)}</span>
              <span className={`status ${track.isPlaying ? 'playing' : 'paused'}`}>
                {track.isPlaying ? 'Playing' : 'Paused'}
              </span>
              <span className="total">{formatTime(track.durationMs)}</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(isAuthorized());
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    completeLoginFromUrl()
      .then((done) => { if (done) setAuthed(true); })
      .catch((err) => setAuthError(err.message));
  }, []);

  return authed ? <NowPlaying /> : <Login error={authError} />;
}
