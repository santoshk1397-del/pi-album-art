import { useEffect, useRef, useState } from 'react';
import { getAccessToken } from './auth';

const NOW_PLAYING_URL =
  'https://api.spotify.com/v1/me/player/currently-playing?additional_types=track,episode';

function toTrack(item, data) {
  if (!item) return null;
  const isEpisode = item.type === 'episode';
  const images = (isEpisode ? item.images : item.album?.images) || [];
  const best = images.reduce((a, b) => ((b.width || 0) > (a.width || 0) ? b : a), images[0] || {});

  return {
    id: item.id,
    title: item.name || '',
    artist: isEpisode
      ? item.show?.name || ''
      : (item.artists || []).map((a) => a.name).join(', '),
    album: isEpisode ? item.show?.name || '' : item.album?.name || '',
    art: best?.url || null,
    durationMs: item.duration_ms || 0,
    progressMs: data.progress_ms || 0,
    isPlaying: Boolean(data.is_playing),
  };
}

/**
 * Polls Spotify for the current track, and interpolates playback position
 * locally between polls so the progress bar moves smoothly.
 */
export function useNowPlaying(pollMs = 3000) {
  const [track, setTrack] = useState(null);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);
  const [progressMs, setProgressMs] = useState(0);

  // Where playback was at the moment of the last successful poll.
  const anchor = useRef({ progressMs: 0, at: 0, isPlaying: false, durationMs: 0 });

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const token = await getAccessToken();
        const resp = await fetch(NOW_PLAYING_URL, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (cancelled) return;

        if (resp.status === 204) {
          setTrack(null);
          setError(null);
          setReady(true);
          return;
        }
        if (!resp.ok) throw new Error(`Spotify returned ${resp.status}`);

        const data = await resp.json();
        const next = toTrack(data.item, data);
        anchor.current = {
          progressMs: next?.progressMs || 0,
          at: Date.now(),
          isPlaying: next?.isPlaying || false,
          durationMs: next?.durationMs || 0,
        };
        setTrack(next);
        setError(null);
        setReady(true);
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setReady(true);
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

  return { track, progressMs, error, ready };
}
