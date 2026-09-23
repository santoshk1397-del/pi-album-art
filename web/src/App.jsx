import { useEffect, useState } from 'react';
import { beginLogin, completeLoginFromUrl, getClientId, isAuthorized, REDIRECT_URI, signOut } from './auth';
import { useNowPlaying } from './useNowPlaying';
import { dominantColor, toAccent } from './palette';

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

  if (!track) {
    return (
      <div className="state">
        <p className="state-title">Nothing playing</p>
        <p className="muted">Start a track on any device.</p>
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
              <span>{formatTime(progressMs)}</span>
              <span className={track.isPlaying ? 'playing' : 'paused'}>
                {track.isPlaying ? 'Playing' : 'Paused'}
              </span>
              <span>{formatTime(track.durationMs)}</span>
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
