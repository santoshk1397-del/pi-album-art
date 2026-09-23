import { useEffect, useRef, useState } from 'react';
import { searchArtwork } from './search';

// The bridge runs on the same host as the display (the Pi), or on this machine
// during development.
export const BRIDGE_URL =
  localStorage.getItem('pi-album-art.bridge') ||
  `http://${window.location.hostname}:8899`;

/** Polls the local bridge for pushes from Android / desktop players. */
export function useBridge(pollMs = 3000) {
  const [track, setTrack] = useState(null);
  const [online, setOnline] = useState(false);
  const [progressMs, setProgressMs] = useState(0);
  const anchor = useRef({ progressMs: 0, at: 0, isPlaying: false, durationMs: 0 });

  // In a Spotify-only setup there is no bridge at all, so back off after a few
  // failures instead of retrying against nothing every few seconds forever.
  const misses = useRef(0);
  const ticks = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      // Once it's clearly absent, try roughly every tenth tick.
      if (misses.current >= 3) {
        ticks.current += 1;
        if (ticks.current % 10 !== 0) return;
      }

      try {
        const resp = await fetch(`${BRIDGE_URL}/api/state`);
        if (!resp.ok) throw new Error(String(resp.status));
        const { state } = await resp.json();
        if (cancelled) return;

        misses.current = 0;
        setOnline(true);

        if (!state) {
          setTrack(null);
          return;
        }

        // Pushes rarely carry artwork, so fill it in from Spotify's catalogue.
        let art = state.art;
        if (!art) {
          art = await searchArtwork(state);
          if (cancelled) return;
        }

        anchor.current = {
          progressMs: state.progressMs || 0,
          at: Date.now() - (state.age || 0) * 1000,
          isPlaying: state.isPlaying,
          durationMs: state.durationMs || 0,
        };

        setTrack({
          id: `${state.source}:${state.artist}:${state.title}`,
          title: state.title,
          artist: state.artist,
          album: state.album,
          art,
          durationMs: state.durationMs || 0,
          isPlaying: state.isPlaying,
          source: state.source,
        });
      } catch {
        if (!cancelled) {
          misses.current += 1;
          setOnline(false);
          setTrack(null);
        }
      }
    }

    poll();
    const id = setInterval(poll, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pollMs]);

  useEffect(() => {
    const id = setInterval(() => {
      const { progressMs: base, at, isPlaying, durationMs } = anchor.current;
      const elapsed = isPlaying ? Date.now() - at : 0;
      setProgressMs(Math.min(base + elapsed, durationMs || Infinity));
    }, 250);
    return () => clearInterval(id);
  }, []);

  return { track, progressMs, online };
}
